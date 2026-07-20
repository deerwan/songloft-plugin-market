<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

interface Plugin {
  entryPath: string
  name: string
  version: string
  description: string
  author: string
  permissions: string[]
  minHostVersion: string | null
  homepage: string | null
  pluginJsonUrl: string
  downloadUrl: string | null
  updateUrl: string | null
  source: 'open' | 'closed'
  origin: string | null
  repo: string | null
  stars: number | null
  updatedAt: string | null
  license: string | null
  logo: string | null
  tags: string[]
  featured: boolean
}

interface SourceInfo {
  id: string
  name: string
  official: boolean
  url: string
  count: number
}

interface MarketData {
  generatedAt: string
  count: number
  openCount: number
  closedCount: number
  sources?: SourceInfo[]
  plugins: Plugin[]
}

type SortKey = 'stars' | 'updated' | 'name'
type SourceFilter = 'all' | 'open' | 'closed'

const loading = ref(true)
const error = ref('')
const data = ref<MarketData | null>(null)

const query = ref('')
const activeTag = ref('')
const sourceFilter = ref<SourceFilter>('all')
const activeOrigin = ref<string>('all')
const sortKey = ref<SortKey>('stars')
const copiedKey = ref('')

// 聚合源：固定使用 raw.githubusercontent.com 形态，使宿主端「GitHub 镜像加速」可用。
// 自定义域名 songloft-store.lllh.de 不被镜像加速覆盖，直连不稳时建议用此地址（见 plugin_registry.md 第 263 行）。
const registryUrl = 'https://raw.githubusercontent.com/deerwan/songloft-plugin-market/main/registry.json'
const copiedAgg = ref(false)

// 运行时 fetch：用 BASE_URL 拼路径，独立站与 VitePress 子路径均可用
async function load() {
  loading.value = true
  error.value = ''
  try {
    const url = `${import.meta.env.BASE_URL}plugins.generated.json`
    const resp = await fetch(url)
    if (!resp.ok) throw new Error(`加载失败 HTTP ${resp.status}`)
    data.value = await resp.json()
  } catch (e: any) {
    error.value = e?.message || '加载插件数据失败'
  } finally {
    loading.value = false
  }
}

onMounted(load)

const allTags = computed(() => {
  const set = new Set<string>()
  for (const p of data.value?.plugins || []) {
    for (const t of p.tags || []) set.add(t)
  }
  return [...set].sort()
})

// 来源清单（只保留有插件的源，官方优先）
const originSources = computed<SourceInfo[]>(() => {
  const list = (data.value?.sources || []).filter((s) => s.count > 0)
  return list.slice().sort((a, b) => Number(b.official) - Number(a.official))
})

// 来源 id -> 用户提交的源地址（registry feed），用于「复制源」
const sourceUrlMap = computed(() => {
  const m = new Map<string, string>()
  for (const s of data.value?.sources || []) {
    if (s.url) m.set(s.id, s.url)
  }
  return m
})

