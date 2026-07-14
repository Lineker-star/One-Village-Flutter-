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
  phone?: string;
  whatsappNumber?: string;
  preferredLanguage: "fr" | "en";
  avatarUrl?: string;
  referralCode?: string;
  referredBy?: string;
  rewardsCredit?: number;
  onboarding_completed?: boolean;
  email?: string;
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
  category: ServiceCategory;
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
  categories?: ServiceCategory[];
  status?: "pending" | "approved" | "rejected";
  idNumber?: string;
  idCardFrontUrl?: string;
  idCardBackUrl?: string;
  created_by_admin?: boolean;
  rejectionReason?: string;
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

