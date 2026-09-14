import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function stripCrossorigin(): import('vite').Plugin {
  return {
    name: 'strip-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/ crossorigin/g, '')
    },
  }
}

// https://vite.dev/config
export default defineConfig({
  base: '/crm/',
  plugins: [react(), stripCrossorigin()],
  build: {
    modulePreload: {
      polyfill: false,
    },
  },
})
