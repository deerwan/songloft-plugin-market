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

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
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
const DRY_RUN = Boolean(CLI_TEST_URL) || process.argv.includes('--dry-run')
// 包校验：在 DRY_RUN 基础上，额外下载 .jsplugin.zip 做结构/语法静态校验。
// 用于 submit-source.yml 与 validate.yml（PR 拦截坏包）。不影响正常的生产数据构建。
const CHECK_PACKAGES = process.argv.includes('--check-packages')

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

// ——————————————————————————————————————————————
// 版本比较（按 . 分段数值比较，去掉前导 v）
// ——————————————————————————————————————————————

function normalizeVersion(v) {
  return String(v || '').replace(/^v/i, '').trim()
}

function compareVersion(a, b) {
  const pa = normalizeVersion(a).split(/[.\-+]/)
  const pb = normalizeVersion(b).split(/[.\-+]/)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] || '0', 10)
    const nb = parseInt(pb[i] || '0', 10)
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      const cmp = (pa[i] || '').localeCompare(pb[i] || '')
      if (cmp !== 0) return cmp
    } else if (na !== nb) {
      return na - nb
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
  const owner = parseGitHubRepo(url)?.owner || ''
  const official = raw.official ?? owner === 'songloft-org'
  const id = String(raw.id || owner || `source-${index + 1}`)
  const name = String(raw.name || (official ? '官方' : owner || `源 ${index + 1}`))
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

  // 记录插件来源（首次命中的顶层源胜出）
  const tag = (pluginUrl) => {
    if (origin && !pluginOrigin.has(pluginUrl)) pluginOrigin.set(pluginUrl, origin.id)
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
// 开源/闭源探测：从各类 URL 中解析 GitHub owner/repo
// ——————————————————————————————————————————————

function parseGitHubRepo(...urls) {
  for (const u of urls) {
    if (typeof u !== 'string') continue
    // raw.githubusercontent.com/owner/repo/... 优先（能拿到插件自身仓库）
    let m = u.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/#?]+)/i)
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
    m = u.match(/github\.com\/([^/]+)\/([^/#?]+)/i)
    if (m) return { owner: m[1], repo: m[2].replace(/\.git$/, '') }
  }
  return null
}

// 判断仓库是否真的包含源码（而非只上传打包 zip 的「发布仓库」）。
// 用 raw.githubusercontent.com HEAD 探测标志性源码文件，不占 GitHub API 额度。
// 命中任一即视为开源：package.json / tsconfig.json / go.mod / src/index.ts
async function repoHasSource(owner, repo) {
  const files = ['package.json', 'tsconfig.json', 'go.mod', 'src/index.ts']
  for (const branch of ['main', 'master']) {
    for (const f of files) {
      if (await headOk(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${f}`)) {
        return true
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
// 返回 string[]：错误信息列表；空数组表示通过。
// ——————————————————————————————————————————————

const REQUIRED_PJ_FIELDS = ['name', 'version', 'description', 'author']

// 这些报错属于 ESM 模块特征，script 模式无法编译，不应判为语法错误
const ESM_NOISE = /import statement|export .* outside|Cannot use import|Unexpected token 'export'|Unexpected token 'import'/i

async function validatePackage(entry) {
  const errs = []
  if (!entry.downloadUrl) {
    errs.push('缺少 downloadUrl（无法获取插件包）')
    return errs
  }
  let files
  try {
    ({ files } = await fetchZip(entry.downloadUrl))
  } catch (e) {
    errs.push(`插件包下载/解包失败：${e.message}`)
    return errs
  }

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

  // 开源探测：优先用插件自身的 URL（下载/更新/plugin.json），homepage 最后
  // （homepage 常指向主项目仓库，而非插件自己的仓库）
  const gh = parseGitHubRepo(entry.downloadUrl, entry.updateUrl, pluginJsonUrl, entry.homepage)
  if (gh) {
    entry.repo = `https://github.com/${gh.owner}/${gh.repo}`
    const prev = prevMap.get(entryPath)
    // 开源判定（不占 API 额度）：探测仓库是否真的包含源码。
    // 只上传打包 .jsplugin.zip / plugin.json 的「发布仓库」不算开源。
    const hasSource = await repoHasSource(gh.owner, gh.repo)
    entry.source = hasSource ? 'open' : 'closed'
    try {
      const info = await githubApi(`/repos/${gh.owner}/${gh.repo}`)
      // API 能访问时，用主编程语言作二次校正（补探测未命中的源码布局）
      if (info.language) entry.source = 'open'
      entry.stars = info.stargazers_count ?? null
      entry.updatedAt = info.pushed_at || info.updated_at || entry.updatedAt || null
      entry.license = info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION'
        ? info.license.spdx_id
        : null
      // logo 兜底：仓库根目录 logo.png / icon.png（仅开源仓库才有意义）
      if (!entry.logo && entry.source === 'open') {
        const branch = info.default_branch || 'main'
        for (const name of ['logo.png', 'icon.png']) {
          const raw = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${branch}/${name}`
          if (await headOk(raw)) {
            entry.logo = raw
            break
          }
        }
      }
    } catch (e) {
      // GitHub API 失败（限额/网络）：开源判定已由 raw 探测完成，
      // 仅 stars/license 等增强字段回退到上次缓存。
      warn(`GitHub 增强失败，回退缓存：${entry.repo}（${e.message}）`)
      if (prev) {
        entry.stars = prev.stars ?? null
        entry.updatedAt = entry.updatedAt || prev.updatedAt || null
        entry.license = prev.license ?? null
        entry.logo = entry.logo || prev.logo || null
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
  const pluginOrigin = new Map() // pluginJsonUrl -> source.id
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
    entry.origin = pluginOrigin.get(url) || entry.origin || null
    // 3) 按 entryPath 去重，保留高版本
    const existing = byEntry.get(entry.entryPath)
    if (!existing || compareVersion(entry.version, existing.version) > 0) {
      byEntry.set(entry.entryPath, entry)
    }
  }

  // 3.5) 包静态校验（仅 --check-packages）：校验将进入输出的插件包
  if (CHECK_PACKAGES) {
    for (const entry of byEntry.values()) {
      if (!entry.downloadUrl) {
        packageErrors.set(entry.entryPath, ['缺少 downloadUrl（无法获取插件包）'])
        continue
      }
      const errs = await validatePackage(entry)
      if (errs.length) packageErrors.set(entry.entryPath, errs)
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

  info(`✅ 完成：${plugins.length} 个插件（开源 ${openCount} / 闭源 ${plugins.length - openCount}），警告 ${warnings.length} 条`)
  info(`输出：${OUTPUT_FILE}`)
}

main().catch((e) => {
  console.error('[build] 致命错误：', e)
  process.exit(1)
})
