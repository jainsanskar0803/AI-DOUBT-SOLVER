import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // Load env file for the current mode (development / production).
  // The third argument '' means: load ALL variables, not just VITE_ ones.
  // We need this so we can validate and re-expose them correctly.
  const env = loadEnv(mode, process.cwd(), '');

  // ── Build-time validation ───────────────────────────────────────────────
  // Fail fast if the API key is missing rather than letting the app deploy
  // and silently fail at runtime with a confusing "model not found" error.
  const requiredVars = ['VITE_GEMINI_API_KEY'];
  for (const key of requiredVars) {
    if (!env[key] || env[key] === 'YOUR_GEMINI_API_KEY') {
      // Warn (don't hard-fail) so local dev without .env still works.
      console.warn(
        `\n⚠  WARNING: ${key} is not set or is still the placeholder value.\n` +
        `   The app will load but Gemini API calls will fail.\n` +
        `   Set it in your .env file or Vercel environment variables.\n`
      );
    }
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],

    // ── Dev server ────────────────────────────────────────────────────────
    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    // ── Build ─────────────────────────────────────────────────────────────
    build: {
      // Increase the chunk size warning threshold — the PDF.js worker is large.
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          // Split large dependencies into separate chunks for better caching.
          manualChunks: {
            'vendor-react':   ['react', 'react-dom'],
            'vendor-firebase': ['firebase'],
            'vendor-gemini':  ['@google/genai'],
            'vendor-pdf':     ['pdfjs-dist'],
            'vendor-mammoth': ['mammoth'],
          },
        },
      },
    },

    // ── Optimise deps ─────────────────────────────────────────────────────
    optimizeDeps: {
      // Exclude PDF.js worker from pre-bundling — it must stay as a URL import.
      exclude: ['pdfjs-dist'],
    },

    // ── Define ────────────────────────────────────────────────────────────
    // Explicitly expose env vars to the client bundle.
    // This is belt-and-suspenders — VITE_ vars are already auto-exposed,
    // but being explicit here makes it clear exactly what's available.
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
  };
});
