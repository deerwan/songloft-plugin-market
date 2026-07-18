import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import { cloudflare } from "@cloudflare/vite-plugin";

// BASE_PATH 允许部署到子路径（如 GitHub Pages 的 /songloft-plugin-market/）。
// 默认根路径，Cloudflare Pages / 自定义域名直接用 '/'。
// DEPLOY_TARGET=github-pages 时不加载 Cloudflare 插件，产出纯静态站点。
const isGithubPages = process.env.DEPLOY_TARGET === 'github-pages'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), ...(isGithubPages ? [] : [cloudflare()])],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})