import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import LaunchSplash from './components/LaunchSplash.tsx';
import OfflineBanner from './components/OfflineBanner.tsx';
import {isMedianApp} from './lib/platform.ts';
import {useAppLifecycle} from './hooks/useAppLifecycle.ts';
import './index.css';

// Rendered as a true sibling of <App/> at the actual React root, not from inside App itself — App
// has several mutually-exclusive early returns (session-check blank frame, landing page, standalone
// public pages, the main app), and mounting the splash from within any one of those would remount
// (and reset the timer of) a fresh LaunchSplash instance every time App switches between them during
// the cold-boot sequence. Here its lifecycle is entirely independent of whatever App does internally.
//
// The splash now runs for EVERY cold boot (not only the Median-wrapped build), giving the PWA a
// native-quality launch on web too. It is shown once per tab session (sessionStorage) so ordinary
// in-app navigations and soft reloads don't replay it — only a genuine cold start does. When it
// finishes, the app wrapper plays a subtle coordinated entrance (scale + fade) so the handoff from
// splash to dashboard reads as one continuous motion rather than a cut.
//
// OfflineBanner is mounted the same way, for the same reason, and gated behind isMedianApp() per
// the scope reminder — the desktop/browser PWA experience is unchanged by item 4's in-app UI.
function Root() {
  // Centralized lifecycle tracking (online/offline, visibility, BFCache, freeze/resume). Drives
  // background-sync draining on reconnect and exposes connectivity to the rest of the app.
  useAppLifecycle();

  const [showSplash, setShowSplash] = useState(() => {
    try {
      // Show on cold start unless already shown this tab session.
      return sessionStorage.getItem('ov_splash_shown') !== '1';
    } catch {
      return true;
    }
  });
  // Once the splash is gone (or skipped), mark the session and play the app entrance.
  const [appEntered, setAppEntered] = useState(!showSplash);
  // Once the entrance transition finishes we drop the transform entirely (`none`). A non-none
  // transform creates a stacking context that would trap fixed modals (z-50) *below* the portaled
  // bottom nav (z-40) — which is exactly what made the sign-in/up modal sit under the nav. With
  // `transform: none` after the intro, modals layer correctly above the nav.
  const [introDone, setIntroDone] = useState(!showSplash);
  const isMedian = isMedianApp();

  useEffect(() => {
    if (!showSplash) {
      try { sessionStorage.setItem('ov_splash_shown', '1'); } catch {}
    }
  }, [showSplash]);

  const handleSplashComplete = () => {
    try { sessionStorage.setItem('ov_splash_shown', '1'); } catch {}
    setShowSplash(false);
    // Next frame: trigger the app's coordinated entrance so it animates in sync with the
    // splash's exit rather than appearing statically underneath.
    requestAnimationFrame(() => setAppEntered(true));
    // Drop the transform shortly after the entrance so the stacking context is gone.
    setTimeout(() => setIntroDone(true), 650);
  };

  return (
    <>
      <div
        className="min-h-screen"
        style={{
          opacity: appEntered ? 1 : 0,
          transform: !appEntered ? 'scale(0.985)' : introDone ? 'none' : 'scale(1)',
          transition: 'opacity 500ms cubic-bezier(0.22,1,0.36,1), transform 500ms cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <App />
      </div>
      {showSplash && <LaunchSplash lang="fr" onComplete={handleSplashComplete} />}
      {isMedian && <OfflineBanner />}
    </>
  );
}

// Silence Vite HMR/WebSocket connection unhandled rejections and global errors in development
if (typeof window !== 'undefined') {
  // 1. Monkey-patch Native WebSocket to swallow errors on connection failure
  try {
    const NativeWebSocket = window.WebSocket;
    if (NativeWebSocket) {
      class ShieldedWebSocket extends NativeWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          try {
            super(url, protocols);
            
            // Silently handle and stop propagation of errors on this socket
            this.addEventListener('error', (event) => {
              console.warn('[WS Shield] Swallowed WebSocket connection error:', url);
              event.preventDefault();
              event.stopPropagation();
              event.stopImmediatePropagation();
            }, { capture: true });
          } catch (err) {
            console.warn('[WS Shield] Suppressed error in WebSocket initialization:', err);
            
            // Return a harmless dummy object matching the minimal WebSocket interface
            const dummySocket = {
              readyState: 3, // CLOSED
              url: String(url),
              onclose: null,
              onerror: null,
              onmessage: null,
              onopen: null,
              binaryType: 'blob',
              bufferedAmount: 0,
              extensions: '',
              protocol: '',
              send: () => {},
              close: () => {},
              addEventListener: () => {},
              removeEventListener: () => {},
              dispatchEvent: () => true,
            };
            
            Object.setPrototypeOf(dummySocket, ShieldedWebSocket.prototype);
            return dummySocket as any;
          }
        }
      }
      
      // Also shield the instance prototype addEventListener
      const originalAddEventListener = NativeWebSocket.prototype.addEventListener;
      NativeWebSocket.prototype.addEventListener = function(type, listener, options) {
        if (type === 'error') {
          const wrappedListener = function(this: any, event: any) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            if (typeof listener === 'function') {
              try {
                listener.call(this, event);
              } catch (err) {
                console.warn('[WS Shield] Suppressed error inside WebSocket user handler:', err);
              }
            } else if (listener && 'handleEvent' in listener) {
              try {
                (listener as any).handleEvent(event);
              } catch (err) {
                console.warn('[WS Shield] Suppressed error inside WebSocket user handleEvent:', err);
              }
            }
          };
          return originalAddEventListener.call(this, type, wrappedListener, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
      };

      try {
        Object.defineProperty(window, 'WebSocket', {
          value: ShieldedWebSocket,
          configurable: true,
          writable: true
        });
      } catch (defineError) {
        console.warn('[WS Shield] Object.defineProperty for WebSocket failed, trying direct assignment:', defineError);
        try {
          (window as any).WebSocket = ShieldedWebSocket;
        } catch (assignError) {
          console.warn('[WS Shield] Direct assignment to window.WebSocket failed due to getter-only constraints:', assignError);
        }
      }
    }
  } catch (globalWSError) {
    console.warn('[WS Shield] Suppressed general error during WebSocket shield configuration:', globalWSError);
  }

  // 2. Global Unhandled Rejection interceptor
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonStr = String(reason || '');
    const reasonMsg = (reason && typeof reason === 'object' && 'message' in reason) ? String(reason.message) : '';
    
    const isViteWS = 
      reasonStr.includes('WebSocket') || 
      reasonStr.includes('vite') || 
      reasonStr.includes('HMR') ||
      reasonStr.includes('closed without opened') ||
      reasonMsg.includes('WebSocket') ||
      reasonMsg.includes('vite') ||
      reasonMsg.includes('closed without opened');

    if (isViteWS) {
      console.warn('[Vite WS Error Shield] Prevented crash from unhandled HMR/WebSocket rejection:', reason);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  });

  // 3. Global Error Event interceptor
  window.addEventListener('error', (event) => {
    const msg = String(event.message || '');
    const isViteWS = 
      msg.includes('WebSocket') || 
      msg.includes('vite') ||
      msg.includes('HMR') ||
      msg.includes('closed without opened');

    if (isViteWS) {
      console.warn('[Vite WS Error Shield] Prevented crash from global HMR/WebSocket error:', msg);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
}

// Capture `beforeinstallprompt` as early as possible (before React mounts) so the install button
// never misses the event on fast pages. usePwaInstall() reads window.__ovDeferredInstallPrompt.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    (window as any).__ovDeferredInstallPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    (window as any).__ovDeferredInstallPrompt = null;
    try { localStorage.setItem('ov_installed', '1'); } catch {}
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