const filtered = computed(() => {
  let list = data.value?.plugins ? [...data.value.plugins] : []

  if (sourceFilter.value !== 'all') {
    list = list.filter((p) => p.source === sourceFilter.value)
  }
  if (activeOrigin.value !== 'all') {
    list = list.filter((p) => p.origin === activeOrigin.value)
  }
  if (activeTag.value) {
    list = list.filter((p) => (p.tags || []).includes(activeTag.value))
  }
  const q = query.value.trim().toLowerCase()
  if (q) {
    list = list.filter((p) =>
      [p.name, p.description, p.author, p.entryPath, ...(p.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }

  list.sort((a, b) => {
    if (a.featured !== b.featured) return a.featured ? -1 : 1
    if (sortKey.value === 'name') return a.name.localeCompare(b.name)
    if (sortKey.value === 'updated') {
      return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))
    }
    return (b.stars ?? -1) - (a.stars ?? -1)
  })
  return list
})

function initials(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase()
}

// logo 可能是绝对 URL（作者自托），也可能是相对路径 icons/xxx.svg
// （构建时从插件包提取），后者需按部署子路径拼上 BASE_URL
function logoSrc(logo: string): string {
  if (/^https?:\/\//i.test(logo)) return logo
  return `${import.meta.env.BASE_URL}${logo.replace(/^\//, '')}`
}

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function copySubscribe(p: Plugin) {
  const text = sourceUrlMap.value.get(p.origin || '') || p.pluginJsonUrl
  try {
    await navigator.clipboard.writeText(text)
    copiedKey.value = p.entryPath
    setTimeout(() => {
      if (copiedKey.value === p.entryPath) copiedKey.value = ''
    }, 1600)
  } catch {
    /* 剪贴板不可用时静默 */
  }
}

async function copyAggregated() {
  try {
    await navigator.clipboard.writeText(registryUrl)
    copiedAgg.value = true
    setTimeout(() => (copiedAgg.value = false), 1600)
  } catch {
    /* 剪贴板不可用时静默 */
  }
}
</script>

<template>
  <div class="market">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="search">
        <input
          v-model="query"
          type="search"
          placeholder="搜索插件名称、描述、作者、标签…"
          aria-label="搜索插件"
        />
      </div>
      <div class="controls">
        <select v-if="originSources.length > 1" v-model="activeOrigin" aria-label="来源筛选">
          <option value="all">全部来源（{{ data?.count ?? 0 }}）</option>
          <option v-for="s in originSources" :key="s.id" :value="s.id">
            {{ s.name }}（{{ s.count }}）
          </option>
        </select>
        <select v-model="sourceFilter" aria-label="类型筛选">
          <option value="all">全部（{{ data?.count ?? 0 }}）</option>
          <option value="open">开源（{{ data?.openCount ?? 0 }}）</option>
          <option value="closed">闭源（{{ data?.closedCount ?? 0 }}）</option>
        </select>
        <select v-model="sortKey" aria-label="排序方式">
          <option value="stars">按 Star 排序</option>
          <option value="updated">按更新时间</option>
          <option value="name">按名称</option>
        </select>
        <button
          class="btn btn--primary agg-btn"
          title="复制聚合源地址，在宿主「管理订阅源」里添加即可一次性订阅全部源"
          @click="copyAggregated"
        >
          {{ copiedAgg ? '✓ 已复制聚合源' : '复制聚合源' }}
        </button>
      </div>
    </div>

    <!-- 标签筛选 -->
    <div v-if="allTags.length" class="tags-bar">
      <button :class="['tag-chip', { active: activeTag === '' }]" @click="activeTag = ''">全部标签</button>
      <button
        v-for="t in allTags"
        :key="t"
        :class="['tag-chip', { active: activeTag === t }]"
        @click="activeTag = activeTag === t ? '' : t"
      >
        {{ t }}
      </button>
    </div>

    <!-- 状态区 -->
    <div v-if="loading" class="state">正在加载插件列表…</div>
    <div v-else-if="error" class="state state--error">
      {{ error }}
      <button class="retry" @click="load">重试</button>
    </div>
    <template v-else>
      <div class="summary" v-if="data">
        共 {{ filtered.length }} 个插件
        <span class="summary__meta">
          （开源 {{ data.openCount }} · 闭源 {{ data.closedCount }} · 更新于
          {{ new Date(data.generatedAt).toLocaleString('zh-CN') }}）
        </span>
      </div>

      <div v-if="!filtered.length" class="state">没有匹配的插件</div>

      <div v-else class="grid">
        <article v-for="p in filtered" :key="p.entryPath" class="card">
          <div class="card__head">
            <div class="card__logo">
              <img v-if="p.logo" :src="logoSrc(p.logo)" :alt="p.name" loading="lazy" @error="p.logo = null" />
              <span v-else>{{ initials(p.name) }}</span>
            </div>
            <div class="card__titles">
              <h3 class="card__name" :title="p.name">
                {{ p.name }}
                <span v-if="p.featured" class="badge badge--featured" title="精选">★</span>
              </h3>
              <div class="card__sub">
                <span class="card__author">{{ p.author || '未知作者' }}</span>
                <span class="dot">·</span>
                <span class="card__ver">v{{ p.version }}</span>
              </div>
            </div>
          </div>

          <p class="card__desc">{{ p.description || '暂无描述' }}</p>

          <div class="card__badges">
            <span :class="['badge', p.source === 'open' ? 'badge--open' : 'badge--closed']">
              {{ p.source === 'open' ? '开源' : '闭源' }}
            </span>
            <span v-if="p.license" class="badge">{{ p.license }}</span>
            <span v-if="p.source === 'open' && p.stars !== null" class="badge">★ {{ p.stars }}</span>
            <span v-if="p.updatedAt" class="badge">{{ formatDateTime(p.updatedAt) }}</span>
          </div>

          <div v-if="p.permissions.length" class="card__perms">
            <span v-for="perm in p.permissions.slice(0, 4)" :key="perm" class="perm">{{ perm }}</span>
            <span v-if="p.permissions.length > 4" class="perm perm--more">+{{ p.permissions.length - 4 }}</span>
          </div>

          <div class="card__actions">
            <button class="btn btn--primary" @click="copySubscribe(p)">
              {{ copiedKey === p.entryPath ? '✓ 已复制' : '复制源' }}
            </button>
            <a v-if="p.repo" class="btn" :href="p.repo" target="_blank" rel="noopener">仓库</a>
            <a
              v-else-if="p.homepage"
              class="btn"
              :href="p.homepage"
              target="_blank"
              rel="noopener"
              >主页</a
            >
            <a v-if="p.downloadUrl" class="btn" :href="p.downloadUrl" target="_blank" rel="noopener">下载</a>
          </div>
        </article>
      </div>
    </template>
  </div>
</template>

<style scoped>
.market {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  min-width: 0;
}

.search {
  flex: 1 1 180px;
  min-width: 0;
}

.search input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 14px;
  border: 1px solid var(--slm-border);
  border-radius: var(--slm-radius);
  background: var(--slm-bg-soft);
  color: var(--slm-text);
  font-size: 14px;
  outline: none;
}

.search input:focus {
  border-color: var(--slm-brand);
}

.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  flex-shrink: 0;
}

