import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  base: '/screencast/',
  plugins: [
    svelte(),
    legacy({
      targets: ['chrome 53'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    }),
    {
      name: 'router-share-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const [path, query] = req.url.split('?');
          if (path.endsWith('/share') || path.endsWith('/share/')) {
            req.url = path.replace(/\/share\/?$/, '/share/index.html') + (query ? '?' + query : '');
          }
          next();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const [path, query] = req.url.split('?');
          if (path.endsWith('/share') || path.endsWith('/share/')) {
            req.url = path.replace(/\/share\/?$/, '/share/index.html') + (query ? '?' + query : '');
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        tv: resolve(__dirname, 'index.html'),
        pc: resolve(__dirname, 'share/index.html')
      }
    },
    target: 'chrome53',
    cssTarget: 'chrome53'
  }
});