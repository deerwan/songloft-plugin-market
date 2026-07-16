<script setup lang="ts">
import { ref } from 'vue'
import PluginMarket from './components/PluginMarket.vue'
import SubmitSource from './components/SubmitSource.vue'
import PendingSources from './components/PendingSources.vue'

const showSubmit = ref(false)
// 官方品牌图标（与 favicon 共用，支持子路径部署）
const logoSrc = import.meta.env.BASE_URL + 'favicon.svg'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__inner">
        <div class="app-brand">
          <img class="app-brand__logo" :src="logoSrc" alt="Songloft" />
          <div>
            <h1 class="app-brand__title">Songloft 插件市场</h1>
            <p class="app-brand__subtitle">浏览、搜索并安装社区 JS 插件</p>
          </div>
        </div>
        <div class="app-header__actions">
          <button class="btn btn--primary" @click="showSubmit = true">提交插件源</button>
          <a class="app-header__link" href="https://github.com/songloft-org/songloft" target="_blank" rel="noopener">
            GitHub
          </a>
        </div>
      </div>
    </header>

    <main class="app-main">
      <PendingSources />
      <PluginMarket />
    </main>

    <footer class="app-footer">
      基于 Songloft 插件源自动生成 ·
      <a href="https://songloft.hanxi.cc/plugin_registry" target="_blank" rel="noopener">如何发布插件</a>
    </footer>

    <SubmitSource :visible="showSubmit" @close="showSubmit = false" />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  border-bottom: 1px solid var(--slm-border);
  background: var(--slm-bg);
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(8px);
}

.app-header__inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-brand__logo {
  width: 32px;
  height: 32px;
  border-radius: 7px;
  object-fit: contain;
}

.app-brand__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.app-brand__subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--slm-text-2);
}

.app-header__link {
  color: var(--slm-text-2);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}

.app-header__link:hover {
  color: var(--slm-brand);
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
}

.app-footer {
  border-top: 1px solid var(--slm-border);
  padding: 20px 24px;
  text-align: center;
  font-size: 13px;
  color: var(--slm-text-2);
}

.app-footer a {
  color: var(--slm-brand);
  text-decoration: none;
}
</style>
