<script setup lang="ts">
import { ref, watch } from 'vue'

// 维护者视图：从 GitHub Issues API 拉取待审（source-submit）的提交，
// 不设后端，直接读公开 API（匿名 60/h 限额，足够审核查看）。
const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

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

const loading = ref(false)
const error = ref('')
const items = ref<Pending[]>([])

async function load() {
  // 已加载过则不再重复请求，避免触发 GitHub 限额
  if (items.value.length > 0) return
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

// 每次打开弹窗时拉取一次
watch(
  () => props.visible,
  (v) => {
    if (v) load()
  },
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <div v-if="visible" class="modal-mask" @click.self="emit('close')" @keydown="onKey">
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal__head">
        <h2 class="modal__title">待审插件源</h2>
        <button class="modal__close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <p v-if="loading" class="modal__state">加载中…</p>
      <p v-else-if="error" class="modal__state modal__state--err">{{ error }}</p>
      <p v-else-if="!items.length" class="modal__state">暂无待审的插件源 🎉</p>
      <ul v-else class="modal__list">
        <li v-for="it in items" :key="it.number" class="modal__item">
          <div class="modal__row">
            <a class="modal__title-link" :href="it.url" target="_blank" rel="noopener"
              >#{{ it.number }} {{ it.title }}</a
            >
            <a class="btn btn--primary modal__review" :href="it.url" target="_blank" rel="noopener">去审核</a>
          </div>
          <div class="modal__meta">
            <span class="modal__src" :title="it.sourceUrl">{{ it.sourceUrl || '（未解析到地址）' }}</span>
            <span class="dot">·</span>
            <span>by {{ it.user }}</span>
            <span class="dot">·</span>
            <span>{{ new Date(it.createdAt).toLocaleDateString('zh-CN') }}</span>
          </div>
        </li>
      </ul>

      <p class="modal__tip">在 Issue 上打 <code>approved</code> 标签即可自动开 PR 收录。</p>
    </div>
  </div>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}
.modal {
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  overflow: auto;
  background: var(--slm-bg);
  border: 1px solid var(--slm-border);
  border-radius: var(--slm-radius);
  box-shadow: var(--slm-shadow);
  padding: 20px;
}
.modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal__title {
  margin: 0;
  font-size: 18px;
}
.modal__close {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1;
  color: var(--slm-text-2);
  cursor: pointer;
}
.modal__state {
  font-size: 13px;
  color: var(--slm-text-2);
  padding: 16px 0;
  text-align: center;
}
.modal__state--err {
  color: #e5484d;
}
.modal__list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.modal__item {
  border: 1px solid var(--slm-border);
  border-radius: 8px;
  background: var(--slm-bg-soft);
  padding: 10px 12px;
}
.modal__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.modal__title-link {
  color: var(--slm-text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  word-break: break-all;
}
.modal__title-link:hover {
  color: var(--slm-brand);
}
.modal__review {
  padding: 4px 12px;
  font-size: 12px;
  flex-shrink: 0;
}
.modal__meta {
  margin-top: 6px;
  font-size: 12px;
  color: var(--slm-text-2);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.modal__src {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dot {
  opacity: 0.5;
}
.modal__tip {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--slm-text-2);
}
.modal__tip code {
  background: var(--slm-bg-alt);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
