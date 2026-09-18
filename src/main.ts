import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'

// hash → history 迁移兼容：旧分享链接形如 /#/issues，直接加载会落到市场页。
// 检测到以 #/ 开头的 hash 时改写为真实路径，再交给路由解析。
// 过渡期后（旧链接失去流量）可移除。
const legacyHash = window.location.hash
if (legacyHash.startsWith('#/')) {
  window.history.replaceState(null, '', legacyHash.slice(1))
}

createApp(App).use(router).mount('#app')
