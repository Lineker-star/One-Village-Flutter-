/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { ServiceProvider, ServiceCategory, PromotedAd } from "./src/types.ts";
import { CATEGORY_DETAILS, SUB_CATEGORIES } from "./src/data/bertouaData.ts";

// Plain dotenv.config() only ever loads a file literally named ".env", which doesn't exist in
// this project — GEMINI_API_KEY (and everything else) actually lives in .env.local, matching
// Vite's own frontend convention. Without this, the server silently ran in "mock mode" forever
// even with a real key configured, since process.env.GEMINI_API_KEY was simply never populated.
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
// Render (and most Node hosts) assign the actual listening port dynamically via process.env.PORT —
// binding to a hardcoded 3000 regardless would make the deployed service unreachable, since Render's
// router only forwards traffic to the port it told the app to use. 3000 remains the local-dev fallback.
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Lazy-loaded Supabase admin client, using the service role key (server-only — it must never be
// VITE_-prefixed or it would get bundled into the client). Used to verify the caller's JWT and look
// up their role directly, bypassing RLS, since this is the trusted server-side admin boundary.
let supabaseAdmin: SupabaseClient | null = null;
function getSupabaseAdmin(): SupabaseClient | null {
  if (!supabaseAdmin) {
    const url = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) {
      console.warn("VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined. Admin routes will reject all requests.");
      return null;
    }
    supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return supabaseAdmin;
}

// Verifies the Supabase JWT sent in the Authorization header server-side (via the service role
// key), then looks up that user's role in profiles. Only requests from a user whose profile has
// role = 'admin' are allowed through — replaces the old client-trusted "x-user-role" header, which
// any caller could have set to anything.
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token." });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return res.status(503).json({ error: "Admin verification is not configured." });
  }

  try {
    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== "admin") {
      return res.status(403).json({ error: "Admin access required." });
    }

    next();
  } catch (err) {
    console.error("requireAdmin verification failed:", err);
    res.status(500).json({ error: "Admin verification failed." });
  }
}

app.use("/api/admin", requireAdmin);

// Lazy-loaded Gemini client
let aiInstance: any = null;
function getGeminiClient() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not defined. AI Guide will operate in mock mode.");
      return null;
    }
    aiInstance = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiInstance;
}

// --- AI guide performance/reliability helpers (Part A) ---

const GEMINI_TIMEOUT_MS = 18000;

// Races a promise against a hard timeout. Doesn't actually cancel the underlying Gemini request
// (the SDK gives us no cancellation hook), but it does guarantee the user gets a timely response
// either way — an orphaned request that finishes late is simply ignored.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err: any = new Error(`${label} timed out after ${ms}ms`);
      err.code = "TIMEOUT";
      reject(err);
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Gemini quota/rate-limit errors surface as HTTP 429 (sometimes wrapped, sometimes with a
// RESOURCE_EXHAUSTED message) — detected distinctly so callers can show "too many requests" rather
// than a generic failure, and so retry logic below skips them (retrying a quota error just burns
// more of the same exhausted quota).
function isQuotaError(err: any): boolean {
  const status = err?.status ?? err?.code;
  const message = String(err?.message || err || "");
  return status === 429 || /\b429\b|quota|resource_exhausted/i.test(message);
}

// Wraps a Gemini generateContent call with a hard timeout and one retry after a short delay for
// transient failures (network blips, 5xx). Quota errors and timeouts are NOT retried — a quota
// error will just fail again immediately, and retrying a timeout would double the user's wait for
// a request that's already slow.
async function generateContentWithResilience(ai: any, params: any, label: string): Promise<any> {
  try {
    return await withTimeout(ai.models.generateContent(params), GEMINI_TIMEOUT_MS, label);
  } catch (err: any) {
    if (isQuotaError(err) || err?.code === "TIMEOUT") throw err;
    console.warn(`[${label}] Gemini call failed transiently, retrying once — status: ${err?.status ?? "n/a"}, message: ${err?.message || err}`);
    await new Promise((resolve) => setTimeout(resolve, 800));
    return await withTimeout(ai.models.generateContent(params), GEMINI_TIMEOUT_MS, `${label} (retry)`);
  }
}

// Part A, Item 1: only fetch/include the job-postings context block when the user's message
// actually looks work/employment-related — kept as a simple keyword check, not a second AI call.
function isJobRelatedQuery(text: string): boolean {
  return /emploi|travail|job|embauch|recrut|postul|cherche du travail|cv\b|carri[eè]re|hiring|work\b|career/i.test(text);
}

// Fetches the LIVE category list straight from service_categories on every call — built-in
// categories AND any admin-approved "Autre" suggestion (e.g. "Informatique (TIC)") — so a
// newly-approved category is reflected in the AI's grounding immediately, with no server restart.
// Returns [] if Supabase isn't configured or the query fails; callers fall back to the static
// built-in ServiceCategory enum in that case (same behavior as before this existed).
async function fetchLiveCategories(): Promise<Array<{ slug: string; nameFr: string; nameEn: string }>> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("service_categories")
      .select("slug, name_fr, name_en")
      .order("name_fr", { ascending: true });
    if (error || !data) return [];
    return data
      .filter((row: any) => !!row.slug)
      .map((row: any) => ({ slug: row.slug, nameFr: row.name_fr, nameEn: row.name_en }));
  } catch (err) {
    console.error("Failed to fetch live service_categories for AI grounding, falling back to static list:", err);
    return [];
  }
}

// Fetches a live sample of real approved providers (public_provider_cards) for AI grounding, so the
// prompt's example set includes providers that actually registered — including under a brand new
// category — rather than only the static mock providers below. Returns [] if Supabase isn't
// configured or the query fails; callers fall back to the mock `providers` array sample.
async function fetchLiveProviderSample(
  limit: number
): Promise<Array<{ name: string; businessName?: string; category: string; neighborhoodId: string; description: string }>> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("public_provider_cards")
      .select("provider_name, business_name, description_fr, category_slugs, neighborhood_id")
      .limit(limit);
    if (error || !data) return [];
    return data.map((row: any) => ({
      name: row.provider_name,
      businessName: row.business_name || undefined,
      category: (row.category_slugs && row.category_slugs[0]) || "",
      neighborhoodId: row.neighborhood_id,
      description: row.description_fr || "",
    }));
  } catch (err) {
    console.error("Failed to fetch live provider sample for AI grounding, falling back to mock providers:", err);
    return [];
  }
}

// Builds a French-language summary of the category/sub-category list so AI prompts are grounded in
// what actually exists in the app instead of relying on Gemini's own (potentially incomplete or
// hallucinated) idea of what's available. Prefers the live list (see fetchLiveCategories above);
// falls back to the static built-in ServiceCategory enum only when Supabase isn't reachable.
function buildCategoryContextBlock(liveCategories: Array<{ slug: string; nameFr: string; nameEn: string }>): string {
  const slugs = liveCategories.length > 0 ? liveCategories.map((c) => c.slug) : Object.values(ServiceCategory);
  return slugs
    .map((slug) => {
      const builtIn = CATEGORY_DETAILS[slug as ServiceCategory] as { nameFR: string; descriptionFR: string } | undefined;
      const live = liveCategories.find((c) => c.slug === slug);
      const nameFr = builtIn?.nameFR || live?.nameFr || slug;
      const descriptionFr = builtIn?.descriptionFR || nameFr;
      const subs = SUB_CATEGORIES.filter((s) => s.cat === slug).map((s) => s.labelFR.replace(/[^\p{L}\s&/()'-]/gu, "").trim());
      return `- ${slug} (${nameFr}): ${descriptionFr}${subs.length ? ` — métiers spécifiques : ${subs.join(", ")}` : ""}`;
    })
    .join("\n");
}

// Builds a short summary of a handful of real providers for grounding. Keeps the prompt honest
// about what's actually in the directory rather than letting the model invent plausible-sounding
// but fictional services. Accepts either the live fetchLiveProviderSample() result or the static
// mock `providers` array (both share these 5 fields).
function buildProviderSampleBlock(
  providerList: Array<{ name: string; businessName?: string; category: string; neighborhoodId: string; description: string }>
): string {
  return providerList
    .slice(0, 8)
    .map((p) => `- ${p.name}${p.businessName ? ` (${p.businessName})` : ""} — ${p.category}, ${p.neighborhoodId} : "${p.description.slice(0, 100)}"`)
    .join("\n");
}

// Part 1, Item 3: lightweight AI guide awareness of open job postings. Deliberately simple — a
// handful of real open postings, queried fresh on every request (same live-grounding pattern as
// categories/providers above), with no dedicated "find me a job" task branch. Just enough so the
// assistant can mention a real opening instead of only pointing at service categories.
async function fetchOpenJobSample(limit: number): Promise<Array<{ title: string; employmentType: string; neighborhoodId: string | null; categorySlug: string | null }>> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("job_postings")
      .select("title, employment_type, neighborhood_id, service_categories ( slug )")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row: any) => {
      const category = Array.isArray(row.service_categories) ? row.service_categories[0] : row.service_categories;
      return {
        title: row.title,
        employmentType: row.employment_type,
        neighborhoodId: row.neighborhood_id,
        categorySlug: category?.slug || null,
      };
    });
  } catch (err) {
    console.error("Failed to fetch live job sample for AI grounding:", err);
    return [];
  }
}

