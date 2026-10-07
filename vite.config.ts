import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { host: '0.0.0.0' },
  build: { target: 'es2022' },
  assetsInclude: ['**/*.glsl'],
})
