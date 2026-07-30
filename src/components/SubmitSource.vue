<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

// 仓库 slug：前端提交会打开预填好的 GitHub Issue（无需后端）
const REPO = 'deerwan/songloft-plugin-market'

const url = ref('')
const name = ref('')

function submit() {
  const raw = url.value.trim()
  if (!/^https?:\/\//i.test(raw)) {
    alert('请输入合法的 http(s) 源地址')
    return
  }
  if (!/registry\.json([?#].*)?$/i.test(raw)) {
    alert('源地址必须以 registry.json 结尾（如 https://.../main/registry.json）。若只有一个 plugin.json，请先包一层含 plugins 数组的 registry.json 再提交。')
    return
  }
  const title = encodeURIComponent(`[Source] ${name.value.trim() || raw}`)
  const body = encodeURIComponent(
    `### 插件源地址（必填）\n${raw}\n\n### 展示名（选填）\n${name.value.trim()}\n\n### 备注（选填）\n\n### 确认项\n- [x] 该源可公开访问，且我已自测能正常解析。\n- [x] 该源中的插件不含恶意代码。`,
  )
  const issueUrl = `https://github.com/${REPO}/issues/new?title=${title}&body=${body}&labels=source-submit`
  window.open(issueUrl, '_blank', 'noopener')
  emit('close')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Transition name="modal">
    <div v-if="visible" class="modal-mask" @click.self="emit('close')" @keydown="onKey">
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal__head">
        <h2 class="modal__title">提交插件源</h2>
        <button class="modal__close" aria-label="关闭" @click="emit('close')">×</button>
      </header>
      <p class="modal__hint">
        提交一个可公开访问的 <code>registry.json</code> 源地址（URL 须以
        <code>registry.json</code> 结尾，可附加 <code>?token=</code> 等查询参数）。
        维护者审核通过后，该源会自动收录进本仓库，下次构建即可展示其下所有插件。
      </p>
      <label class="field">
        <span class="field__label">插件源地址 *</span>
        <input
          v-model="url"
          class="field__input"
          type="url"
          placeholder="https://raw.githubusercontent.com/your/repo/main/registry.json"
          @keydown.enter="submit"
        />
      </label>
      <label class="field">
        <span class="field__label">展示名（选填）</span>
        <input v-model="name" class="field__input" type="text" placeholder="如：我的插件源" />
      </label>
      <footer class="modal__foot">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn btn--primary" @click="submit">提交到 GitHub</button>
      </footer>
    </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

/* 入场/退场：遮罩淡入，弹窗弹性缩放上浮 */
.modal-enter-active {
  transition: opacity 0.25s ease;
}
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .modal {
  transition: transform 0.4s var(--ease-spring);
}
.modal-leave-active .modal {
  transition: transform 0.2s ease;
}
.modal-enter-from .modal {
  transform: scale(0.94) translateY(12px);
}
.modal-leave-to .modal {
  transform: scale(0.96);
}

.modal {
  width: 100%;
  max-width: 480px;
  background: rgba(26, 26, 29, 0.85);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius);
  box-shadow: var(--slm-shadow), var(--glass-highlight);
  padding: 24px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  color: var(--slm-text-2);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, transform 0.25s var(--ease-spring);
}
.modal__close:hover {
  color: var(--slm-text);
  background: var(--slm-bg-alt);
}
.modal__close:active {
  transform: scale(0.9);
}
.modal__hint {
  font-size: 13px;
  color: var(--slm-text-2);
  line-height: 1.6;
  margin: 12px 0 16px;
}
.modal__hint code {
  background: var(--slm-bg-alt);
  padding: 1px 5px;
  border-radius: 4px;
}
.field {
  display: block;
  margin-bottom: 14px;
}
.field__label {
  display: block;
  font-size: 13px;
  margin-bottom: 6px;
  color: var(--slm-text);
}
.field__input {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--glass-border);
  border-radius: var(--slm-radius-sm);
  background: rgba(255, 255, 255, 0.04);
  color: var(--slm-text);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}
.field__input::placeholder {
  color: var(--slm-text-2);
  opacity: 0.7;
}
.field__input:focus {
  border-color: rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.06);
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.05);
}
.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
