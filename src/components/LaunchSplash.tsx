/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";

interface LaunchSplashProps {
  onComplete: () => void;
  /** Optional language for the tagline. */
  lang?: "fr" | "en";
}

// Native-quality launch splash. Rendered as a sibling overlay of <App/> at the React root
// (see main.tsx) so its lifecycle is fully independent of App's internal view switches — App is
// already mounted and running underneath, so when the splash exits it reveals a live dashboard
// rather than a blank frame. The exit is a smooth iOS-style "zoom-out / slide-up reveal": the
// splash scales up slightly, lifts, and fades while the app eases in from a hair smaller — a
// single, coordinated motion rather than two unrelated animations.
//
// Design goals (matching SwiftUI/UIKit launch transitions):
//   - One continuous motion curve, no hard cut.
//   - The logo "breathes" and a light sweep sells the brand before revealing content.
//   - Total time ~1.6s (inside the 1.4–2.0s native sweet spot), gated to run once per cold boot.
//   - Honors prefers-reduced-motion (near-instant, no parallax/scale).
export default function LaunchSplash({ onComplete, lang = "fr" }: LaunchSplashProps) {
  const reduce = useReducedMotion();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Minimum on-screen time before the exit begins; the 0.55s exit lands total ~1.7s.
    const t = setTimeout(() => setExiting(true), reduce ? 500 : 1250);
    return () => clearTimeout(t);
  }, [reduce]);

  const t = {
    fr: { tagline: "Votre village, connecté." },
    en: { tagline: "Your village, connected." },
  }[lang];

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {!exiting && (
        <motion.div
          key="launch-splash"
          className="fixed inset-0 z-[9999] overflow-hidden"
          style={{ background: "linear-gradient(160deg,#FBF7F0 0%,#F6EFE3 55%,#F3E9D7 100%)" }}
          initial={{ opacity: 1 }}
          exit={
            reduce
              ? { opacity: 0, transition: { duration: 0.25 } }
              : { opacity: 0, scale: 1.06, y: "-6%", transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } }
          }
        >
          {/* Drifting ambient color blobs — subtle depth without distracting from the logo. */}
          <motion.div
            aria-hidden
            className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(227,162,61,0.20), rgba(227,162,61,0) 70%)" }}
            animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="absolute -bottom-28 -right-20 w-[460px] h-[460px] rounded-full blur-3xl"
            style={{ background: "radial-gradient(circle, rgba(16,106,74,0.14), rgba(16,106,74,0) 70%)" }}
            animate={reduce ? undefined : { x: [0, -36, 0], y: [0, -26, 0] }}
            transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
          />

          <div className="relative z-10 h-full w-full flex flex-col items-center justify-center px-8">
            {/* Logo with spring entrance, breathing loop, and a light sweep. */}
            <div className="relative">
              {/* reveal flare */}
              <motion.div
                aria-hidden
                className="absolute inset-0 -m-10 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(227,162,61,0.45) 0%, rgba(227,162,61,0) 70%)" }}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={reduce ? { opacity: 0 } : { opacity: [0, 0.9, 0.25], scale: [0.4, 1.5, 2] }}
                transition={{ duration: 1.2, times: [0, 0.4, 1], ease: "easeOut" }}
              />
              <motion.div
                initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.6, y: 10 }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 240, damping: 18, mass: 0.9 }}
              >
                <motion.div
                  animate={reduce ? undefined : { scale: [1, 1.035, 1] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-[28px] overflow-hidden shadow-2xl ring-1 ring-black/5"
                >
                  <img src={brandLogo} alt="One Village" className="w-full h-full object-cover" />
                  {/* soft top highlight */}
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
                  {/* light sweep */}
                  {!reduce && (
                    <motion.div
                      aria-hidden
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                      style={{ skewX: -18 }}
                      initial={{ x: "-160%" }}
                      animate={{ x: "360%" }}
                      transition={{ duration: 1.4, delay: 0.35, ease: "easeInOut" }}
                    />
                  )}
                </motion.div>
              </motion.div>
            </div>

            {/* Brand name + tagline */}
            <motion.div
              className="mt-7 text-center"
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.35, duration: 0.5, ease: "easeOut" }}
            >
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-amber-950">
                One Village
              </h1>
              <p className="mt-1.5 text-sm text-amber-800/80 font-medium">{t.tagline}</p>
            </motion.div>

            {/* Progress shimmer bar */}
            <motion.div
              className="mt-10 h-1.5 w-44 rounded-full bg-amber-900/10 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduce ? 0 : 0.5 }}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-700"
                initial={{ width: "8%" }}
                animate={{ width: "100%" }}
                transition={{ duration: reduce ? 0.5 : 1.35, ease: "easeInOut" }}
              />
            </motion.div>
          </div>

          {/* Footer brand line */}
          <motion.p
            className="absolute bottom-8 text-[11px] font-semibold tracking-wide text-amber-900/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduce ? 0 : 0.7 }}
          >
            BERTOUA · EST · CAMEROUN
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}