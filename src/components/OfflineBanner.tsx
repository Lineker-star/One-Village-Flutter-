import {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';

/**
 * In-app offline indicator for the Median-wrapped app (item 4's "offline fallback"). Deliberately
 * a small in-flow banner rather than a full-screen takeover — the app shell + last-cached data are
 * still usable offline (see vite.config.ts's NetworkFirst rules), so blocking the whole UI would
 * contradict the point of caching anything in the first place. The retry action simply re-checks
 * navigator.onLine and, if back online, reloads so the SPA re-fetches everything fresh.
 */
export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    if (navigator.onLine) {
      window.location.reload();
      return;
    }
    // Still offline — briefly show feedback then let the user try again.
    window.setTimeout(() => setRetrying(false), 800);
  };

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{y: -60, opacity: 0}}
          animate={{y: 0, opacity: 1}}
          exit={{y: -60, opacity: 0}}
          transition={{duration: 0.25, ease: 'easeOut'}}
          className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-lg"
          style={{paddingTop: 'max(0.625rem, env(safe-area-inset-top))'}}
        >
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
            You're offline — showing the latest saved data.
          </span>
          <button
            type="button"
            onClick={handleRetry}
            disabled={retrying}
            className="shrink-0 rounded-md bg-white/10 px-3 py-1 font-medium hover:bg-white/20 disabled:opacity-60"
          >
            {retrying ? 'Checking…' : 'Retry'}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
