import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

// `npm run dev:web` sets this to serve ONLY the React renderer (no Electron) so
// the UI can be previewed in a plain browser — e.g. via Codespaces port
// forwarding. A browser mock for `window.couple` is installed at runtime.
const browserPreview = process.env.BROWSER_PREVIEW === '1'

// Single Vite config that builds three targets:
//   - Electron main process  -> dist-electron/main.js   (CommonJS)
//   - Electron preload script -> dist-electron/preload.js (CommonJS, exposes the
//     secure bridge to the renderer)
//   - React renderer          -> dist/index.html        (loaded by the main process)
export default defineConfig({
  // Relative base so the built index.html loads correctly via file:// in production.
  base: './',
  // Expose the dev server and allow Codespaces' forwarded *.app.github.dev host.
  server: {
    host: true,
    allowedHosts: ['.app.github.dev'],
  },
  resolve: {
    alias: {
      '@shared': path.join(__dirname, 'src/shared'),
      '@renderer': path.join(__dirname, 'src/renderer'),
    },
  },
  plugins: [
    react(),
    // Skip the Electron build entirely in browser-preview mode.
    ...(browserPreview ? [] : [electron({
      main: {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: { format: 'cjs', entryFileNames: 'main.js' },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'src/preload/index.ts'),
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: { format: 'cjs', entryFileNames: 'preload.js' },
            },
          },
        },
      },
      // Renderer config is the default Vite app (this file). Nothing extra needed.
      renderer: {},
    })]),
  ],
})
