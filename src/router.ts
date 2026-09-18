/* 应用路由表。
 *
 * 关键设计：
 * - 使用 history 模式（createWebHistory）。站点部署在 GitHub Pages + Cloudflare：
 *   Cloudflare 侧 wrangler.jsonc 已配置 SPA 回退；GitHub Pages 无 SPA 回退，
 *   由构建脚本（scripts/inject-seo.mjs）为已知路由预生成子目录 index.html
 *   （直达/刷新返回 200），未知路径由 dist/404.html 兜底回市场页。
 *   注意：新增路由时需同步在 inject-seo.mjs 的预生成清单中添加对应子目录。
 * - 传入 BASE_URL，保证将来部署到子路径（如 GitHub Pages 项目页）时路由 base 正确。
 * - 组件全部同步引入：市场页是首屏主体，Issues/Discussions 两页体积很小，
 *   拆包收益不抵额外请求，保持简单。
 */
import { createRouter, createWebHistory } from 'vue-router'
import PluginMarket from './components/PluginMarket.vue'
import IssuesView from './views/IssuesView.vue'
import DiscussionsView from './views/DiscussionsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 插件市场即首页：根路径直接渲染市场列表。
    // /market 保留为 alias，兼容站内旧链接、README 与 Issue 中已分享的地址
    { path: '/', name: 'market', component: PluginMarket, alias: ['/market'], meta: { title: '插件市场' } },
    { path: '/issues', name: 'issues', component: IssuesView, meta: { title: 'Issues' } },
    {
      path: '/discussions',
      name: 'discussions',
      component: DiscussionsView,
      meta: { title: '讨论' },
    },
    // 未知路径一律回市场页，避免出现空白视图
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · Songloft` : 'Songloft'
})

export default router