function buildJobContextBlock(jobs: Array<{ title: string; employmentType: string; neighborhoodId: string | null; categorySlug: string | null }>): string {
  if (jobs.length === 0) return "";
  return jobs
    .map((j) => `- ${j.title} (${j.employmentType}${j.categorySlug ? `, ${j.categorySlug}` : ""}${j.neighborhoodId ? `, ${j.neighborhoodId}` : ""})`)
    .join("\n");
}

// In-Memory Database
const providers: ServiceProvider[] = [
  {
    id: "p1",
    name: "Jean-Pierre Ndouan",
    businessName: "Agro-Est Services",
    phone: "+237 677 89 45 12",
    whatsappNumber: "+237 677 89 45 12",
    category: ServiceCategory.AGRICULTURE,
    neighborhoodId: "ndouan",
    rateFCFA: 5000,
    rateUnit: "jour",
    description: "Expert en préparation de sols pour le manioc et le cacao. Je prépare vos champs avec soin pour la saison des pluies.",
    languages: ["FR", "Gbaya", "Makaa"],
    rating: 4.8,
    reviewCount: 24,
    verified: true,
    available: true,
    bannerUrl: "https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=600&q=80",
    city: "Bertoua",
    bookingsCount: 38,
    recencyScore: 0.9,
  },
  {
    id: "p2",
    name: "Alhadji Bouba",
    businessName: "Rapide Moto-Kano",
    phone: "+237 699 12 34 56",
    whatsappNumber: "+237 699 12 34 56",
    category: ServiceCategory.TRANSPORT,
    neighborhoodId: "kano",
    rateFCFA: 1500,
    rateUnit: "course",
    description: "Moto-taxi professionnel à Kano. Disponible pour vos déplacements rapides et la livraison sécurisée de vos marchandises à Bertoua.",
    languages: ["FR", "Fulfulde", "EN"],
    rating: 4.9,
    reviewCount: 52,
    verified: true,
    available: true,
    bannerUrl: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=600&q=80",
    city: "Bertoua",
    bookingsCount: 84,
    recencyScore: 0.95,
  },
  {
    id: "p3",
    name: "Maman Solange",
    businessName: "Maison de Couture Solange",
    phone: "+237 655 43 21 09",
    whatsappNumber: "+237 655 43 21 09",
    category: ServiceCategory.TAILORING,
    neighborhoodId: "mokolo",
    rateFCFA: 8000,
    rateUnit: "tâche",
    description: "Couturière de référence au marché de Mokolo. Spécialiste des robes de mariage en pagne et tenues traditionnelles Gbaya et Makaa.",
    languages: ["FR", "Gbaya", "Makaa", "EN"],
    rating: 4.7,
    reviewCount: 37,
    verified: true,
    available: true,
    bannerUrl: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80",
    city: "Bertoua",
    bookingsCount: 57,
    recencyScore: 0.85,
  },
  {
    id: "p4",
    name: "Abel Dzang",
    businessName: "Bâtisseurs Dzang",
    phone: "+237 675 32 89 43",
    whatsappNumber: "+237 675 32 89 43",
    category: ServiceCategory.CONSTRUCTION,
    neighborhoodId: "tigaza",
    rateFCFA: 6000,
    rateUnit: "jour",
    description: "Maçon qualifié avec 10 ans d'expérience. Construction de maisons, pose de briques de terre stabilisée et rénovations diverses.",
    languages: ["FR", "Makaa"],
    rating: 4.6,
    reviewCount: 18,
    verified: false,
    available: true,
    bannerUrl: "/images/providers/macon-bricklayer.jpg",
    city: "Bertoua",
    bookingsCount: 12,
    recencyScore: 0.5,
  },
  {
    id: "p5",
    name: "Clarisse Belinga",
    businessName: "Nounou de Confiance Énia",
    phone: "+237 691 54 87 23",
    whatsappNumber: "+237 691 54 87 23",
    category: ServiceCategory.CHILDCARE,
    neighborhoodId: "enia",
    rateFCFA: 1200,
    rateUnit: "heure",
    description: "Maman de confiance et garde d'enfants à Enia. Je m'occupe de vos tout-petits avec des activités éducatives après l'école.",
    languages: ["FR", "EN", "Gbaya"],
    rating: 4.9,
    reviewCount: 15,
    verified: true,
    available: true,
    bannerUrl: "https://images.unsplash.com/photo-1502086223501-7ea6ecd79368?auto=format&fit=crop&w=600&q=80",
    city: "Bertoua",
    bookingsCount: 19,
    recencyScore: 0.75,
  },
];

const bookings: any[] = [
  {
    id: "b1",
    providerId: "p2",
    providerName: "Alhadji Bouba",
    customerName: "Fidèle Ngo",
    customerPhone: "+237 671 22 33 44",
    category: "TRANSPORT",
    serviceDate: "2026-07-10",
    serviceTime: "09:00",
    description: "Transport de cartons de poisson depuis le carrefour Kano jusqu'à l'entrée Mokolo.",
    estimatedFCFA: 3000,
    status: "PAID",
    paymentMethod: "MTN_MOMO",
    paymentPhone: "+237 671 22 33 44",
    createdAt: "2026-07-09T10:00:00Z",
  }
];

const chats: Record<string, any[]> = {
  "p1": [
    { id: "m1", sender: "provider", text: "Bonjour ! Est-ce que votre champ à Ndouan est facile d'accès par la route ?", createdAt: "2026-07-09T11:00:00Z" }
  ],
  "p2": [
    { id: "m2", sender: "provider", text: "Bonjour mon frère, je suis prêt pour la course à Kano. Confirmez-moi l'heure !", createdAt: "2026-07-09T11:30:00Z" }
  ],
  "p3": [
    { id: "m3", sender: "provider", text: "Salut ma fille, passe à mon atelier à Mokolo pour que je prenne tes mesures pour le pagne.", createdAt: "2026-07-09T11:45:00Z" }
  ]
};

// API Routes

// Health Check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Providers list & registration
app.get("/api/providers", (req, res) => {
  const userId = req.headers["x-user-id"] || req.query.userId;
  
  if (userId) {
    // Authenticated role: returns full details including phone & whatsapp
    res.json(providers);
  } else {
    // Guest role: emulates public_provider_cards view.
    // Filter out phone/whatsapp and only return verified providers, but keep public fields
    const publicProviders = providers.map(p => {
      const { phone, whatsappNumber, ...safeProvider } = p;
      return {
        ...safeProvider,
        phone: "[Se connecter pour déverrouiller]",
        whatsappNumber: "[Se connecter pour déverrouiller]",
      };
    });
    res.json(publicProviders);
  }
});

