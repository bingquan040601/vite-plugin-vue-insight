<script setup>
import { ref, computed } from 'vue'
import HelloWorld from './HelloWorld.vue'

const count = ref(0)
const message = ref('Hello Vue Insight!')

const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)
const shortcutLabel = computed(() => isMac ? '⌥+Shift' : 'Alt+Shift')
</script>

<template>
  <div class="app">
    <h1>{{ message }}</h1>
    <p>按住 <kbd>{{ shortcutLabel }}</kbd> 点击页面元素开始调试</p>

    <div class="card">
      <button @click="count++">count is {{ count }}</button>
      <p>
        Edit <code>src/App.vue</code> to test HMR
      </p>
      <input v-model="message" placeholder="输入文本..." />
    </div>

    <HelloWorld :msg="message" :count="count" />

    <footer>
      <p>vite-plugin-vue-insight demo</p>
    </footer>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #1a1a2e;
  color: #e0e0e0;
  min-height: 100vh;
}
#app {
  display: flex;
  justify-content: center;
  padding: 2rem;
}
.app {
  max-width: 600px;
  width: 100%;
}
h1 {
  font-size: 2rem;
  color: #ff6b6b;
  margin-bottom: 0.5rem;
}
.card {
  background: #16213e;
  border-radius: 8px;
  padding: 1.5rem;
  margin: 1.5rem 0;
}
button {
  background: #ff6b6b;
  color: white;
  border: none;
  padding: 0.6em 1.2em;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}
button:hover {
  background: #e55353;
}
input {
  display: block;
  margin-top: 0.5rem;
  padding: 0.5em;
  border-radius: 4px;
  border: 1px solid #333;
  background: #1a1a2e;
  color: #e0e0e0;
  width: 200px;
}
kbd {
  background: #333;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85em;
}
footer {
  margin-top: 2rem;
  font-size: 0.85rem;
  color: #666;
  text-align: center;
}
</style>
