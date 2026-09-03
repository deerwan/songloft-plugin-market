#!/usr/bin/env node
// Songloft 插件市场 - 数据构建管线
//
// 流程：
//   1. 读取 data/sources.json（一组 registry.json 入口 URL）
//   2. 递归展开每个 registry（includes + plugins），套用去重/深度/循环检测规则
//   3. 逐个拉取 plugin.json，解析核心元数据（name/version/desc/author/permissions...）
//   4. 探测开源/闭源：能定位到公开 GitHub 仓库则走增强，否则标记 closed
//   5. 开源插件补 stars / updated_at / logo / license（GitHub API）
//   6. 解析版本与下载地址（plugin.json 或其 updateUrl 指向的 manifest.json）
//   7. 合并 data/overlay.json 人工策展层（优先级最高）
//   8. 任何一步失败回退到上一次 data/plugins.generated.json 缓存，保证数据不丢
//
// 环境变量：
//   GITHUB_TOKEN   GitHub API token（CI 中由 secrets 注入，提高限额）；缺失时匿名请求
//   GITHUB_PROXY   可选，GitHub 加速代理前缀（如 https://gproxy.example.com/proxy?url=）
//
// 退出码：0 成功；1 致命错误（写盘失败等）。单个插件拉取失败不影响整体。

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'
import { createScript } from 'node:vm'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const dataDir = resolve(repoRoot, 'data')
const publicDir = resolve(repoRoot, 'public')

const SOURCES_FILE = resolve(dataDir, 'sources.json')
const OVERLAY_FILE = resolve(dataDir, 'overlay.json')
const OUTPUT_FILE = resolve(dataDir, 'plugins.generated.json')
const PUBLIC_OUTPUT = resolve(publicDir, 'plugins.generated.json')
// 图标：data/icons 作提交入库的缓存，public/icons 供前端运行时读取
const ICONS_DATA_DIR = resolve(dataDir, 'icons')
const ICONS_PUBLIC_DIR = resolve(publicDir, 'icons')

// —— 限制（对齐后端插件源解析规则）——
const MAX_DEPTH = 20
const MAX_PLUGINS = 500
const FETCH_TIMEOUT_MS = 15000
const MAX_JSON_BYTES = 2 * 1024 * 1024 // 2MB
const MAX_ZIP_BYTES = 20 * 1024 * 1024 // 20MB：下载插件包提取图标的上限

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_PROXY = process.env.GITHUB_PROXY || ''

// 测试模式：传入一个 URL 即用它作为唯一源试跑（不写盘，不污染真实数据/图标/缓存）
//   node scripts/build.mjs https://.../registry.json
//   node scripts/build.mjs https://.../plugin.json   （单插件也行）
const CLI_TEST_URL = process.argv.slice(2).find((a) => /^https?:\/\//i.test(a)) || ''
// 包校验：额外下载 .jsplugin.zip 做结构/语法静态校验。
// 用于 submit-source.yml 与 validate.yml（PR 拦截坏包）。不影响正常的生产数据构建。
const CHECK_PACKAGES = process.argv.includes('--check-packages')
// 包校验属于「只读检查」：它跑完整条管线，但绝不该改写 data/ 与 public/。
// 否则 validate.yml 在 PR 上一次执行就写两遍盘（build:data 一遍、validate:source 一遍）。
const DRY_RUN = Boolean(CLI_TEST_URL) || CHECK_PACKAGES || process.argv.includes('--dry-run')

const warnings = []
// 包校验错误：entryPath -> string[]。仅 --check-packages 时填充，用于 CI 拦截。
const packageErrors = new Map()
function warn(msg) {
  warnings.push(msg)
  console.warn(`[build] ⚠️  ${msg}`)
}
function info(msg) {
  console.log(`[build] ${msg}`)
}

// ——————————————————————————————————————————————
// 网络工具
// ——————————————————————————————————————————————

async function fetchWithTimeout(url, opts = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeout || FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(url, { headers = {} } = {}) {
  const resp = await fetchWithTimeout(url, { headers })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.byteLength > MAX_JSON_BYTES) throw new Error(`JSON 超过 ${MAX_JSON_BYTES} 字节上限`)
  return JSON.parse(buf.toString('utf-8'))
}

async function headOk(url) {
  try {
    const resp = await fetchWithTimeout(url, { method: 'HEAD' })
    return resp.ok
  } catch {
    return false
  }
}

// 从 release 资源的 Last-Modified 头取“最后更新时间”（不依赖 GitHub API 限额，一次 HEAD 即可）
async function fetchReleaseUpdatedAt(url) {
  try {
    const resp = await fetchWithTimeout(viaProxy(url), { method: 'HEAD' })
    const lm = resp.ok ? resp.headers.get('last-modified') : null
    if (!lm) return null
    const t = Date.parse(lm)
    return Number.isNaN(t) ? null : new Date(t).toISOString()
  } catch {
    return null
  }
}

// 通过代理改写 GitHub 相关 URL（可选）
function viaProxy(url) {
  if (!GITHUB_PROXY) return url
  return GITHUB_PROXY.includes('?') ? `${GITHUB_PROXY}${encodeURIComponent(url)}` : `${GITHUB_PROXY}${url}`
}

async function githubApi(path) {
  const url = `https://api.github.com${path}`
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'songloft-plugin-market' }
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`
  const resp = await fetchWithTimeout(viaProxy(url), { headers })
  if (!resp.ok) throw new Error(`GitHub API ${resp.status} for ${path}`)
  return resp.json()
}

// Gitee v5 API：匿名可调（限频宽松），一次请求拿 stars/pushed_at/头像/license
async function giteeApi(path) {
  const url = `https://gitee.com/api/v5${path}`
  const resp = await fetchWithTimeout(url, { headers: { 'User-Agent': 'songloft-plugin-market' } })
  if (!resp.ok) throw new Error(`Gitee API ${resp.status} for ${path}`)
  return resp.json()
}

