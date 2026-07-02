/**
 * vite-plugin-vue-insight — Vite 插件
 *
 * dev 模式下扫描 .vue template，在每个 HTML 标签注入 data-v-insight-* 属性，
 * 配合客户端运行时实现：Alt+Shift 定位源码 + 高亮 DOM + 打印组件状态 + 分享链接。
 *
 * @package vite-plugin-vue-insight
 */

import { parse as parseSFC } from '@vue/compiler-sfc'
import path from 'node:path'

// ─── 工具函数 ───────────────────────────────────────────────────────────────────

function findUnquoted(str, char, startPos) {
  let inQuote = false, quoteChar = ''
  for (let i = startPos; i < str.length; i++) {
    const ch = str[i]
    if (inQuote) { if (ch === quoteChar) inQuote = false }
    else { if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch }
           else if (ch === char) return i }
  }
  return -1
}

function isComponentName(name) {
  return name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()
}

const VIRTUAL_TAGS = new Set(['template', 'slot', 'component'])

// ─── 插件选项 ──────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} InsightOptions
 * @property {'vscode'|'cursor'|'webstorm'|'vscode-insiders'} [editor='vscode']
 * @property {string} [namespace='data-v-insight']  属性名前缀
 * @property {boolean} [skipComponents=true]         跳过组件标签注入
 */

// ─── Vite Plugin ────────────────────────────────────────────────────────────────

/**
 * @param {InsightOptions} [options]
 * @returns {import('vite').Plugin}
 */
