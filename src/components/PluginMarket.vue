<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import GlassSelect from './GlassSelect.vue'

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

// 筛选下拉选项（自定义玻璃下拉 GlassSelect 用）
const originOptions = computed(() => [
  { value: 'all', label: `全部来源（${data.value?.count ?? 0}）` },
  ...originSources.value.map((s) => ({ value: s.id, label: `${s.name}（${s.count}）` })),
])

const sourceOptions = computed<{ value: SourceFilter; label: string }[]>(() => [
  { value: 'all', label: `全部（${data.value?.count ?? 0}）` },
  { value: 'open', label: `开源（${data.value?.openCount ?? 0}）` },
  { value: 'closed', label: `闭源（${data.value?.closedCount ?? 0}）` },
])

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

// 精选/常规拆分：精选单独成区（Raycast Featured），其余进主网格
const featuredList = computed(() => filtered.value.filter((p) => p.featured))
const regularList = computed(() => filtered.value.filter((p) => !p.featured))

function initials(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase()
}

// 从仓库 URL 解析 GitHub 用户名（repo owner）：作者位展示/跳转以此为准，保证名字与落地页自洽
function ownerOf(p: Plugin): string | null {
  const m = (p.repo || '').match(/^https?:\/\/github\.com\/([^/]+)\//)
  return m ? m[1] : null
}

// 头像经 wsrv.nl 图片代理（缩放+转 webp）：直连 avatars.githubusercontent.com 国内基本不可达
function avatarUrl(owner: string): string {
  return `https://wsrv.nl/?url=${encodeURIComponent(`github.com/${owner}.png`)}&w=40&h=40&output=webp`
}

// 加载失败的 owner 集合：隐藏失败头像，退回纯用户名链接
const avatarFailed = ref<Set<string>>(new Set())
function onAvatarError(owner: string) {
  avatarFailed.value = new Set(avatarFailed.value).add(owner)
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

// —— 分段控件滑动指示器：测量选中按钮位置，用 transform 过渡平滑滑到新位置 ——
const segmentedRef = ref<HTMLElement | null>(null)
const indicatorStyle = ref({ transform: 'translateX(0)', width: '0px', opacity: '0' })

function updateIndicator() {
  const wrap = segmentedRef.value
  const btn = wrap?.querySelector<HTMLElement>('.segmented__btn.active')
  if (!btn) return
  indicatorStyle.value = {
    transform: `translateX(${btn.offsetLeft}px)`,
    width: `${btn.offsetWidth}px`,
    opacity: '1',
  }
}

// 切换排序后等 DOM 更新再测量；窗口缩放时按钮宽度会变（窄屏 flex:1）需重新对齐
watch(sortKey, () => nextTick(updateIndicator))
onMounted(() => {
  nextTick(updateIndicator)
  window.addEventListener('resize', updateIndicator)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateIndicator))
</script>

<template>
  <div class="market">
    <!-- Hero：大标题 + 居中搜索 -->
    <section class="hero">
      <h2 class="hero__title">插件市场</h2>
      <p class="hero__sub">浏览社区插件，一键订阅全部插件源</p>
      <div class="hero__search">
        <svg class="hero__search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          v-model="query"
          type="search"
          placeholder="搜索插件名称、描述、作者、标签…"
          aria-label="搜索插件"
        />
      </div>
    </section>

    <!-- 工具栏：分段排序 + 筛选 + 聚合源 -->
    <div class="toolbar">
      <div ref="segmentedRef" class="segmented" role="group" aria-label="排序方式">
        <span class="segmented__indicator" :style="indicatorStyle" aria-hidden="true"></span>
        <button :class="['segmented__btn', { active: sortKey === 'stars' }]" @click="sortKey = 'stars'">按 Star</button>
        <button :class="['segmented__btn', { active: sortKey === 'updated' }]" @click="sortKey = 'updated'">最近更新</button>
        <button :class="['segmented__btn', { active: sortKey === 'name' }]" @click="sortKey = 'name'">名称</button>
      </div>
      <div class="controls">
        <GlassSelect
          v-if="originSources.length > 1"
          v-model="activeOrigin"
          :options="originOptions"
          aria-label="来源筛选"
          class="filter-select"
        />
        <GlassSelect
          v-model="sourceFilter"
          :options="sourceOptions"
          aria-label="类型筛选"
          class="filter-select"
        />
        <button
          class="btn btn--primary agg-btn"
          :class="{ 'is-copied': copiedAgg }"
          title="复制聚合源地址，在宿主「管理订阅源」里添加即可一次性订阅全部源"
          @click="copyAggregated"
        >
          {{ copiedAgg ? '✓ 已复制聚合源' : '复制聚合源' }}
        </button>
      </div>
    </div>

    <!-- 标签筛选（窄屏横向滑动） -->
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

    <!-- 骨架屏 -->
    <div v-if="loading" class="grid">
      <div v-for="i in 6" :key="i" class="card skeleton" :style="{ '--i': i - 1 }">
        <div class="card__top">
          <div class="sk sk--logo"></div>
          <div class="sk sk--line" style="width: 40%"></div>
        </div>
        <div class="sk sk--line" style="width: 92%"></div>
        <div class="sk sk--line" style="width: 55%"></div>
      </div>
    </div>

    <div v-else-if="error" class="state state--error">
      {{ error }}
      <button class="btn retry" @click="load">重试</button>
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

      <template v-else>
        <!-- 精选区 -->
        <section v-if="featuredList.length" class="section">
          <div class="section__head">
            <h3 class="section__title">精选</h3>
            <p class="section__sub">由市场维护者推荐</p>
          </div>
          <TransitionGroup name="flip" tag="div" class="featured-grid" appear>
            <article v-for="(p, i) in featuredList" :key="p.entryPath" class="fcard" :style="{ '--i': i }">
              <div class="fcard__logo">
                <img v-if="p.logo" :src="logoSrc(p.logo)" :alt="p.name" loading="lazy" @error="p.logo = null" />
                <span v-else>{{ initials(p.name) }}</span>
              </div>
              <h4 class="fcard__name" :title="p.name">{{ p.name }}</h4>
              <p class="fcard__desc">{{ p.description || '暂无描述' }}</p>
              <button
                class="btn fcard__btn"
                :class="{ 'is-copied': copiedKey === p.entryPath }"
                @click="copySubscribe(p)"
              >
                {{ copiedKey === p.entryPath ? '✓ 已复制' : '复制源' }}
              </button>
            </article>
          </TransitionGroup>
        </section>

        <!-- 主列表 -->
        <section v-if="regularList.length" class="section">
          <div v-if="featuredList.length" class="section__head">
            <h3 class="section__title">全部插件</h3>
          </div>
          <TransitionGroup name="flip" tag="div" class="grid" appear>
            <article v-for="(p, i) in regularList" :key="p.entryPath" class="card" :style="{ '--i': i }">
              <div class="card__top">
                <div class="card__logo">
                  <img v-if="p.logo" :src="logoSrc(p.logo)" :alt="p.name" loading="lazy" @error="p.logo = null" />
                  <span v-else>{{ initials(p.name) }}</span>
                </div>
                <h3 class="card__name" :title="p.name">{{ p.name }}</h3>
                <button
                  class="btn card__install"
                  :class="{ 'is-copied': copiedKey === p.entryPath }"
                  title="复制该插件所属源地址"
                  @click="copySubscribe(p)"
                >
                  {{ copiedKey === p.entryPath ? '✓ 已复制' : '复制源' }}
                </button>
              </div>

              <p class="card__desc">{{ p.description || '暂无描述' }}</p>

              <div class="card__chips">
                <span :class="['badge', p.source === 'open' ? 'badge--open' : 'badge--closed']">
                  {{ p.source === 'open' ? '开源' : '闭源' }}
                </span>
                <span v-if="p.license" class="badge">{{ p.license }}</span>
                <span v-for="perm in p.permissions.slice(0, 4)" :key="perm" class="perm">{{ perm }}</span>
                <span v-if="p.permissions.length > 4" class="perm perm--more">+{{ p.permissions.length - 4 }}</span>
              </div>

              <div class="card__meta">
                <a
                  v-if="ownerOf(p)"
                  class="meta meta--author"
                  :href="`https://github.com/${ownerOf(p)}`"
                  target="_blank"
                  rel="noopener"
                  :title="p.author && p.author !== ownerOf(p) ? `作者署名：${p.author}` : '访问 GitHub 主页'"
                >
                  <img
                    v-if="!avatarFailed.has(ownerOf(p)!)"
                    class="meta__avatar"
                    :src="avatarUrl(ownerOf(p)!)"
                    alt=""
                    loading="lazy"
                    @error="onAvatarError(ownerOf(p)!)"
                  />
                  {{ ownerOf(p) }}
                </a>
                <span v-else class="meta">{{ p.author || '未知作者' }}</span>
                <span class="meta">v{{ p.version }}</span>
                <span v-if="p.source === 'open' && p.stars !== null" class="meta">★ {{ p.stars }}</span>
                <span v-if="p.updatedAt" class="meta meta--date">{{ formatDateTime(p.updatedAt) }}</span>
                <span class="card__links">
                  <a v-if="p.repo" :href="p.repo" target="_blank" rel="noopener">仓库</a>
                  <a v-else-if="p.homepage" :href="p.homepage" target="_blank" rel="noopener">主页</a>
                  <a v-if="p.downloadUrl" :href="p.downloadUrl" target="_blank" rel="noopener">下载</a>
                </span>
              </div>
            </article>
          </TransitionGroup>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.market {
  display: flex;
  flex-direction: column;
  gap: clamp(14px, 2vw, 20px);
}

/* —— Hero —— */
.hero {
  text-align: center;
  padding: clamp(28px, 6vw, 64px) 0 clamp(4px, 1vw, 8px);
  animation: fade-up 0.55s var(--ease-out) both;
}

.hero__title {
  margin: 0;
  font-size: clamp(34px, 6vw, 56px);
  font-weight: 800;
  letter-spacing: -0.03em;
}

.hero__sub {
  margin: 10px 0 0;
  font-size: clamp(14px, 2vw, 17px);
  color: var(--slm-text-2);
}

.hero__search {
  position: relative;
  max-width: 640px;
  margin: clamp(18px, 3vw, 28px) auto 0;
}

.hero__search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--slm-text-2);
  pointer-events: none;
}

