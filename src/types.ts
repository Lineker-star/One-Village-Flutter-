/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ServiceCategory {
  AGRICULTURE = "AGRICULTURE",
  TRANSPORT = "TRANSPORT",
  HOME_HELP = "HOME_HELP",
  CHILDCARE = "CHILDCARE",
  CONSTRUCTION = "CONSTRUCTION",
  TAILORING = "TAILORING",
  EDUCATION = "EDUCATION",
  HEALTH = "HEALTH",
}

export enum BookingStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  PAID = "PAID",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum PaymentMethod {
  MTN_MOMO = "MTN_MOMO",
  ORANGE_MONEY = "ORANGE_MONEY",
  CASH = "CASH",
}

export interface UserProfile {
  id: string;
  role: "client" | "provider" | "admin";
  fullName: string;
  bio?: string;
  phone?: string;
  whatsappNumber?: string;
  preferredLanguage: "fr" | "en";
  avatarUrl?: string;
  referralCode?: string;
  referredBy?: string;
  rewardsCredit?: number;
  onboarding_completed?: boolean;
  email?: string;
  // False only for a first-time OAuth (e.g. Google) sign-in, where the trigger had no client/
  // provider metadata to go on and defaulted to "client" — gates the one-time role-selection
  // screen. Always true for email+password signups, which choose a role in the form itself.
  roleConfirmed?: boolean;
}

export interface Neighborhood {
  id: string;
  name: string;
  description: string;
}

export interface ServiceProvider {
  id: string;
  name: string;
  businessName?: string;
  phone: string;
  whatsappNumber?: string;
  // A plain string, not strictly ServiceCategory: real providers can belong to an admin-approved
  // category that only exists in the database (e.g. an approved "Autre" suggestion), which has no
  // corresponding enum member. Look up CATEGORY_DETAILS[category as ServiceCategory] and fall back
  // gracefully (via ?.) when it's a DB-only category with no curated icon/color.
  category: string;
  neighborhoodId: string;
  rateFCFA: number;
  rateUnit: string; // e.g., "heure", "jour", "tâche"
  description: string;
  languages: string[]; // e.g., ["FR", "EN", "Gbaya"]
  rating: number;
  reviewCount: number;
  avatarUrl?: string;
  bannerUrl?: string; // Flyer image
  city?: string;
  verified: boolean;
  available: boolean;
  bookingsCount?: number;
  categories?: string[];
  status?: "pending" | "approved" | "rejected";
  idNumber?: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  created_by_admin?: boolean;
  rejectionReason?: string;
  cvUrl?: string;
  pendingCategoryName?: string;
  recencyScore?: number;
  popularityScore?: number;
  popularityViewsToday?: number;
  popularityViewsWeek?: number;
  popularityViewsMonth?: number;
  popularityBookingsToday?: number;
  popularityBookingsWeek?: number;
  popularityBookingsMonth?: number;
  popularityChatsToday?: number;
  popularityChatsWeek?: number;
  popularityChatsMonth?: number;
  createdAt?: string; // ISO timestamp — real providers only (public_provider_cards.created_at)
  subcategories?: string[]; // provider_services.subcategory values, for full-text search matching
  customDescriptions?: string[]; // provider_services.custom_description values ("Autre" free text)
}

export interface Review {
  id: string;
  providerId: string;
  bookingId: string;
  rating: number;
  text?: string;
  reviewerName: string;
  createdAt: string;
  response?: string;
  responseCreatedAt?: string;
  isTrustedReviewer?: boolean;
}

export interface Booking {
  id: string;
  providerId: string;
  providerName: string;
  customerName: string;
  customerPhone: string;
  category: ServiceCategory;
  serviceDate: string;
  serviceTime: string;
  description: string;
  estimatedFCFA: number;
  status: BookingStatus;
  paymentMethod?: PaymentMethod;
  paymentPhone?: string;
  momoTransactionId?: string;
  createdAt: string;
}

// Real Supabase-backed booking (see supabase/migrations/20260709000000_init_schema.sql and
// 20260715010000_bookings_realtime_and_status_rules.sql). Distinct from the legacy Booking/
// BookingStatus/PaymentMethod types above, which still back the mock in-memory bookings used by
// chat auto-booking, the admin dispute panel, and provider popularity stats — none of those moved
// to Supabase yet.
export type RealBookingStatus = "requested" | "accepted" | "in_progress" | "completed" | "cancelled";
export type RealPaymentMethod = "mobile_money" | "cash";

export interface RealBooking {
  id: string;
  clientId: string;
  providerId: string;
  categoryId?: number | null;
  status: RealBookingStatus;
  paymentMethod: RealPaymentMethod;
  agreedPrice: number;
  scheduledAt: string; // ISO timestamp
  description?: string;
  clientConfirmedComplete: boolean;
  providerConfirmedComplete: boolean;
  createdAt: string;
  // Denormalized display fields resolved via join in supabase.ts — never written back.
  clientName?: string;
  clientPhone?: string;
  providerBusinessName?: string;
  categoryNameFR?: string;
  categoryNameEN?: string;
}

export interface CommunityAd {
  id: string;
  title: string;
  description: string;
  category: ServiceCategory;
  neighborhoodId: string;
  authorName: string;
  authorPhone: string;
  budgetFCFA: number;
  createdAt: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
}

export interface ChatMessage {
  id: string;
  sender: "customer" | "provider";
  text: string;
  createdAt: string;
  imageUrl?: string;
  audioUrl?: string;
  status?: "sent" | "delivered" | "read";
}

export interface ChatHistory {
  providerId: string;
  providerName: string;
  messages: ChatMessage[];
}

export interface Referral {
  id: string;
  code: string;
  referrerName: string;
  points: number;
  shares: number;
}

export interface PromotedAd {
  id: string;
  providerId: string;
  providerName: string;
  providerPhone: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  placement: "home" | string; // 'home' or specific category id
  budgetFCFA: number;
  startDate: string;
  endDate: string;
  status: "pending_payment" | "pending_approval" | "approved" | "rejected";
  rejectionReason?: string;
  paymentMethod?: string;
  paymentPhone?: string;
  momoTransactionId?: string;
  impressions: number;
  clicks: number;
  createdAt: string;
}

