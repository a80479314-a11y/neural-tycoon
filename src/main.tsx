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
