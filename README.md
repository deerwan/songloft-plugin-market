# Songloft 插件市场

展示 [Songloft](https://github.com/songloft-org/songloft) 社区 JS 插件的静态站点，数据来自官方/社区**插件源（registry.json）**，自动增强后渲染为可搜索、可筛选的插件列表。

## 一键订阅聚合源

本站会自动把收录的所有插件源汇总成**一个聚合源**，你只需在 Songloft 宿主「管理订阅源」里添加下面这一个地址，即可一次性订阅全部官方与社区插件：

```
https://raw.githubusercontent.com/deerwan/songloft-plugin-market/main/registry.json
```


- 站内工具栏的「复制聚合源」按钮可直接复制该地址。
- 备用兜底地址（GitHub Pages，可能受直连网络影响）：`https://songloft-store.lllh.de/registry.json`
- 聚合源采用 `includes` 嵌套，宿主端会递归拉取各源并按 `entryPath` 去重、保留高版本，因此始终跟随各上游源的最新内容。

## 提交你的插件源

如果你想把自己制作的插件分享到本站聚合源，可以通过 Issue 提交。提交前请先准备：

1. **创建个人插件源仓库**：在 GitHub / Gitee 上建一个仓库，根目录放一份 `registry.json`，`plugins` 字段填写各插件的 `plugin.json` 完整 URL 数组。

   ```json
   {
     "name": "我的插件源",
     "plugins": [
       "https://raw.githubusercontent.com/you/repo/main/plugin-a.json",
       "https://raw.githubusercontent.com/you/repo/main/plugin-b.json"
     ]
   }
   ```

   制作规范详见[插件源制作指南](https://songloft.hanxi.cc/plugin_registry)。

2. **每位开发者只提交一次**：同平台（GitHub / Gitee）同一账号下只需提交一个源地址。新增插件时，直接把新插件的 `plugin.json` URL 加进你已有源的 `plugins` 数组即可，下次构建会自动收录，无需重复提交。

3. 提交时请勾选确认项：已制作个人插件源仓库、源可公开访问且能正常解析、插件不含恶意代码。

提交入口：点击站内「提交插件源」按钮，或在仓库 [Issues](https://github.com/deerwan/songloft-plugin-market/issues) 中选择「提交插件源」模板。维护者审核通过（打 `approved` 标签）后，CI 会自动收录你的源并合并。

## 鸣谢

- 首页 WebGL 持续流动光球背景组件（`src/components/OrbBackground.vue`）移植自 [vuepress-theme-plume](https://github.com/pengzhanbo/vuepress-theme-plume) 的 `Orb` 背景，其最初 fork 自 [vue-bits](https://github.com/DavidHDev/vue-bits)（MIT License）。
- WebGL 渲染依赖 [ogl](https://github.com/oframe/ogl)。
