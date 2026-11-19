/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Centralized deep-linking strategy for One Village.
//
// The app has no router library — App.tsx reads a few path/query params directly from
// window.location on mount (see proProfileUserId / companyPageId / jobPageId / ?providerId=).
// This module gives every entry point (push notification taps, universal links, QR codes,
// shared URLs, in-app navigations) ONE place to turn a raw URL or a notification payload into a
// normalized intent, and ONE place to navigate there.
//
// Supported shapes:
//   Path routes (read at cold start by App.tsx):
//     /pro/<userId>         -> public professional profile
//     /company/<companyId>  -> public company page
//     /job/<jobId>          -> public job posting
//   Query intents:
//     ?providerId=<id>      -> open a provider profile (handled in App)
//     ?view=<tab>           -> open a main tab (home|dashboard|jobs|professionals|ads|admin)
//     ?category=<slug>      -> open a category browse
//     ?ref=<code>           -> referral attribution
//     ?chat=<providerId>    -> open a chat with a provider (auth-gated in App)
//   Hash routes (SPA tabs):
//     #/dashboard, #/jobs, #/ads, #/professionals, #/admin

export type DeepLinkIntent =
  | { type: "pro"; id: string }
  | { type: "company"; id: string }
  | { type: "job"; id: string }
  | { type: "provider"; id: string }
  | { type: "chat"; providerId: string }
  | { type: "view"; view: string }
  | { type: "category"; slug: string }
  | { type: "referral"; code: string }
  | { type: "home" }
  | { type: "unknown"; raw: string };

const TABS = new Set(["home", "dashboard", "jobs", "professionals", "ads", "admin"]);
const ABSOLUTE = /^(https?:)?\/\//i;

/** Normalizes any input (absolute URL, path, or notification payload) into a DeepLinkIntent. */
export function parseDeepLink(input?: string | null): DeepLinkIntent {
  if (!input) return { type: "home" };
  let raw = String(input).trim();

  // Notification payloads often pass a relative path in a `url`/`link` field, or a structured
  // {type,id}. Handle a JSON-ish payload defensively.
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw);
      const fromObj = fromNotificationData(obj);
      if (fromObj) return fromObj;
      if (obj.url || obj.link) raw = String(obj.url || obj.link);
    } catch {
      /* not JSON, continue as URL */
    }
  }

  // Strip origin if absolute, keep pathname+search+hash.
  let pathname = raw;
  let search = "";
  let hash = "";
  try {
    const u = new URL(ABSOLUTE.test(raw) ? (raw.startsWith("//") ? "https:" + raw : raw) : `https://local${raw.startsWith("/") ? "" : "/"}${raw}`, "https://local");
    pathname = u.pathname;
    search = u.search;
    hash = u.hash;
  } catch {
    // Fallback manual split.
    const [pathPart, ...rest] = raw.split("#");
    hash = rest.length ? "#" + rest.join("#") : "";
    const [p, ...q] = pathPart.split("?");
    pathname = p || "/";
    search = q.length ? "?" + q.join("?") : "";
  }

  const params = new URLSearchParams(search);

  // Hash routes: #/dashboard
  const hashPath = hash.replace(/^#\/?/, "").split("?")[0];
  if (hashPath && TABS.has(hashPath)) return { type: "view", view: hashPath };

  // Path routes.
  let m = pathname.match(/^\/pro\/([^/]+)\/?$/);
  if (m) return { type: "pro", id: decodeURIComponent(m[1]) };
  m = pathname.match(/^\/company\/([^/]+)\/?$/);
  if (m) return { type: "company", id: decodeURIComponent(m[1]) };
  m = pathname.match(/^\/job\/([^/]+)\/?$/);
  if (m) return { type: "job", id: decodeURIComponent(m[1]) };

  // Query intents.
  const providerId = params.get("providerId");
  if (providerId) return { type: "provider", id: providerId };
  const chat = params.get("chat");
  if (chat) return { type: "chat", providerId: chat };
  const view = params.get("view");
  if (view && TABS.has(view)) return { type: "view", view };
  const category = params.get("category");
  if (category) return { type: "category", slug: category };
  const ref = params.get("ref");
  if (ref) return { type: "referral", code: ref };

  if (pathname === "/" || pathname === "") return { type: "home" };
  return { type: "unknown", raw };
}

