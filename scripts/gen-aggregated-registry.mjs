#!/usr/bin/env node
/**
 * 从 data/sources.json 生成一个聚合 registry.json（零网络依赖）。
 *
 * 背景：宿主端支持插件源的 includes 嵌套引用（见 plugin_registry.md）。
 * 本脚本把 market 收录的所有源"翻译"成一个宿主可直接订阅的单一源，
 * 用户只需在宿主里配置这一个 URL，即可拉取全部社区源的插件（issue #15）。
 *
 * 分类规则（按 URL 后缀，无需联网即可判断）：
 *   - 以 registry.json 结尾  -> includes（宿主端递归解析其内部 includes/plugins）
 *   - 其余（plugin.json 等）  -> plugins（单个插件源）
 * 若未来出现不以 registry.json 结尾的聚合源，可在 sources.json 条目里
 * 增加 { "type": "registry" } 显式标注，本脚本会优先采纳该标注。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const sourcesFile = resolve(root, 'data/sources.json')
const outFile = resolve(root, 'public/registry.json')

const { sources = [] } = JSON.parse(readFileSync(sourcesFile, 'utf-8'))

const includes = []
const plugins = []
const seen = new Set()

for (const entry of sources) {
  const url = (typeof entry === 'string' ? entry : entry?.url || '').trim()
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
console.log(
  `[gen] 聚合源已生成: ${includes.length} includes + ${plugins.length} plugins -> ${outFile}`,
)
