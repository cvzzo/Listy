import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['Logo.svg'],
      manifest: {
        name: 'Listy',
        short_name: 'Listy',
        description: 'La lista della spesa condivisa in famiglia',
        theme_color: '#faf6ed',
        background_color: '#faf6ed',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [{ src: '/Logo.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname === '/api/sync-pull',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'sync-pull-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
})
