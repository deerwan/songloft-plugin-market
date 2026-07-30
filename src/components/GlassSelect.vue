<script setup lang="ts" generic="T extends string">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  modelValue: T
  options: { value: T; label: string }[]
  ariaLabel?: string
}>()

const emit = defineEmits<{ (e: 'update:modelValue', v: T): void }>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? ''
)

function choose(v: T) {
  emit('update:modelValue', v)
  open.value = false
}

// 点击组件外部时收起面板
function onDocClick(e: MouseEvent) {
  if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div ref="rootRef" class="gselect" @keydown="onKey">
    <button
      type="button"
      class="gselect__trigger"
      :class="{ 'is-open': open }"
      :aria-label="ariaLabel"
      aria-haspopup="listbox"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="gselect__label">{{ selectedLabel }}</span>
      <svg
        class="gselect__chevron"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M2.5 4.5L6 8l3.5-3.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <Transition name="gselect">
      <ul v-if="open" class="gselect__panel" role="listbox">
        <li v-for="o in options" :key="o.value" role="option" :aria-selected="o.value === modelValue">
          <button
            type="button"
            class="gselect__option"
            :class="{ active: o.value === modelValue }"
            @click="choose(o.value)"
          >
            <span class="gselect__option-label">{{ o.label }}</span>
            <svg
              v-if="o.value === modelValue"
              class="gselect__check"
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M2.5 6.5L5 9l4.5-5.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.gselect {
  position: relative;
  display: inline-block;
}

/* 触发按钮：与工具栏其它玻璃控件同材质 */
.gselect__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-card);
  color: var(--slm-text);
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s, background 0.2s;
}

.gselect__trigger:hover,
.gselect__trigger:focus-visible,
.gselect__trigger.is-open {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
}

.gselect__label {
  flex: 1;
  min-width: 0;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gselect__chevron {
  flex: none;
  color: var(--slm-text-2);
  transition: transform 0.3s var(--ease-spring);
}

.gselect__trigger.is-open .gselect__chevron {
  transform: rotate(180deg);
}

/* 下拉面板：近乎实底深色 + 重投影。
   不依赖 backdrop-filter：祖先带 opacity 动画时会形成 backdrop root，模糊会失效导致下方内容透出 */
.gselect__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 80;
  min-width: 100%;
  width: max-content;
  max-width: 280px;
  max-height: min(48vh, 400px);
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0;
  padding: 4px;
  list-style: none;
  background: #1b1b1e;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.4), var(--glass-highlight);
  transform-origin: top left;
}

/* 面板内细滚动条 */
.gselect__panel::-webkit-scrollbar {
  width: 6px;
}

.gselect__panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 3px;
}

.gselect__panel {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.14) transparent;
}

.gselect-enter-active {
  transition: opacity 0.2s ease, transform 0.3s var(--ease-spring);
}

.gselect-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.gselect-enter-from,
.gselect-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.96);
}

.gselect__option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--slm-text-2);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.gselect__option:hover {
  color: var(--slm-text);
  background: rgba(255, 255, 255, 0.08);
}

.gselect__option.active {
  color: #fff;
  font-weight: 600;
}

.gselect__option-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gselect__check {
  flex: none;
  color: var(--slm-text);
}
</style>
