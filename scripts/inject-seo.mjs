// 构建后注入 SEO 资源（在 `vite build` 之后执行）：
//   1. 向 dist/index.html 注入 JSON-LD 结构化数据
//      （CollectionPage + ItemList，含全部插件元数据，使爬虫可索引列表内容）
//   2. 预生成路由子目录（dist/issues/index.html 等）与 dist/404.html：
//      GitHub Pages 无 SPA 回退，预生成的真实文件使已知路由直达/刷新返回 200；
//      未知路径由 404.html 兜底回市场页（Cloudflare 侧 wrangler 已配置 SPA
//      回退，这些真实文件同样存在，行为一致）。新增路由时需同步更新
//      PRERENDER_ROUTES 清单。
//   3. 生成 dist/sitemap.xml（站点已知路由）
//   4. 生成 dist/robots.txt
//
// 站点域名可由环境变量 SITE_URL 覆盖，默认使用已部署的 GitHub Pages 备用地址。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const SITE_URL = (process.env.SITE_URL || 'https://songloft-store.lllh.de').replace(/\/$/, '')

// 预生成子目录的路由清单（与 src/router.ts 保持同步，首页 "/" 除外）。
// 新增路由时必须在此同步添加，否则 GitHub Pages 上直达/刷新只能靠 404.html 兜底。
const PRERENDER_ROUTES = ['issues', 'discussions']

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

// —— 预生成路由子目录与 404.html ——
// 复制注入后的最终 HTML，保证每个入口都带 JSON-LD 等资源。
for (const route of PRERENDER_ROUTES) {
  const dir = resolve(root, 'dist', route)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), html)
}
writeFileSync(resolve(root, 'dist/404.html'), html)
console.log(`[inject-seo] 已预生成 ${PRERENDER_ROUTES.map((r) => `/${r}`).join('、')} 入口与 404.html 兜底`)

// —— sitemap.xml ——
const routes = [`${SITE_URL}/`, ...PRERENDER_ROUTES.map((r) => `${SITE_URL}/${r}`)]
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