// Lightweight AI search box query / category matching
app.post("/api/ai-search", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Search query is required." });
  }

  const queryLower = query.toLowerCase();
  let categoryMatch = "";
  let fallbackExplanation = "Je n'ai pas pu identifier la catégorie exacte, voici tous nos prestataires disponibles.";

  // Rule-based classifier — covers all 8 real top-level categories (previously only 5 were
  // handled, so queries like "mon frigo ne refroidit plus" or anything health/education/home-help
  // related had no fallback match at all when Gemini wasn't available or disagreed).
  if (queryLower.match(/(manioc|champ|terre|agri|labour|plante|cacao|banane|ferme|sol|cultiv|bétail|élevage|volaille)/)) {
    categoryMatch = "AGRICULTURE";
    fallbackExplanation = "C'est parfait ! Notre guide suggère la catégorie Agriculture pour préparer vos sols ou cultiver vos parcelles.";
  } else if (queryLower.match(/(moto|taxi|course|livr|transport|bagage|moto-taxi|camion|déplace|colis|marchandise)/)) {
    categoryMatch = "TRANSPORT";
    fallbackExplanation = "En route ! Notre guide suggère la catégorie Transport & Moto-Taxi pour vos courses rapides à Bertoua.";
  } else if (queryLower.match(/(ménage|nettoy|lessive|blanchisserie|pressing|cuisine|ordure|poubelle|déchet)/)) {
    categoryMatch = "HOME_HELP";
    fallbackExplanation = "Notre guide suggère la catégorie Aide à domicile & Ménage pour ce type de besoin.";
  } else if (queryLower.match(/(bébé|enfant|garde|nounou|maman|crèche|maternelle|garderie)/)) {
    categoryMatch = "CHILDCARE";
    fallbackExplanation = "Sûr ! Notre guide vous propose la catégorie Garde d'enfants pour trouver des mamans de confiance.";
  } else if (queryLower.match(/(maçon|brique|construct|ciment|maison|rénov|mur|bâtiment|fondation|électric|plomb|menuis|charpente)/)) {
    categoryMatch = "CONSTRUCTION";
    fallbackExplanation = "Solide ! Notre guide vous oriente vers la catégorie Bâtiment & Maçonnerie pour vos travaux d'habitation.";
  } else if (queryLower.match(/(couture|couturi|robe|pagne|habill|mesure|tissu|uniforme|fête|chaussure|cordonn)/)) {
    categoryMatch = "TAILORING";
    fallbackExplanation = "Élégant ! Notre guide vous conseille la catégorie Couture & Mode pour vos besoins vestimentaires.";
  } else if (queryLower.match(/(répétit|cours|école|examen|informatique|ordinateur|réseau|juridique|avocat|droit|contenu|photo|vidéo|communication|gadget)/)) {
    categoryMatch = "EDUCATION";
    fallbackExplanation = "Notre guide suggère la catégorie Soutien Scolaire (elle couvre aussi l'informatique, le contenu numérique et les conseils juridiques) pour ce besoin.";
  } else if (queryLower.match(/(santé|soin|malade|infirmi|tisane|massage|frigo|réfrigérateur|climatisation|congélateur|téléphone|télé|télévision|dépannage|électronique)/)) {
    categoryMatch = "HEALTH";
    fallbackExplanation = "Notre guide suggère la catégorie Santé & Soins (elle couvre aussi la réparation de frigos, téléphones et téléviseurs) pour ce besoin.";
  }

  const ai = getGeminiClient();
  let categoryResult = categoryMatch;
  let explanationResult = fallbackExplanation;

  if (ai) {
    try {
      // Fetched fresh on every request (Item 6: AI guide live grounding) — a category approved
      // moments ago, or a provider who just registered, is immediately visible here with no server
      // restart. Falls back to the static built-in list/mock providers if Supabase isn't reachable.
      // Part A, Item 1: capped at 5 providers (was 8) to keep the prompt lean.
      const liveCategories = await fetchLiveCategories();
      const liveProviderSample = await fetchLiveProviderSample(5);
      const validCategorySlugs = liveCategories.length > 0 ? liveCategories.map((c) => c.slug) : Object.values(ServiceCategory);
      const categoryContext = buildCategoryContextBlock(liveCategories);
      const providerSample = buildProviderSampleBlock(liveProviderSample.length > 0 ? liveProviderSample : providers);
      const systemInstruction = `Tu es "Assistant One Village" à Bertoua. Ton rôle est de faire correspondre la requête de l'utilisateur avec l'une des catégories RÉELLES de la plateforme, listées ci-dessous avec leurs métiers spécifiques :
${categoryContext}

Voici un échantillon de prestataires réellement inscrits sur la plateforme, pour t'aider à donner des réponses concrètes plutôt que génériques :
${providerSample}

Retourne STRICTEMENT un objet JSON avec les clés suivantes :
- category: le mot-clé exact en majuscules parmi ${validCategorySlugs.join(", ")} qui correspond le mieux (ou "" si aucun ne correspond vraiment)
- explanation: UNE SEULE phrase courte (pas plus de 20 mots) en français, ton amical et direct, qui dit pourquoi cette catégorie correspond (en citant le métier précis si pertinent). Si aucune catégorie ne correspond vraiment, dis-le simplement en une phrase, sans forcer une suggestion non pertinente. N'utilise aucune expression religieuse, bénédiction, ou terme comme "mon enfant" — reste professionnel et chaleureux, pas paternaliste.
Ne mets pas de texte avant ou après le bloc de code JSON.`;

      // Part A, Items 2-4: hard timeout + one retry for transient failures (not quota errors),
      // logged server-side with status/message. ai-search already falls back gracefully to the
      // regex-based classifier on any failure (see catch below), so this just bounds how long that
      // fallback takes to kick in instead of risking a long hang first.
      const response = await generateContentWithResilience(ai, {
        model: "gemini-3.5-flash",
        contents: `Requête de l'utilisateur : "${query}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      }, "ai-search");

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        if (parsed.category) {
          categoryResult = parsed.category;
          explanationResult = parsed.explanation;
        }
      }
    } catch (err: any) {
      // Part A, Item 4: log enough to diagnose from server logs (status/code, message, which
      // failure mode) — the user never sees this since the regex-based fallback above already
      // covers it silently.
      console.error(
        `[ai-search] Gemini call failed — ${err?.code === "TIMEOUT" ? "TIMEOUT" : isQuotaError(err) ? "QUOTA/429" : "ERROR"}, status: ${err?.status ?? "n/a"}, message: ${err?.message || err}. Falling back to regex classifier.`
      );
    }
  }

  // Filter matched providers
  let matched = providers;
  if (categoryResult) {
    matched = providers.filter(p => p.category === categoryResult);
  }

  // Apply guest protection
  const userId = req.headers["x-user-id"] || req.query.userId;
  const safeMatched = matched.map(p => {
    if (userId) return p;
    const { phone, whatsappNumber, ...safeProvider } = p;
    return {
      ...safeProvider,
      phone: "[Se connecter pour déverrouiller]",
      whatsappNumber: "[Se connecter pour déverrouiller]",
    };
  });

  res.json({
    category: categoryResult,
    explanation: explanationResult,
    providers: safeMatched,
  });
});

app.post("/api/providers", (req, res) => {
  const { name, phone, category, neighborhoodId, rateFCFA, rateUnit, description, languages } = req.body;
  if (!name || !phone || !category || !neighborhoodId || !rateFCFA) {
    return res.status(400).json({ error: "Missing required provider fields." });
  }
  const newProvider = {
    id: `p_${Date.now()}`,
    name,
    phone,
    category,
    neighborhoodId,
    rateFCFA: Number(rateFCFA),
    rateUnit: rateUnit || "heure",
    description: description || "",
    languages: languages || ["FR"],
    rating: 5.0,
    reviewCount: 0,
    verified: false,
    available: true,
  };
  providers.unshift(newProvider);
  res.status(201).json(newProvider);
});

// NOTE: the plain GET/POST /api/bookings routes that used to live here were removed — booking
// creation and the client-facing bookings list are now wired directly to Supabase (see
// src/components/BookingModal.tsx and src/components/Dashboard.tsx). The `bookings` in-memory
// array below is intentionally kept: it still backs the provider-mode demo simulator, the chat
// auto-booking-on-agreement feature, the admin dispute panel (/api/admin/bookings and
// force-action below), and provider popularity/trending stats — none of those were part of this
// pass. GET /api/admin/bookings (further below) is a separate route and is unaffected.

// Real-time double-sided completion endpoint — still used by the admin dispute "force complete"
// action and the provider-mode demo simulator in Dashboard.tsx (both against the mock array above).

app.post("/api/bookings/:id/confirm-completion", (req, res) => {
  const { id } = req.params;
  const { role } = req.body; // "client" | "provider"

  const booking = bookings.find(b => b.id === id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  if (role === "client") {
    booking.clientCompleted = true;
  } else if (role === "provider") {
    booking.providerCompleted = true;
  }

  if (booking.clientCompleted && booking.providerCompleted) {
    booking.status = "COMPLETED";
    // Increase provider booking count
    const provider = providers.find(p => p.id === booking.providerId);
    if (provider) {
      provider.bookingsCount = (provider.bookingsCount || 0) + 1;
    }
    // Trigger referral reward
    if (typeof triggerReferralReward === "function") {
      triggerReferralReward(booking.customerPhone);
    }
  }

  res.json({ success: true, booking });
});

// Update booking status directly (e.g. accepted, cancelled) — still used by the admin dispute
// "force cancel" action and the provider-mode demo simulator, both against the mock array above.
// The real client/provider dashboards now call supabaseService.updateBookingStatus() instead.
app.patch("/api/bookings/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const booking = bookings.find(b => b.id === id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  booking.status = status;
  res.json({ success: true, booking });
});

// In-Memory Database for reviews with response & safety mechanisms
interface Review {
  id: string;
  providerId: string;
  bookingId: string;
  rating: number;
  text?: string;
  reviewerName: string;
  createdAt: string;
  response?: string;
  responseCreatedAt?: string;
}

const reviews: Review[] = [
  {
    id: "rev1",
    providerId: "p1",
    bookingId: "b_old_1",
    rating: 5,
    text: "Excellent travail ! Toujours à l'heure et très respectueux de nos consignes au champ de Ndouan. Je recommande vivement !",
    reviewerName: "Ernestine Ndengue",
    createdAt: "2026-07-06T10:00:00Z",
    response: "Merci beaucoup Ernestine, c'est toujours un plaisir de travailler pour vous !"
  },
  {
    id: "rev2",
    providerId: "p1",
    bookingId: "b_old_2",
    rating: 4,
    text: "Très sérieux et courageux pour le labour de mon champ de manioc. Je recommande Jean-Pierre.",
    reviewerName: "Abel Dzang",
    createdAt: "2026-07-01T15:00:00Z"
  },
  {
    id: "rev3",
    providerId: "p2",
    bookingId: "b_old_3",
    rating: 5,
    text: "Trés poli et efficace. Le tarif est très honnête et les explications en Gbaya ont facilité notre accord immédiatement.",
    reviewerName: "Fidèle Ngo",
    createdAt: "2026-07-07T09:30:00Z"
  },
  {
    id: "rev4",
    providerId: "p3",
    bookingId: "b_old_4",
    rating: 5,
    text: "La confection de mes tenues traditionnelles Gbaya et Makaa est incroyable ! Maman Solange est la meilleure de Mokolo.",
    reviewerName: "Clarisse Belinga",
    createdAt: "2026-07-05T14:20:00Z",
    response: "Merci ma fille ! Reviens quand tu veux pour tes prochains modèles."
  }
];

const profileViews: Record<string, { today: number; week: number; month: number }> = {
  "p1": { today: 8, week: 42, month: 152 },
  "p2": { today: 15, week: 94, month: 310 },
  "p3": { today: 6, week: 28, month: 110 },
  "p4": { today: 2, week: 14, month: 45 },
  "p5": { today: 4, week: 21, month: 65 },
};

function getBookingsWindowedCount(providerId: string, daysLimit: number): number {
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() - daysLimit);
  return bookings.filter(b => b.providerId === providerId && new Date(b.createdAt) >= limitDate).length;
}

function recalculatePopularity() {
  console.log("[Job] Refreshing service_popularity metrics...");
  providers.forEach(p => {
    const bookingsToday = (p.id === "p2" ? 3 : p.id === "p1" ? 1 : p.id === "p3" ? 1 : 0) + getBookingsWindowedCount(p.id, 1);
    const bookingsWeek = (p.id === "p2" ? 18 : p.id === "p1" ? 8 : p.id === "p3" ? 12 : p.id === "p5" ? 4 : 2) + getBookingsWindowedCount(p.id, 7);
    const bookingsMonth = (p.bookingsCount || 10) + getBookingsWindowedCount(p.id, 30);

    const views = profileViews[p.id] || { today: 2, week: 10, month: 30 };

    const chatsSeed = {
      p1: { today: 2, week: 12, month: 35 },
      p2: { today: 5, week: 28, month: 82 },
      p3: { today: 1, week: 9, month: 24 },
      p4: { today: 0, week: 3, month: 10 },
      p5: { today: 1, week: 5, month: 15 },
    }[p.id] || { today: 1, week: 3, month: 10 };

    const actualChatsCount = chats[p.id] ? chats[p.id].length : 0;
    const chatsToday = chatsSeed.today + (actualChatsCount > 0 ? 1 : 0);
    const chatsWeek = chatsSeed.week + actualChatsCount;
    const chatsMonth = chatsSeed.month + actualChatsCount;

    p.popularityBookingsToday = bookingsToday;
    p.popularityBookingsWeek = bookingsWeek;
    p.popularityBookingsMonth = bookingsMonth;

    p.popularityViewsToday = views.today;
    p.popularityViewsWeek = views.week;
    p.popularityViewsMonth = views.month;

    p.popularityChatsToday = chatsToday;
    p.popularityChatsWeek = chatsWeek;
    p.popularityChatsMonth = chatsMonth;

    p.popularityScore = (bookingsMonth * 10) + (chatsMonth * 5) + p.popularityViewsMonth;
  });
  console.log("[Job] service_popularity cached successfully.");
}

// Initial aggregation run on start
setTimeout(recalculatePopularity, 1000);

// Emulate daily schedule (refresh daily)
setInterval(recalculatePopularity, 24 * 60 * 60 * 1000);

// NOTE: the old GET/POST /api/providers/:id/reviews and POST /api/reviews/:reviewId/response
// routes were removed here — ratings are now wired directly to Supabase (see
// supabaseService.submitRating/getProviderRatings/respondToRating and the
// 20260715020000_chat_realtime_and_ratings.sql migration). The mock `reviews` array below is kept:
// the admin moderation/flagging endpoints further down still operate on it, which wasn't part of
// this pass.

// Track profile view
app.post("/api/providers/:id/view", (req, res) => {
  const { id } = req.params;
  if (!profileViews[id]) {
    profileViews[id] = { today: 0, week: 0, month: 0 };
  }
  profileViews[id].today += 1;
  profileViews[id].week += 1;
  profileViews[id].month += 1;
  
  recalculatePopularity();
  res.json({ success: true });
});

// Trigger daily popularity job via CRON endpoint
app.get("/api/cron/refresh-popularity", (req, res) => {
  recalculatePopularity();
  res.json({ success: true, message: "Service popularity statistics aggregated successfully!" });
});

// NOTE: the old /api/momo/webhook and POST /api/bookings/:id/pay simulation endpoints were
// removed here — they only ever served BookingModal's old fake USSD/PIN payment step, which no
// longer exists (Mobile Money is now an honest "coming soon" notice; both cash and mobile_money
// bookings flow through the same real two-sided completion confirmation — see BookingModal.tsx
// and the 20260715010000 migration).

// NOTE: /api/ads (GET/POST) was removed here — community ads now read/write directly against the
// real community_ads table (see supabaseService.getCommunityAds/createCommunityAd/updateCommunityAd
// /setCommunityAdStatus/deleteCommunityAd and AdBoard.tsx), so this in-memory mock has no callers
// left at all.

// NOTE: the old GET/POST /api/chats/:providerId routes (including the AI-simulated provider
// auto-reply and the chat-auto-booking side effect) were removed here — chat is now wired directly
// to Supabase Realtime between two real people (see ChatInterface.tsx and
// supabaseService.getOrCreateChat/getChatMessages/sendChatMessage/subscribeToChatMessages). There's
// no more artificial "provider" reply since a real provider now types their own responses. The
// `chats` in-memory object below is kept only because the popularity/trending stats further up
// still read `chats[p.id].length` as a proxy chat-activity signal — unrelated to this pass.

// Multilingual AI Guide Endpoint
app.post("/api/ai-guide", async (req, res) => {
  const { prompt, task, targetLang } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required." });
  }

  const ai = getGeminiClient();
  
  if (!ai) {
    // Elegant fallbacks if API Key is not yet configured or fails
    let fallbackText = "";
    if (task === "translate") {
      fallbackText = `[Mode Simulation - Clé API non configurée]\nTraduction de votre message en ${targetLang || "langue locale"} :\n"${prompt}" s'exprime couramment dans cette langue pour dire que vous demandez de l'aide pour un travail local à Bertoua.`;
    } else if (task === "polish") {
      fallbackText = `[Mode Simulation - Clé API non configurée]\nVoici une description professionnelle générée :\n"Je propose mes services professionnels de qualité supérieure à Bertoua. Sérieux, ponctuel et disponible immédiatement pour répondre à vos besoins. Tarif compétitif à convenir."`;
    } else if (task === "pricing") {
      fallbackText = `[Mode Simulation - Clé API non configurée]\nÀ Bertoua et dans la région de l'Est :\n- Les petits trajets en Moto-Taxi coûtent généralement entre 200 FCFA et 500 FCFA.\n- Les services agricoles se négocient entre 3 000 FCFA et 6 000 FCFA par jour de travail.\n- Les travaux de maçonnerie/bâtiment vont de 5 000 FCFA à 8 000 FCFA par jour selon la complexité.`;
    } else {
      fallbackText = `Bonjour, je suis Assistant One Village. Je peux traduire vos demandes en Gbaya, Makaa ou Fulfulde, ou vous donner une idée des tarifs justes à Bertoua. Que puis-je faire pour vous ?`;
    }
    return res.json({ text: fallbackText });
  }

  try {
    // Fetched fresh on every request (Item 6: AI guide live grounding) — a category approved
    // moments ago is reflected in the assistant's answers immediately, with no server restart.
    // Falls back to the static built-in list if Supabase isn't reachable.
    const liveCategories = await fetchLiveCategories();
    // Part 1, Item 3: same live-grounding treatment as categories — a few real open job postings,
    // fetched fresh every request, so the assistant can point someone looking for work at an
    // actual opening instead of only ever discussing service categories.
    // Part A, Item 1: only fetched (and only added to the prompt) when the message actually looks
    // work/employment-related — was previously fetched and included on every single request
    // regardless of topic, which meant an extra DB round-trip and ~500-700 extra prompt
    // characters on every message, even ones with nothing to do with jobs. Also capped at 5 (was 6).
    const jobSample = isJobRelatedQuery(prompt) ? await fetchOpenJobSample(5) : [];
    let systemInstruction = `Tu es "Assistant One Village", l'assistant IA de la plateforme One Village à Bertoua (région de l'Est du Cameroun). Tu aides les habitants à trouver des services locaux fiables et les prestataires à mieux présenter leur activité.

RÈGLES DE TON ET DE STYLE (à respecter strictement) :
- Ton chaleureux, amical et professionnel — comme un assistant local compétent et sympathique. Ce n'est PAS un sage, un prédicateur ou un ancien du village.
- N'utilise JAMAIS de formules religieuses, de bénédictions, ou d'expressions comme "mon enfant", "que la paix soit sur toi", "que Dieu te bénisse", ou tout terme d'affection excessif.
- Réponses COURTES par défaut : 2 à 4 phrases maximum pour une question simple. Ne développe une réponse plus longue que si l'utilisateur demande explicitement plus de détails, plus d'options, ou pose une question de suivi.
- Formatage minimal : évite le gras excessif et les longues listes à puces pour une réponse courte — c'est un chat, pas un document formel.
- Si la catégorie demandée n'existe pas encore sur la plateforme, dis-le clairement et brièvement, puis propose au maximum UNE catégorie alternative pertinente si cela a vraiment du sens. N'ajoute pas plusieurs suggestions sans rapport juste pour paraître complet.

Tu parles couramment français et anglais, et tu connais les langues locales majeures de l'Est : Gbaya, Makaa, Fulfulde.

Voici les catégories et métiers RÉELLEMENT disponibles sur la plateforme One Village — appuie-toi dessus pour donner des réponses concrètes et précises plutôt que des conseils génériques :
${buildCategoryContextBlock(liveCategories)}${jobSample.length > 0 ? `

Voici quelques offres d'emploi RÉELLEMENT ouvertes en ce moment sur la plateforme — si quelqu'un cherche du travail ou un emploi dans un métier précis, mentionne une offre pertinente ci-dessous plutôt que de parler uniquement des catégories de services :
${buildJobContextBlock(jobSample)}` : ""}`;

    // NOTE: task values here must match exactly what the frontend sends (see AIGuide.tsx's
    // activeTab and AddServiceModal.tsx) — this previously checked for "write-description" and
    // "explain-pricing", which nothing ever sent, so the "polish" and "pricing" tabs silently fell
    // through to the generic chat instruction below and never got their specialized prompt.
    if (task === "translate") {
      systemInstruction += `\nTACHE : Traduis le texte de l'utilisateur de manière fidèle en langue : ${targetLang}. Donne la traduction claire, puis explique en une phrase simple comment le prononcer ou tout contexte de politesse locale utile. Pas de markdown complexe.`;
    } else if (task === "polish") {
      systemInstruction += `\nTACHE : Reçois les notes brutes d'un prestataire de service local qui veut lister son service sur One Village. Rédige un titre accrocheur et une description professionnelle claire et engageante (3-5 phrases maximum), rédigée à la première personne ("Je..."), mettant en valeur ses compétences. Reste concis — ce n'est pas un roman.`;
    } else if (task === "pricing") {
      systemInstruction += `\nTACHE : L'utilisateur demande des conseils sur les prix pratiqués à Bertoua pour un type de service. Donne la fourchette de prix moyenne (en FCFA) en 2-4 phrases, avec au besoin un conseil de négociation bref. Pas de longue liste de conseils annexes.`;
    } else {
      systemInstruction += `\nTACHE : Réponds de manière brève et directe aux questions sur les services, la vie de quartier à Bertoua, ou l'utilisation de l'application One Village. Si la question porte sur un besoin précis, indique la catégorie et le métier concernés dans la liste ci-dessus en 2-4 phrases maximum, sans énumérer d'options non demandées.`;
    }

    // Part A, Items 2-4: hard 18s timeout + one retry for transient failures (not quota errors).
    const response = await generateContentWithResilience(ai, {
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    }, "ai-guide");

    res.json({ text: response.text });
  } catch (error: any) {
    // Part A, Item 4: always log status/code + message server-side, tagged with which failure mode
    // (quota/timeout/other) so this is diagnosable from server logs alone, not just a generic
    // client-side alert.
    const failureMode = isQuotaError(error) ? "QUOTA/429" : error?.code === "TIMEOUT" ? "TIMEOUT" : "ERROR";
    console.error(`[ai-guide] Gemini call failed — ${failureMode}, status: ${error?.status ?? "n/a"}, message: ${error?.message || error}`);

    if (isQuotaError(error)) {
      return res.status(429).json({ error: "L'assistant reçoit trop de demandes en ce moment. Réessayez dans un instant." });
    }
    if (error?.code === "TIMEOUT") {
      return res.status(504).json({ error: "L'assistant met trop de temps à répondre. Réessayez dans un instant." });
    }
    res.status(500).json({ error: "L'appel à l'IA a échoué. Veuillez réessayer.", details: error.message });
  }
});

