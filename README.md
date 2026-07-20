# Songloft 插件市场

展示 [Songloft](https://github.com/songloft-org/songloft) 社区 JS 插件的静态站点，数据来自官方/社区**插件源（registry.json）**，自动增强后渲染为可搜索、可筛选的插件列表。

## 一键订阅聚合源

本站会自动把收录的所有插件源汇总成**一个聚合源**，你只需在 Songloft 宿主「管理订阅源」里添加下面这一个地址，即可一次性订阅全部官方与社区插件：

```
https://songloft-store.lllh.de/registry.json
```

- 站内工具栏的「复制聚合源」按钮可直接复制该地址。
- 聚合源采用 `includes` 嵌套引用（见 [`plugin_registry.md`](../plugin_registry.md)），宿主端会递归拉取各源并按 `entryPath` 去重、保留高版本，因此始终跟随各上游源的最新内容。
- 聚合源由 [`scripts/gen-aggregated-registry.mjs`](scripts/gen-aggregated-registry.mjs) 从 [`data/sources.json`](data/sources.json) 自动生成（零网络依赖），随 CI 部署到 GitHub Pages。

