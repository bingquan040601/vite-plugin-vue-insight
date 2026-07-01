<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  msg: String,
  count: Number,
})

const localCount = ref(0)
const doubled = computed(() => localCount.value * 2)
</script>

<template>
  <div class="hello">
    <h2>📦 HelloWorld 组件</h2>
    <p class="msg">{{ msg }}</p>
    <p>父组件 count: <strong>{{ count }}</strong></p>

    <div class="local">
      <span>本地计数: {{ localCount }}</span>
      <span>×2 = {{ doubled }}</span>
      <button @click="localCount++">+1</button>
    </div>
  </div>
</template>

<style scoped>
.hello {
  background: #0f3460;
  border-radius: 8px;
  padding: 1.5rem;
  margin: 1rem 0;
}
.hello h2 {
  margin-top: 0;
  color: #38bdf8;
}
.msg {
  font-size: 1.1rem;
  color: #e2e8f0;
}
.local {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1rem;
}
.local button {
  font-size: 0.85rem;
  padding: 0.3em 0.8em;
}
</style>
