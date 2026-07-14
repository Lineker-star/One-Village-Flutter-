import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

