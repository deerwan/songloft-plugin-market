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
  <div v-if="visible" class="modal-mask" @click.self="emit('close')" @keydown="onKey">
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal__head">
        <h2 class="modal__title">提交插件源</h2>
        <button class="modal__close" aria-label="关闭" @click="emit('close')">×</button>
      </header>
      <p class="modal__hint">
        提交一个可公开访问的 <code>registry.json</code>（或单个 <code>plugin.json</code>）地址。
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
  max-width: 480px;
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
  padding: 10px 12px;
  border: 1px solid var(--slm-border);
  border-radius: var(--slm-radius);
  background: var(--slm-bg-soft);
  color: var(--slm-text);
  font-size: 14px;
  outline: none;
}
.field__input:focus {
  border-color: var(--slm-brand);
}
.modal__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
</style>