.hero__search input {
  width: 100%;
  padding: 14px 18px 14px 44px;
  border: 1px solid var(--glass-border);
  border-radius: 14px;
  background: var(--glass-card);
  color: var(--slm-text);
  font-size: 15px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.hero__search input::placeholder {
  color: var(--slm-text-2);
}

.hero__search input:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.05);
}

/* —— 工具栏 —— */
.toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  /* 入场动画会形成层叠上下文，提升 z-index 保证下拉面板盖在后续卡片区之上 */
  position: relative;
  z-index: 20;
  animation: fade-up 0.55s var(--ease-out) 0.08s both;
}

/* 分段排序控件（Raycast 胶囊风：暗灰高光滑块 + 滑动指示器） */
.segmented {
  position: relative;
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: var(--glass-card);
}

/* 滑动高亮块：顶部径向高光模拟凸起质感，位置/宽度由 JS 测量后弹性过渡 */
.segmented__indicator {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  border-radius: 999px;
  background: radial-gradient(120% 170% at 50% 0%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.03) 62%),
    rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 2px 10px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  will-change: transform, width;
  transition: transform 0.4s var(--ease-spring), width 0.4s var(--ease-spring), opacity 0.2s;
}

.segmented__btn {
  position: relative;
  z-index: 1;
  padding: 7px 16px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--slm-text-2);
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.25s;
}

