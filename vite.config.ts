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

            const normalizedId = id.replace(/\\/g, '/');

            if (/\/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)) {
              return 'vendor-react';
            }
            const codemirrorLanguage = normalizedId.match(/\/node_modules\/@codemirror\/(lang-[^/]+)/);
            if (codemirrorLanguage) {
              return `cm-${codemirrorLanguage[1]}`;
            }
            if (
              normalizedId.includes('/@uiw/react-codemirror') ||
              normalizedId.includes('/codemirror') ||
              /\/node_modules\/@codemirror\/(autocomplete|commands|language|lint|search|state|view)\//.test(normalizedId)
            ) {
              return 'vendor-editor';
            }
            if (normalizedId.includes('/node_modules/mermaid/dist/mermaid.core.mjs')) {
              return 'mermaid-runtime';
            }
            if (/\/node_modules\/mermaid\/dist\/chunks\/mermaid\.core\/chunk-[^/]+\.mjs$/.test(normalizedId)) {
              return 'mermaid-core-shared';
            }
            if (/\/node_modules\/(@mermaid-js\/parser|langium)\//.test(normalizedId)) {
              return 'mermaid-parser';
            }
            if (/\/node_modules\/dompurify\//.test(normalizedId) || normalizedId.includes('/node_modules/@braintree/sanitize-url/')) {
              return 'mermaid-sanitize';
            }
            if (/\/node_modules\/(marked|ts-dedent)\//.test(normalizedId)) {
              return 'mermaid-text';
            }
            if (/\/node_modules\/(khroma|roughjs|stylis)\//.test(normalizedId)) {
              return 'mermaid-render-tools';
            }
            if (/\/node_modules\/dayjs\//.test(normalizedId)) {
              return 'vendor-dayjs';
            }
            if (/\/node_modules\/uuid\//.test(normalizedId)) {
              return 'vendor-uuid';
            }
            if (/\/node_modules\/lodash-es\//.test(normalizedId)) {
              return 'vendor-lodash';
            }
            if (/\/node_modules\/d3(-[^/]*)?\//.test(normalizedId) || normalizedId.includes('/node_modules/dagre-d3-es/')) {
              return 'vendor-d3-layout';
            }
            if (/\/node_modules\/cytoscape\//.test(normalizedId)) {
              return 'vendor-cytoscape';
            }
            if (/\/node_modules\/(cytoscape-cose-bilkent|cytoscape-fcose)\//.test(normalizedId)) {
              return 'vendor-cytoscape-layouts';
            }
            if (normalizedId.includes('/react-markdown') || normalizedId.includes('/remark-') || normalizedId.includes('/rehype-') || normalizedId.includes('/micromark') || normalizedId.includes('/unified') || normalizedId.includes('/hast') || normalizedId.includes('/mdast')) {
              return 'vendor-markdown';
            }
            if (normalizedId.includes('/katex')) {
              return 'vendor-katex';
            }
            if (normalizedId.includes('/lucide-react')) {
              return 'vendor-icons';
            }
            if (normalizedId.includes('/@tauri-apps') || normalizedId.includes('/zustand')) {
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
