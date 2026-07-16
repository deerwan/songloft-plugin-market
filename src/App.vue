<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import PluginMarket from './components/PluginMarket.vue'
import SubmitSource from './components/SubmitSource.vue'
import PendingSources from './components/PendingSources.vue'

const showSubmit = ref(false)
const isDark = ref(false)
// VitePress 集成时不接管主题
const isVitePress = typeof document !== 'undefined' && document.documentElement.classList.contains('vp-doc')

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(dark: boolean) {
  if (isVitePress) return
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  localStorage.setItem('slm-theme', dark ? 'dark' : 'light')
}

function toggleTheme() {
  isDark.value = !isDark.value
}

onMounted(() => {
  if (isVitePress) return
  const saved = localStorage.getItem('slm-theme')
  isDark.value = saved ? saved === 'dark' : getSystemDark()
  applyTheme(isDark.value)
})

watch(isDark, applyTheme)

// 官方品牌图标（与 favicon 共用，支持子路径部署）
const logoSrc = import.meta.env.BASE_URL + 'favicon.svg'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-header__inner">
        <div class="app-brand">
          <img class="app-brand__logo" :src="logoSrc" alt="Songloft" />
          <h1 class="app-brand__title">Songloft</h1>
        </div>
        <div class="app-header__actions">
          <button v-if="!isVitePress" class="app-header__icon" @click="toggleTheme" :title="isDark ? '浅色模式' : '深色模式'">
            <!-- 太阳（浅色模式时显示，切换为暗色） -->
            <svg v-if="!isDark" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
            <!-- 月亮（深色模式时显示，切换为浅色） -->
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          </button>
          <button class="app-header__icon" @click="showSubmit = true" title="提交插件">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <a class="app-header__github" href="https://github.com/songloft-org/songloft" target="_blank" rel="noopener" title="GitHub">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
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

.app-header__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--slm-text-2);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.app-header__icon:hover {
  color: var(--slm-brand);
  background: var(--slm-bg-soft);
}

.app-header__github {
  color: var(--slm-text-2);
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.app-header__github:hover {
  color: var(--slm-text);
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
