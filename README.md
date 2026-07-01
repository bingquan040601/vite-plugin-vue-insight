# vite-plugin-vue-insight

> 点击定位源码、高亮 DOM、查看组件状态、分享链接 — Vue 3 + Vite 调试助手

一个 Vite 插件，在开发模式下按住 `⌥+Shift`（macOS）或 `Alt+Shift`（Windows/Linux）并点击页面元素，即可：

- 🔦 **DOM 高亮** — 点击的元素显示脉动红色边框
- 📁 **源码定位** — 自动打开编辑器中对应的 `.vue` 文件并跳转到指定行
- ⚛️ **组件状态** — 在控制台打印组件的 props 和响应式数据
- 🔗 **可分享链接** — 生成 `vscode://` 协议的链接并复制到剪贴板，团队成员点击即可在本地打开对应代码

## 安装

```bash
npm install vite-plugin-vue-insight --save-dev
```

## 使用

```js
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vueInsightPlugin } from 'vite-plugin-vue-insight'

export default defineConfig(({ mode }) => ({
  plugins: [
    // 只在开发模式下启用
    ...(mode === 'development' ? [vueInsightPlugin()] : []),
    vue(),
  ],
}))
```

启动 dev server 后，按住 `⌥+Shift`（macOS）或 `Alt+Shift`（Windows/Linux）并点击页面上的任意元素即可开始调试。

## 选项

```js
vueInsightPlugin({
  editor: 'vscode',                 // 编辑器类型：'vscode' | 'cursor' | 'webstorm' | 'vscode-insiders'
  namespace: 'data-v-insight',      // DOM 属性名前缀
  skipComponents: true,             // 是否跳过 Vue 组件标签（只保留原生 HTML 标签的标记）
})
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `editor` | `string` | `'vscode'` | 点击后打开的编辑器 |
| `namespace` | `string` | `'data-v-insight'` | 注入到 HTML 标签上的属性名前缀 |
| `skipComponents` | `boolean` | `true` | 是否跳过组件标签（如 `<MyComponent>`） |

## 工作原理

整个插件分为两个阶段：

### 1. 构建时（Build Time）

通过 Vite 的 `transform` 钩子，在编译 `.vue` 文件时：

- 解析 SFC 中的 `<template>` 部分
- 在每个 HTML 标签上注入自定义属性，例如：

```html
<div data-v-insight-file="src/App.vue" data-v-insight-line="5" data-v-insight-component="App">
```

- 组件标签和虚拟标签（`<template>`、`<slot>`、`<component>`）默认跳过

### 2. 运行时（Runtime）

通过 `transformIndexHtml` 钩子向 `index.html` 注入一段客户端脚本：

- **激活**：检测 `⌥+Shift` 或 `Alt+Shift` 组合键，进入检查模式（鼠标变为十字准星）
- **预览**：鼠标悬停时显示蓝色半透明边框
- **点击**：脉动红色边框高亮 + 控制台打印文件路径、行号、组件名
- **编辑器**：通过 `fetch('/__open-in-editor')` 请求打开 Vite 的编辑器接口
- **状态**：读取 `__vueParentComponent` 内部引用，提取 props 和响应式状态
- **分享**：生成 `vscode://file/path:line` 链接并自动复制到剪贴板

## 示例输出

控制台打印效果：

```
🔍 Vue Insight

📁 src/components/HelloWorld.vue
📍 第 15 行
🧩 HelloWorld
🏷️ button
🔗 vscode://file/src/components/HelloWorld.vue:15:1  (已复制)

⚛️ HelloWorld — 组件状态
  📦 Props: { msg: "Welcome" }
  🔄 Reactive State: { count: 0 (ref) }
```

## 许可证

MIT
