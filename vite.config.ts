import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import checker from 'vite-plugin-checker';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// Production CSP — verbatim from the security brief. No 'unsafe-eval', no
// 'unsafe-inline' on script-src. Strict.
const STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

// Dev CSP — relaxed so Vite HMR (inline + eval) works. Never deployed.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.supabase.co",
  "connect-src 'self' ws: wss: https://*.supabase.co wss://*.supabase.co",
].join('; ');

export default defineConfig(({ command }) => ({
  // Switch to '/<repo-name>/' for a GitHub Pages project site
  // (username.github.io/<repo-name>/). Leave '/' for a user/org site or any host.
  base: '/Testapp/',

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        lintCommand: 'eslint . --max-warnings 0',
        useFlatConfig: true,
      },
      overlay: { initialIsOpen: false },
    }),
    {
      name: 'inject-csp',
      transformIndexHtml(html) {
        const placeholder = '<!-- CSP -->';
        if (!html.includes(placeholder)) {
          // Fail loud: otherwise html.replace() is a silent no-op and the
          // build ships without a CSP meta tag.
          throw new Error(
            `inject-csp: placeholder "${placeholder}" not found in index.html. Restore it or remove this plugin.`
          );
        }
        const csp = command === 'build' ? STRICT_CSP : DEV_CSP;
        return html.replace(
          placeholder,
          `<meta http-equiv="Content-Security-Policy" content="${csp}">`
        );
      },
    },
  ],

  build: {
    outDir: 'dist',
    sourcemap: 'hidden', // generated, not referenced from minified output
    target: 'es2020',
    cssCodeSplit: true,
  },

  server: {
    port: 5173,
    strictPort: false,
  },

  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
}));