.segmented__btn:hover {
  color: var(--slm-text);
}

.segmented__btn.active {
  color: #fff;
  font-weight: 600;
}

.controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-select {
  max-width: 170px;
}

/* —— 标签栏 —— */
.tags-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  animation: fade-up 0.55s var(--ease-out) 0.12s both;
}

.tag-chip {
  padding: 6px 14px;
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  background: transparent;
  color: var(--slm-text-2);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  transition: all 0.25s var(--ease-spring);
}

.tag-chip:hover {
  color: var(--slm-text);
  border-color: rgba(255, 255, 255, 0.22);
  transform: translateY(-1px);
}

.tag-chip.active {
  background: radial-gradient(120% 170% at 50% 0%, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.03) 62%),
    rgba(255, 255, 255, 0.05);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 2px 10px rgba(0, 0, 0, 0.35);
  font-weight: 600;
}

.summary {
  font-size: 13px;
  color: var(--slm-text);
  padding: 0 2px;
}

.summary__meta {
  color: var(--slm-text-2);
}

.state {
  padding: 56px 24px;
  text-align: center;
  color: var(--slm-text-2);
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius);
  background: var(--glass-card);
}

.state--error {
  color: #ff6369;
}

.retry {
  margin-left: 10px;
}

/* —— 分区标题 —— */
.section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section__head {
  margin-top: 8px;
}

.section__title {
  margin: 0;
  font-size: clamp(18px, 2.5vw, 22px);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.section__sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--slm-text-2);
}

/* —— 精选区（三列，图标居中放大） —— */
.featured-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: clamp(12px, 2vw, 20px);
}

.fcard {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 10px;
  padding: clamp(20px, 3vw, 32px) 20px;
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius);
  background: var(--glass-card);
  box-shadow: var(--glass-highlight);
  transition: transform 0.35s var(--ease-spring), background 0.3s, border-color 0.3s;
}

.fcard:hover {
  transform: translateY(-4px);
  background: var(--glass-card-hover);
  border-color: rgba(255, 255, 255, 0.18);
}

.fcard__logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--slm-bg-alt);
  color: var(--slm-text);
  font-weight: 700;
  font-size: 26px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  transition: transform 0.35s var(--ease-spring);
}

