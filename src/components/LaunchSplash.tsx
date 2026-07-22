/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";

interface LaunchSplashProps {
  onComplete: () => void;
}

// Rendered as an overlay on top of the normal app tree (see App.tsx) — never a gate that blocks
// anything else from mounting. The session-check effect underneath starts running the moment App
// mounts, in parallel with this animation, not after it; this component only controls what's
// visually on top for ~2s before removing itself.
export default function LaunchSplash({ onComplete }: LaunchSplashProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    // Total on-screen time before the exit animation starts — combined with the 0.5s exit below,
    // this lands at ~2.1s, inside the requested 1.8–2.5s window.
    const timer = setTimeout(() => setExiting(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence onExitComplete={onComplete}>
      {!exiting && (
        <motion.div
          key="launch-splash"
          exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.5, ease: "easeInOut" } }}
          className="fixed inset-0 z-[9999] bg-[#FBF7F0] flex items-center justify-center overflow-hidden"
        >
          {/* Radial "light splash" flare — a brief flash of light hitting the logo, not a generic
              fade. Scales past the logo and fades out as it grows, timed slightly ahead of the
              logo's own entrance so the flare reads as the thing that "reveals" it. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.25 }}
            animate={{ opacity: [0, 1, 0.35], scale: [0.25, 1.6, 2.1] }}
            transition={{ duration: 1.1, times: [0, 0.35, 1], ease: "easeOut" }}
            className="absolute w-[380px] h-[380px] rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(227,162,61,0.6) 0%, rgba(227,162,61,0.15) 45%, rgba(227,162,61,0) 72%)",
            }}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.55 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
            className="relative z-10"
          >
            <img
              src={brandLogo}
              alt="One Village"
              className="w-28 h-28 rounded-3xl shadow-xl object-cover border border-amber-100"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
