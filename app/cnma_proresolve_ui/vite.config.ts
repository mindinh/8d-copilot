import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import * as path from 'path'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(), // Tailwind v4 — no postcss.config needed
    ],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        dedupe: ['react', 'react-dom'],
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
    },
    server: {
        proxy: {
            '/odata': {
                target: 'http://127.0.0.1:4004',
                changeOrigin: true,
                secure: false,
                headers: { Authorization: 'Basic YWRtaW46MTIz' },
            },
            '/api/cnma': {
                target: 'http://127.0.0.1:4004',
                changeOrigin: true,
                secure: false,
                headers: { Authorization: 'Basic YWRtaW46MTIz' },
            },
            '/identity': {
                target: 'http://127.0.0.1:4004',
                changeOrigin: true,
                secure: false,
                headers: { Authorization: 'Basic YWRtaW46MTIz' },
            },
            '/identity-admin': {
                target: 'http://127.0.0.1:4004',
                changeOrigin: true,
                secure: false,
                headers: { Authorization: 'Basic YWRtaW46MTIz' },
                configure: (proxy) => {
                    proxy.on('error', (err) => console.error('[Vite Proxy Error /identity-admin]:', err.message));
                },
            },
            '/workflow': {
                target: 'http://127.0.0.1:4004',
                changeOrigin: true,
                secure: false,
                headers: { Authorization: 'Basic YWRtaW46MTIz' },
            },
            '/workflow-admin': {
                target: 'http://127.0.0.1:4004',
                changeOrigin: true,
                secure: false,
                headers: { Authorization: 'Basic YWRtaW46MTIz' },
            },
        },
    },
})
