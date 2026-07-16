<script setup lang="ts">
import { ref } from 'vue'

// 维护者视图：从 GitHub Issues API 拉取待审（source-submit）的提交，
// 不设后端，直接读公开 API（匿名 60/h 限额，足够审核查看）。
const REPO = 'deerwan/songloft-plugin-market'
const API = `https://api.github.com/repos/${REPO}/issues?labels=source-submit&state=open&per_page=50`

interface Pending {
  number: number
  title: string
  user: string
  createdAt: string
  url: string
  sourceUrl: string
}

const open = ref(false)
const loading = ref(false)
const error = ref('')
const items = ref<Pending[]>([])

async function toggle() {
  open.value = !open.value
  if (open.value && items.value.length === 0 && !loading.value) {
    await load()
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const resp = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const raw = (await resp.json()) as any[]
    // issue 接口会包含 PR，需过滤掉
    items.value = raw
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title,
        user: i.user?.login || '未知',
        createdAt: i.created_at,
        url: i.html_url,
        sourceUrl: (i.body || '').match(/https?:\/\/[^\s"'`<>)\]]+/i)?.[0] || '',
      }))
  } catch {
    error.value = '加载待审列表失败（可能是 GitHub API 限额）'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="pending">
    <button class="pending__toggle" @click="toggle">
      <span>📥 待审插件源（{{ open ? items.length : '?' }}）</span>
      <span class="pending__caret">{{ open ? '▾' : '▸' }}</span>
    </button>

    <div v-if="open" class="pending__panel">
      <p v-if="loading" class="pending__state">加载中…</p>
      <p v-else-if="error" class="pending__state pending__state--err">{{ error }}</p>
      <p v-else-if="!items.length" class="pending__state">暂无待审的插件源 🎉</p>
      <ul v-else class="pending__list">
        <li v-for="it in items" :key="it.number" class="pending__item">
          <div class="pending__row">
            <a class="pending__title" :href="it.url" target="_blank" rel="noopener"
              >#{{ it.number }} {{ it.title }}</a
            >
            <a class="btn btn--primary pending__review" :href="it.url" target="_blank" rel="noopener"
              >去审核</a
            >
          </div>
          <div class="pending__meta">
            <span class="pending__src" :title="it.sourceUrl">{{ it.sourceUrl || '（未解析到地址）' }}</span>
            <span class="dot">·</span>
            <span>by {{ it.user }}</span>
            <span class="dot">·</span>
            <span>{{ new Date(it.createdAt).toLocaleDateString('zh-CN') }}</span>
          </div>
        </li>
      </ul>
      <p class="pending__tip">在 Issue 上打 <code>approved</code> 标签即可自动开 PR 收录。</p>
    </div>
  </section>
</template>

<style scoped>
.pending {
  margin-bottom: 16px;
  border: 1px solid var(--slm-border);
  border-radius: var(--slm-radius);
  background: var(--slm-bg-soft);
  overflow: hidden;
}
.pending__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: var(--slm-text);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.pending__panel {
  padding: 0 16px 14px;
}
.pending__state {
  font-size: 13px;
  color: var(--slm-text-2);
  padding: 8px 0;
}
.pending__state--err {
  color: #e5484d;
}
.pending__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pending__item {
  border: 1px solid var(--slm-border);
  border-radius: 8px;
  background: var(--slm-bg);
  padding: 10px 12px;
}
.pending__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.pending__title {
  color: var(--slm-text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
}
.pending__title:hover {
  color: var(--slm-brand);
}
.pending__review {
  padding: 4px 12px;
  font-size: 12px;
  flex-shrink: 0;
}
.pending__meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--slm-text-2);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.pending__src {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dot {
  opacity: 0.5;
}
.pending__tip {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--slm-text-2);
}
.pending__tip code {
  background: var(--slm-bg-alt);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