export function vueInsightPlugin(options = {}) {
  const opts = {
    editor: 'vscode',
    namespace: 'data-v-insight',
    skipComponents: true,
    ...options,
  }

  /** @type {string} */
  let root = ''

  /** 客户端配置，运行时透传给 inspector-client.js */
  const clientConfig = JSON.stringify({
    editor: opts.editor,
    attrPrefix: opts.namespace,
    modifiers: { alt: true, shift: true },
    highlightColor: '#ff6b6b',
    highlightDuration: 4000,
  })

  return {
    name: 'vite-plugin-vue-insight',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    transform(code, id) {
      if (!id.endsWith('.vue') || id.includes('node_modules')) return null

      let descriptor
      try {
        const result = parseSFC(code)
        if (result.errors.length > 0) return null
        descriptor = result.descriptor
      } catch {
        return null
      }

      if (!descriptor.template || descriptor.template.lang) return null

      const template = descriptor.template
      const templateContent = template.content
      const len = templateContent.length
      if (len === 0) return null

      const contentStart = template.loc.start.offset
      const baseLine = code.substring(0, contentStart).split('\n').length
      const relativePath = path.relative(root, id).replace(/\\/g, '/')
      const absolutePath = path.resolve(id).replace(/\\/g, '/')
      const componentName = path.basename(id, '.vue')

      const P = opts.namespace  // 属性前缀

      /** @type {Array<{pos: number, text: string}>} */
      const insertions = []
      let i = 0

      while (i < len) {
        const tagStart = templateContent.indexOf('<', i)
        if (tagStart === -1 || tagStart >= len - 1) break

        // 跳过注释
        if (tagStart + 3 < len &&
            templateContent[tagStart + 1] === '!' &&
            templateContent[tagStart + 2] === '-' &&
            templateContent[tagStart + 3] === '-') {
          const close = templateContent.indexOf('-->', tagStart + 4)
          i = close !== -1 ? close + 3 : len; continue
        }

        // 跳过结束标签
        if (templateContent[tagStart + 1] === '/') {
          const close = templateContent.indexOf('>', tagStart + 2)
          i = close !== -1 ? close + 1 : len; continue
        }

        // 跳过 <!DOCTYPE> 等
        if (templateContent[tagStart + 1] === '!' || templateContent[tagStart + 1] === '?') {
          const close = templateContent.indexOf('>', tagStart + 2)
          i = close !== -1 ? close + 1 : len; continue
        }

        // 提取标签名
        let tagNameEnd = tagStart + 1
        while (tagNameEnd < len && /[\w.-]/.test(templateContent[tagNameEnd])) { tagNameEnd++ }

        if (tagNameEnd === tagStart + 1) { i = tagStart + 1; continue }

        const tagName = templateContent.substring(tagStart + 1, tagNameEnd)

        // 跳过组件标签和虚拟标签
        if (isComponentName(tagName) || VIRTUAL_TAGS.has(tagName)) {
          const openEnd = findUnquoted(templateContent, '>', tagNameEnd)
          i = openEnd !== -1 ? openEnd + 1 : len; continue
        }

        // 计算 SFC 行号
        let linesInContent = 0
        for (let j = 0; j < tagStart; j++) { if (templateContent[j] === '\n') linesInContent++ }
        const sfcLine = baseLine + linesInContent

        // 插入属性
        const sfcPos = contentStart + tagNameEnd
        const attrStr =
          ` ${P}-file="${relativePath}"` +
          ` ${P}-abspath="${absolutePath}"` +
          ` ${P}-line="${sfcLine}"` +
          ` ${P}-component="${componentName}"`

        insertions.push({ pos: sfcPos, text: attrStr })

        const openEnd = findUnquoted(templateContent, '>', tagNameEnd)
        i = openEnd !== -1 ? openEnd + 1 : len
      }

      if (insertions.length === 0) return null

      insertions.sort((a, b) => b.pos - a.pos)
      let result = code
      for (const ins of insertions) {
        result = result.slice(0, ins.pos) + ins.text + result.slice(ins.pos)
      }

      return { code: result, map: null }
    },

    /**
     * 注入客户端运行时 + 配置
     */
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: inspectorClientCode,
          injectTo: 'body-prepend',
        },
      ]
    },

    /**
     * 服务端中间件：处理 /__open-in-editor 请求，
     * 调用系统命令打开编辑器并跳转到指定文件的指定行。
     */
    configureServer(server) {
      server.middlewares.use('/__open-in-editor', async (req, res) => {
        try {
          const url = new URL(req.url, 'http://localhost')
          const fileParam = url.searchParams.get('file')
          if (!fileParam) {
            res.statusCode = 400
            res.end('Missing file parameter')
            return
          }

          // Windows 绝对路径如 C:/path/to/file.vue:10:1，需从右侧拆分行号列号
          const lastColon = fileParam.lastIndexOf(':')
          const secondLastColon = fileParam.lastIndexOf(':', lastColon - 1)
          const filePath = fileParam.substring(0, secondLastColon)
          const line = fileParam.substring(secondLastColon + 1, lastColon)
          const column = fileParam.substring(lastColon + 1) || '1'

          const { spawn } = await import('node:child_process')

          /** @type {string} */ let cmd
          /** @type {string[]} */ let args

          switch (opts.editor) {
            case 'cursor':
              cmd = 'cursor'
              args = ['-g', `${filePath}:${line}:${column}`]
              break
            case 'webstorm':
              cmd = 'webstorm'
              args = ['--line', line, '--column', column, filePath]
              break
            case 'vscode-insiders':
              cmd = 'code-insiders'
              args = ['-g', `${filePath}:${line}:${column}`]
              break
            case 'vscode':
            default:
              cmd = 'code'
              args = ['-g', `${filePath}:${line}:${column}`]
              break
          }

          const child = spawn(cmd, args, {
            stdio: 'ignore',
            detached: true,
            shell: process.platform === 'win32',
          })
          child.on('error', (err) => {
            console.warn('[vue-insight] 无法启动编辑器 (' + cmd + '): ' + err.message)
            console.warn('[vue-insight] 请确认 ' + cmd + ' 已安装且已加入 PATH 环境变量')
          })
          child.unref()

          res.statusCode = 200
          res.end('OK')
        } catch {
          res.statusCode = 500
          res.end('Failed to open editor')
        }
      })
    },
  }
}

// ─── 客户端运行时（内联） ──────────────────────────────────────────────────────
// 构建时可通过 esbuild 压缩替换此处

