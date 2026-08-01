/// <reference types="vite/client" />

/* giscus 相关环境变量的类型声明。
 * 均为可选：未配置时 src/config.ts 会回退到当前仓库的默认值。
 */
interface ImportMetaEnv {
  readonly VITE_GISCUS_REPO?: string
  readonly VITE_GISCUS_REPO_ID?: string
  readonly VITE_GISCUS_CATEGORY?: string
  readonly VITE_GISCUS_CATEGORY_ID?: string
  readonly VITE_GISCUS_THEME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
