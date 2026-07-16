import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import { cloudflare } from "@cloudflare/vite-plugin";

// BASE_PATH 允许部署到子路径（如 GitHub Pages 的 /songloft-plugin-market/）。
// 默认根路径，Cloudflare Pages / 自定义域名直接用 '/'。
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [vue(), cloudflare()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})