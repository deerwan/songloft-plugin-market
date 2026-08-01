<script lang="ts">
export default { name: 'HomeView' }
</script>

<script setup lang="ts">
import { ref, onActivated, onDeactivated } from 'vue'
import { RouterLink } from 'vue-router'
import OrbBackground from '../components/OrbBackground.vue'

// KeepAlive 缓存首页时停/启 WebGL 渲染，既保留上下文又省 GPU
const orbActive = ref(true)
onActivated(() => orbActive.value = true)
onDeactivated(() => orbActive.value = false)
</script>

<template>
  <section class="hero">
    <!-- WebGL 持续流动光球背景（始终在动），铺满整屏底层 -->
    <OrbBackground class="hero__orb" :paused="!orbActive" />

    <div class="hero__content">
      <h1 class="hero__title">Songloft 插件市场</h1>
      <p class="hero__subtitle">
        浏览社区开发者贡献的 JS 插件，一键探索、提交与讨论。
      </p>

      <a class="hero__cta" href="#/market">
        <span class="hero__cta-glow"></span>
        <span class="hero__cta-inner">
          <span class="hero__cta-main">浏览插件</span>
          <span class="hero__cta-divider" aria-hidden="true"></span>
          <span class="hero__cta-hint">→</span>
        </span>
      </a>
    </div>
  </section>
</template>

<style scoped>
/* 首屏全屏动画着陆页，不展示插件列表 */
.hero {
  position: relative;
  min-height: calc(100vh - 160px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: clamp(24px, 6vw, 64px) clamp(16px, 4vw, 48px);
  overflow: hidden;
}

/* WebGL 光球背景：铺满整屏底层，始终在动 */
.hero__orb {
  z-index: 0;
}

.hero__content {
  position: relative;
  z-index: 2;
  max-width: 680px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  animation: hero-rise 0.9s var(--ease-out) both;
}

.hero__title {
  margin: 0;
  font-size: clamp(30px, 6vw, 56px);
  line-height: 1.08;
  font-weight: 700;
  letter-spacing: -0.03em;
  background: linear-gradient(180deg, #fff 0%, rgba(255, 255, 255, 0.72) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero__subtitle {
  margin: 0;
  max-width: 520px;
  font-size: clamp(14px, 2.2vw, 17px);
  line-height: 1.6;
  color: var(--slm-text-2);
}

/* 发光流光按钮：左侧主文案 + 竖线 + 右侧箭头 */
.hero__cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 2px;
  margin-top: 6px;
  border-radius: 999px;
  text-decoration: none;
  color: inherit;
  overflow: hidden;
  transition: transform 0.25s var(--ease-out), box-shadow 0.25s var(--ease-out);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.35);
}

.hero__cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14), 0 12px 32px rgba(0, 0, 0, 0.45);
}

/* 旋转流光层 */
.hero__cta-glow {
  position: absolute;
  inset: -50%;
  z-index: 0;
  background: conic-gradient(
    from 0deg,
    rgba(255, 255, 255, 0) 0deg,
    rgba(255, 255, 255, 0.18) 60deg,
    rgba(255, 255, 255, 0) 120deg,
    rgba(255, 255, 255, 0) 180deg,
    rgba(160, 140, 255, 0.35) 240deg,
    rgba(255, 255, 255, 0) 300deg,
    rgba(255, 255, 255, 0) 360deg
  );
  animation: cta-rotate 4s linear infinite;
  opacity: 0.75;
  pointer-events: none;
}

.hero__cta:hover .hero__cta-glow {
  opacity: 1;
  animation-duration: 2.5s;
}

/* 内部深色胶囊 */
.hero__cta-inner {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 22px;
  border-radius: 999px;
  background: rgba(12, 12, 14, 0.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.hero__cta-main {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #fff;
}

.hero__cta-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.2);
}

.hero__cta-hint {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.55);
  transition: color 0.2s, transform 0.2s var(--ease-out);
}

.hero__cta:hover .hero__cta-hint {
  color: rgba(255, 255, 255, 0.9);
  transform: translateX(3px);
}

/* —— 动效 —— */
@keyframes hero-rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes cta-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 尊重系统「减少动态效果」：关闭流光旋转，保留静态淡入 */
@media (prefers-reduced-motion: reduce) {
  .hero__content {
    animation: hero-rise 0.6s var(--ease-out) both;
  }
  .hero__cta-glow {
    animation: none;
  }
  .hero__cta:hover .hero__cta-hint {
    transform: none;
  }
}
</style>
