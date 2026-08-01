<script setup lang="ts">
/* Issues 列表页。
 *
 * 纯前端读取 GitHub REST API（匿名请求，未认证配额 60 次/小时/IP），
 * 因此只做「读」：列表展示 + 跳转到 GitHub 进行回复/新建。
 * 写操作交给 GitHub 自身完成，站点无需任何后端与 token。
 */
import { onMounted, ref } from 'vue'
import { GITHUB_REPO } from '../config'

interface GitHubUser {
  login: string
  avatar_url: string
  html_url: string
}

interface GitHubLabel {
  id: number
  name: string
  color: string
}

interface GitHubIssue {
  id: number
  number: number
  title: string
  html_url: string
  state: 'open' | 'closed'
  comments: number
  created_at: string
  user: GitHubUser | null
  labels: GitHubLabel[]
  /** 该字段存在即代表这条记录其实是 PR，需要在列表中剔除 */
  pull_request?: unknown
}

type StateFilter = 'open' | 'closed'

const issues = ref<GitHubIssue[]>([])
const loading = ref(true)
const error = ref('')
const state = ref<StateFilter>('open')

async function load(next: StateFilter) {
  state.value = next
  loading.value = true
  error.value = ''
  try {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/issues?state=${next}&per_page=30&sort=created&direction=desc`
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) {
      // 403 绝大多数是匿名调用触发了速率限制，单独给出可操作的提示
      throw new Error(
        res.status === 403
          ? 'GitHub API 请求过于频繁（匿名限额 60 次/小时），请稍后再试或直接前往 GitHub 查看。'
          : `GitHub API 返回 ${res.status}`,
      )
    }
    const data: GitHubIssue[] = await res.json()
    issues.value = data.filter((item) => !item.pull_request)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '加载失败，请稍后重试。'
    issues.value = []
  } finally {
    loading.value = false
  }
}

/** 相对时间，避免引入 dayjs 之类的额外依赖 */
function fromNow(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month} 个月前`
  return `${Math.floor(month / 12)} 年前`
}

/** 依据标签底色亮度选择前景色，保证浅色标签上的文字可读 */
function labelStyle(label: GitHubLabel) {
  const hex = label.color || '888888'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return {
    background: `#${hex}29`,
    borderColor: `#${hex}66`,
    color: luminance > 0.6 ? `#${hex}` : `#${hex}`,
  }
}

onMounted(() => load('open'))
</script>

<template>
  <section class="issues">
    <header class="issues__head">
      <div>
        <h2 class="issues__title">提交列表</h2>
        <p class="issues__sub">
          仅用于插件提交展示
        </p>
      </div>
    </header>

    <div class="issues__toolbar">
      <div class="seg" role="tablist">
        <button
          class="seg__item"
          :class="{ 'seg__item--active': state === 'open' }"
          role="tab"
          :aria-selected="state === 'open'"
          @click="load('open')"
        >
          开放中
        </button>
        <button
          class="seg__item"
          :class="{ 'seg__item--active': state === 'closed' }"
          role="tab"
          :aria-selected="state === 'closed'"
          @click="load('closed')"
        >
          已关闭
        </button>
      </div>
    </div>

    <p v-if="loading" class="issues__state">正在加载…</p>

    <div v-else-if="error" class="issues__state issues__state--error">
      <p>{{ error }}</p>
      <button class="btn" @click="load(state)">重试</button>
    </div>

    <p v-else-if="issues.length === 0" class="issues__state">
      暂无{{ state === 'open' ? '开放中的' : '已关闭的' }} Issue。
    </p>

    <ul v-else class="issue-list">
      <li v-for="issue in issues" :key="issue.id" class="issue">
        <a class="issue__main" :href="issue.html_url" target="_blank" rel="noopener">
          <span class="issue__dot" :class="`issue__dot--${issue.state}`" aria-hidden="true"></span>
          <span class="issue__body">
            <span class="issue__title">{{ issue.title }}</span>
            <span class="issue__meta">
              #{{ issue.number }} · {{ issue.user?.login ?? '未知' }} 于
              {{ fromNow(issue.created_at) }}开启
            </span>
            <span v-if="issue.labels.length" class="issue__labels">
              <span
                v-for="label in issue.labels"
                :key="label.id"
                class="issue__label"
                :style="labelStyle(label)"
              >{{ label.name }}</span>
            </span>
          </span>
        </a>
        <span v-if="issue.comments > 0" class="issue__comments" :title="`${issue.comments} 条评论`">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
          </svg>
          {{ issue.comments }}
        </span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.issues {
  animation: fade-up 0.5s var(--ease-out) both;
}

.issues__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  margin-bottom: 20px;
}

.issues__title {
  margin: 0 0 6px;
  font-size: clamp(22px, 4vw, 30px);
  letter-spacing: -0.02em;
}

.issues__sub {
  margin: 0;
  font-size: 14px;
  color: var(--slm-text-2);
  line-height: 1.6;
}

.issues__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.seg {
  display: inline-flex;
  padding: 3px;
  gap: 2px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
}

.seg__item {
  padding: 6px 16px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--slm-text-2);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s, background 0.2s;
}

.seg__item:hover {
  color: var(--slm-text);
}

.seg__item--active {
  background: radial-gradient(120% 170% at 50% 0%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.03) 62%),
    rgba(255, 255, 255, 0.05);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.issues__state {
  padding: 48px 16px;
  text-align: center;
  color: var(--slm-text-2);
  font-size: 14px;
}

.issues__state--error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  line-height: 1.6;
}

.issue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius);
  overflow: hidden;
  background: var(--glass-card);
}

.issue {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--glass-border);
  transition: background 0.2s;
}

.issue:last-child {
  border-bottom: none;
}

.issue:hover {
  background: var(--glass-card-hover);
}

.issue__main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
  text-decoration: none;
  color: inherit;
}

.issue__dot {
  flex-shrink: 0;
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 50%;
}

.issue__dot--open {
  background: #3fb950;
  box-shadow: 0 0 0 3px rgba(63, 185, 80, 0.16);
}

.issue__dot--closed {
  background: #a371f7;
  box-shadow: 0 0 0 3px rgba(163, 113, 247, 0.16);
}

.issue__body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.issue__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
  word-break: break-word;
}

.issue__meta {
  font-size: 12px;
  color: var(--slm-text-2);
}

.issue__labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}

.issue__label {
  padding: 1px 8px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.6;
}

.issue__comments {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--slm-text-2);
}

@media (max-width: 560px) {
  .issues__head {
    flex-direction: column;
    align-items: stretch;
  }
  .issues__head .btn {
    justify-content: center;
  }
}
</style>
