// 构建后注入 SEO 资源（在 `vite build` 之后执行）：
//   1. 向 dist/index.html 注入 JSON-LD 结构化数据
//      （CollectionPage + ItemList，含全部插件元数据，使爬虫可索引列表内容）
//   2. 生成 dist/sitemap.xml（站点已知路由）
//   3. 生成 dist/robots.txt
//
// 站点域名可由环境变量 SITE_URL 覆盖，默认使用已部署的 GitHub Pages 备用地址。
// 说明：当前为 hash 路由（#/market），搜索引擎不会把 fragment 当作独立页面，
// 因此 sitemap 仅列出站点级路由；插件级内容通过 JSON-LD 的 ItemList 提供元数据，
// 由 Google 等支持结构化数据的爬虫收录。后续若要逐插件独立收录，需改造为
// History 路由 + 预渲染（SSG）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const SITE_URL = (process.env.SITE_URL || 'https://songloft-store.lllh.de').replace(/\/$/, '')

const distHtml = resolve(root, 'dist/index.html')
if (!existsSync(distHtml)) {
  console.error('[inject-seo] dist/index.html 不存在，跳过（请先执行 vite build）')
  process.exit(0)
}

// 数据来源：构建期已生成的插件缓存（已入库的源数据）
const dataPath = resolve(root, 'data/plugins.generated.json')
const plugins = existsSync(dataPath)
  ? (JSON.parse(readFileSync(dataPath, 'utf8')).plugins || [])
  : []

const lastmod = new Date().toISOString().slice(0, 10)

// —— JSON-LD ——
const itemListElements = plugins.slice(0, 500).map((p, i) => {
  const url = p.repo || p.homepage || p.pluginJsonUrl || null
  return {
    '@type': 'ListItem',
    position: i + 1,
    name: p.name,
    description: p.description || undefined,
    url: url || undefined,
    author: p.author || undefined,
  }
})

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'Songloft 插件市场',
  description: '浏览、搜索、筛选 Songloft 社区 JS 插件，一键订阅全部官方与社区插件源。',
  url: `${SITE_URL}/`,
  mainEntity: {
    '@type': 'ItemList',
    numberOfItems: itemListElements.length,
    itemListElement: itemListElements,
  },
}

const jsonLdTag = `  <script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n  </script>`

let html = readFileSync(distHtml, 'utf8')
if (!html.includes('application/ld+json')) {
  html = html.replace('</head>', `${jsonLdTag}\n  </head>`)
  writeFileSync(distHtml, html)
  console.log(`[inject-seo] 已注入 JSON-LD（含 ${itemListElements.length} 个插件元数据）`)
} else {
  console.log('[inject-seo] JSON-LD 已存在，跳过')
}

// —— sitemap.xml ——
const routes = [`${SITE_URL}/`, `${SITE_URL}/#/issues`, `${SITE_URL}/#/discussions`]
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map((loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join('\n')}
</urlset>
`
writeFileSync(resolve(root, 'dist/sitemap.xml'), sitemap)

// —— robots.txt ——
const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`
writeFileSync(resolve(root, 'dist/robots.txt'), robots)

console.log(`[inject-seo] 已生成 sitemap.xml 与 robots.txt（SITE_URL=${SITE_URL}）`)