// --- Phase 11 & 12: Referrals & Admin API Endpoints ---

// 1. In-memory data structures for Referrals, Category Suggestions, Suspensions, Flags
const userReferrals: any[] = [
  {
    id: "ref1",
    referrerId: "p1",
    referrerName: "Jean-Pierre Ndouan",
    referredId: "ref_user_1",
    referredName: "Fidèle Ngo",
    status: "completed",
    rewardAmount: 1000,
    createdAt: "2026-07-08T10:00:00Z"
  }
];

// Let's add standard categories list we can modify
let categoriesList = [
  { id: "AGRICULTURE", nameFR: "Agriculture & Labour", nameEN: "Agriculture & Farm Labor", count: 12 },
  { id: "TRANSPORT", nameFR: "Transport & Moto-Taxi", nameEN: "Transport & Moto-Taxi", count: 35 },
  { id: "HOME_HELP", nameFR: "Aide Ménagère", nameEN: "Home Help", count: 8 },
  { id: "CHILDCARE", nameFR: "Garde d'enfants (Nounou)", nameEN: "Childcare & Babysitting", count: 5 },
  { id: "CONSTRUCTION", nameFR: "Maçonnerie & Construction", nameEN: "Masonry & Construction", count: 14 },
  { id: "TAILORING", nameFR: "Couture & Mode", nameEN: "Tailoring & Fashion", count: 22 },
  { id: "EDUCATION", nameFR: "Répétiteur & Enseignement", nameEN: "Tutoring & Education", count: 10 },
  { id: "HEALTH", nameFR: "Santé & Soins à domicile", nameEN: "Health & Home Care", count: 3 }
];

