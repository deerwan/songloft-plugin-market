/* 站点级外部服务配置。
 *
 * giscus 的四个标识（repo / repo-id / category / category-id）本身是公开信息，
 * 会原样出现在前端 HTML 中，不属于密钥；放环境变量只是为了便于换仓库时无需改代码。
 * 未配置时回退到当前仓库的默认值，保证 clone 下来即可运行。
 */

/** 评论与 Issues 所指向的 GitHub 仓库，格式 `owner/repo`。 */
export const GITHUB_REPO =
  import.meta.env.VITE_GISCUS_REPO ?? 'deerwan/songloft-plugin-market'

/** 仓库主页地址。 */
export const GITHUB_REPO_URL = `https://github.com/${GITHUB_REPO}`

/** 新建 Issue 的地址。 */
export const GITHUB_NEW_ISSUE_URL = `${GITHUB_REPO_URL}/issues/new`

/** 使用仓库中 .github/ISSUE_TEMPLATE/SUBMIT_SOURCE.yml 模板提交插件。 */
export const GITHUB_SUBMIT_PLUGIN_URL = `${GITHUB_REPO_URL}/issues/new?template=SUBMIT_SOURCE.yml`

/** giscus 组件所需配置。 */
export const GISCUS = {
  repo: GITHUB_REPO as `${string}/${string}`,
  repoId: import.meta.env.VITE_GISCUS_REPO_ID ?? 'R_kgDOTaR0Pw',
  category: import.meta.env.VITE_GISCUS_CATEGORY ?? 'Announcements',
  categoryId: import.meta.env.VITE_GISCUS_CATEGORY_ID ?? 'DIC_kwDOTaR0P84DCcAj',
  theme: import.meta.env.VITE_GISCUS_THEME ?? 'dark',
  lang: 'zh-CN',
} as const
