import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { vueInsightPlugin } from 'vite-plugin-vue-insight'

export default defineConfig({
  plugins: [
    vueInsightPlugin(),
    vue(),
  ],
})
