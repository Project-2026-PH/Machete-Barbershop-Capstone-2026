import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { env } from 'node:process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const startupLogPlugin = () => ({
  name: 'demoshop-startup-log',
  configureServer(server) {
    server.httpServer?.once('listening', () => {
      const address = server.httpServer.address()
      const port = typeof address === 'object' && address ? address.port : 5173
      console.log(`[Frontend] Started successfully at http://localhost:${port}`)
    })
  },
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    startupLogPlugin(),
  ],
  envDir: '../',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@demoshop/shared-types': path.resolve(__dirname, '../packages/shared-types/index.ts'),
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router',
      'lucide-react',
      'chart.js',
      'react-chartjs-2',
      'recharts',
      'zxcvbn',
      '@supabase/supabase-js',
      'axios'
    ],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      clientPort: 5173,
    },
    warmup: {
      // Keep the app shell responsive at startup. Set VITE_DEV_WARMUP=1
      // to restore the broader cashier-navigation warmup when profiling it.
      clientFiles: env.VITE_DEV_WARMUP === '1'
        ? [
          './src/App.jsx',
          './src/main.jsx',
          './src/features/cashier/tabs/*.jsx',
          './src/features/cashier/components/pos/*.jsx',
          './src/hooks/*.ts',
        ]
        : ['./src/App.jsx', './src/main.jsx'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: 'es2020',
    // Gzip-size calculation is diagnostic only and slows production builds.
    reportCompressedSize: false,
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
          chartjs: ['chart.js', 'react-chartjs-2'],
          recharts: ['recharts'],
          lucide: ['lucide-react'],
        },
      },
    },
  },
})
