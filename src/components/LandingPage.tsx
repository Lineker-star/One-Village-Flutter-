/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { ServiceCategory } from "../types.ts";
import { SUB_CATEGORIES } from "../data/bertouaData.ts";
import { Globe, ShieldCheck, Star, ArrowRight, Users, Briefcase } from "lucide-react";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";
import heroBg from "../assets/images/landing/hero-bg.jpg";
import InstallAppButton from "./InstallAppButton.tsx";
import communityFind from "../assets/images/landing/community-1.jpg";
import communityOffer from "../assets/images/landing/community-5.jpg";

interface LandingPageProps {
  lang: "fr" | "en";
  setLang: (l: "fr" | "en") => void;
  onGetStarted: () => void;
}

// Fade/slide-up entrance used for anything that scrolls into view. `viewport={{ once: true }}`
// (applied where this is used) ensures each element only ever animates in once, never re-triggering
// as the user scrolls back up and down past it.
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export default function LandingPage({ lang, setLang, onGetStarted }: LandingPageProps) {
  // Genuinely computed from the real category data (8 top-level + all sub-categories) rather than
  // a fabricated marketing number — see src/data/bertouaData.ts.
  const totalServiceCount = Object.keys(ServiceCategory).length + SUB_CATEGORIES.length;

  const heroRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  // Subtle parallax + slow zoom on the hero background as the user scrolls past it — transform-only
  // (translateY + scale), so it's GPU-accelerated and never triggers layout reflow.
  const heroBgY = useTransform(heroScroll, [0, 1], ["0%", "18%"]);
  const heroBgScale = useTransform(heroScroll, [0, 1], [1.06, 1.16]);

  const t = {
    fr: {
      tagline: "BERTOUA, CAMEROUN",
      headline: "Votre village, à portée de main.",
      subheadline: "One Village met en relation les habitants de Bertoua qui cherchent un service de confiance avec ceux qui savent le rendre — artisans, agriculteurs, enseignants et bien plus encore.",
      ctaPrimary: "Commencer",
      findTitle: "Vous cherchez un service ?",
      findDesc: "Parcourez des prestataires locaux par catégorie ou quartier, consultez leurs avis, et réservez en toute simplicité — par Mobile Money ou en espèces.",
      findBullet: "Recherche par quartier et par métier",
      offerTitle: "Vous proposez vos compétences ?",
      offerDesc: "Créez votre profil de prestataire, faites-vous connaître dans votre quartier, et développez votre clientèle grâce aux avis de la communauté.",
      offerBullet: "Inscription gratuite, avis vérifiés",
      trustTitle: "Une communauté de confiance",
      statServices: "métiers représentés",
      statVerified: "Prestataires vérifiés",
      statVerifiedDesc: "Chaque profil passe par une vérification d'identité avant publication.",
      statReviews: "Avis authentiques",
      statReviewsDesc: "Seuls les clients ayant réellement réservé peuvent laisser un avis.",
      statLocal: "100% Bertoua",
      statLocalDesc: "Pensé pour et par la communauté de Bertoua, quartier par quartier.",
      footerNote: "Un village fort, une communauté prospère • On est ensemble.",
      revisit: "Vous avez déjà un compte ?",
      revisitLink: "Se connecter",
    },
    en: {
      tagline: "BERTOUA, CAMEROON",
      headline: "Your community, within reach.",
      subheadline: "One Village connects Bertoua residents looking for trusted local help with the people who provide it — tradespeople, farmers, tutors, and many more.",
      ctaPrimary: "Get Started",
      findTitle: "Looking for a service?",
      findDesc: "Browse local providers by category or neighborhood, check their reviews, and book in a few taps — pay by Mobile Money or cash.",
      findBullet: "Search by neighborhood and trade",
      offerTitle: "Offering your skills?",
      offerDesc: "Create your provider profile, get known in your neighborhood, and grow your client base through community reviews.",
      offerBullet: "Free sign-up, verified reviews",
      trustTitle: "A community built on trust",
      statServices: "trades represented",
      statVerified: "Verified providers",
      statVerifiedDesc: "Every profile goes through an identity check before it's published.",
      statReviews: "Genuine reviews",
      statReviewsDesc: "Only clients who actually booked a service can leave a review.",
      statLocal: "100% Bertoua",
      statLocalDesc: "Built for and by the Bertoua community, neighborhood by neighborhood.",
      footerNote: "A strong village, a thriving community • We're in this together.",
      revisit: "Already have an account?",
      revisitLink: "Sign in",
    }
  }[lang];

  return (
    <div className="min-h-screen bg-[#FBF7F0] text-[#241611] font-sans antialiased overflow-x-hidden">
      {/* Top bar */}
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="absolute top-0 left-0 right-0 z-20 px-4 sm:px-8 py-5 flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5">
          <img
            src={brandLogo}
            alt="OneVillage Logo"
            className="w-10 h-10 sm:w-11 sm:h-11 object-contain rounded-xl shadow-sm border border-white/30"
            referrerPolicy="no-referrer"
          />
          <span className="font-extrabold text-white tracking-tight text-base sm:text-lg drop-shadow-sm">
            ONE VILLAGE
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.15 }}
          onClick={() => setLang(lang === "fr" ? "en" : "fr")}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-xl border border-white/20 transition-colors cursor-pointer"
        >
          <Globe className="w-4 h-4" />
          <span>{lang === "fr" ? "English" : "Français"}</span>
        </motion.button>
      </motion.header>

      {/* Hero */}
      <section ref={heroRef} className="relative w-full min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center overflow-hidden">
        <motion.img
          src={heroBg}
          alt=""
          style={{ y: heroBgY, scale: heroBgScale }}
          className="absolute inset-0 w-full h-full object-cover will-change-transform"
          referrerPolicy="no-referrer"
        />
        {/* Darkened for text readability, using a dark navy palette instead of the earlier
            terracotta -> ink treatment — never lighter than ~60% opacity. */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F1B2E]/60 via-[#16243D]/65 to-[#1A2942]/90" />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 text-center py-28 sm:py-32"
        >
          <motion.span
            variants={fadeUp}
            className="inline-block text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] text-[#F2B355] mb-4"
          >
            {t.tagline}
          </motion.span>
          <motion.h1 variants={fadeUp} className="text-3xl sm:text-5xl font-black text-white leading-tight tracking-tight drop-shadow-md">
            {t.headline}
          </motion.h1>
          <motion.p variants={fadeUp} className="mt-5 text-sm sm:text-base text-amber-50/90 leading-relaxed max-w-xl mx-auto font-serif">
            {t.subheadline}
          </motion.p>

          <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <motion.button
              whileHover={{ scale: 1.045, boxShadow: "0 0 32px rgba(227,162,61,0.55)" }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
              onClick={onGetStarted}
              className="inline-flex items-center gap-2 bg-[#E3A23D] hover:bg-[#F2B355] text-[#241611] font-black text-sm sm:text-base px-7 sm:px-8 py-3.5 sm:py-4 rounded-2xl shadow-lg cursor-pointer"
            >
              {t.ctaPrimary}
              <ArrowRight className="w-5 h-5" />
            </motion.button>
            <InstallAppButton lang={lang} variant="hero" />
          </motion.div>

          <motion.p variants={fadeUp} className="mt-5 text-xs text-amber-100/70">
            {t.revisit} <button onClick={onGetStarted} className="font-bold underline hover:text-white cursor-pointer transition-colors">{t.revisitLink}</button>
          </motion.p>
        </motion.div>
      </section>

      {/* Two-sided value proposition */}
      <section className="relative max-w-6xl mx-auto px-4 sm:px-8 -mt-12 sm:-mt-16 pb-16 overflow-hidden">
        {/* Decorative soft gradient blobs — pure CSS, absolutely positioned, blurred; give the
            glassmorphism cards below something translucent to show through. Purely decorative
            (pointer-events-none) and clipped by the section's overflow-hidden so they can never
            cause horizontal scroll on small screens. */}
        <div className="absolute -top-10 -left-16 w-64 h-64 bg-[#E3A23D]/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -right-16 w-72 h-72 bg-[#245C46]/20 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="relative grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6"
        >
          {/* Find help */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            transition={{ duration: 0.2 }}
            className="bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/60 overflow-hidden flex flex-col"
          >
            <div className="h-40 sm:h-48 overflow-hidden">
              <img
                src={communityFind}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="p-6 sm:p-7 space-y-3 flex-1 flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-[#E3A23D]/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-[#B87423]" />
              </div>
              <h3 className="text-lg font-black text-[#241611]">{t.findTitle}</h3>
              <p className="text-xs sm:text-sm text-[#241611]/75 leading-relaxed font-serif flex-1">
                {t.findDesc}
              </p>
              <span className="text-[11px] font-bold text-[#B87423] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                {t.findBullet}
              </span>
            </div>
          </motion.div>

          {/* Offer skills */}
          <motion.div
            variants={fadeUp}
            whileHover={{ y: -6 }}
            transition={{ duration: 0.2 }}
            className="bg-white/70 backdrop-blur-md rounded-3xl shadow-xl border border-white/60 overflow-hidden flex flex-col"
          >
            <div className="h-40 sm:h-48 overflow-hidden">
              <img
                src={communityOffer}
                alt=""
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className="p-6 sm:p-7 space-y-3 flex-1 flex flex-col">
              <div className="w-10 h-10 rounded-xl bg-[#245C46]/15 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-[#245C46]" />
              </div>
              <h3 className="text-lg font-black text-[#241611]">{t.offerTitle}</h3>
              <p className="text-xs sm:text-sm text-[#241611]/75 leading-relaxed font-serif flex-1">
                {t.offerDesc}
              </p>
              <span className="text-[11px] font-bold text-[#245C46] flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" />
                {t.offerBullet}
              </span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Trust signals */}
      <section className="relative bg-gradient-to-br from-[#241611] via-[#7A3420] to-[#241611] py-14 sm:py-16 overflow-hidden">
        <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-80 h-80 bg-[#E3A23D]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#3E8467]/15 rounded-full blur-3xl pointer-events-none" />

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="relative max-w-5xl mx-auto px-4 sm:px-8"
        >
          <motion.h2 variants={fadeUp} className="text-center text-[#F2B355] font-black uppercase tracking-widest text-xs sm:text-sm mb-8 sm:mb-10">
            {t.trustTitle}
          </motion.h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            <motion.div variants={fadeUp} className="text-center space-y-1.5">
              <div className="text-3xl sm:text-4xl font-black text-white font-mono">{totalServiceCount}+</div>
              <div className="text-xs sm:text-sm text-amber-100 font-bold">{t.statServices}</div>
            </motion.div>
            <motion.div variants={fadeUp} className="text-center space-y-1.5">
              <ShieldCheck className="w-7 h-7 mx-auto text-[#F2B355]" />
              <div className="text-xs sm:text-sm text-amber-100 font-bold">{t.statVerified}</div>
              <p className="text-[11px] text-amber-200/70 font-serif max-w-[220px] mx-auto leading-snug">{t.statVerifiedDesc}</p>
            </motion.div>
            <motion.div variants={fadeUp} className="text-center space-y-1.5">
              <Star className="w-7 h-7 mx-auto text-[#F2B355]" />
              <div className="text-xs sm:text-sm text-amber-100 font-bold">{t.statReviews}</div>
              <p className="text-[11px] text-amber-200/70 font-serif max-w-[220px] mx-auto leading-snug">{t.statReviewsDesc}</p>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.5 }}
        transition={{ duration: 0.4 }}
        className="bg-white border-t border-[#241611]/10 py-8"
      >
        <div className="max-w-5xl mx-auto px-4 text-center space-y-3">
          <p className="text-xs text-[#241611]/60 font-medium font-serif italic">"{t.footerNote}"</p>
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: "0 0 24px rgba(227,162,61,0.4)" }}
            whileTap={{ scale: 0.96 }}
            transition={{ duration: 0.15 }}
            onClick={onGetStarted}
            className="bg-[#7A3420] hover:bg-[#8A3D25] text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer inline-flex items-center gap-1.5"
          >
            {t.ctaPrimary}
            <ArrowRight className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </motion.footer>
    </div>
  );
}
