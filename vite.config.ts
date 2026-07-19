import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Keep the big, rarely-changing canvas/zip libraries in their own
        // long-cacheable chunk instead of bloating the dashboard bundle.
        manualChunks: {
          'fabric-vendor': ['fabric'],
          'zip-vendor': ['jszip'],
        },
      },
    },
  },
})
