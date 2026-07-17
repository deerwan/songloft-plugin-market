#!/usr/bin/env node
// 从「提交插件源」Issue 的正文里解析出源地址（registry.json / plugin.json URL）。
//
// 这是 submit-source.yml 的第一环：把用户在 Issue 表单里填写的
// 「插件源地址」抽取成标准 URL，交给后续的 `validate:source` 校验。
//
// 用法：
//   node scripts/parse_submission.mjs <issue_body_file>   读取文件内容解析
//   node scripts/parse_submission.mjs <url>               直接传入 URL（本地调试）
//
// 输出：成功时把解析到的 URL 打印到 stdout（一行），退出码 0；
//       找不到合法 URL 时打印原因到 stderr，退出码 1。

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 从正文抽取第一个合法 http(s) URL。
// 策略：
//   1) 优先取「插件源地址」小节之后的 URL（GitHub Forms 渲染为 ### 标题 + 内容）
//   2) 兜底：全文第一个 URL（含 markdown 链接 [text](url)）
function extractUrl(body) {
  if (typeof body !== 'string' || !body.trim()) return null
  const text = body

  const stripTrailing = (u) => u.replace(/[.,;:)'"`]+$/, '').trim()

  // 1) 定位「插件源地址」小节
  const sectionMatch = text.match(/插件源地址[\s\S]*?(?=\n###\s|$)/i)
  const section = sectionMatch ? sectionMatch[0] : ''
  const sectionUrls = [...section.matchAll(/\bhttps?:\/\/\S+/gi)].map((m) => stripTrailing(m[0]))
  if (sectionUrls.length) return sectionUrls[0]

  // 2) 全文兜底
  const allUrls = [...text.matchAll(/\bhttps?:\/\/\S+/gi)].map((m) => stripTrailing(m[0]))
  // 2a) markdown 链接里的 url 优先级略高
  const mdUrls = [...text.matchAll(/\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)/gi)].map((m) => stripTrailing(m[1]))
  const candidates = mdUrls.length ? mdUrls : allUrls
  if (candidates.length) return candidates[0]

  return null
}

function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('用法: node scripts/parse_submission.mjs <issue_body_file|url>')
    process.exit(1)
  }

  // 直接传了 URL
  if (/^https?:\/\//i.test(arg)) {
    process.stdout.write(arg + '\n')
    process.exit(0)
  }

  // 当作文件路径读取
  const filePath = resolve(process.cwd(), arg)
  if (!existsSync(filePath)) {
    console.error(`找不到文件：${arg}`)
    process.exit(1)
  }
  let body
  try {
    body = readFileSync(filePath, 'utf-8')
  } catch (e) {
    console.error(`读取文件失败：${e.message}`)
    process.exit(1)
  }

  const url = extractUrl(body)
  if (!url) {
    console.error('未能从 Issue 正文中解析出合法的 http(s) 源地址（registry.json / plugin.json）。')
    process.exit(1)
  }
  process.stdout.write(url + '\n')
  process.exit(0)
}

main()
