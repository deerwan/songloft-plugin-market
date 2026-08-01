<script setup lang="ts">
import { ref } from 'vue'
import SubmitSource from './components/SubmitSource.vue'
import { RouterLink, useRoute } from 'vue-router'

const showSubmit = ref(false)
const menuOpen = ref(false)
const route = useRoute()

// 顶部导航项；品牌 logo 指向首页（动画着陆页），「市场」单独作为入口排在首位
const navItems = [
  { to: '/market', label: '市场' },
  { to: '/issues', label: '提交列表' },
  { to: '/discussions', label: '讨论' },
]

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
      <!-- 首页已有全屏 WebGL 光球背景，不再叠加顶部静态光带，避免重复/隐约可见 -->
      <div v-if="route.path !== '/'" class="bg-glow__art" :style="{ backgroundImage: `url(${heroArt})` }"></div>
    </div>

    <header class="app-header glass-nav">
      <div class="app-header__inner">
        <RouterLink class="app-brand" to="/" title="返回首页" @click="menuOpen = false">
          <img class="app-brand__logo" :src="logoSrc" alt="Songloft" />
          <h1 class="app-brand__title">Songloft</h1>
        </RouterLink>
        <nav class="app-nav">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            class="app-nav__link"
            active-class="app-nav__link--active"
            :to="item.to"
          >{{ item.label }}</RouterLink>
        </nav>
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
          <button
            class="app-header__menu"
            :class="{ 'app-header__menu--open': menuOpen }"
            aria-label="打开导航"
            :aria-expanded="menuOpen"
            aria-controls="mobile-nav"
            @click="menuOpen = !menuOpen"
          >
            <span class="app-header__menu-bar"></span>
            <span class="app-header__menu-bar"></span>
            <span class="app-header__menu-bar"></span>
          </button>
        </div>
      </div>
    </header>

    <nav
      id="mobile-nav"
      class="mobile-nav"
      :class="{ 'mobile-nav--open': menuOpen }"
      :aria-hidden="!menuOpen"
    >
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        class="mobile-nav__link"
        :class="{ 'mobile-nav__link--active': route.path === item.to }"
        :to="item.to"
        @click="menuOpen = false"
      >{{ item.label }}</RouterLink>
    </nav>

    <main class="app-main">
      <RouterView v-slot="{ Component }">
        <KeepAlive include="HomeView">
          <Transition name="view" mode="out-in">
            <component :is="Component" />
          </Transition>
        </KeepAlive>
      </RouterView>
    </main>

    <footer class="app-footer">
      <div class="app-footer__inner">
        <div class="app-footer__top">
          <RouterLink class="app-footer__brand" to="/">
            <img class="app-footer__logo" :src="logoSrc" alt="" />
            <span class="app-footer__name">Songloft</span>
          </RouterLink>
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

/* 品牌区即首页入口 */
.app-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  color: inherit;
  text-decoration: none;
  transition: opacity 0.2s;
}

.app-brand:hover {
  opacity: 0.75;
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

/* 导航项：胶囊导航中部，选中态用与主按钮同款的暗灰高光 */
.app-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.app-nav::-webkit-scrollbar {
  display: none;
}

.app-nav__link {
  padding: 6px 14px;
  border-radius: 999px;
  color: var(--slm-text-2);
  font-size: 13px;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.2s, background 0.2s;
}

.app-nav__link:hover {
  color: var(--slm-text);
  background: var(--slm-bg-soft);
}

.app-nav__link--active {
  background: radial-gradient(120% 170% at 50% 0%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.03) 62%),
    rgba(255, 255, 255, 0.05);
  color: #fff;
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
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

/* 汉堡按钮：三条横线，展开时变 X */
.app-header__menu {
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  gap: 5px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--slm-text-2);
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.app-header__menu:hover {
  color: var(--slm-text);
  background: var(--slm-bg-alt);
}

.app-header__menu-bar {
  display: block;
  width: 18px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
  transition: transform 0.25s var(--ease-spring), opacity 0.15s ease;
  transform-origin: center;
}

.app-header__menu--open .app-header__menu-bar:nth-child(1) {
  transform: translateY(6.5px) rotate(45deg);
}

.app-header__menu--open .app-header__menu-bar:nth-child(2) {
  opacity: 0;
}

.app-header__menu--open .app-header__menu-bar:nth-child(3) {
  transform: translateY(-6.5px) rotate(-45deg);
}

/* 移动端抽屉：header 下方滑出 */
.mobile-nav {
  display: none;
  position: fixed;
  top: 70px;
  right: clamp(8px, 2vw, 24px);
  z-index: 9;
  min-width: 180px;
  padding: 8px;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius-sm);
  background: var(--glass-nav);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  backdrop-filter: blur(20px) saturate(160%);
  box-shadow: var(--slm-shadow);
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.25s var(--ease-spring);
}

.mobile-nav--open {
  opacity: 1;
  transform: translateY(0) scale(1);
  pointer-events: auto;
}

.mobile-nav__link {
  padding: 10px 16px;
  border-radius: 10px;
  color: var(--slm-text-2);
  font-size: 14px;
  text-decoration: none;
  transition: color 0.2s, background 0.2s;
}

.mobile-nav__link:hover {
  color: var(--slm-text);
  background: var(--slm-bg-alt);
}

.mobile-nav__link--active {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-weight: 600;
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

/* 路由切换：淡入淡出，不做位移以免与各视图自身的 fade-up 叠加 */
.view-enter-active {
  transition: opacity 0.22s var(--ease-out);
}

.view-leave-active {
  transition: opacity 0.14s ease;
}

.view-enter-from,
.view-leave-to {
  opacity: 0;
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
  color: inherit;
  text-decoration: none;
  transition: opacity 0.2s;
}

.app-footer__brand:hover {
  opacity: 0.75;
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

@media (max-width: 640px) {
  .app-nav {
    display: none;
  }

  .app-header__menu,
  .mobile-nav {
    display: flex;
  }
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
