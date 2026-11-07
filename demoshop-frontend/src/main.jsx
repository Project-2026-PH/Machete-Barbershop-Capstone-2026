import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from './App.jsx'

// Vite emits this event when a lazy chunk was removed by a newer deployment.
// Reload once so the browser gets the current app shell and chunk manifest,
// while the timestamp prevents an endless reload loop if the deployment is
// still inconsistent.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();

  const reloadKey = 'demoshop:chunk-reload-at';
  const now = Date.now();
  let shouldReload = true;

  try {
    const lastReload = Number(sessionStorage.getItem(reloadKey));
    shouldReload = !lastReload || now - lastReload >= 10_000;
    if (shouldReload) {
      sessionStorage.setItem(reloadKey, String(now));
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  if (shouldReload) {
    window.location.reload();
  } else {
    console.error('[App] Lazy chunk is still unavailable after a reload.', event);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter((cacheName) => cacheName.startsWith('demoshop-'))
        .map((cacheName) => caches.delete(cacheName)));
      return;
    }

    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[SW] Cashier offline shell registered:', reg.scope);
        const announceWaitingWorker = () => {
          if (!reg.waiting || !navigator.serviceWorker.controller) return;
          window.dispatchEvent(new CustomEvent('cashier-service-worker-update-available', {
            detail: { registration: reg },
          }));
        };
        announceWaitingWorker();
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') announceWaitingWorker();
          });
        });
      })
      .catch((err) => {
        console.warn('[SW] Service Worker registration failed:', err);
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