/** Maps a notification/deep-link data payload to an intent (used by push taps and QR scans). */
export function fromNotificationData(data: Record<string, any> | null | undefined): DeepLinkIntent | null {
  if (!data) return null;
  // Explicit URL wins.
  if (data.url || data.link || data.deeplink) return parseDeepLink(String(data.url || data.link || data.deeplink));
  // Structured {type, id}.
  const type = String(data.type || "").toLowerCase();
  const id = data.id || data.providerId || data.targetId;
  if (id && (type === "provider" || type === "pro")) return { type: "pro", id: String(id) };
  if (id && type === "company") return { type: "company", id: String(id) };
  if (id && type === "job") return { type: "job", id: String(id) };
  if (id && (type === "chat" || type === "message")) return { type: "chat", providerId: String(id) };
  if (type === "view" && data.view) return { type: "view", view: String(data.view) };
  return null;
}

/** Builds a shareable absolute URL for a given intent (used by share buttons). */
export function buildShareUrl(intent: DeepLinkIntent): string {
  const base = "https://www.onevillage.site";
  switch (intent.type) {
    case "pro": return `${base}/pro/${encodeURIComponent(intent.id)}`;
    case "company": return `${base}/company/${encodeURIComponent(intent.id)}`;
    case "job": return `${base}/job/${encodeURIComponent(intent.id)}`;
    case "provider": return `${base}/?providerId=${encodeURIComponent(intent.id)}`;
    case "chat": return `${base}/?chat=${encodeURIComponent(intent.providerId)}`;
    case "view": return `${base}/#/ ${intent.view}`.replace("#/ ", "#/");
    case "category": return `${base}/?category=${encodeURIComponent(intent.slug)}`;
    case "referral": return `${base}/?ref=${encodeURIComponent(intent.code)}`;
    default: return base + "/";
  }
}

/**
 * Navigates the app to an intent. Path-based routes are read once at mount by App.tsx, so a warm
 * navigation to them performs a full assign (cold-start semantics) to guarantee they render;
 * lighter intents (view/chat/provider) use history + a custom event the app can react to without
 * a reload. Returns true if it handled the intent.
 */
export function navigateToIntent(intent: DeepLinkIntent): boolean {
  if (typeof window === "undefined") return false;
  switch (intent.type) {
    case "pro":
    case "company":
    case "job": {
      const path = intent.type === "pro" ? `/pro/${encodeURIComponent(intent.id)}`
        : intent.type === "company" ? `/company/${encodeURIComponent(intent.id)}`
        : `/job/${encodeURIComponent(intent.id)}`;
      if (window.location.pathname === path) return true;
      window.location.assign(path);
      return true;
    }
    case "provider":
    case "chat":
    case "category":
    case "view": {
      const params = new URLSearchParams();
      if (intent.type === "provider") params.set("providerId", intent.id);
      if (intent.type === "chat") params.set("chat", intent.providerId);
      if (intent.type === "category") params.set("category", intent.slug);
      if (intent.type === "view") params.set("view", intent.view);
      const url = `/${params.toString() ? "?" + params.toString() : ""}`;
      window.history.pushState({}, "", url);
      window.dispatchEvent(new CustomEvent("ov:navigate", { detail: { intent, url } }));
      return true;
    }
    case "referral": {
      try { localStorage.setItem("ov_ref", intent.code); } catch {}
      window.dispatchEvent(new CustomEvent("ov:navigate", { detail: { intent } }));
      return true;
    }
    default:
      return false;
  }
}

/** Convenience: parse + navigate in one call. Returns the parsed intent. */
export function handleIncomingUrl(input?: string | null): DeepLinkIntent {
  const intent = parseDeepLink(input);
  navigateToIntent(intent);
  return intent;
}