select {
  max-width: 160px;
  padding: 8px 12px;
  border: 1px solid var(--slm-border);
  border-radius: var(--slm-radius);
  background: var(--slm-bg-soft);
  color: var(--slm-text);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tags-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  padding: 5px 12px;
  border: 1px solid var(--slm-border);
  border-radius: 999px;
  background: transparent;
  color: var(--slm-text-2);
  cursor: pointer;
  font-size: 12px;
}

.tag-chip.active {
  background: var(--slm-brand-soft);
  color: var(--slm-brand);
  border-color: var(--slm-brand);
}

.summary {
  font-size: 13px;
  color: var(--slm-text);
}

.summary__meta {
  color: var(--slm-text-2);
}

.state {
  padding: 48px 0;
  text-align: center;
  color: var(--slm-text-2);
}

.state--error {
  color: #e5484d;
}

.retry {
  margin-left: 10px;
  padding: 4px 12px;
  border: 1px solid var(--slm-border);
  border-radius: 8px;
  background: var(--slm-bg-soft);
  color: var(--slm-text);
  cursor: pointer;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border: 1px solid var(--slm-border);
  border-radius: var(--slm-radius);
  background: var(--slm-bg);
  box-shadow: var(--slm-shadow);
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.card:hover {
  transform: translateY(-2px);
  border-color: var(--slm-brand);
}

.card__head {
  display: flex;
  gap: 12px;
  align-items: center;
}

.card__logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--slm-brand-soft);
  color: var(--slm-brand);
  font-weight: 700;
  font-size: 18px;
  overflow: hidden;
}

.card__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card__titles {
  min-width: 0;
}

.card__name {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card__sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--slm-text-2);
  display: flex;
  gap: 6px;
  align-items: center;
}

.dot {
  opacity: 0.5;
}

.card__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--slm-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 39px;
}

.card__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--slm-bg-alt);
  color: var(--slm-text-2);
}

.badge--open {
  background: rgba(46, 160, 67, 0.16);
  color: #2ea043;
}

.badge--closed {
  background: rgba(158, 106, 3, 0.16);
  color: #9e6a03;
}

.badge--featured {
  background: transparent;
  color: #eab308;
  padding: 0;
}

.card__perms {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.perm {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 1px 6px;
  border: 1px solid var(--slm-border);
  border-radius: 5px;
  color: var(--slm-text-2);
}

.perm--more {
  border-style: dashed;
}

.card__actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  flex-wrap: wrap;
}

.btn {
  padding: 7px 14px;
  border: 1px solid var(--slm-border);
  border-radius: 8px;
  background: var(--slm-bg-soft);
  color: var(--slm-text);
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.btn:hover {
  border-color: var(--slm-brand);
  color: var(--slm-brand);
}

.btn--primary {
  background: var(--slm-brand);
  color: #fff;
  border-color: var(--slm-brand);
}

.btn--primary:hover {
  color: #fff;
  opacity: 0.9;
}

.agg-btn {
  white-space: nowrap;
}

@media (max-width: 640px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .search {
    flex: none;
    width: 100%;
  }
  .controls {
    width: 100%;
    justify-content: flex-start;
  }
  select {
    flex: 1;
    min-width: 0;
  }
}
</style>
