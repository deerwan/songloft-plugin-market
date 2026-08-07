<script setup lang="ts">
import { ref } from 'vue'
import { GITHUB_SUBMIT_PLUGIN_URL } from '../config'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ close: [] }>()

const url = ref('')
const confirmed = ref(false)

function submit() {
  const raw = url.value.trim()
  if (!/^https?:\/\//i.test(raw)) {
    alert('请输入合法的 http(s) 源地址')
    return
  }
  if (!/registry\.json([?#].*)?$/i.test(raw)) {
    alert('源地址必须以 registry.json 结尾。请先制作个人插件源（含 plugins 数组的 registry.json）再提交，可参考弹窗里的「插件源制作指南」。')
    return
  }
  if (!confirmed.value) {
    alert('请先勾选确认框：确认已制作个人插件源仓库且插件不含恶意代码。')
    return
  }
  const params = new URLSearchParams({
    'source-url': raw,
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
        提交你的<strong>个人插件源</strong>地址（可公开访问的 <code>registry.json</code>，URL 须以
        <code>registry.json</code> 结尾，若只有一个 plugin.json，请先包一层含 plugins 数组的
        registry.json 再提交，查看<a
          href="https://songloft.hanxi.cc/plugin_registry"
          target="_blank"
          rel="noopener"
        >插件源制作指南</a>）。每位开发者只需提交一次，新插件加入自己的源即可自动收录。
        支持 GitHub / Gitee 托管的源。
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
      <label class="field field--row">
        <input v-model="confirmed" type="checkbox" />
        <span>
          我已制作个人插件源仓库（含 plugins 数组的 registry.json），并确认该源可公开访问、其中插件不含恶意代码。
        </span>
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
.modal__hint a {
  color: var(--slm-text);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.2s;
}
.modal__hint a:hover {
  opacity: 0.75;
}
.field {
  display: block;
  margin-bottom: 14px;
}
.field--row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--slm-text-2);
  cursor: pointer;
  margin: 16px 0 6px;
}
.field--row input[type="checkbox"] {
  margin-top: 2px;
  width: 16px;
  height: 16px;
  accent-color: var(--slm-primary);
  flex-shrink: 0;
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
