/* 应用路由表。
 *
 * 关键设计：
 * - 使用 hash 模式（createWebHashHistory）。站点部署在 GitHub Pages，
 *   静态托管无法为任意路径回退到 index.html；hash 模式下路径部分始终是 `/`，
 *   刷新与直达链接天然不会 404，无需 404.html 之类的兜底 hack。
 * - 组件全部同步引入：市场页是首屏主体，Issues/Discussions 两页体积很小，
 *   拆包收益不抵额外请求，保持简单。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import PluginMarket from './components/PluginMarket.vue'
import IssuesView from './views/IssuesView.vue'
import DiscussionsView from './views/DiscussionsView.vue'

const router = createRouter({
  history: createWebHashHistory(),
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