// ——————————————————————————————————————————————
// 版本比较（语义化版本：主版本按段数值比较，预发布低于正式版）
//
// 注意两点历史坑：
//   1) 版本号前缀既有 `v1.2.3`，也有 `V-2026.08.29.12.07` 这类写法。只去掉 v/V
//      会留下前导 `-`，导致分段后首段是空串、比较结果反转，所以前导分隔符要一并去掉。
//   2) 不能简单按 [.\-+] 通切后逐段比。那样 `1.0.0-beta` 会因为多出一段 beta
//      而被判为高于 `1.0.0`，语义化版本里正好相反：预发布低于正式版。
// ——————————————————————————————————————————————

function normalizeVersion(v) {
  return String(v || '')
    .replace(/^\s*v/i, '')
    .replace(/^[-+.\s]+/, '')
    .trim()
}

// 拆成 { parts: number[], pre: string|null }；build metadata（+xxx）按 semver 忽略。
// 非标准版本号（如纯字符串 "beta"）退化为 parts=[]、pre=原串，仍可参与比较。
function parseVersion(v) {
  const s = normalizeVersion(v)
  const m = s.match(/^([0-9]+(?:\.[0-9]+)*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/)
  if (!m) return { parts: [], pre: s || null }
  return { parts: m[1].split('.').map((n) => parseInt(n, 10)), pre: m[2] || null }
}

function compareVersion(a, b) {
  const va = parseVersion(a)
  const vb = parseVersion(b)

  const len = Math.max(va.parts.length, vb.parts.length)
  for (let i = 0; i < len; i++) {
    const na = va.parts[i] ?? 0
    const nb = vb.parts[i] ?? 0
    if (na !== nb) return na - nb
  }

  // 主版本相同：正式版 > 预发布版
  if (va.pre === vb.pre) return 0
  if (!va.pre) return 1
  if (!vb.pre) return -1

  // 两边都是预发布：按点分段比较，数字段按数值、字母段按字典序，且数字段优先级低于字母段
  const sa = va.pre.split('.')
  const sb = vb.pre.split('.')
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) {
    if (sa[i] === undefined) return -1 // 段数少者更低（beta < beta.1）
    if (sb[i] === undefined) return 1
    const na = parseInt(sa[i], 10)
    const nb = parseInt(sb[i], 10)
    const naNum = !Number.isNaN(na)
    const nbNum = !Number.isNaN(nb)
    if (naNum && nbNum) {
      if (na !== nb) return na - nb
    } else if (naNum !== nbNum) {
      return naNum ? -1 : 1 // 数字段低于字母段
    } else {
      const cmp = sa[i].localeCompare(sb[i])
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

// ——————————————————————————————————————————————
// registry 递归展开：收集所有 plugin.json URL
// ——————————————————————————————————————————————

// 把 sources.json 里的一项（字符串 URL 或对象）规整为统一描述符
// { id, url, name, official }。字符串项会从 GitHub owner 推导 id/name。
function normalizeSource(entry, index) {
  const raw = typeof entry === 'string' ? { url: entry } : { ...(entry || {}) }
  const url = String(raw.url || '').trim()
  if (!url) return null
  const gh = parseRepoHost(url)
  const owner = gh?.owner || ''
  const official = raw.official ?? owner === 'songloft-org'
  // 兜底 id：用 owner/repo（含分支），与 submit-source.yml 一致，避免同 owner 不同源碰撞
  const idBase = raw.id || (gh ? `${gh.owner}-${gh.repo}${gh.ref ? '-' + gh.ref : ''}` : `source-${index + 1}`)
  const id = String(idBase).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `source-${index + 1}`
  const name = String(raw.name || (official ? '官方' : (gh ? gh.owner : `源 ${index + 1}`)))
  return { id, url, name, official: Boolean(official) }
}

async function expandRegistry(url, { depth, visited, pluginUrls, pluginOrigin, origin }) {
  if (depth > MAX_DEPTH) {
    warn(`registry 递归深度超过 ${MAX_DEPTH}，跳过：${url}`)
    return
  }
  if (visited.has(url)) return // 循环 / 重复引用检测
  visited.add(url)

  let reg
  try {
    reg = await fetchJson(url)
  } catch (e) {
    warn(`拉取源失败，跳过：${url}（${e.message}）`)
    return
  }

  // 记录插件来源：首次命中的顶层源胜出；但官方源只算「收录」，
  // 若社区源也收录了同一插件，归属改判给社区源（原始提交者），
  // 避免官方 registry 转发第三方插件后原作者来源不可见。
  const tag = (pluginUrl) => {
    if (!origin) return
    const prev = pluginOrigin.get(pluginUrl)
    if (!prev || (prev.official && !origin.official)) pluginOrigin.set(pluginUrl, origin)
  }

  // 容错：若直接贴的是单个 plugin.json（没有 plugins/includes，却有 entryPath/name+version），
  // 则把该 URL 本身当作一个插件。方便单插件提交 / 快速测试。
  const isRegistry = Array.isArray(reg.plugins) || Array.isArray(reg.includes)
  const looksLikePlugin = reg.entryPath || (reg.name && reg.version)
  if (!isRegistry && looksLikePlugin) {
    if (pluginUrls.size >= MAX_PLUGINS) {
      warn(`插件数量达到上限 ${MAX_PLUGINS}，后续截断`)
      return
    }
    pluginUrls.add(url)
    tag(url)
    info(`识别为单个 plugin.json：${url}`)
    return
  }

  for (const p of reg.plugins || []) {
    if (typeof p === 'string') {
      if (!pluginUrls.has(p)) {
        if (pluginUrls.size >= MAX_PLUGINS) {
          warn(`插件数量达到上限 ${MAX_PLUGINS}，后续截断`)
          return
        }
        pluginUrls.add(p)
      }
      tag(p) // 即使已存在，也尝试标记（首次胜出）
    }
  }

  for (const inc of reg.includes || []) {
    if (typeof inc === 'string') {
      // includes 引入的嵌套 registry 仍归属到同一个顶层源
      await expandRegistry(inc, { depth: depth + 1, visited, pluginUrls, pluginOrigin, origin })
    }
  }
}

// ——————————————————————————————————————————————
// 开源/闭源探测：从各类 URL 中解析托管平台与 owner/repo
// ——————————————————————————————————————————————

// 从 URL 解析仓库信息，返回 { platform, owner, repo, ref }。
// 支持 GitHub（github.com / raw.githubusercontent.com）与
// Gitee（gitee.com / raw.giteeusercontent.com）。
function parseRepoHost(...urls) {
  for (const u of urls) {
    if (typeof u !== 'string') continue
    // raw.githubusercontent.com/owner/repo/branch/... 优先（能拿到插件自身仓库）
    let m = u.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/#?]+)(?:\/([^/#?]+))?/i)
    if (m) return { platform: 'github', owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: m[3] || null }
    m = u.match(/github\.com\/([^/]+)\/([^/#?]+)(?:\/(?:raw\/)?([^/#?]+))?/i)
    if (m) return { platform: 'github', owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: (m[3] && m[3] !== 'raw') ? m[3] : null }
    // Gitee：raw 地址比 GitHub 多一段 /raw/（raw.giteeusercontent.com/o/r/raw/branch/...）
    m = u.match(/(?:raw\.giteeusercontent\.com|gitee\.com)\/([^/]+)\/([^/#?]+)(?:\/(?:raw\/)?([^/#?]+))?/i)
    if (m) return { platform: 'gitee', owner: m[1], repo: m[2].replace(/\.git$/, ''), ref: (m[3] && m[3] !== 'raw') ? m[3] : null }
  }
  return null
}

// 仓库归属判定：从插件所有可用 URL 解析候选仓库，按「出现次数」投票，票数高者胜。
//
// 为什么不能简单让 homepage 优先：不少插件（尤其官方插件）把 homepage 填成组织/宿主主页，
// 如「智能音箱」的 homepage 是 songloft-org/songloft，而 downloadUrl / updateUrl /
// pluginJsonUrl 三项一致指向 songloft-plugin-miot。若取 homepage，stars、开源探测、
// 头像会全部落在宿主主仓库上（把宿主的 1600+ star 当成插件 star）。
//
// 为什么不能简单让 downloadUrl 优先：部分插件的 plugin.json 托管在「registry 仓库」，
// 而下载包在插件源码仓库（如 lxbridge：update/pj 指向 songloft-plugin-registry，
// download 指向 lxbridge）；也有把发布包放 Gitee 的（如 multisource-music）。
//
// 投票制能同时覆盖上述两种情形：
//   智能音箱       -> miot 3 票 胜 songloft 1 票
//   LX音乐桥       -> lxbridge 2 票 vs registry 2 票（平票，按 rank 取 download 的 lxbridge）
//   多源音乐桥     -> github 3 票 胜 gitee 1 票
// 平票时的可信度顺序：download > homepage > update > pluginJson。
// release 直链最可能指向插件自身仓库；registry 仓库通常只出现在 update / pluginJson 两项。
function resolveRepo(entry, pluginJsonUrl) {
  const candidates = [
    { url: entry.downloadUrl, rank: 0 },
    { url: entry.homepage, rank: 1 },
    { url: entry.updateUrl, rank: 2 },
    { url: pluginJsonUrl, rank: 3 },
  ]
  const tally = new Map()
  for (const c of candidates) {
    const repo = parseRepoHost(c.url)
    if (!repo) continue
    const id = `${repo.platform}:${repo.owner}/${repo.repo}`.toLowerCase()
    const prev = tally.get(id)
    if (prev) prev.count += 1
    else tally.set(id, { count: 1, rank: c.rank, repo })
  }
  if (!tally.size) return null
  return [...tally.values()].sort((a, b) => b.count - a.count || a.rank - b.rank)[0].repo
}

// 两平台 raw 文件直链格式不同，统一从这里生成：
//   GitHub: raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}
//   Gitee:  raw.giteeusercontent.com/{owner}/{repo}/raw/{branch}/{path}
function rawFileUrl(platform, owner, repo, branch, path) {
  return platform === 'gitee'
    ? `https://raw.giteeusercontent.com/${owner}/${repo}/raw/${branch}/${path}`
    : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`
}

// 从 plugin.json 的 URL 解析其所在子目录（如 news-plugin/），用于开源探测。
// 不少插件把源码放在仓库子目录而非根目录，只探根目录会误判为闭源。
function subDirFromPluginUrl(url) {
  if (typeof url !== 'string') return ''
  // 取仓库路径之后的部分：raw.githubusercontent.com/{owner}/{repo}/<rest>
  // 或 github.com/{owner}/{repo}/raw|blob/<rest>
  let m = url.match(/raw\.githubusercontent\.com\/[^/#?]+\/[^/#?]+\/(.+)$/i)
  let rest = m ? m[1] : ''
  if (!rest) {
    m = url.match(/github\.com\/[^/#?]+\/[^/#?]+\/(?:raw|blob)\/(.+)$/i)
    rest = m ? m[1] : ''
  }
  if (!rest) {
    // Gitee：gitee.com/{owner}/{repo}/raw/{branch}/... 或 raw.giteeusercontent.com/...
    m = url.match(/(?:raw\.giteeusercontent\.com|gitee\.com)\/[^/#?]+\/[^/#?]+\/(?:raw\/)?(.+)$/i)
    rest = m ? m[1] : ''
  }
  if (!rest) return ''
  const segs = String(rest).split('/').filter(Boolean)
  if (segs.length < 2) return '' // 至少要有分支 + 文件名
  let i = 0
  // 容错：raw.githubusercontent.com 偶见多余的 raw/ 段（如 …/raw/refs/heads/master/…）
  if (segs[0] === 'raw' || segs[0] === 'blob') i = 1
  // 分支：refs/heads/xxx、refs/tags/xxx 占 3 段，普通分支名占 1 段
  i += segs[i] === 'refs' ? 3 : 1
  const dirSegs = segs.slice(i, -1) // 去掉末尾文件名，剩下子目录
  return dirSegs.length ? dirSegs.join('/') + '/' : ''
}

// 判断仓库是否真的包含源码（而非只上传打包 zip 的「发布仓库」）。
// 用平台 raw 直链 HEAD 探测标志性源码文件，不占任何 API 额度。
// 命中任一即视为开源：package.json / tsconfig.json / go.mod / src/index.ts
// 探测范围：仓库根目录 + plugin.json 所在子目录（源码常放子目录）
// branches 默认只试 main/master；调用方拿到 API 的 default_branch 后可传具体分支补探。
async function repoHasSource(owner, repo, subDir = '', platform = 'github', branches = ['main', 'master']) {
  const files = ['package.json', 'tsconfig.json', 'go.mod', 'src/index.ts']
  const dirs = ['', subDir].filter((d, i, a) => a.indexOf(d) === i)
  for (const branch of branches) {
    for (const dir of dirs) {
      for (const f of files) {
        if (await headOk(rawFileUrl(platform, owner, repo, branch, dir + f))) {
          return true
        }
      }
    }
  }
  return false
}

// 下载并解包 .jsplugin.zip，带内存缓存（图标提取与包校验共用，避免重复下载）。
// 返回 { files, lastModified }：files 为 { 相对路径 -> Uint8Array }；lastModified 取自响应头。
const zipCache = new Map()
async function fetchZip(url) {
  if (zipCache.has(url)) return zipCache.get(url)
  const resp = await fetchWithTimeout(viaProxy(url))
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const lm = resp.headers.get('last-modified')
  const len = Number(resp.headers.get('content-length') || 0)
  if (len && len > MAX_ZIP_BYTES) throw new Error(`zip 超过 ${MAX_ZIP_BYTES} 字节上限`)
  const ab = await resp.arrayBuffer()
  if (ab.byteLength > MAX_ZIP_BYTES) throw new Error(`zip 超过 ${MAX_ZIP_BYTES} 字节上限`)
  const files = unzipSync(new Uint8Array(ab))
  const result = { files, lastModified: lm ? new Date(Date.parse(lm)).toISOString() : null }
  zipCache.set(url, result)
  return result
}

// ——————————————————————————————————————————————
// 图标提取：插件图标只打包在 .jsplugin.zip 内（构建后带 hash 文件名），
// 仓库里没有独立图片 URL。这里下载插件包、按 zip 内 plugin.json 的 icon
// 字段定位图标文件，落地到 data/icons 与 public/icons。按版本缓存，
// 版本未变则复用已提交的图标，避免每次构建重复下载。
// ——————————————————————————————————————————————

function iconExt(name) {
  const m = String(name).toLowerCase().match(/\.(svg|png|jpe?g|webp|gif)$/)
  return m ? m[1].replace('jpeg', 'jpg') : 'png'
}

function reusePrevIcon(entry, prev) {
  if (!prev || typeof prev.logo !== 'string' || !prev.logo.startsWith('icons/')) return false
  const cached = resolve(dataDir, prev.logo)
  if (!existsSync(cached)) return false
  entry.logo = prev.logo
  if (DRY_RUN) return true // 测试模式：不写盘
  mkdirSync(ICONS_PUBLIC_DIR, { recursive: true })
  copyFileSync(cached, resolve(publicDir, prev.logo))
  return true
}

async function extractIconFromZip(entry, prevMap) {
  // 作者若直接给了绝对图片 URL，则无需下载插件包
  if (entry.logo) return
  if (!entry.downloadUrl) return

  const prev = prevMap.get(entry.entryPath)
  // 版本未变且已有提交入库的图标 → 直接复用
  if (prev && prev.version === entry.version && reusePrevIcon(entry, prev)) return

  try {
    // 下载插件包（带缓存：校验包时复用，避免重复下载）
    const { files, lastModified } = await fetchZip(entry.downloadUrl)
    if (lastModified) entry.updatedAt = lastModified
    const names = Object.keys(files)

    // 优先按 zip 内 plugin.json 的 icon 字段定位（打包后为 hash 文件名）
    let iconName = null
    if (files['plugin.json']) {
      try {
        iconName = JSON.parse(strFromU8(files['plugin.json'])).icon
      } catch {}
    }
    let iconPath = null
    if (iconName) {
      const base = String(iconName).split('/').pop()
      iconPath = names.find((n) => n === iconName || n === base || n.endsWith('/' + base))
    }
    // 兜底：包内任意 icon*/logo* 图片
    if (!iconPath) {
      iconPath = names.find((n) => /(^|\/)(icon|logo)[^/]*\.(svg|png|jpe?g|webp)$/i.test(n))
    }
    if (!iconPath || !files[iconPath]) return // 无图标，前端回退首字母

    const rel = `icons/${entry.entryPath}.${iconExt(iconPath)}`
    entry.logo = rel
    if (DRY_RUN) return // 测试模式：只报告“能提取到图标”，不写盘
    mkdirSync(ICONS_DATA_DIR, { recursive: true })
    mkdirSync(ICONS_PUBLIC_DIR, { recursive: true })
    const bytes = Buffer.from(files[iconPath])
    writeFileSync(resolve(dataDir, rel), bytes)
    writeFileSync(resolve(publicDir, rel), bytes)
  } catch (e) {
    warn(`提取图标失败：${entry.entryPath}（${e.message}）`)
    reusePrevIcon(entry, prev) // 回退到上次缓存的图标
  }
}

// ——————————————————————————————————————————————
// 插件包静态校验（--check-packages）：不执行插件、不需要宿主运行时，
// 只做「包可解、清单合法、入口存在、JS 语法可编译」四件事，足以在 CI
// 拦截坏包 / 损坏 zip / 语法错误 / 缺字段等问题。
// 返回：
//   string[] —— 校验结论（空数组表示通过；非空表示该包本身有问题）
//   null     —— 跳过（无 downloadUrl / 临时下载故障），不计入失败
// ——————————————————————————————————————————————

const REQUIRED_PJ_FIELDS = ['name', 'version', 'description', 'author']

// 这些报错属于 ESM 模块特征，script 模式无法编译，不应判为语法错误
const ESM_NOISE = /import statement|export .* outside|Cannot use import|Unexpected token 'export'|Unexpected token 'import'/i

async function validatePackage(entry) {
  // 无 downloadUrl：没有包可校验，跳过（不判失败）
  if (!entry.downloadUrl) {
    warn(`跳过包校验（无 downloadUrl）：${entry.entryPath}`)
    return null
  }
  let files
  try {
    ({ files } = await fetchZip(entry.downloadUrl))
  } catch (e) {
    // 下载/解包失败（限流 403、网络抖动、S3 重定向等临时故障）降级为警告，
    // 不阻断 PR：生产构建已对不可达包告警；真实坏包由结构/语法错误拦截。
    warn(`插件包下载/解包失败，跳过校验：${entry.entryPath}（${e.message}）`)
    return null
  }

  const errs = []
  const pjRaw = files['plugin.json']
  if (!pjRaw) {
    errs.push('插件包内缺少 plugin.json')
    return errs
  }
  let pj
  try {
    pj = JSON.parse(strFromU8(pjRaw))
  } catch {
    errs.push('插件包内 plugin.json 不是合法 JSON')
    return errs
  }

  for (const f of REQUIRED_PJ_FIELDS) {
    const v = pj[f]
    if (v == null || (typeof v === 'string' && !v.trim())) {
      errs.push(`plugin.json 缺少必填字段：${f}`)
    }
  }
  if (!Array.isArray(pj.permissions)) {
    errs.push('plugin.json.permissions 应为数组')
  }
  if (pj.main) {
    const base = String(pj.main).split('/').pop()
    const hit = Object.keys(files).find(
      (n) => n === pj.main || n === base || n.endsWith('/' + base),
    )
    if (!hit) errs.push(`声明的入口文件不存在于包内：${pj.main}`)
  }

  // 逐个 JS 文件做语法编译（不执行），拦截语法错误/坏包
  for (const [name, data] of Object.entries(files)) {
    if (!/\.m?js$/i.test(name) || name.endsWith('/')) continue
    try {
      createScript(strFromU8(data), { filename: name })
    } catch (e) {
      const msg = e.message || ''
      if (ESM_NOISE.test(msg)) continue // ESM 特征，跳过
      errs.push(`JS 语法错误 ${name}：${msg}`)
    }
  }

  return errs
}

// ——————————————————————————————————————————————
// 解析单个插件
// ——————————————————————————————————————————————

async function processPlugin(pluginJsonUrl, prevMap) {
  let pj
  try {
    pj = await fetchJson(pluginJsonUrl)
  } catch (e) {
    warn(`拉取 plugin.json 失败：${pluginJsonUrl}（${e.message}）`)
    // 回退：若上一次缓存里能按 URL 找到，则沿用
    const prev = [...prevMap.values()].find((x) => x.pluginJsonUrl === pluginJsonUrl)
    return prev || null
  }

  const entryPath = pj.entryPath || pj.name
  if (!entryPath) {
    warn(`plugin.json 缺少 entryPath/name，跳过：${pluginJsonUrl}`)
    return null
  }

  const entry = {
    entryPath,
    name: pj.name || entryPath,
    version: normalizeVersion(pj.version) || '0.0.0',
    description: pj.description || '',
    author: pj.author || '',
    permissions: Array.isArray(pj.permissions) ? pj.permissions : [],
    minHostVersion: pj.minHostVersion || null,
    homepage: pj.homepage || null,
    pluginJsonUrl,
    downloadUrl: pj.download_url || null,
    updateUrl: pj.updateUrl || null,
    source: 'closed',
    origin: null,
    repo: null,
    stars: null,
    updatedAt: null,
    license: null,
    // 作者头像直链：Gitee 头像无固定约定 URL，构建时从 Gitee API 的
    // owner.avatar_url 取；GitHub 留空，前端按 github.com/{owner}.png 约定自拼
    avatarUrl: null,
    // 仅保留作者直接提供的绝对图片 URL；相对路径的 icon 实际打包在
    // .jsplugin.zip 内（仓库根目录的同名文件一般不存在），后续由 extractIconFromZip 处理
    logo: /^https?:\/\//i.test(String(pj.logo || pj.icon || '')) ? String(pj.logo || pj.icon) : null,
    tags: [],
    featured: false,
  }

  // 若 plugin.json 未直接给出 download_url，尝试从 updateUrl 指向的 manifest.json 补齐
  if (!entry.downloadUrl && entry.updateUrl) {
    try {
      const manifest = await fetchJson(entry.updateUrl)
      if (manifest.download_url) entry.downloadUrl = manifest.download_url
      if (manifest.version && compareVersion(manifest.version, entry.version) > 0) {
        entry.version = normalizeVersion(manifest.version)
      }
    } catch (e) {
      warn(`拉取 manifest 失败：${entry.updateUrl}（${e.message}）`)
    }
  }

  // 图标：下载插件包从 zip 内提取（图标只存在于包内），按版本缓存
  await extractIconFromZip(entry, prevMap)

  // 最后更新时间兜底：若图标步骤未顺带到日期（如复用了缓存），则用一次 HEAD 取 Last-Modified
  if (!entry.updatedAt && entry.downloadUrl) {
    entry.updatedAt = await fetchReleaseUpdatedAt(entry.downloadUrl)
  }

  // 仓库探测：四个地址投票决定归属（详见 resolveRepo 注释）。
  // downloadUrl / updateUrl / pluginJsonUrl 三项通常一致指向插件自身仓库；
  // homepage 常填组织主页（官方插件多为 songloft-org/songloft），只能算其中一票。
  const gh = resolveRepo(entry, pluginJsonUrl)
  if (gh) {
    const isGitee = gh.platform === 'gitee'
    entry.repo = isGitee ? `https://gitee.com/${gh.owner}/${gh.repo}` : `https://github.com/${gh.owner}/${gh.repo}`
    const prev = prevMap.get(entryPath)
    // 开源判定（不占 API 额度）：探测仓库是否真的包含源码（根目录 + plugin.json 子目录）。
    // 只上传打包 .jsplugin.zip / plugin.json 的「发布仓库」不算开源。
    const hasSource = await repoHasSource(gh.owner, gh.repo, subDirFromPluginUrl(pluginJsonUrl), gh.platform)
    entry.source = hasSource ? 'open' : 'closed'
    try {
      const info = isGitee
        ? await giteeApi(`/repos/${gh.owner}/${gh.repo}`)
        : await githubApi(`/repos/${gh.owner}/${gh.repo}`)
      // API 能访问时，用主编程语言作二次校正（补探测未命中的源码布局）
      if (info.language) entry.source = 'open'
      // 补探默认分支：上面的探测只试了 main/master，而部分仓库的默认分支叫别的名字
      // （release / dev / 插件名等），此时固定分支探测必然落空会把有源码的仓库误判成闭源。
      // 拿到 API 的 default_branch 后再探一次即可，同样不额外消耗 API 额度。
      else if (info.default_branch && !['main', 'master'].includes(String(info.default_branch).toLowerCase())) {
        const found = await repoHasSource(
          gh.owner,
          gh.repo,
          subDirFromPluginUrl(pluginJsonUrl),
          gh.platform,
          [info.default_branch],
        )
        if (found) entry.source = 'open'
      }
      entry.stars = info.stargazers_count ?? null
      entry.updatedAt = info.pushed_at || info.updated_at || entry.updatedAt || null
      // license：GitHub 返回 { spdx_id }；Gitee v5 可能是字符串或对象，兼容处理
      const spdx = typeof info.license === 'string' ? info.license : info.license?.spdx_id
      entry.license = spdx && spdx !== 'NOASSERTION' ? spdx : null
      // 头像：GitHub / Gitee 都从 API 的 owner.avatar_url 取，前端经 wsrv.nl 代理展示。
      // Gitee 的 no_portrait 是默认占位图，视为无头像；GitHub 无此类占位，直接取。
      const avatar = info.owner?.avatar_url || null
      entry.avatarUrl = avatar && (!isGitee || !avatar.includes('no_portrait')) ? avatar : null
      // logo 兜底：仓库根目录 logo.png / icon.png（仅开源仓库才有意义）
      if (!entry.logo && entry.source === 'open') {
        const branch = info.default_branch || 'main'
        for (const name of ['logo.png', 'icon.png']) {
          const raw = rawFileUrl(gh.platform, gh.owner, gh.repo, branch, name)
          if (await headOk(raw)) {
            entry.logo = raw
            break
          }
        }
      }
    } catch (e) {
      // 平台 API 失败（限额/网络）：开源判定已由 raw 探测完成，
      // 仅 stars/license/头像等增强字段回退到上次缓存。
      warn(`${isGitee ? 'Gitee' : 'GitHub'} 增强失败，回退缓存：${entry.repo}（${e.message}）`)
      if (prev) {
        entry.stars = prev.stars ?? null
        entry.updatedAt = entry.updatedAt || prev.updatedAt || null
        entry.license = prev.license ?? null
        entry.logo = entry.logo || prev.logo || null
        entry.avatarUrl = prev.avatarUrl ?? null
      }
    }
  }

  return entry
}

// ——————————————————————————————————————————————
// overlay 合并
// ——————————————————————————————————————————————

function applyOverlay(entry, overrides) {
  const o = overrides[entry.entryPath]
  if (!o) return entry
  const merged = { ...entry }
  for (const [k, v] of Object.entries(o)) {
    if (k === 'tags' && Array.isArray(v)) {
      merged.tags = [...new Set([...(entry.tags || []), ...v])]
    } else {
      merged[k] = v
    }
  }
  return merged
}

// ——————————————————————————————————————————————
// 主流程
// ——————————————————————————————————————————————

function loadPrevCache() {
  const map = new Map()
  if (existsSync(OUTPUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUTPUT_FILE, 'utf-8'))
      for (const p of prev.plugins || []) map.set(p.entryPath, p)
    } catch {
      warn('上次缓存解析失败，忽略')
    }
  }
  return map
}

/**
 * 清理孤儿图标。
 *
 * 图标按 `icons/{entryPath}.{ext}` 命名，插件改名、换 entryPath 或更换图标格式
 * （png -> svg）都会留下不再被引用的旧文件。这些文件会随每次 CI 提交永久堆积在
 * data/icons 里。以本次输出的 logo 引用为准，删除两处目录中用不到的文件。
 * 拉取失败的插件会沿用上一次缓存的 entry（含 logo 引用），因此不会被误删。
 */
function pruneIcons(plugins) {
  const prefix = 'icons/'
  const used = new Set(
    plugins
      .map((p) => p.logo)
      .filter((l) => typeof l === 'string' && l.startsWith(prefix))
      .map((l) => l.slice(prefix.length)),
  )
  let removed = 0
  for (const dir of [ICONS_DATA_DIR, ICONS_PUBLIC_DIR]) {
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir)) {
      if (used.has(file)) continue
      rmSync(resolve(dir, file))
      removed += 1
    }
  }
  if (removed) info(`清理孤儿图标 ${removed} 个文件`)
}

async function main() {
  const overlay = existsSync(OVERLAY_FILE)
    ? JSON.parse(readFileSync(OVERLAY_FILE, 'utf-8'))
    : { overrides: {} }
  const overrides = overlay.overrides || {}
  const prevMap = loadPrevCache()

  // 源：命令行传入 URL 则以它为唯一源（测试），否则读 data/sources.json
  let rawSources
  if (CLI_TEST_URL) {
    rawSources = [CLI_TEST_URL]
    info(`【测试模式】仅试跑：${CLI_TEST_URL}（不写盘）`)
  } else {
    if (!existsSync(SOURCES_FILE)) {
      console.error(`[build] 找不到 ${SOURCES_FILE}`)
      process.exit(1)
    }
    rawSources = JSON.parse(readFileSync(SOURCES_FILE, 'utf-8')).sources || []
  }
  const sourceDescriptors = rawSources.map(normalizeSource).filter(Boolean)

  info(`GitHub Token: ${GITHUB_TOKEN ? '已配置' : '未配置（匿名，限额较低）'}`)
  info(`共 ${sourceDescriptors.length} 个源入口，开始递归展开...`)

  // 1) 展开所有 plugin.json URL（并记录每个插件的顶层来源）
  const pluginUrls = new Set()
  const pluginOrigin = new Map() // pluginJsonUrl -> 源描述符 { id, official, ... }
  const visited = new Set()
  for (const src of sourceDescriptors) {
    await expandRegistry(src.url, { depth: 0, visited, pluginUrls, pluginOrigin, origin: src })
  }
  info(`展开得到 ${pluginUrls.size} 个 plugin.json URL`)

  // 2) 逐个解析（串行，避免 GitHub 限额与目标站点压力）
  const byEntry = new Map()
  for (const url of pluginUrls) {
    const entry = await processPlugin(url, prevMap)
    if (!entry) continue
    entry.origin = pluginOrigin.get(url)?.id || entry.origin || null
    // 3) 按 entryPath 去重，保留高版本
    const existing = byEntry.get(entry.entryPath)
    if (!existing || compareVersion(entry.version, existing.version) > 0) {
      byEntry.set(entry.entryPath, entry)
    }
  }

  // 3.5) 包静态校验（仅 --check-packages）：校验将进入输出的插件包
  if (CHECK_PACKAGES) {
    for (const entry of byEntry.values()) {
      const res = await validatePackage(entry)
      if (res === null) continue // 跳过（无包 / 临时故障），不计入失败
      if (res.length) packageErrors.set(entry.entryPath, res)
    }
  }

  // 4) overlay 合并 + 排序（精选优先，其次 stars，再次更新时间）
  let plugins = [...byEntry.values()].map((e) => applyOverlay(e, overrides))
  plugins.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    if ((b.stars ?? -1) !== (a.stars ?? -1)) return (b.stars ?? -1) - (a.stars ?? -1)
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
  })

  const openCount = plugins.filter((p) => p.source === 'open').length
  // 来源清单（供前端「来源」筛选）：按 sources.json 顺序，带每个源的插件数
  const sourceSummary = sourceDescriptors.map((s) => ({
    id: s.id,
    name: s.name,
    official: s.official,
    url: s.url,
    count: plugins.filter((p) => p.origin === s.id).length,
  }))
  const output = {
    generatedAt: new Date().toISOString(),
    count: plugins.length,
    openCount,
    closedCount: plugins.length - openCount,
    sources: sourceSummary,
    warnings,
    plugins,
  }

  // 包静态校验：有错误则直接判失败（submit-source.yml / validate.yml 均会拦截）
  if (CHECK_PACKAGES && packageErrors.size) {
    console.error('\n[build] ❌ 插件包校验未通过：')
    for (const [ep, errs] of packageErrors) {
      console.error(`  • ${ep}:`)
      for (const e of errs) console.error(`    - ${e}`)
    }
    process.exit(1)
  }

  // 5) 测试模式只打印结果，不写盘；否则写 data/（缓存）与 public/（前端运行时）
  if (DRY_RUN) {
    info(`【测试模式】共 ${plugins.length} 个插件（开源 ${openCount} / 闭源 ${plugins.length - openCount}），警告 ${warnings.length} 条`)
    const originName = (id) => sourceSummary.find((s) => s.id === id)?.name || id || '-'
    for (const p of plugins) {
      const flags = [
        p.source === 'open' ? '开源' : '闭源',
        p.logo ? '图标✓' : '图标✗',
        p.downloadUrl ? '下载✓' : '下载✗',
      ].join(' ')
      console.log(`  • ${p.name} (${p.entryPath}) v${p.version} | 来源:${originName(p.origin)} | ★${p.stars ?? '-'} | ${p.updatedAt || '无日期'} | ${flags}`)
    }
    // 无效源（0 个插件）视为校验失败：供 submit-source.yml 据此判断是否开 PR
    if (plugins.length === 0) {
      console.error('[build] ❌ 测试失败：未能从源解析到任何插件（URL 不可达，或不是合法的 registry.json / plugin.json）')
      process.exit(1)
    }
    if (CHECK_PACKAGES) info('✅ 全部插件包静态校验通过')
    if (warnings.length) console.log(`  警告：\n    - ${warnings.join('\n    - ')}`)
    info('✅ 测试完成（未写入任何文件）')
    return
  }

  mkdirSync(dataDir, { recursive: true })
  mkdirSync(publicDir, { recursive: true })
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf-8')
  copyFileSync(OUTPUT_FILE, PUBLIC_OUTPUT)
  pruneIcons(plugins)

  info(`✅ 完成：${plugins.length} 个插件（开源 ${openCount} / 闭源 ${plugins.length - openCount}），警告 ${warnings.length} 条`)
  info(`输出：${OUTPUT_FILE}`)
}

main().catch((e) => {
  console.error('[build] 致命错误：', e)
  process.exit(1)
})
