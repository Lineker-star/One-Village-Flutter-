/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { ServiceProvider, ServiceCategory, PromotedAd } from "./src/types.ts";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// TEMPORARY: interim admin gate until Step 3 wires real Supabase auth with JWT verification.
// Trusts an "x-user-role" header set by the frontend from the current logged-in user's session,
// which is not verifiable server-side yet and must not be relied on once real auth is in place.
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.headers["x-user-role"] !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
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
    bannerUrl: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80",
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

const ads = [
  {
    id: "ad1",
    title: "Urgent : Labour d'un demi-hectare de manioc",
    description: "Recherche agriculteur vigoureux pour préparer la terre avant le retour des pluies la semaine prochaine. Terrain situé près du fleuve à Ndouan.",
    category: "AGRICULTURE",
    neighborhoodId: "ndouan",
    authorName: "Ernestine Ndengue",
    authorPhone: "+237 673 45 90 22",
    budgetFCFA: 35000,
    createdAt: "2026-07-08T09:00:00Z",
    urgency: "HIGH",
  },
  {
    id: "ad2",
    title: "Recherche couturière pour 5 tenues de fête scolaires",
    description: "Besoin de confectionner des tenues d'élèves uniformes pour un événement culturel d'école à Yademe. Tissu fourni.",
    category: "TAILORING",
    neighborhoodId: "yademe",
    authorName: "Directrice Marie-Claire",
    authorPhone: "+237 691 12 87 55",
    budgetFCFA: 40000,
    createdAt: "2026-07-09T08:30:00Z",
    urgency: "MEDIUM",
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

  // Rule-based classifier
  if (queryLower.match(/(manioc|champ|terre|agri|labour|plante|cacao|banane|ferme|sol|cultiv)/)) {
    categoryMatch = "AGRICULTURE";
    fallbackExplanation = "C'est parfait ! Notre guide suggère la catégorie Agriculture pour préparer vos sols ou cultiver vos parcelles.";
  } else if (queryLower.match(/(moto|taxi|course|livr|transport|bagage|moto-taxi|camion|déplace)/)) {
    categoryMatch = "TRANSPORT";
    fallbackExplanation = "En route ! Notre guide suggère la catégorie Transport & Moto-Taxi pour vos courses rapides à Bertoua.";
  } else if (queryLower.match(/(couture|couturi|robe|pagne|habill|mesure|tissu|uniforme|fête)/)) {
    categoryMatch = "TAILORING";
    fallbackExplanation = "Élégant ! Notre guide vous conseille la catégorie Couture & Mode pour confectionner vos magnifiques pagnes.";
  } else if (queryLower.match(/(maçon|brique|construct|ciment|maison|rénov|mur|bâtiment|fondation)/)) {
    categoryMatch = "CONSTRUCTION";
    fallbackExplanation = "Solide ! Notre guide vous oriente vers la catégorie Construction & Maçonnerie pour vos travaux d'habitation.";
  } else if (queryLower.match(/(bébé|enfant|garde|nounou|maman|crèche|maternelle|garderie)/)) {
    categoryMatch = "CHILDCARE";
    fallbackExplanation = "Sûr ! Notre guide vous propose la catégorie Garde d'enfants pour trouver des mamans de confiance.";
  }

  const ai = getGeminiClient();
  let categoryResult = categoryMatch;
  let explanationResult = fallbackExplanation;

  if (ai) {
    try {
      const systemInstruction = `Tu es l'Animateur One Village à Bertoua. Ton rôle est de faire correspondre la requête de l'utilisateur avec l'une de ces catégories : 'AGRICULTURE', 'TRANSPORT', 'TAILORING', 'CONSTRUCTION', 'CHILDCARE'.
Retourne STRICTEMENT un objet JSON avec les clés suivantes :
- category: l'un des mots exacts en majuscules listés ci-dessus (ou "" si aucun ne correspond)
- explanation: une phrase chaleureuse en français qui explique pourquoi cette catégorie correspond et encourage l'entraide communautaire.
Ne mets pas de texte avant ou après le bloc de code JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Requête de l'utilisateur : "${query}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        if (parsed.category) {
          categoryResult = parsed.category;
          explanationResult = parsed.explanation;
        }
      }
    } catch (err) {
      console.error("Gemini category matcher failed, using fallback regex:", err);
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

// Bookings list & creation
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

app.post("/api/bookings", (req, res) => {
  const { providerId, providerName, customerName, customerPhone, category, serviceDate, serviceTime, description, estimatedFCFA, paymentMethod, paymentPhone } = req.body;
  if (!providerId || !customerName || !customerPhone || !serviceDate || !estimatedFCFA) {
    return res.status(400).json({ error: "Missing required booking fields." });
  }

  const isCash = paymentMethod === "CASH";
  const newBooking = {
    id: `b_${Date.now()}`,
    providerId,
    providerName,
    customerName,
    customerPhone,
    category,
    serviceDate,
    serviceTime: serviceTime || "12:00",
    description: description || "",
    estimatedFCFA: Number(estimatedFCFA),
    status: isCash ? "ACCEPTED" : "PENDING",
    paymentMethod: paymentMethod || undefined,
    paymentPhone: paymentPhone || undefined,
    clientCompleted: false,
    providerCompleted: false,
    createdAt: new Date().toISOString(),
  };
  bookings.unshift(newBooking);
  res.status(201).json(newBooking);
});

// Real-time double-sided completion endpoint
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

// Update booking status directly (e.g. accepted, cancelled)
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

const lastReviewSubmission: Record<string, number> = {};

const PROFANITIES = [
  "salopard", "connard", "vautour", "idiot", "arnaque", "bête", "cochon", 
  "scam", "shitty", "bastard", "imbécile", "stupid", "fraud"
];

function filterProfanity(text: string): string {
  let cleaned = text;
  PROFANITIES.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    cleaned = cleaned.replace(regex, "***");
  });
  return cleaned;
}

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

// Fetch reviews for a provider
app.get("/api/providers/:id/reviews", (req, res) => {
  const { id } = req.params;
  const filtered = reviews.filter(r => r.providerId === id).map(rev => {
    // Check if customer has completed bookings
    const b = bookings.find(bk => bk.id === rev.bookingId);
    const hasCompleted = b ? bookings.some(bk => bk.customerPhone === b.customerPhone && bk.status === "COMPLETED") : true;
    return {
      ...rev,
      isTrustedReviewer: hasCompleted
    };
  });
  res.json(filtered);
});

// Submit Rating & Review (Phase 9 Integration)
app.post("/api/providers/:id/reviews", (req, res) => {
  const { id } = req.params;
  const { rating, text, reviewerName, bookingId } = req.body;

  const provider = providers.find(p => p.id === id);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }

  // 1. One rating per booking protection
  if (bookingId) {
    const alreadyRated = reviews.some(r => r.bookingId === bookingId);
    if (alreadyRated) {
      return res.status(400).json({ error: "Vous avez déjà évalué cette prestation." });
    }
  }

  // 2. Rate-limiting check (10 seconds between submissions)
  const clientIdentifier = String(req.headers["x-user-id"] || req.ip || "unknown");
  const now = Date.now();
  if (lastReviewSubmission[clientIdentifier] && now - lastReviewSubmission[clientIdentifier] < 10000) {
    return res.status(429).json({ error: "Veuillez patienter 10 secondes entre chaque évaluation." });
  }
  lastReviewSubmission[clientIdentifier] = now;

  // 3. Profanity filter on text
  const cleanComment = text ? filterProfanity(text) : "";

  // 4. Save review
  const newReview: Review = {
    id: `rev_${Date.now()}`,
    providerId: id,
    bookingId: bookingId || `b_ext_${Date.now()}`,
    rating: Number(rating) || 5,
    text: cleanComment,
    reviewerName: reviewerName || "Client de Bertoua",
    createdAt: new Date().toISOString()
  };
  reviews.unshift(newReview);

  // 5. Trigger update average rating & count on service_provider for fast sorting/filtering
  const providerReviews = reviews.filter(r => r.providerId === id);
  const totalRating = providerReviews.reduce((sum, r) => sum + r.rating, 0);
  
  provider.reviewCount = providerReviews.length;
  provider.rating = Number((totalRating / providerReviews.length).toFixed(1));

  // Trigger popularity recalculation
  recalculatePopularity();

  res.json({ success: true, provider, review: newReview });
});

// Provider respond to review (Phase 9)
app.post("/api/reviews/:reviewId/response", (req, res) => {
  const { reviewId } = req.params;
  const { responseText } = req.body;

  if (!responseText || !responseText.trim()) {
    return res.status(400).json({ error: "Le texte de réponse est requis." });
  }

  const review = reviews.find(r => r.id === reviewId);
  if (!review) {
    return res.status(404).json({ error: "Review not found" });
  }

  // Apply profanity filtering to the response as well
  review.response = filterProfanity(responseText);
  review.responseCreatedAt = new Date().toISOString();

  res.json({ success: true, review });
});

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

// Mobile Money Webhook endpoint
app.post("/api/momo/webhook", (req, res) => {
  const { transactionId, status, bookingId } = req.body;
  console.log(`[MoMo Webhook received] Tx: ${transactionId}, Status: ${status}, Booking: ${bookingId}`);

  const booking = bookings.find(b => b.id === bookingId);
  if (booking) {
    if (status === "SUCCESSFUL") {
      booking.status = "PAID";
      booking.momoTransactionId = transactionId;
    } else {
      booking.status = "CANCELLED";
    }
    return res.json({ success: true, message: "Booking updated via Webhook" });
  }
  res.status(404).json({ error: "Booking not found" });
});

// Simulate Mobile Money Payment Request with real API capability/fallback
app.post("/api/bookings/:id/pay", async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, paymentPhone } = req.body;
  
  const booking = bookings.find(b => b.id === id);
  if (!booking) {
    return res.status(404).json({ error: "Booking not found" });
  }

  if (!paymentMethod || !paymentPhone) {
    return res.status(400).json({ error: "Missing payment method or phone number" });
  }

  const amount = booking.estimatedFCFA;
  const isMTN = paymentMethod === "MTN_MOMO";
  const mtnUrl = "https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay";
  const orangeUrl = "https://api.orange.com/orange-money-webpay/cm/v1/webpayment";

  console.log(`[MoMo Payment Request] Initializing for ${paymentMethod} to ${paymentPhone} of amount ${amount}`);

  // Sandbox external HTTP client calls if keys are defined
  const mtnKey = process.env.MTN_MOMO_API_KEY;
  const orangeKey = process.env.ORANGE_MONEY_API_KEY;

  if (isMTN && mtnKey) {
    try {
      const response = await fetch(mtnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mtnKey}`,
          "X-Reference-Id": id,
          "X-Target-Environment": "sandbox",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          amount: amount.toString(),
          currency: "XAF",
          externalId: id,
          payer: { partyIdType: "MSISDN", partyId: paymentPhone },
          payerMessage: "One Village Booking Payment",
          payeeNote: "Payment to provider"
        })
      });
      console.log("MTN MoMo Sandbox request status:", response.status);
    } catch (err) {
      console.error("Failed to connect to real MTN Sandbox:", err);
    }
  }

  // Fallback simulator USSD Push Notification on Cameroon numbers
  const transactionId = `TX_${isMTN ? "MTN" : "ORANGE"}_${Math.floor(100000 + Math.random() * 900000)}`;
  
  // Accept the payment in-memory
  booking.status = "PAID";
  booking.paymentMethod = paymentMethod;
  booking.paymentPhone = paymentPhone;
  booking.momoTransactionId = transactionId;

  // Simulate server receiving Webhook Callback automatically after 2 seconds
  setTimeout(async () => {
    try {
      await fetch(`http://localhost:${PORT}/api/momo/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          status: "SUCCESSFUL",
          bookingId: id
        })
      });
    } catch (e) {
      console.error("Local webhook loop failed:", e);
    }
  }, 2000);

  res.json({
    success: true,
    message: `Payment request pushed to phone ${paymentPhone}. Transaction ${transactionId} confirmed.`,
    booking,
  });
});

// Community Ads list & posting
app.get("/api/ads", (req, res) => {
  res.json(ads);
});

app.post("/api/ads", (req, res) => {
  const { title, description, category, neighborhoodId, authorName, authorPhone, budgetFCFA, urgency } = req.body;
  if (!title || !description || !category || !neighborhoodId || !authorName || !authorPhone || !budgetFCFA) {
    return res.status(400).json({ error: "Missing required ad fields." });
  }
  const newAd = {
    id: `ad_${Date.now()}`,
    title,
    description,
    category,
    neighborhoodId,
    authorName,
    authorPhone,
    budgetFCFA: Number(budgetFCFA),
    createdAt: new Date().toISOString(),
    urgency: urgency || "MEDIUM",
  };
  ads.unshift(newAd);
  res.status(201).json(newAd);
});

// Chats
app.get("/api/chats/:providerId", (req, res) => {
  const { providerId } = req.params;
  res.json(chats[providerId] || []);
});

app.post("/api/chats/:providerId", async (req, res) => {
  const { providerId } = req.params;
  const { text, imageUrl, audioUrl, proposal } = req.body;
  if (!text && !imageUrl && !audioUrl && !proposal) {
    return res.status(400).json({ error: "Message text, image, audio or proposal required." });
  }

  if (!chats[providerId]) {
    chats[providerId] = [];
  }

  // Save customer message
  const userMsg: any = {
    id: `msg_${Date.now()}_u`,
    sender: "customer",
    text: text || (proposal ? `[PROPOSITION] Travail demandé le ${proposal.date} à ${proposal.time} pour ${proposal.price} FCFA` : ""),
    imageUrl: imageUrl || undefined,
    audioUrl: audioUrl || undefined,
    proposal: proposal || undefined,
    status: "read",
    createdAt: new Date().toISOString()
  };
  chats[providerId].push(userMsg);

  // Generate automated reply from provider using provider context!
  const provider = providers.find(p => p.id === providerId);
  const providerName = provider ? provider.name : "Prestataire";
  const providerDesc = provider ? provider.description : "Je suis disponible pour vous aider.";
  const providerRate = provider ? `${provider.rateFCFA} FCFA par ${provider.rateUnit}` : "tarif à convenir";

  // Check if AI client is available to write a realistic response, else fallback to templates
  const ai = getGeminiClient();
  let replyText = `Bonjour ! Merci pour votre message. Je suis bien ${providerName}. Concernant votre demande, je suis généralement disponible. Discutons des détails et du tarif (${providerRate}).`;

  if (proposal) {
    const pPrice = Number(proposal.price) || 0;
    if (pPrice < 1000) {
      replyText = `Mon frère, ${pPrice} FCFA c'est un peu bas pour ce travail. Est-ce qu'on peut s'entendre sur ${provider ? provider.rateFCFA : 3000} FCFA ?`;
    } else {
      replyText = `D'accord, c'est parfait ! J'accepte ta proposition de contrat de ${pPrice} FCFA pour le ${proposal.date} à ${proposal.time}. Travaillons ensemble, on est ensemble !`;
      
      // Auto-create active booking agreed in chat!
      const newBooking = {
        id: `b_chat_${Date.now()}`,
        providerId: providerId,
        providerName: providerName,
        customerName: "Client de discussion",
        customerPhone: "+237 600 00 00 00",
        category: provider ? provider.category : "TRANSPORT",
        serviceDate: proposal.date,
        serviceTime: proposal.time,
        description: proposal.description || "Contrat convenu en discussion",
        estimatedFCFA: pPrice,
        status: "ACCEPTED", // Immediately accepted since agreed in chat!
        paymentMethod: "CASH", // Cash default, can be paid via MoMo on dashboard
        clientCompleted: false,
        providerCompleted: false,
        createdAt: new Date().toISOString(),
      };
      bookings.unshift(newBooking);
    }
  } else if (imageUrl) {
    replyText = `Merci pour la photo de référence ! C'est très clair, je peux tout à fait réaliser ce travail. Discutons ensemble des modalités pour débuter à ${provider ? provider.neighborhoodId : "Bertoua"}.`;
  } else if (audioUrl) {
    replyText = `Bien reçu votre message vocal mon frère ! On est ensemble, j'ai tout écouté et je suis disponible pour cette tâche à ${providerRate}.`;
  } else if (ai) {
    try {
      const systemInstruction = `Tu incarnes ${providerName}, un prestataire de services local à Bertoua, au Cameroun. 
Ton profil est : "${providerDesc}". Ton tarif est de ${providerRate}.
Réponds au client de manière polie, accueillante et chaleureuse dans un style camerounais authentique mais professionnel (utilise un français simple, chaleureux, parfois agrémenté d'expressions comme 'on est ensemble', 'pas de souci mon frère/ma soeur', etc.). 
Sois bref (1-3 phrases maximum) et demande-lui d'en dire plus sur son besoin ou de confirmer une date d'intervention. Si le message est en anglais ou dans une autre langue, réponds de manière adaptée.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { role: "user", parts: [{ text: `Le client dit : "${text}"` }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      if (response.text) {
        replyText = response.text.trim();
      }
    } catch (err) {
      console.error("Error generating provider chat reply via Gemini:", err);
    }
  }

  // Save provider reply (with 1-second delay simulated in client, but saved immediately on server)
  const replyMsg = {
    id: `msg_${Date.now()}_p`,
    sender: "provider",
    text: replyText,
    status: "read",
    createdAt: new Date(Date.now() + 500).toISOString()
  };
  chats[providerId].push(replyMsg);

  res.json({ userMsg, replyMsg });
});

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
    } else if (task === "write-description") {
      fallbackText = `[Mode Simulation - Clé API non configurée]\nVoici une description professionnelle générée :\n"Je propose mes services professionnels de qualité supérieure à Bertoua. Sérieux, ponctuel et disponible immédiatement pour répondre à vos besoins. Tarif compétitif à convenir."`;
    } else if (task === "explain-pricing") {
      fallbackText = `[Mode Simulation - Clé API non configurée]\nÀ Bertoua et dans la région de l'Est :\n- Les petits trajets en Moto-Taxi coûtent généralement entre 200 FCFA et 500 FCFA.\n- Les services agricoles se négocient entre 3 000 FCFA et 6 000 FCFA par jour de travail.\n- Les travaux de maçonnerie/bâtiment vont de 5 000 FCFA à 8 000 FCFA par jour selon la complexité.`;
    } else {
      fallbackText = `Bonjour ! Je suis l'Animateur du village (Conseiller One Village). Je suis là pour vous aider à traduire vos demandes en Gbaya, Makaa ou Fulfulde, ou estimer les tarifs justes à Bertoua. Que désirez-vous savoir aujourd'hui ?`;
    }
    return res.json({ text: fallbackText });
  }

  try {
    let systemInstruction = `Tu es le "Conseiller Communautaire de One Village" (Tonton l'Est), un guide d'intelligence artificielle chaleureux, sage et expert de Bertoua et de la région de l'Est du Cameroun.
Tu parles couramment le français, l'anglais et maîtrises les cultures et langues locales majeures de l'Est : le Gbaya, le Makaa, et le Fulfulde.
Ton rôle est d'aider les membres de la communauté et les prestataires à mieux communiquer, se comprendre, et convenir de transactions équitables.
Utilise des expressions polies, respectueuses et chaleureuses propres à la culture camerounaise (ex: "Bonjour mon enfant", "On est ensemble", "Que la paix soit sur toi").`;

    if (task === "translate") {
      systemInstruction += `\nTACHE : Traduis le texte de l'utilisateur de manière fidèle et chaleureuse en langue : ${targetLang}. Donne la traduction claire, puis explique brièvement en une phrase simple comment le prononcer ou le contexte de politesse locale associé. Ne mets aucun code markdown complexe.`;
    } else if (task === "write-description") {
      systemInstruction += `\nTACHE : Reçois les notes brutes d'un prestataire de service local qui veut lister son service sur One Village. Rédige pour lui un titre accrocheur, une description professionnelle claire, rassurante et engageante, rédigée à la première personne ("Je..."), mettant en valeur ses compétences et son sérieux. Présente le résultat de manière très soignée et polie.`;
    } else if (task === "explain-pricing") {
      systemInstruction += `\nTACHE : L'utilisateur te demande des conseils sur les prix en vigueur à Bertoua pour un type de service. Explique clairement la fourchette de prix moyenne (en Francs CFA - FCFA) observée dans les marchés de Bertoua (Mokolo, Tigaza, Kano, etc.), donne des astuces pour négocier avec respect et équité, et rappelle l'importance de s'entraider dans le village.`;
    } else {
      systemInstruction += `\nTACHE : Réponds de manière générale, chaleureuse et informative aux questions sur les services, la vie de quartier à Bertoua, ou l'utilisation de l'application One Village. Garde un ton bienveillant et paternel/maternel.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API call failed:", error);
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
const promotedAds: PromotedAd[] = [
  {
    id: "pad1",
    providerId: "p2",
    providerName: "Alhadji Bouba",
    providerPhone: "+237 699 12 34 56",
    mediaUrl: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=600&q=80",
    mediaType: "image",
    placement: "home",
    budgetFCFA: 15000,
    startDate: "2026-07-01",
    endDate: "2026-07-15",
    status: "approved",
    impressions: 420,
    clicks: 65,
    momoTransactionId: "TX_MTN_112233",
    createdAt: "2026-07-01T08:00:00Z"
  },
  {
    id: "pad2",
    providerId: "p3",
    providerName: "Maman Solange",
    providerPhone: "+237 655 43 21 09",
    mediaUrl: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=600&q=80",
    mediaType: "image",
    placement: "TAILORING",
    budgetFCFA: 10000,
    startDate: "2026-07-02",
    endDate: "2026-07-16",
    status: "approved",
    impressions: 280,
    clicks: 34,
    momoTransactionId: "TX_ORANGE_445566",
    createdAt: "2026-07-02T09:00:00Z"
  }
];

// 1. Get approved ads (optionally filter by placement)
app.get("/api/promoted-ads", (req, res) => {
  const { placement } = req.query;
  let filtered = promotedAds.filter(ad => ad.status === "approved");
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