// In-memory list of Category Suggestions ("Other - specify") submitted by providers
const categorySuggestions: any[] = [
  { id: "sug1", providerId: "p4", providerName: "Abel Dzang", suggestedName: "Électricien bâtiment", status: "pending", createdAt: "2026-07-09T08:00:00Z" }
];

// Flagged reviews queue
const flaggedReviews: any[] = [
  { id: "flag1", reviewId: "rev2", reason: "Langage agressif suspect", status: "pending", createdAt: "2026-07-09T09:15:00Z" }
];

// Flagged messages queue
const flaggedMessages: any[] = [];

// Track suspended user IDs in memory
const suspendedUserIds = new Set<string>();

// Endpoint to fetch all referrals
app.get("/api/referrals", (req, res) => {
  res.json(userReferrals);
});

// Endpoint to submit a referral on onboarding
app.post("/api/referrals", (req, res) => {
  const { code, referredId, referredName } = req.body;
  if (!code || !referredId || !referredName) {
    return res.status(400).json({ error: "Missing referral code or referred user info." });
  }

  // Find referrer in our providers or mock profiles
  const referrerProvider = providers.find(p => p.id === code || (p.name && p.name.toLowerCase().includes(code.toLowerCase())));
  const referrerId = referrerProvider ? referrerProvider.id : "p1"; // Fallback to p1 (Jean-Pierre) for testing
  const referrerName = referrerProvider ? referrerProvider.name : "Jean-Pierre Ndouan";

  const newRef = {
    id: `ref_${Date.now()}`,
    referrerId,
    referrerName,
    referredId,
    referredName,
    status: "pending",
    rewardAmount: 1000, // 1000 FCFA Mobile money fee credit
    createdAt: new Date().toISOString()
  };

  userReferrals.unshift(newRef);
  res.status(201).json(newRef);
});

