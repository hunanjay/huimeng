import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端 dev server 把 /api 代理到本地后端，避免 CORS
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
    // 这些目录不是源码：浏览器临时配置、后端数据与产物、截图脚本
    watch: {
      ignored: ['**/.edge-assets/**', '**/server/data/**', '**/server/uploads/**', '**/preview/**'],
    },
  },
});