.fcard:hover .fcard__logo {
  transform: scale(1.08);
}

.fcard__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fcard__name {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.fcard__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--slm-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fcard__btn {
  margin-top: 4px;
}

/* —— 主网格（Raycast 两列大卡片） —— */
.grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr));
  gap: clamp(12px, 2vw, 20px);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: clamp(16px, 2.5vw, 24px);
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius);
  background: var(--glass-card);
  box-shadow: var(--glass-highlight);
  transition: transform 0.35s var(--ease-spring), background 0.3s, border-color 0.3s;
}

.card:hover {
  transform: translateY(-3px);
  background: var(--glass-card-hover);
  border-color: rgba(255, 255, 255, 0.18);
}

/* 筛选/排序时的 FLIP 平滑重排；入场经 TransitionGroup appear 错峰淡入 */
.flip-move {
  transition: transform 0.5s var(--ease-out);
}

.flip-enter-active {
  transition: opacity 0.4s ease, transform 0.4s var(--ease-out);
  transition-delay: calc(min(var(--i, 0), 10) * 45ms);
}

.flip-enter-from {
  opacity: 0;
  transform: translateY(14px) scale(0.98);
}

/* 离场：首帧即隐形。若带淡出，成批离场的卡片会因 position:absolute 堆叠到网格起点，
   半透明白底叠加会闪出一块白斑 */
.flip-leave-active {
  position: absolute;
  transition: opacity 0.15s ease;
}

.flip-leave-from,
.flip-leave-to {
  opacity: 0;
}

/* 顶行：图标 + 名称居左，复制源按钮居右 */
.card__top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card__logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--slm-bg-alt);
  color: var(--slm-text);
  font-weight: 700;
  font-size: 17px;
  overflow: hidden;
  transition: transform 0.35s var(--ease-spring);
}

.card:hover .card__logo {
  transform: scale(1.08);
}

.card__logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card__name {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card__install {
  flex-shrink: 0;
}

.card__desc {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.55;
  color: var(--slm-text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 42px;
}

.card__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.badge {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--slm-bg-soft);
  color: var(--slm-text-2);
}

.badge--open {
  background: rgba(46, 160, 67, 0.18);
  color: #4ade80;
}

.badge--closed {
  background: rgba(158, 106, 3, 0.2);
  color: #fbbf24;
}

.perm {
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 2px 8px;
  border: 1px solid var(--slm-border);
  border-radius: 999px;
  color: var(--slm-text-2);
}

.perm--more {
  border-style: dashed;
}

/* 底部元信息行 */
.card__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: auto;
  font-size: 12px;
  color: var(--slm-text-2);
}

.meta {
  white-space: nowrap;
}

/* 作者链接：头像 + 用户名，灰字 hover 变白，与页脚链接同款 */
.meta--author {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--slm-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.meta--author:hover {
  color: var(--slm-text);
}

.meta__avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--slm-bg-alt);
  outline: 1px solid rgba(255, 255, 255, 0.1);
  outline-offset: -1px;
}

.card__links {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.card__links a {
  color: var(--slm-text-2);
  text-decoration: none;
  transition: color 0.2s;
}

.card__links a:hover {
  color: var(--slm-text);
}

/* 复制成功反馈 */
.is-copied {
  animation: pop 0.4s var(--ease-spring);
  background: rgba(48, 164, 108, 0.2);
  border-color: rgba(48, 164, 108, 0.5);
  color: #4ade80;
}

/* 聚合源按钮复制成功：提高优先级覆盖 .btn--primary，与其它按钮同款半透明绿 */
.agg-btn.is-copied {
  background: rgba(48, 164, 108, 0.2);
  border-color: rgba(48, 164, 108, 0.5);
  color: #4ade80;
}

.agg-btn {
  white-space: nowrap;
}

/* —— 骨架屏 —— */
.skeleton {
  pointer-events: none;
}

.sk {
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.05) 25%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0.05) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

.sk--logo {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.sk--line {
  height: 13px;
}

/* —— 响应式 —— */
@media (max-width: 720px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .segmented {
    width: 100%;
  }
  .segmented__btn {
    flex: 1;
  }
  .controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    width: 100%;
  }
  .filter-select {
    max-width: none;
    width: 100%;
  }
  .agg-btn {
    grid-column: 1 / -1;
    justify-content: center;
  }
  .tags-bar {
    flex-wrap: nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
  }
  .tags-bar::-webkit-scrollbar {
    display: none;
  }
  .card:hover,
  .fcard:hover {
    transform: none;
  }
  .card__meta {
    gap: 8px;
  }
}
</style>
