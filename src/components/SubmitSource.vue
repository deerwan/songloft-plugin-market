<script setup lang="ts">
import { ref } from 'vue'
import { GITHUB_SUBMIT_PLUGIN_URL } from '../config'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const url = ref('')
const name = ref('')
const note = ref('')

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
  const params = new URLSearchParams({
    'source-url': raw,
    'display-name': name.value.trim(),
    note: note.value.trim(),
  })
  const issueUrl = `${GITHUB_SUBMIT_PLUGIN_URL}&${params.toString()}`
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
        若只有一个 plugin.json，请先包一层含 plugins 数组的 registry.json 再提交。
        确认后会跳转到 GitHub 的 <strong>SUBMIT_SOURCE</strong> Issue 模板，预填你已填写的内容。
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
      <label class="field">
        <span class="field__label">备注（选填）</span>
        <textarea v-model="note" class="field__input field__input--area" rows="3" placeholder="可选填一些补充说明" />
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
.field__input--area {
  resize: vertical;
  min-height: 72px;
  line-height: 1.5;
}
.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