// Trigger Referral Reward manually or on completion
function triggerReferralReward(userIdOrPhone: string) {
  const ref = userReferrals.find(r => 
    (r.referredId === userIdOrPhone || r.referredId?.replace(/\s+/g, "") === userIdOrPhone?.replace(/\s+/g, "") || r.referredName === userIdOrPhone) && 
    r.status === "pending"
  );
  if (ref) {
    ref.status = "completed";
    console.log(`[Referral Reward Triggered] Credited both ${ref.referrerName} and ${ref.referredName} with ${ref.rewardAmount} FCFA!`);
  }
}

// Admin API: Accounts list
app.get("/api/admin/accounts", (req, res) => {
  // Generate a list of client and admin accounts
  const clientAccounts = [
    {
      id: "admin_123",
      role: "admin",
      fullName: "Admin One Village",
      phone: "+237 600 00 00 00",
      email: "admin@onevillage.org",
      referralCode: "OV-ADM",
      rewardsCredit: 5000,
      isSuspended: false
    },
    {
      id: "u_client1",
      role: "client",
      fullName: "Amadou Diallo",
      phone: "+237 677 88 99 00",
      email: "amadou@gmail.com",
      referralCode: "OV-AMA",
      rewardsCredit: 2000,
      isSuspended: suspendedUserIds.has("u_client1")
    },
    {
      id: "u_client2",
      role: "client",
      fullName: "Chantal Bella",
      phone: "+237 655 11 22 33",
      email: "chantal@yahoo.fr",
      referralCode: "OV-CHA",
      rewardsCredit: 1000,
      isSuspended: suspendedUserIds.has("u_client2")
    }
  ];

  const providerAccounts = providers.map(p => ({
    id: p.id,
    role: "provider",
    fullName: p.name,
    phone: p.phone,
    email: (p as any).email || `${p.name.toLowerCase().replace(/\s+/g, "")}@onevillage.net`,
    referralCode: `OV-${p.name.slice(0, 3).toUpperCase()}`,
    rewardsCredit: (p as any).rewardsCredit || 0,
    isSuspended: suspendedUserIds.has(p.id)
  }));

  res.json([...clientAccounts, ...providerAccounts]);
});

// Admin API: Suspend or Toggle suspension on user/provider account
app.post("/api/admin/accounts/:id/suspend", (req, res) => {
  const { id } = req.params;
  const { suspend } = req.body;
  
  if (suspend !== undefined) {
    if (suspend) {
      suspendedUserIds.add(id);
      const provider = providers.find(p => p.id === id);
      if (provider) provider.available = false;
    } else {
      suspendedUserIds.delete(id);
      const provider = providers.find(p => p.id === id);
      if (provider) provider.available = true;
    }
  } else {
    // toggle mode as fallback
    if (suspendedUserIds.has(id)) {
      suspendedUserIds.delete(id);
      const provider = providers.find(p => p.id === id);
      if (provider) provider.available = true;
    } else {
      suspendedUserIds.add(id);
      const provider = providers.find(p => p.id === id);
      if (provider) provider.available = false;
    }
  }
  res.json({ success: true, isSuspended: suspendedUserIds.has(id) });
});

app.post("/api/admin/accounts/:id/toggle-suspend", (req, res) => {
  const { id } = req.params;
  if (suspendedUserIds.has(id)) {
    suspendedUserIds.delete(id);
    const provider = providers.find(p => p.id === id);
    if (provider) provider.available = true;
  } else {
    suspendedUserIds.add(id);
    const provider = providers.find(p => p.id === id);
    if (provider) provider.available = false;
  }
  res.json({ success: true, isSuspended: suspendedUserIds.has(id) });
});

// Change user role
app.post("/api/admin/accounts/:id/role", (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const provider = providers.find(p => p.id === id);
  if (provider) {
    (provider as any).role = role;
  }
  res.json({ success: true, role });
});

// Admin API: Delete a service provider / person completely
app.delete("/api/admin/providers/:id", (req, res) => {
  const { id } = req.params;
  const index = providers.findIndex(p => p.id === id);
  if (index !== -1) {
    providers.splice(index, 1);
    return res.json({ success: true, message: "Provider deleted successfully." });
  }
  res.status(404).json({ error: "Provider not found" });
});

