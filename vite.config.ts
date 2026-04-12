import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Warn if API key is missing at build time
  if (!env.VITE_GEMINI_API_KEY || env.VITE_GEMINI_API_KEY === 'YOUR_GEMINI_API_KEY') {
    console.warn(
      '\n⚠  WARNING: VITE_GEMINI_API_KEY is not set.\n' +
      '   Gemini API calls will fail until you set it.\n'
    );
  }

  return {
    plugins: [react(), tailwindcss()],

    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
    },

    build: {
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':    ['react', 'react-dom'],
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'vendor-gemini':   ['@google/genai'],
            'vendor-pdf':      ['pdfjs-dist'],
            'vendor-mammoth':  ['mammoth'],
          },
        },
      },
    },

    optimizeDeps: {
      exclude: ['pdfjs-dist'],
    },

    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
    },
  };
});
