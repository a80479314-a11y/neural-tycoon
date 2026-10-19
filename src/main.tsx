import "../styles.css";
import "../audio.js";
import "../game.js";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

// ========== PWA: Service Worker Registration (Production Only) ==========
declare const importMeta: { env: { PROD: boolean } };
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        console.log('[SW] Registered successfully:', registration.scope);
        
        // Auto-reload when new SW takes control
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      })
      .catch((error) => {
        console.warn('[SW] Registration failed:', error);
      });
    
    // Check version and clear cache if outdated
    fetch('./version.json', { cache: 'no-store' })
      .then(response => response.json())
      .then(data => {
        const currentVersion = localStorage.getItem('nt_version');
        if (currentVersion && currentVersion !== data.version) {
          console.log('[PWA] Version changed, clearing cache...');
          caches.keys().then(cacheNames => {
            return Promise.all(
              cacheNames
                .filter(name => name.startsWith('nt-v'))
                .map(name => caches.delete(name))
            );
          }).then(() => {
            localStorage.setItem('nt_version', data.version);
            window.location.reload();
          });
        } else if (!currentVersion) {
          localStorage.setItem('nt_version', data.version);
        }
      })
      .catch(error => {
        console.warn('[PWA] Version check failed:', error);
      });
  });
}

// ========== PWA: Install Prompt Handler ==========
let deferredPrompt: any = null;

window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-block';
  }
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const installBtn = document.getElementById('install-btn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
      } else {
        console.log('[PWA] User dismissed install prompt');
      }
      
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }
});
