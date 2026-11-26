import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // 26 Nov (deployment: her laptop + Cloudflare Tunnel, docs/deploy/tunnel.md): `npm run build` with VITE_API_URL=/api,
  // then `npm run preview` serves the built app and passes /api on to the backend, so the whole site has ONE address
  // the tunnel can publish. xfwd adds the visitor's address for the backend's per-address limits (uvicorn
  // --proxy-headers trusts it only from this computer). Only `vite preview` uses this; `npm run dev` is unchanged.
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        xfwd: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Front-end unit tests (27 Oct): `npm test`. Only src/**/*.test.* run here; the browser tests in e2e/ are Playwright's.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/main.jsx'],
      reporter: ['text', 'json-summary'],
    },
  },
})