// Admin API: Edit a service provider / person details
app.post("/api/admin/providers/:id/edit", (req, res) => {
  const { id } = req.params;
  const provider = providers.find(p => p.id === id);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const { name, businessName, phone, category, neighborhoodId, rateFCFA, rateUnit, description, languages, verified } = req.body;
  if (name) provider.name = name;
  if (businessName !== undefined) provider.businessName = businessName;
  if (phone) {
    provider.phone = phone;
    provider.whatsappNumber = phone;
  }
  if (category) {
    provider.category = category as any;
    if (!provider.categories) provider.categories = [];
    if (!provider.categories.includes(category as any)) {
      provider.categories.push(category as any);
    }
  }
  if (neighborhoodId) provider.neighborhoodId = neighborhoodId;
  if (rateFCFA !== undefined) provider.rateFCFA = Number(rateFCFA);
  if (rateUnit) provider.rateUnit = rateUnit;
  if (description) provider.description = description;
  if (languages) provider.languages = languages;
  if (verified !== undefined) {
    provider.verified = verified;
    provider.status = verified ? "approved" : "pending";
  }
  res.json({ success: true, provider });
});

// Admin API: Category Management
app.get("/api/admin/categories", (req, res) => {
  // Ensure every category has id and slug
  const cleanCategories = categoriesList.map(cat => ({
    ...cat,
    slug: (cat as any).slug || cat.id.toLowerCase()
  }));
  res.json({
    categories: cleanCategories,
    suggestions: categorySuggestions
  });
});

app.post("/api/admin/categories", (req, res) => {
  const { id, nameFR, nameEN, slug, icon } = req.body;
  const finalId = (id || slug || nameFR).toUpperCase().replace(/\s+/g, "_");
  const finalSlug = slug || id || nameFR.toLowerCase().replace(/\s+/g, "-");
  
  const newCat = { 
    id: finalId, 
    slug: finalSlug,
    nameFR, 
    nameEN: nameEN || nameFR, 
    icon: icon || "Sprout",
    count: 0 
  };
  categoriesList.push(newCat);
  
  // Return updated cleanCategories array!
  const cleanCategories = categoriesList.map(cat => ({
    ...cat,
    slug: (cat as any).slug || cat.id.toLowerCase()
  }));
  res.status(201).json(cleanCategories);
});

app.post("/api/admin/categories/merge", (req, res) => {
  const source = req.body.sourceId || req.body.sourceSlug;
  const target = req.body.targetId || req.body.targetSlug;
  if (!source || !target) {
    return res.status(400).json({ error: "Source and Target category IDs/slugs are required." });
  }
  
  const sourceId = source.toUpperCase();
  const targetId = target.toUpperCase();
  
  // Move all providers in source category to target category
  providers.forEach(p => {
    if (p.category === sourceId || p.category === source || p.category === source.toLowerCase()) {
      p.category = targetId as any;
    }
  });
  // Delete source category
  categoriesList = categoriesList.filter(c => c.id !== sourceId && c.id !== source && (c as any).slug !== source);
  res.json({ success: true, message: `Merged ${source} into ${target}.` });
});

// Admin API: Review and promote "Other - specify" submissions
app.post("/api/admin/categories/suggestions/:id/approve", (req, res) => {
  const { id } = req.params;
  const sug = categorySuggestions.find(s => s.id === id);
  if (!sug) return res.status(404).json({ error: "Suggestion not found" });

  sug.status = "approved";
  // Promote to a real category!
  const catId = sug.suggestedName.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
  const newCat = { id: catId, nameFR: sug.suggestedName, nameEN: sug.suggestedName, count: 1 };
  categoriesList.push(newCat);

  // Update provider category
  const provider = providers.find(p => p.id === sug.providerId);
  if (provider) {
    provider.category = catId as any;
  }

  res.json({ success: true, promotedCategory: newCat });
});

// Admin API: Bookings & Disputes Management
app.get("/api/admin/bookings", (req, res) => {
  res.json(bookings);
});

// Force complete or force cancel bookings (Admin override on disputes)
app.post("/api/admin/bookings/:id/force-action", (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // "complete" | "cancel"
  const booking = bookings.find(b => b.id === id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });

  if (action === "complete") {
    booking.status = "COMPLETED";
    booking.clientCompleted = true;
    booking.providerCompleted = true;
    // Reward trigger if referred!
    triggerReferralReward(booking.customerPhone); 
  } else if (action === "cancel") {
    booking.status = "CANCELLED";
  }
  res.json({ success: true, booking });
});

// Admin API: Flag review/message
app.post("/api/reviews/:id/flag", (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const review = reviews.find(r => r.id === id);
  if (!review) return res.status(404).json({ error: "Review not found" });

  const alreadyFlagged = flaggedReviews.some(f => f.reviewId === id);
  if (!alreadyFlagged) {
    flaggedReviews.push({
      id: `flag_${Date.now()}`,
      reviewId: id,
      reviewerName: review.reviewerName,
      text: review.text,
      reason: reason || "Inapproprié",
      status: "pending",
      createdAt: new Date().toISOString()
    });
  }
  res.json({ success: true });
});

// Admin API: Moderation Queue
app.get("/api/admin/moderation", (req, res) => {
  res.json({
    flaggedReviews: flaggedReviews.map(f => {
      const rev = reviews.find(r => r.id === f.reviewId);
      return { ...f, review: rev };
    })
  });
});

app.post("/api/admin/moderation/reviews/:id/:action", (req, res) => {
  const { id, action } = req.params; // action = "keep" | "delete"
  const flagIndex = flaggedReviews.findIndex(f => f.id === id);
  if (flagIndex === -1) return res.status(404).json({ error: "Flag not found" });

  const flag = flaggedReviews[flagIndex];
  if (action === "delete") {
    // Delete review
    const revIndex = reviews.findIndex(r => r.id === flag.reviewId);
    if (revIndex !== -1) reviews.splice(revIndex, 1);
    flag.status = "deleted";
  } else {
    flag.status = "dismissed";
  }

  // Remove from active queue
  flaggedReviews.splice(flagIndex, 1);
  res.json({ success: true });
});

// Admin API: Single provider verification
app.post("/api/providers/:id/verify", (req, res) => {
  const { id } = req.params;
  const { approve, rejectionReason } = req.body;
  const provider = providers.find(p => p.id === id);
  if (!provider) return res.status(404).json({ error: "Provider not found" });

  provider.verified = !!approve;
  provider.status = approve ? "approved" : "rejected";
  if (!approve && rejectionReason) {
    (provider as any).rejectionReason = rejectionReason;
  }
  res.json({ success: true, provider });
});

// Admin API: Direct review moderation
app.post("/api/reviews/:id/moderation", (req, res) => {
  const { id } = req.params;
  const { action } = req.body; // action: "keep" | "delete"
  
  // Find in flagged reviews
  const flagIndex = flaggedReviews.findIndex(f => f.reviewId === id || f.id === id);
  const flag = flagIndex !== -1 ? flaggedReviews[flagIndex] : null;
  const targetReviewId = flag ? flag.reviewId : id;

  if (action === "delete") {
    const revIndex = reviews.findIndex(r => r.id === targetReviewId);
    if (revIndex !== -1) reviews.splice(revIndex, 1);
    if (flag) flag.status = "deleted";
  } else {
    if (flag) flag.status = "dismissed";
  }

  if (flagIndex !== -1) {
    flaggedReviews.splice(flagIndex, 1);
  }
  res.json({ success: true });
});

// Admin API: Bulk approve/reject pending providers
app.post("/api/admin/providers/bulk-verify", (req, res) => {
  const { ids, action } = req.body; // ids: string[], action: "approve" | "reject"
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: "Provider IDs array required." });
  }

  const updated: string[] = [];
  providers.forEach(p => {
    if (ids.includes(p.id)) {
      p.verified = action === "approve";
      p.status = action === "approve" ? "approved" : "rejected";
      updated.push(p.id);
    }
  });

  res.json({ success: true, updatedCount: updated.length });
});

