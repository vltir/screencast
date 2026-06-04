import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    svelte(),
    legacy({
      targets: ['chrome 53'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  build: {
    rollupOptions: {
      input: {
        tv: resolve(__dirname, 'index.html'),
        pc: resolve(__dirname, 'share.html')
      }
    },
    target: 'chrome53',
    cssTarget: 'chrome53'
  }
});