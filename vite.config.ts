import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            const codemirrorLanguage = id.match(/[\\/]node_modules[\\/]@codemirror[\\/](lang-[^\\/]+)/);
            if (codemirrorLanguage) {
              return `cm-${codemirrorLanguage[1]}`;
            }
            if (
              id.includes('/@uiw/react-codemirror') ||
              id.includes('/codemirror') ||
              /[\\/]node_modules[\\/]@codemirror[\\/](autocomplete|commands|language|lint|search|state|view)[\\/]/.test(id)
            ) {
              return 'vendor-editor';
            }
            if (id.includes('/react-markdown') || id.includes('/remark-') || id.includes('/rehype-') || id.includes('/micromark') || id.includes('/unified') || id.includes('/hast') || id.includes('/mdast')) {
              return 'vendor-markdown';
            }
            if (id.includes('/katex')) {
              return 'vendor-katex';
            }
            if (id.includes('/lucide-react')) {
              return 'vendor-icons';
            }
            if (id.includes('/@tauri-apps') || id.includes('/zustand')) {
              return 'vendor-app-runtime';
            }
          }
        }
      }
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
