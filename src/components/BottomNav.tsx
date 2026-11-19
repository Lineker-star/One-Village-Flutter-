/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  Sparkles,
  LayoutDashboard,
  Briefcase,
  Store,
  Users,
  Megaphone,
  Plus,
} from "lucide-react";

export type NavView = "browse" | "dashboard" | "jobs" | "professionals" | "ads";

interface BottomNavProps {
  lang: "fr" | "en";
  /** Currently active view key (drives the highlight). 'ai' is a momentary action, not persistent. */
  active: NavView | "ai" | null;
  onNavigate: (view: NavView) => void;
  onAI: () => void;
  onOffer: () => void;
}

interface NavItem {
  key: NavView | "ai";
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

// Native-style fixed bottom navigation. Seven destinations with the primary action ("Offer a
// Service") as a raised center FAB — a 3 + 1 + 3 layout that stays balanced and thumb-friendly on
// every phone width. On desktop it becomes a centered floating pill so the app still reads as a
// native shell rather than a website. Respects the iOS safe-area inset (notch/home indicator).
export default function BottomNav({ lang, active, onNavigate, onAI, onOffer }: BottomNavProps) {
  const fr = lang === "fr";

  const left: NavItem[] = [
    { key: "ai", label: fr ? "Assistant" : "Assistant", icon: Sparkles },
    { key: "dashboard", label: fr ? "Compte" : "Account", icon: LayoutDashboard },
    { key: "jobs", label: fr ? "Emplois" : "Jobs", icon: Briefcase },
  ];
  const right: NavItem[] = [
    { key: "browse", label: "Services", icon: Store },
    { key: "professionals", label: fr ? "Profils" : "Pros", icon: Users },
    { key: "ads", label: fr ? "Annonces" : "Ads", icon: Megaphone },
  ];

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = active === item.key;
    return (
      <button
        key={item.key}
        type="button"
        onClick={() => (item.key === "ai" ? onAI() : onNavigate(item.key as NavView))}
        aria-current={isActive ? "page" : undefined}
        className="group relative flex flex-1 flex-col items-center justify-center gap-1 py-1.5 active:scale-95 transition-transform duration-150"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <span
          className={`relative flex items-center justify-center w-9 h-9 rounded-2xl transition-all duration-200 ${
            isActive
              ? "bg-amber-100 text-amber-800"
              : "text-amber-700/65 group-hover:text-amber-900 group-hover:bg-amber-50"
          }`}
        >
          <Icon className="w-[21px] h-[21px]" strokeWidth={isActive ? 2.4 : 2} />
        </span>
        <span
          className={`text-[9px] font-semibold leading-none max-w-[62px] truncate transition-colors ${
            isActive ? "text-amber-950" : "text-amber-800/55 group-hover:text-amber-900"
          }`}
        >
          {item.label}
        </span>
        {/* Active indicator dot */}
        <span
          className={`absolute -top-0.5 h-1 w-1 rounded-full bg-amber-600 transition-opacity ${
            isActive ? "opacity-100" : "opacity-0"
          }`}
        />
      </button>
    );
  };

  return (
    <nav
      aria-label={fr ? "Navigation principale" : "Primary navigation"}
      className="fixed inset-x-0 bottom-0 z-40 lg:bottom-4 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:w-auto"
    >
      <div
        className="bg-white/95 backdrop-blur-xl border-t border-amber-100 shadow-[0_-6px_24px_-6px_rgba(8,16,38,0.14)] lg:rounded-full lg:border lg:border-amber-100 lg:shadow-2xl px-1.5 pt-1.5 lg:px-3 lg:py-1.5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}
      >
        <div className="flex items-end justify-between gap-0.5 lg:gap-1">
          {left.map(renderItem)}

          {/* Center raised primary action: Offer a Service */}
          <div className="relative flex flex-1 flex-col items-center justify-end">
            <button
              type="button"
              onClick={onOffer}
              aria-label={fr ? "Proposer un service" : "Offer a service"}
              className="-mt-6 lg:-mt-7 flex h-14 w-14 lg:h-[58px] lg:w-[58px] items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-lg ring-4 ring-white active:scale-95 transition-transform duration-150"
            >
              <Plus className="h-7 w-7 lg:h-8 lg:w-8" strokeWidth={2.6} />
            </button>
            <span className="mt-0.5 text-[9px] font-bold leading-none text-amber-900">
              {fr ? "Proposer" : "Offer"}
            </span>
          </div>

          {right.map(renderItem)}
        </div>
      </div>
    </nav>
  );
}