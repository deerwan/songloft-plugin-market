<script setup lang="ts">
/* 讨论页。
 *
 * 使用 giscus：它把 GitHub Discussions 作为评论后端，访客用自己的 GitHub 账号
 * 授权后即可留言，站点侧零后端、零 token。
 *
 * mapping 固定为 'pathname'：本页是全站唯一的讨论入口，需要所有访客共享同一个
 * discussion 线程。若用默认的 pathname 之外的映射（如 url），hash 路由下不同的
 * query/hash 会分裂出多个线程。
 */
import Giscus from '@giscus/vue'
import { GISCUS } from '../config'
</script>

<template>
  <section class="discussions">
    <header class="discussions__head">
      <div>
        <h2 class="discussions__title">讨论</h2>
        <p class="discussions__sub">
          使用 GitHub 账号登录即可留言。
        </p>
      </div>
    </header>

    <div class="discussions__board">
      <Giscus
        :repo="GISCUS.repo"
        :repo-id="GISCUS.repoId"
        :category="GISCUS.category"
        :category-id="GISCUS.categoryId"
        mapping="pathname"
        strict="0"
        reactions-enabled="1"
        emit-metadata="0"
        input-position="bottom"
        :theme="GISCUS.theme"
        :lang="GISCUS.lang"
        loading="lazy"
        crossorigin="anonymous"
      />
    </div>
  </section>
</template>

<style scoped>
.discussions {
  animation: fade-up 0.5s var(--ease-out) both;
}

.discussions__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  margin-bottom: 20px;
}

.discussions__title {
  margin: 0 0 6px;
  font-size: clamp(22px, 4vw, 30px);
  letter-spacing: -0.02em;
}

.discussions__sub {
  margin: 0;
  font-size: 14px;
  color: var(--slm-text-2);
  line-height: 1.6;
}

.discussions__board {
  padding: 20px clamp(14px, 3vw, 24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius);
  background: var(--glass-card);
  min-height: 320px;
}

@media (max-width: 560px) {
  .discussions__head {
    margin-bottom: 16px;
  }
}
</style>
