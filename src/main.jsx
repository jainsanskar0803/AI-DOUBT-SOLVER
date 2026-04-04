import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

// ─── Polyfill: Promise.try ─────────────────────────────────────────────────
// Required by pdfjs-dist and some other libraries in environments that don't
// yet ship this proposal (Safari < 18, older Chromium builds).
// NOTE: ragService.js also has this polyfill as a safety net for when the
// service is loaded before main.jsx runs (e.g. in tests or SSR). Having it
// here is the authoritative, earliest-possible location.
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn, ...args) {
    return new Promise((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (err) {
        reject(err);
      }
    });
  };
}

// ─── Root element guard ────────────────────────────────────────────────────
// Fail loudly with a clear message instead of an opaque
// "Cannot read properties of null (reading 'render')" crash when the
// #root element is missing (e.g. wrong HTML template, misconfigured Vite).
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error(
    '[main.jsx] Could not find #root element. ' +
    'Make sure index.html contains <div id="root"></div>.'
  );
}

// ─── Mount ─────────────────────────────────────────────────────────────────
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
