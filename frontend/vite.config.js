import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
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