// --- Phase 13: Provider Advertising (Facebook-style Promotion) ---
// This in-memory array is the entire backing store for promoted ads (no Supabase table exists for
// this feature yet — see POST /api/promoted-ads below, which just unshifts onto this same array).
// It used to be seeded with two hardcoded demo entries ("pad1"/"pad2", referencing the mock
// INITIAL_PROVIDERS "Alhadji Bouba"/"Maman Solange" from bertouaData.ts, complete with hardcoded
// Unsplash stock photo URLs). Root cause of the "Sponsorisé" banner showing an unrelated stock
// motorcycle photo: PromotedAdsCarousel.tsx only falls back to real-provider rotation when
// GET /api/promoted-ads returns zero rows — these two permanently-seeded demo rows meant that
// branch was never reached at all, regardless of any fix to the fallback logic itself. Starting
// empty lets the carousel's real-provider fallback (with real bannerUrl/avatarUrl prioritized)
// take over until a genuine paid campaign is submitted through the real flow below.
const promotedAds: PromotedAd[] = [];

// 1. Get approved ads (optionally filter by placement)
app.get("/api/promoted-ads", (req, res) => {
  const { placement } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  // Respect endDate — a promotion that has run out shouldn't keep showing forever just because
  // nothing else was ever submitted to replace it.
  let filtered = promotedAds.filter(ad => ad.status === "approved" && ad.endDate >= today);
  if (placement) {
    filtered = filtered.filter(ad => ad.placement === placement || ad.placement === "home");
  }
  res.json(filtered);
});

// 2. Get ads belonging to a specific provider
app.get("/api/promoted-ads/provider/:providerId", (req, res) => {
  const { providerId } = req.params;
  const filtered = promotedAds.filter(ad => ad.providerId === providerId);
  res.json(filtered);
});

// 3. Submit a new ad campaign
app.post("/api/promoted-ads", (req, res) => {
  const { providerId, mediaUrl, mediaType, placement, budgetFCFA, startDate, endDate } = req.body;
  if (!providerId || !mediaUrl || !placement || !budgetFCFA || !startDate || !endDate) {
    return res.status(400).json({ error: "Missing required fields for ad promotion." });
  }

  const provider = providers.find(p => p.id === providerId);
  const providerName = provider ? provider.name : "Prestataire";
  const providerPhone = provider ? provider.phone : "";

  const newAd: PromotedAd = {
    id: `pad_${Date.now()}`,
    providerId,
    providerName,
    providerPhone,
    mediaUrl,
    mediaType: mediaType || "image",
    placement,
    budgetFCFA: Number(budgetFCFA),
    startDate,
    endDate,
    status: "pending_payment",
    impressions: 0,
    clicks: 0,
    createdAt: new Date().toISOString()
  };

  promotedAds.unshift(newAd);
  res.status(201).json(newAd);
});

// 4. Pay for an ad spend campaign via Mobile Money
app.post("/api/promoted-ads/:id/pay", (req, res) => {
  const { id } = req.params;
  const { paymentMethod, paymentPhone } = req.body;

  const ad = promotedAds.find(a => a.id === id);
  if (!ad) {
    return res.status(404).json({ error: "Promoted ad not found." });
  }
  if (!paymentMethod || !paymentPhone) {
    return res.status(400).json({ error: "Missing payment method or phone number." });
  }

  const transactionId = `TX_${paymentMethod.includes("MTN") ? "MTN" : "ORANGE"}_${Math.floor(100000 + Math.random() * 900000)}`;

  ad.status = "pending_approval";
  ad.paymentMethod = paymentMethod;
  ad.paymentPhone = paymentPhone;
  ad.momoTransactionId = transactionId;

  console.log(`[MoMo Ad Spend Payment] Initiated ${paymentMethod} to ${paymentPhone} of amount ${ad.budgetFCFA} FCFA`);

  res.json({
    success: true,
    message: `Payment of ${ad.budgetFCFA} FCFA request pushed to phone ${paymentPhone}. Transaction ${transactionId} confirmed. Sent to admin review queue.`,
    ad
  });
});

// 5. Track impressions
app.post("/api/promoted-ads/:id/track-impression", (req, res) => {
  const { id } = req.params;
  const ad = promotedAds.find(a => a.id === id);
  if (ad) {
    ad.impressions += 1;
    return res.json({ success: true, impressions: ad.impressions });
  }
  res.status(404).json({ error: "Ad not found" });
});

// 6. Track clicks
app.post("/api/promoted-ads/:id/track-click", (req, res) => {
  const { id } = req.params;
  const ad = promotedAds.find(a => a.id === id);
  if (ad) {
    ad.clicks += 1;
    return res.json({ success: true, clicks: ad.clicks });
  }
  res.status(404).json({ error: "Ad not found" });
});

// 7. Admin API: List all ads for management
app.get("/api/admin/promoted-ads", (req, res) => {
  res.json(promotedAds);
});

// 8. Admin API: Approve or reject promotion
app.post("/api/admin/promoted-ads/:id/moderate", (req, res) => {
  const { id } = req.params;
  const { action, reason } = req.body; // action: "approve" | "reject"
  const ad = promotedAds.find(a => a.id === id);
  if (!ad) {
    return res.status(404).json({ error: "Ad not found" });
  }

  if (action === "approve") {
    ad.status = "approved";
  } else if (action === "reject") {
    ad.status = "rejected";
    ad.rejectionReason = reason || "Le contenu de la publicité ne respecte pas les critères d'approbation.";
  }

  res.json({ success: true, ad });
});

// --- Push Notifications (Median.co-wrapped mobile app, backed by OneSignal) ---
// Sends via OneSignal's own REST API directly, not a Median-specific endpoint — this is exactly
// what Median's docs point to for server-triggered sends (docs.median.co/docs/programmatic-
// notifications). Requires ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY as env vars (server-side
// only — never bundled to the client; see .env.example). Targets by "external_id", which the
// client associates via median.onesignal.login(userId) (src/lib/push.ts) — so the ids here are
// this app's own Supabase user ids, not OneSignal-specific device/player tokens; there is no device
// token stored anywhere in this project (see 20260726000000_push_subscribers.sql for why).
app.post("/api/admin/push/send", async (req, res) => {
  const { userIds, broadcast, title, body, data } = req.body as {
    userIds?: string[];
    broadcast?: boolean;
    title: string;
    body: string;
    data?: Record<string, any>; // e.g. { activeView: "jobs" } — see src/lib/push.ts's tap handler
  };

  if (!title || !body) {
    return res.status(400).json({ error: "title and body are required." });
  }
  if (!broadcast && (!userIds || userIds.length === 0)) {
    return res.status(400).json({ error: "userIds (or broadcast: true) is required." });
  }

  const appId = process.env.ONESIGNAL_APP_ID;
  const restApiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !restApiKey) {
    return res.status(503).json({ error: "Push notifications are not configured (missing ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY)." });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return res.status(503).json({ error: "Admin Supabase client is not configured." });
  }

  try {
    // Only ever target ids actually known to be subscribed — sending to an arbitrary external_id
    // that was never registered is harmless (OneSignal just won't find a match) but this keeps the
    // response honest about who was actually reachable, and is what makes "broadcast" meaningful.
    let query = admin.from("push_subscribers").select("user_id").eq("enabled", true);
    if (!broadcast) query = query.in("user_id", userIds!);
    const { data: subs, error } = await query;
    if (error) throw error;
    const targetIds = (subs || []).map((s: any) => s.user_id);

    if (targetIds.length === 0) {
      return res.json({ success: true, sent: 0, message: "No subscribed recipients matched." });
    }

    const oneSignalRes = await fetch("https://api.onesignal.com/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${restApiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        target_channel: "push",
        headings: { en: title, fr: title },
        contents: { en: body, fr: body },
        include_aliases: { external_id: targetIds },
        data: data || {},
      }),
    });

    const result: any = await oneSignalRes.json();
    if (!oneSignalRes.ok) {
      console.error("OneSignal send failed:", result);
      return res.status(502).json({ error: "OneSignal rejected the notification.", details: result });
    }

    res.json({ success: true, sent: targetIds.length, oneSignalId: result.id });
  } catch (err: any) {
    console.error("Push send error:", err);
    res.status(500).json({ error: "Failed to send push notification.", details: err.message });
  }
});

// Vite & Static Asset Handling
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer();
