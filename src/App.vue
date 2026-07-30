<script setup lang="ts">
import { ref } from 'vue'
import PluginMarket from './components/PluginMarket.vue'
import SubmitSource from './components/SubmitSource.vue'

const showSubmit = ref(false)

// 官方品牌图标（与 favicon 共用，支持子路径部署）
const logoSrc = import.meta.env.BASE_URL + 'favicon.svg'
// Hero 背景光线素材（SVG，经 BASE_URL 拼接支持子路径部署）
const heroArt = import.meta.env.BASE_URL + 'hero-art.svg'
// 页脚版权年份随系统时间自动更新
const year = new Date().getFullYear()
</script>

<template>
  <div class="app-shell">
    <div class="bg-glow" aria-hidden="true">
      <div class="bg-glow__art" :style="{ backgroundImage: `url(${heroArt})` }"></div>
    </div>

    <header class="app-header glass-nav">
      <div class="app-header__inner">
        <div class="app-brand">
          <img class="app-brand__logo" :src="logoSrc" alt="Songloft" />
          <h1 class="app-brand__title">Songloft</h1>
        </div>
        <div class="app-header__actions">
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
      <PluginMarket />
    </main>

    <footer class="app-footer">
      <div class="app-footer__inner">
        <div class="app-footer__top">
          <div class="app-footer__brand">
            <img class="app-footer__logo" :src="logoSrc" alt="" />
            <span class="app-footer__name">Songloft</span>
          </div>
          <a
            class="app-footer__link"
            href="https://songloft.hanxi.cc/plugin_registry"
            target="_blank"
            rel="noopener"
          >如何发布插件</a>
        </div>
        <p class="app-footer__copy">© {{ year }} Songloft · 由 GitHub Actions 每日自动构建</p>
      </div>
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

/* 悬浮胶囊导航：吸顶，内容滚动时从其后方穿过被模糊 */
.app-header {
  position: sticky;
  top: 12px;
  z-index: 10;
  max-width: 1240px;
  width: calc(100% - clamp(16px, 4vw, 48px));
  margin: 12px auto 0;
  border-radius: 999px;
  animation: fade-up 0.5s var(--ease-out) both;
}

.app-header__inner {
  padding: 10px clamp(14px, 2.5vw, 24px);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.app-brand__logo {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: contain;
}

.app-brand__title {
  margin: 0;
  font-size: clamp(16px, 2.5vw, 19px);
  font-weight: 700;
  letter-spacing: -0.02em;
  white-space: nowrap;
}

.app-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.app-header__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--slm-text-2);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, transform 0.25s var(--ease-spring);
}

.app-header__icon:hover {
  color: var(--slm-text);
  background: var(--slm-bg-alt);
}

.app-header__icon:active {
  transform: scale(0.9);
}

.app-header__github {
  color: var(--slm-text-2);
  display: flex;
  align-items: center;
  transition: color 0.2s, transform 0.25s var(--ease-spring);
}

.app-header__github:hover {
  color: var(--slm-text);
  transform: scale(1.08);
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: clamp(16px, 3vw, 28px) clamp(12px, 3vw, 24px) clamp(32px, 5vw, 56px);
}

.app-footer {
  position: relative;
  padding: 28px clamp(12px, 3vw, 24px) 36px;
}

/* 两端渐隐的分隔细线，代替生硬的通栏实线 */
.app-footer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(1240px, calc(100% - clamp(24px, 6vw, 48px)));
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.12), transparent);
}

.app-footer__inner {
  max-width: 1240px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.app-footer__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.app-footer__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-footer__logo {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  object-fit: contain;
}

.app-footer__name {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.app-footer__link {
  font-size: 13px;
  color: var(--slm-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.app-footer__link:hover {
  color: var(--slm-text);
}

.app-footer__copy {
  margin: 0;
  font-size: 12px;
  color: var(--slm-text-2);
  opacity: 0.7;
}

@media (max-width: 560px) {
  .app-footer__top {
    flex-direction: column;
    align-items: center;
  }
  .app-footer__copy {
    text-align: center;
  }
}
</style>
