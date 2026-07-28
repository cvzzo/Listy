import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    // In ascolto su tutte le interfacce, non solo localhost: serve per aprire
    // l'app dal telefono sulla stessa rete di casa
    host: true,
    port: 5173,
    // Meglio un errore subito che scivolare sulla 5174: un secondo Vite avviato
    // per sbaglio serve il frontend senza le funzioni, e ogni /api/* torna 404
    strictPort: true,
  },
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
        // La gestione di push e notificationclick vive in un file a parte: cosi la
        // precache e le regole offline restano generate da workbox, non scritte a mano
        importScripts: ['/push-sw.js'],
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
