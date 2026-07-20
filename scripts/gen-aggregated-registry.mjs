#!/usr/bin/env node
/**
 * 从 data/sources.json 生成一个聚合 registry.json（零网络依赖）。
 *
 * 设计：宿主端支持插件源的 includes 嵌套引用（见 plugin_registry.md 第 13、166 行），
 * 且 includes / plugins 中单条目拉取失败不影响其他条目（第 264 行）。因此本聚合源
 * 采用「includes 聚合」设计：把收录的每个 registry 源放进 includes，由宿主端递归展开，
 * 而非把插件 URL 拍平到 plugins（拍平既没必要、也失去跟随上游更新的能力）。
 *
 * 分类规则（按 URL 后缀，无需联网即可判断）：
 *   - 以 registry.json 结尾  -> includes（宿主端递归解析其内部 includes/plugins）
 *   - 其余（plugin.json 等）  -> plugins（单个插件源）
 *
 * URL 归一化（仅改写写法，不加任何代理/镜像前缀）：
 *   - github.com/{o}/{r}/raw/{ref}/{...}  -> raw.githubusercontent.com/{o}/{r}/{ref}/{...}
 *   - 去掉 /refs/heads/ 与 /refs/tags/ 中间路径
 * 这样所有条目都是标准 raw.githubusercontent.com 直链，宿主端的「GitHub 镜像加速」才能生效
 * （自定义域名的源不会被镜像加速覆盖，见文档第 263 行）。
 *
 * 输出：仓库根目录 registry.json（供宿主用 raw.githubusercontent.com 订阅），
 *       同时复制到 public/registry.json（随 GitHub Pages 发布的兜底地址）。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sourcesFile = resolve(root, 'data/sources.json')
const outFile = resolve(root, 'registry.json') // 仓库根：raw.githubusercontent.com 订阅地址
const publicOutFile = resolve(root, 'public/registry.json') // GitHub Pages 兜底地址

const { sources = [] } = JSON.parse(readFileSync(sourcesFile, 'utf-8'))

// 仅规范化 URL 写法（去重定向形态、去 refs 中间路径），绝不添加代理/镜像前缀
function normalizeUrl(url) {
  let u = String(url || '').trim()
  if (!u) return u
  // github.com/{o}/{r}/raw/{ref}/{...}  -> raw.githubusercontent.com/{o}/{r}/{ref}/{...}
  u = u.replace(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.*)$/i,
    'https://raw.githubusercontent.com/$1/$2/$3/$4',
  )
  // 去掉 /refs/heads/ 与 /refs/tags/
  u = u.replace(
    /(raw\.githubusercontent\.com\/[^/]+\/[^/]+\/)refs\/(?:heads|tags)\//i,
    '$1',
  )
  return u
}

const includes = []
const plugins = []
const seen = new Set()

for (const entry of sources) {
  const raw = typeof entry === 'string' ? entry : entry?.url || ''
  const url = normalizeUrl(raw)
  if (!url || seen.has(url)) continue
  seen.add(url)

  // 显式 type 标注优先；否则按 URL 后缀推断
  const explicit = typeof entry === 'object' ? entry.type : ''
  const isRegistry = explicit
    ? explicit === 'registry'
    : /\/registry\.json(\?.*)?$/i.test(url)

  if (isRegistry) includes.push(url)
  else plugins.push(url)
}

const aggregated = {
  name: 'Songloft 社区聚合源',
  description: '由 songloft-plugin-market 自动生成，聚合官方与社区收录的全部插件源。',
  homepage: 'https://github.com/deerwan/songloft-plugin-market',
  includes,
  plugins,
}

mkdirSync(resolve(root, 'public'), { recursive: true })
writeFileSync(outFile, JSON.stringify(aggregated, null, 2) + '\n', 'utf-8')
copyFileSync(outFile, publicOutFile)
console.log(
  `[gen] 聚合源已生成: ${includes.length} includes + ${plugins.length} plugins -> ${outFile}`,
)