const inspectorClientCode = `
window.__VUE_INSIGHT__ = ${JSON.stringify({
  editor: 'vscode',
  attrPrefix: 'data-v-insight',
  modifiers: { alt: true, shift: true },
  highlightColor: '#ff6b6b',
  highlightDuration: 4000,
})};

;(() => {
  const C = window.__VUE_INSIGHT__
  const P = C.attrPrefix  // 属性前缀

  // ── 平台检测 ──
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgentData?.platform || '')
  const shortcutLabel = isMac ? '⌥+Shift (Option+Shift)' : 'Alt+Shift'

  let isInspecting = false
  let currentOverlay = null
  let hoveredElement = null
  let rafId = null
  let hasShownInstructions = false

  // ── 样式注入 ──
  if (!document.getElementById('__v-insight-styles')) {
    const s = document.createElement('style')
    s.id = '__v-insight-styles'
    s.textContent = '@keyframes __v-insight-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.03)}}'
    document.head.appendChild(s)
  }

  // ── 高亮 ──
  function showOverlay(el, isPreview) {
    removeOverlay()
    const r = el.getBoundingClientRect()
    const o = document.createElement('div')
    o.style.cssText = isPreview
      ? \`position:fixed;z-index:2147483646;pointer-events:none;top:\${r.top}px;left:\${r.left}px;width:\${r.width}px;height:\${r.height}px;border:1.5px solid #38bdf8;border-radius:2px;background:rgba(56,189,248,0.08);transition:all .05s\`
      : \`position:fixed;z-index:2147483647;pointer-events:none;top:\${r.top}px;left:\${r.left}px;width:\${r.width}px;height:\${r.height}px;border:2px solid \${C.highlightColor};border-radius:2px;box-shadow:0 0 0 4px \${C.highlightColor}33,0 0 24px \${C.highlightColor}44;animation:__v-insight-pulse 1.2s ease-in-out 3\`
    document.body.appendChild(o)
    currentOverlay = o
    if (!isPreview) setTimeout(removeOverlay, C.highlightDuration)
  }

  function removeOverlay() { currentOverlay?.remove(); currentOverlay = null }

  // ── Vue 状态提取 ──
  function getCompInfo(el) {
    try {
      const internal = el.__vueParentComponent
      if (!internal) return null
      const displayName = internal.type?.name || internal.type?.__name || internal.type?._componentTag || 'Anonymous'
      const rawProps = internal.props || {}
      const props = {}
      for (const k of Object.keys(rawProps)) { try { props[k] = structuredClone(rawProps[k]) } catch { props[k] = String(rawProps[k]) } }
      const rawState = internal.setupState || {}
      const state = {}
      for (const k of Object.keys(rawState)) {
        if (k.startsWith('__') || k === '\$' || k === 'props') continue
        try {
          const v = rawState[k]
          if (v && typeof v === 'object' && '__v_isRef' in v) state[\`\${k} (ref)\`] = structuredClone(v.value)
          else if (v && typeof v === 'object' && '__v_isReactive' in v) state[\`\${k} (reactive)\`] = structuredClone(v)
          else if (typeof v === 'function') state[k] = \`ƒ \${v.name || 'anonymous'}()\`
          else state[k] = structuredClone(v)
        } catch { state[k] = '[unserializable]' }
      }
      const rawData = internal.data || {}
      for (const k of Object.keys(rawData)) { if (!(k in state)) { try { state[k] = structuredClone(rawData[k]) } catch { state[k] = String(rawData[k]) } } }
      return { displayName, props, state }
    } catch { return null }
  }

  // ── 可分享链接 ──
  const SCHEMES = { vscode: 'vscode', 'vscode-insiders': 'vscode-insiders', cursor: 'cursor', webstorm: 'webstorm' }

  function genLink(abspath, line) {
    const scheme = SCHEMES[C.editor] || 'vscode'
    return scheme + '://file/' + encodeURIComponent(abspath).replace(/%2F/g, '/') + ':' + line + ':1'
  }

  function copy(text) {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).catch(() => {})
  }

  // ── Console 打印 ──
  function printInfo(el) {
    const file = el.getAttribute(P + '-file')
    const abspath = el.getAttribute(P + '-abspath')
    const line = el.getAttribute(P + '-line')
    const comp = el.getAttribute(P + '-component')

    console.log('%c 🔍 Vue Insight ', 'font-size:15px;font-weight:800;color:#fff;background:#e53e3e;padding:4px 10px;border-radius:4px')
    console.log('')

    const tag = (bg) => 'font-size:13px;font-weight:700;color:#fff;background:' + bg + ';padding:1px 8px;border-radius:3px;margin-right:4px'
    const val = 'font-size:13px;font-weight:600'

    console.log('%c 📁 %c ' + file,                       tag('#2563eb'), val)
    console.log('%c 📍 %c 第 ' + line + ' 行',              tag('#7c3aed'), val)
    console.log('%c 🧩 %c ' + comp,                        tag('#0891b2'), val)
    console.log('%c 🏷️ %c ' + el.tagName.toLowerCase(),    tag('#be185d'), val)

    if (abspath && line) {
      const url = genLink(abspath, line)
      copy(url)
      console.log('')
      console.log('%c 🔗 %c  ' + url + '  %c  (已复制)', tag('#10b981'), 'font-size:12px;font-weight:500;color:#10b981;user-select:all', 'font-size:11px;color:#6b7280')
    }

    const ci = getCompInfo(el)
    if (ci && (Object.keys(ci.props).length || Object.keys(ci.state).length)) {
      console.groupCollapsed('%c⚛️ ' + ci.displayName + ' — 组件状态', 'font-size:14px;font-weight:700')
      if (Object.keys(ci.props).length) console.log('%c📦 Props:', 'font-size:13px;font-weight:700', ci.props)
      if (Object.keys(ci.state).length) console.log('%c🔄 Reactive State:', 'font-size:13px;font-weight:700', ci.state)
      console.groupEnd()
    } else {
      console.log('%cℹ️  未提取到组件状态', 'font-size:12px;color:#94a3b8')
    }
    console.log('─'.repeat(44))
  }

  // ── 事件处理 ──
  function checkMod(e) { const m = C.modifiers; return (!m.alt || e.altKey) && (!m.shift || e.shiftKey) && (!m.ctrl || e.ctrlKey) && (!m.meta || e.metaKey) }

  function preventSelect(e) { e.preventDefault() }

  function onKD(e) {
    if (!hasShownInstructions && checkMod(e)) {
      hasShownInstructions = true
      console.log('%c 🔍 Vue Insight 已激活 ', 'font-size:16px;font-weight:800;color:#fff;background:#e53e3e;padding:4px 12px;border-radius:4px')
      console.log('%c 按住 ' + shortcutLabel + ' 点击页面元素 ➔ 高亮 + 源码 + 状态 + 分享', 'font-size:13px;font-weight:600')
    }
    if (checkMod(e) && !isInspecting) {
      isInspecting = true
      document.body.style.cursor = 'crosshair'
      document.addEventListener('selectstart', preventSelect)
      document.addEventListener('mousemove', onMM, true)
    }
  }

  function onKU(e) {
    if (isInspecting && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      isInspecting = false
      document.body.style.cursor = ''
      document.removeEventListener('selectstart', preventSelect)
      document.removeEventListener('mousemove', onMM, true)
      hoveredElement = null; removeOverlay()
    }
  }

  function onMM(e) {
    if (!isInspecting || rafId) return
    const el = e.target.closest('[' + P + '-file]')
    rafId = requestAnimationFrame(function() {
      rafId = null
      if (el && hoveredElement !== el) {
        hoveredElement = el; removeOverlay();
        showOverlay(el, true)
      } else if (!el) {
        hoveredElement = null; removeOverlay()
      }
    })
  }

  function onCL(e) {
    if (!isInspecting) return
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation()
    isInspecting = false
    document.body.style.cursor = ''
    document.removeEventListener('selectstart', preventSelect)
    document.removeEventListener('mousemove', onMM, true)
    hoveredElement = null

    const el = e.target.closest('[' + P + '-file]')
    if (!el) { removeOverlay(); return }
    showOverlay(el, false)
    printInfo(el)

    const file = el.getAttribute(P + '-file')
    const abspath = el.getAttribute(P + '-abspath')
    const line = el.getAttribute(P + '-line')
    const target = abspath || file
    if (target && line) {
      fetch('/__open-in-editor?file=' + encodeURIComponent(target) + ':' + line + ':1', { method: 'HEAD' }).catch(function() {
        location.href = genLink(abspath, line)
      })
    }
  }

  // ── 初始化 ──
  document.addEventListener('keydown', onKD, true)
  document.addEventListener('keyup', onKU, true)
  document.addEventListener('click', onCL, true)

  console.log('%c 🔍 Vue Insight 已加载 — 按住 ' + shortcutLabel + ' 点击页面元素开始调试 ', 'font-size:13px;font-weight:600;color:#e2e8f0;background:#1e293b;padding:3px 10px;border-radius:4px;border-left:4px solid #e53e3e')
})();
`
