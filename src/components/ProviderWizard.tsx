import React, { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import { ServiceCategory } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS, CATEGORY_DETAILS, SUB_CATEGORIES } from "../data/bertouaData.ts";
import { supabaseService, mockSupabase } from "../lib/supabase.ts";
import { toTitleCase } from "../lib/textFormat.ts";
import BertouaMap from "./BertouaMap.tsx";
import brandLogo from "../assets/images/one_village_logo_1784027088635.jpg";
import {
  Sparkles,
  Phone,
  Check,
  Languages,
  Upload,
  User,
  Image as ImageIcon,
  FileText,
  DollarSign,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  HelpCircle,
  Info,
  Globe,
  Loader2,
  Lock,
  Download,
} from "lucide-react";

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const OTHER_NEIGHBORHOOD_VALUE = "OTHER_NEIGHBORHOOD";

interface ProviderWizardProps {
  lang: "fr" | "en";
  userId: string;
  userPhone?: string;
  fullName?: string;
  onSuccess: (providerData: any) => void;
  onCancel: () => void;
  isAdminCreating?: boolean; // admin-assisted setup flag
}

export default function ProviderWizard({
  lang,
  userId,
  userPhone = "",
  fullName = "",
  onSuccess,
  onCancel,
  isAdminCreating = false,
}: ProviderWizardProps) {
  const [step, setStep] = useState(1);

  // Form State
  const [businessName, setBusinessName] = useState("");
  const [descriptionFR, setDescriptionFR] = useState("");
  const [descriptionEN, setDescriptionEN] = useState("");
  const [translating, setTranslating] = useState(false);

  // Category State
  // A plain string, not ServiceCategory: mainCategory holds a service_categories.slug, which may be
  // one of the 8 built-in enum values OR a DB-only category from a previously-approved "Autre"
  // suggestion (see allCategories below — the live source of truth for this dropdown).
  const [mainCategory, setMainCategory] = useState<string>(ServiceCategory.AGRICULTURE);
  const [allCategories, setAllCategories] = useState<Array<{ id: number; slug: string; nameFr: string; nameEn: string }>>([]);
  const [isOtherCategory, setIsOtherCategory] = useState(false);
  const [otherCategoryName, setOtherCategoryName] = useState("");
  const [otherCategoryDescription, setOtherCategoryDescription] = useState("");
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([]);
  const [otherCategorySpec, setOtherCategorySpec] = useState("");
  const [transportSubtype, setTransportSubtype] = useState<"truck" | "tricycle" | "bike" | "car" | "">("");

  // Location State
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
  const [useFreeTextNeighborhood, setUseFreeTextNeighborhood] = useState(false);
  const [neighborhoodFreeText, setNeighborhoodFreeText] = useState("");
  const [textAddress, setTextAddress] = useState("");
  const [city, setCity] = useState("Bertoua");
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number }>({ lat: 4.5772, lng: 13.6826 });

  // Contact State
  const [contactPhone, setContactPhone] = useState(userPhone || "+237 ");
  const [whatsappNumber, setWhatsappNumber] = useState(userPhone || "+237 ");
  const [email, setEmail] = useState("");
  const [facebook, setFacebook] = useState("");
  const [linkedin, setLinkedin] = useState("");

  // Pricing State
  const [displayPricing, setDisplayPricing] = useState(true);
  const [rateFCFA, setRateFCFA] = useState("");
  const [rateUnit, setRateUnit] = useState("jour");

  // Languages spoken
  const [languages, setLanguages] = useState<string[]>(["FR"]);

  // Media State
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // ID verification State
  const [idNumber, setIdNumber] = useState("");
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idFrontUrl, setIdFrontUrl] = useState("");
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [idBackUrl, setIdBackUrl] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Item 1 fix: this wizard has no native <form>/`required` at all — each step already does its
  // own manual validation via handleNext below — but when the admin-assisted setup renders it
  // inside App.tsx's `fixed inset-0 overflow-y-auto` modal, the errorMsg banner (which sits above
  // each step's fields) can end up scrolled out of view if the user was scrolled further down a
  // long step, making the failure look like nothing happened. errorBannerRef lets every validation
  // failure below scroll that banner back into view, and the couple of vestigial `required` HTML
  // attributes previously left on some fields (inert without a real <form>) have been removed.
  const errorBannerRef = useRef<HTMLDivElement>(null);
  const descriptionFRRef = useRef<HTMLTextAreaElement>(null);
  const textAddressRef = useRef<HTMLInputElement>(null);
  const contactPhoneRef = useRef<HTMLInputElement>(null);
  const whatsappNumberRef = useRef<HTMLInputElement>(null);
  const idNumberRef = useRef<HTMLInputElement>(null);

  const showStepError = (message: string, fieldRef?: React.RefObject<HTMLElement>) => {
    setErrorMsg(message);
    const target = fieldRef?.current ?? errorBannerRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    (fieldRef?.current as HTMLInputElement | HTMLTextAreaElement | undefined)?.focus?.({ preventScroll: true });
  };

  // Live list of every category that actually exists in service_categories (built-in + any
  // admin-approved "Autre" suggestions) — the single source of truth for this dropdown, so a
  // newly-approved category shows up here without a rebuild.
  useEffect(() => {
    supabaseService.getAllServiceCategories().then(setAllCategories);
  }, []);

  // Translation Helper via Gemini API
  const handleTranslateDescription = async () => {
    const textToTranslate = descriptionFR.trim();
    if (!textToTranslate) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/ai-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToTranslate,
          task: "translate",
          targetLang: "English",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Remove simulated mode notices if any
        const cleaned = data.text.replace(/\[Mode Simulation[^\]]*\]/gi, "").trim();
        setDescriptionEN(cleaned);
      }
    } catch (err) {
      console.error("Translation failed:", err);
    } finally {
      setTranslating(false);
    }
  };

  // Helper to handle client-side compressed image uploads to the real Supabase Storage buckets.
  // Admin-assisted setup uses a synthetic userId with no real Supabase auth user behind it (see
  // handleSubmitRegistration), so its uploads stay on the local mock path — storage RLS requires
  // auth.uid() to match the upload folder, which a synthetic id can never satisfy.
  const handleFileUpload = async (
    file: File,
    bucket: "provider-media" | "id-verification",
    filename: string,
    setUrl: (url: string) => void
  ) => {
    try {
      const url = isAdminCreating
        ? await mockSupabase.compressAndUpload(file, bucket)
        : await supabaseService.uploadProviderMedia(bucket, userId, file, filename);
      setUrl(url);
      return url;
    } catch (err) {
      console.error(`Upload error on bucket ${bucket}:`, err);
      return "";
    }
  };

  const validatePhone = (num: string) => {
    return num.trim().startsWith("+237") && num.replace(/[\s-]/g, "").length >= 12;
  };

  const handleNext = async () => {
    setErrorMsg("");
    if (step === 1) {
      if (!descriptionFR.trim()) {
        showStepError(lang === "fr" ? "Veuillez fournir une description en français." : "Please provide a description in French.", descriptionFRRef);
        return;
      }
      if (isOtherCategory && !otherCategoryName.trim()) {
        showStepError(lang === "fr" ? "Veuillez nommer la nouvelle catégorie proposée." : "Please name the new category you're suggesting.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!isOtherCategory && selectedSubCategories.length === 0 && !otherCategorySpec.trim()) {
        showStepError(lang === "fr" ? "Veuillez choisir au moins une catégorie de service." : "Please select at least one service category.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (useFreeTextNeighborhood && !neighborhoodFreeText.trim()) {
        showStepError(lang === "fr" ? "Veuillez indiquer le nom de votre quartier." : "Please enter your neighborhood name.");
        return;
      }
      if (!textAddress.trim()) {
        showStepError(lang === "fr" ? "Veuillez indiquer votre adresse textuelle." : "Please specify your physical address.", textAddressRef);
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (!validatePhone(contactPhone)) {
        showStepError(lang === "fr" ? "Format de téléphone incorrect. Doit commencer par +237." : "Incorrect phone format. Must start with +237.", contactPhoneRef);
        return;
      }
      if (!validatePhone(whatsappNumber)) {
        showStepError(lang === "fr" ? "Format WhatsApp incorrect. Doit commencer par +237." : "Incorrect WhatsApp format. Must start with +237.", whatsappNumberRef);
        return;
      }
      setStep(5);
    } else if (step === 5) {
      if (displayPricing && (!rateFCFA || Number(rateFCFA) <= 0)) {
        showStepError(lang === "fr" ? "Veuillez entrer un tarif valide en FCFA." : "Please enter a valid rate in FCFA.");
        return;
      }
      setStep(6);
    } else if (step === 6) {
      // Upload media if present before going to ID verification
      setUploadingMedia(true);
      try {
        if (avatarFile && !avatarUrl) {
          await handleFileUpload(avatarFile, "provider-media", "avatar.jpg", setAvatarUrl);
        }
        if (bannerFile && !bannerUrl) {
          await handleFileUpload(bannerFile, "provider-media", "banner.jpg", setBannerUrl);
        }
      } catch (e) {
        console.error("Media pre-upload failed", e);
      } finally {
        setUploadingMedia(false);
      }
      setStep(7);
    } else if (step === 7) {
      if (!idNumber.trim()) {
        showStepError(lang === "fr" ? "Veuillez saisir votre numéro de carte d'identité." : "Please enter your National ID card number.", idNumberRef);
        return;
      }
      if (!idFrontFile && !idFrontUrl) {
        showStepError(lang === "fr" ? "La photo de face de la CNI est requise." : "Front photo of ID card is required.");
        return;
      }
      // Upload ID files
      setUploadingMedia(true);
      try {
        if (idFrontFile && !idFrontUrl) {
          await handleFileUpload(idFrontFile, "id-verification", "id-front.jpg", setIdFrontUrl);
        }
        if (idBackFile && !idBackUrl) {
          await handleFileUpload(idBackFile, "id-verification", "id-back.jpg", setIdBackUrl);
        }
      } catch (e) {
        console.error("ID upload failed", e);
      } finally {
        setUploadingMedia(false);
      }
      setStep(8);
    }
  };

  const handlePrev = () => {
    setErrorMsg("");
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSubmitRegistration = async () => {
    setSubmitting(true);
    setErrorMsg("");
    try {
      // Structured sub-type values (e.g. Transport's truck/tricycle/bike/car, or the tech_* repair
      // specialties) go into provider_services.subcategory; only the free-text "other, please
      // specify" note goes into custom_description.
      const subcategory =
        mainCategory === ServiceCategory.TRANSPORT && transportSubtype
          ? transportSubtype
          : selectedSubCategories.join(", ") || undefined;
      const customDescription = otherCategorySpec.trim() || undefined;
      const effectiveNeighborhoodId = useFreeTextNeighborhood ? toTitleCase(neighborhoodFreeText) : neighborhoodId;

      if (isAdminCreating) {
        // Admin-assisted "offline merchant" setup uses a synthetic userId with no real Supabase
        // auth user behind it, so it stays entirely on the local mock system. Wiring this properly
        // would require the admin to provision a real Supabase auth user first (via the service
        // role key) — a bigger feature, out of scope for this step.
        const result = await mockSupabase.submitProviderRegistration({
          id: userId,
          name: fullName || businessName,
          businessName: businessName || fullName,
          phone: contactPhone,
          whatsappNumber: whatsappNumber,
          category: mainCategory,
          categories: [mainCategory],
          neighborhoodId: effectiveNeighborhoodId,
          city: city,
          rateFCFA: displayPricing ? Number(rateFCFA) : 0,
          rateUnit: rateUnit,
          description: descriptionFR,
          languages: languages,
          avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(businessName)}`,
          bannerUrl: bannerUrl || "",
          idNumber: idNumber,
          idCardFrontUrl: idFrontUrl,
          idCardBackUrl: idBackUrl,
          created_by_admin: true,
        });
        onSuccess(result);
        return;
      }

      await supabaseService.registerServiceProvider({
        userId,
        businessName: businessName || fullName,
        descriptionFR: descriptionFR,
        descriptionEN: descriptionEN || descriptionFR,
        bannerUrl: bannerUrl || undefined,
        addressText: textAddress,
        city: city,
        neighborhoodId: effectiveNeighborhoodId,
        latitude: gpsCoords.lat,
        longitude: gpsCoords.lng,
        hasFixedPricing: displayPricing,
        basePrice: displayPricing ? Number(rateFCFA) : 0,
        rateUnit: rateUnit,
        languages: languages,
        idCardNumber: idNumber,
        idCardFrontPath: idFrontUrl || undefined,
        idCardBackPath: idBackUrl || undefined,
        facebook: facebook || undefined,
        linkedin: linkedin || undefined,
        mainCategorySlug: isOtherCategory ? undefined : mainCategory,
        subcategory: isOtherCategory ? undefined : subcategory,
        customDescription: isOtherCategory ? undefined : customDescription,
        pendingCategorySuggestion: isOtherCategory
          ? { categoryName: otherCategoryName.trim(), description: otherCategoryDescription.trim() || descriptionFR }
          : undefined,
      });

      // Update the user's own profile: role, contact info, and profile picture (profiles.avatar_url)
      await supabaseService.updateUserProfile({
        fullName: fullName || businessName,
        phone: contactPhone,
        whatsappNumber: whatsappNumber,
        avatarUrl: avatarUrl || undefined,
        role: "provider",
        onboarding_completed: true,
      });

      onSuccess({ id: userId, name: fullName || businessName, businessName, category: mainCategory });
    } catch (err: any) {
      console.error("Registration error:", err);
      showStepError(err.message || "Erreur de soumission. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  const subCategoriesList = SUB_CATEGORIES;

  const handleSubCategoryToggle = (id: string) => {
    if (selectedSubCategories.includes(id)) {
      setSelectedSubCategories(selectedSubCategories.filter((x) => x !== id));
    } else {
      setSelectedSubCategories([...selectedSubCategories, id]);
    }
  };

  const availableLanguages = ["FR", "EN", "Gbaya", "Makaa", "Fulfulde"];
  const handleLanguageToggle = (l: string) => {
    if (languages.includes(l)) {
      setLanguages(languages.filter((x) => x !== l));
    } else {
      setLanguages([...languages, l]);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setGpsCoords({ lat, lng });
  };

  // Loads a bundled image asset (e.g. the app logo) into a data URL, since jsPDF's addImage
  // needs raster data rather than a plain asset URL to embed it in the document.
  const loadImageAsDataUrl = (url: string): Promise<string> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/jpeg"));
      };
      img.onerror = () => reject(new Error("Logo failed to load"));
      img.src = url;
    });

  // Client-side PDF of everything entered so far, so the provider has a record of their
  // submission independent of the platform. Built as a bordered, sectioned document (logo header,
  // labeled boxes per topic, footer with date) rather than a flat text dump.
  const handleDownloadPdf = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;

    let logoDataUrl: string | null = null;
    try {
      logoDataUrl = await loadImageAsDataUrl(brandLogo);
    } catch {
      logoDataUrl = null;
    }

    const builtInCategory = CATEGORY_DETAILS[mainCategory as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
    const liveCategory = allCategories.find((c) => c.slug === mainCategory);
    const categoryLabel = isOtherCategory
      ? `${otherCategoryName || "-"} (${lang === "fr" ? "en attente d'approbation" : "pending approval"})`
      : lang === "fr" ? (builtInCategory?.nameFR || liveCategory?.nameFr || mainCategory) : (builtInCategory?.nameEN || liveCategory?.nameEn || mainCategory);
    const neighborhoodLabel = toTitleCase(
      useFreeTextNeighborhood ? neighborhoodFreeText : BERTOUA_NEIGHBORHOODS.find((n) => n.id === neighborhoodId)?.name || neighborhoodId
    );

    // ---- Header band with logo + title ----
    const headerHeight = 30;
    doc.setFillColor(69, 39, 19);
    doc.rect(0, 0, pageWidth, headerHeight, "F");
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, "JPEG", margin, 5, 20, 20);
    }
    const titleX = logoDataUrl ? margin + 26 : margin;
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("ONE VILLAGE", titleX, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(lang === "fr" ? "Résumé d'inscription prestataire" : "Provider Registration Summary", titleX, 22);

    // ---- Pending verification badge ----
    const badgeText = lang === "fr" ? "EN ATTENTE DE VÉRIFICATION" : "PENDING VERIFICATION";
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    const badgeWidth = doc.getTextWidth(badgeText) + 8;
    doc.setFillColor(217, 119, 6);
    doc.roundedRect(pageWidth - margin - badgeWidth, headerHeight + 4, badgeWidth, 7, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, pageWidth - margin - badgeWidth + 4, headerHeight + 9);

    let y = headerHeight + 18;

    // Draws a bordered, titled box with label/value rows, wrapping to a new page if needed.
    const drawSection = (title: string, rows: [string, string][]) => {
      const rowLines = rows.map(([label, value]) => {
        const wrapped = doc.splitTextToSize(String(value || "-"), contentWidth - 55);
        return { label, wrapped: (Array.isArray(wrapped) ? wrapped : [wrapped]) as string[] };
      });
      const titleHeight = 9;
      const padding = 6;
      const rowsHeight = rowLines.reduce((sum, r) => sum + r.wrapped.length * 5.5, 0);
      const boxHeight = titleHeight + rowsHeight + padding * 2;

      if (y + boxHeight > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }

      doc.setDrawColor(230, 200, 150);
      doc.setFillColor(250, 248, 245);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 3, 3, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(120, 53, 15);
      doc.text(title.toUpperCase(), margin + 5, y + 8);

      let rowY = y + titleHeight + padding;
      rowLines.forEach(({ label, wrapped }) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(40, 30, 20);
        doc.text(`${label}:`, margin + 5, rowY);
        doc.setFont("helvetica", "normal");
        doc.text(wrapped, margin + 55, rowY);
        rowY += wrapped.length * 5.5;
      });

      y += boxHeight + 6;
    };

    drawSection(lang === "fr" ? "Informations sur l'activité" : "Business Info", [
      [lang === "fr" ? "Nom de l'activité" : "Business name", businessName || fullName || "-"],
      [lang === "fr" ? "Catégorie" : "Category", categoryLabel],
    ]);

    drawSection(lang === "fr" ? "Localisation" : "Location", [
      [lang === "fr" ? "Quartier" : "Neighborhood", `${neighborhoodLabel} (${city})`],
      [lang === "fr" ? "Adresse" : "Address", textAddress || "-"],
      [lang === "fr" ? "Coordonnées GPS" : "GPS coordinates", `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}`],
    ]);

    drawSection(lang === "fr" ? "Contact" : "Contact", [
      [lang === "fr" ? "Téléphone" : "Phone", contactPhone],
      [lang === "fr" ? "WhatsApp" : "WhatsApp", whatsappNumber],
      [lang === "fr" ? "Email" : "Email", email || "-"],
    ]);

    drawSection(lang === "fr" ? "Tarification" : "Pricing", [
      [lang === "fr" ? "Tarif" : "Rate", displayPricing ? `${rateFCFA} FCFA / ${rateUnit}` : (lang === "fr" ? "Sur devis" : "Quote on request")],
    ]);

    drawSection(lang === "fr" ? "Langues" : "Languages", [
      [lang === "fr" ? "Langues parlées" : "Languages spoken", languages.join(", ") || "-"],
    ]);

    drawSection(lang === "fr" ? "Description" : "Description", [
      [lang === "fr" ? "Description (FR)" : "Description (FR)", descriptionFR || "-"],
    ]);

    // ---- Footer on every page ----
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setDrawColor(230, 200, 150);
      doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 110, 80);
      doc.text(
        `${lang === "fr" ? "Généré le" : "Generated on"} ${new Date().toISOString().split("T")[0]} — ONE VILLAGE`,
        margin,
        pageHeight - 9
      );
      doc.text(`${i} / ${pageCount}`, pageWidth - margin - 12, pageHeight - 9);
    }

    doc.save(`one-village-${(businessName || fullName || "provider").replace(/\s+/g, "_")}.pdf`);
  };

  return (
    <div className="bg-white border border-amber-100 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 max-w-3xl mx-auto">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-amber-50 pb-4">
        <div>
          <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest block mb-0.5">
            {isAdminCreating ? "Admin Assisted Setup (Phase 12)" : "Onboarding Prestataire / Provider Registration"}
          </span>
          <h2 className="text-lg font-black text-amber-950 uppercase tracking-tight">
            {lang === "fr" ? "Créer votre Profil de Service" : "Register Your Service Profile"}
          </h2>
        </div>
        <div className="text-right">
          <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg">
            Step {step} / 8
          </span>
        </div>
      </div>

      {/* Progress Line */}
      <div className="relative w-full h-1.5 bg-amber-100/50 rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-amber-800 transition-all duration-300"
          style={{ width: `${(step / 8) * 100}%` }}
        />
      </div>

      {errorMsg && (
        <div ref={errorBannerRef} className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs font-bold flex items-center gap-2">
          <Info className="w-4.5 h-4.5 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: Business Basics */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Nom de l'Activité / Entreprise" : "Business / Brand Name"}
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Atelier de Couture de Maman Solange"
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Catégorie Principale" : "Primary Category"}
            </label>
            <select
              value={isOtherCategory ? "OTHER" : mainCategory}
              onChange={(e) => {
                if (e.target.value === "OTHER") {
                  setIsOtherCategory(true);
                } else {
                  setIsOtherCategory(false);
                  setMainCategory(e.target.value);
                }
              }}
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
            >
              {allCategories.map((cat) => {
                const builtIn = CATEGORY_DETAILS[cat.slug as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
                return (
                  <option key={cat.slug} value={cat.slug}>
                    {lang === "fr" ? (builtIn?.nameFR || cat.nameFr) : (builtIn?.nameEN || cat.nameEn)}
                  </option>
                );
              })}
              <option value="OTHER">{lang === "fr" ? "Autre — à préciser" : "Other — specify"}</option>
            </select>
          </div>

          {isOtherCategory && (
            <div className="space-y-3 p-4 border border-amber-200 rounded-2xl bg-amber-50/30 animate-fade-in">
              <p className="text-[10px] text-amber-800 font-serif">
                {lang === "fr"
                  ? "Cette catégorie sera soumise à l'administration pour approbation. Votre profil sera tout de même publié, avec la mention « en attente d'approbation »."
                  : "This category will be submitted to the admin team for approval. Your profile will still be published, marked as \"pending review\"."}
              </p>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Nom de la nouvelle catégorie" : "New category name"}
                </label>
                <input
                  type="text"
                  value={otherCategoryName}
                  onChange={(e) => setOtherCategoryName(e.target.value)}
                  placeholder={lang === "fr" ? "ex: Coiffure & Beauté" : "e.g. Hairdressing & Beauty"}
                  className="w-full bg-white border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Décrivez ce service précisément" : "Describe this specific service"}
                </label>
                <textarea
                  rows={2}
                  value={otherCategoryDescription}
                  onChange={(e) => setOtherCategoryDescription(e.target.value)}
                  placeholder={lang === "fr" ? "ex: Tresses, coiffures traditionnelles, soins capillaires..." : "e.g. Braiding, traditional hairstyles, hair care..."}
                  className="w-full bg-white border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-serif"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider">
                {lang === "fr" ? "Description de votre Service (Français)" : "Service Description (French)"}
              </label>
              <button
                onClick={handleTranslateDescription}
                disabled={translating || !descriptionFR.trim()}
                className="text-[10px] bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1.5 rounded-lg font-bold text-amber-900 flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                {translating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3 text-amber-700" />}
                {lang === "fr" ? "Traduire en Anglais (AI)" : "Translate to English (AI)"}
              </button>
            </div>
            <textarea
              ref={descriptionFRRef}
              rows={4}
              value={descriptionFR}
              onChange={(e) => setDescriptionFR(e.target.value)}
              placeholder="Décrivez en français vos compétences, vos années d'expérience et votre sérieux pour rassurer la communauté à Bertoua..."
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-serif leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Description du Service (Anglais - Optionnelle)" : "Service Description (English - Optional)"}
            </label>
            <textarea
              rows={4}
              value={descriptionEN}
              onChange={(e) => setDescriptionEN(e.target.value)}
              placeholder="English description of your skills and service. Helps reach English-speaking clients in the East..."
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 font-serif leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Langues parlées" : "Languages Spoken"}
            </label>
            <div className="flex flex-wrap gap-2">
              {availableLanguages.map((l) => {
                const isSelected = languages.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => handleLanguageToggle(l)}
                    className={`px-3 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                      isSelected
                        ? "bg-amber-800 border-amber-800 text-white shadow-sm"
                        : "bg-[#FAF8F5] border-amber-200/60 text-amber-950 hover:bg-amber-100/30"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Sub-categories Selection */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
          {isOtherCategory ? (
            <div className="p-6 border border-dashed border-amber-200 rounded-2xl bg-amber-50/20 text-center space-y-2">
              <p className="text-xs font-bold text-amber-950">
                {lang === "fr" ? "Aucune sous-catégorie requise" : "No sub-categories needed"}
              </p>
              <p className="text-[11px] text-amber-800/80 font-serif">
                {lang === "fr"
                  ? `Vous avez proposé une nouvelle catégorie : "${otherCategoryName || "..."}". Continuez vers l'étape suivante.`
                  : `You suggested a new category: "${otherCategoryName || "..."}". Continue to the next step.`}
              </p>
            </div>
          ) : (
            <>
          <div>
            <h4 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
              {lang === "fr" ? "Services proposés au village" : "Select Your Specific Services"}
            </h4>
            <p className="text-[11px] text-amber-800/80 mt-0.5 font-serif">
              {lang === "fr"
                ? "Sélectionnez tous les services spécifiques que vous maîtrisez. Vous apparaîtrez dans ces catégories lors des recherches."
                : "Select all custom service roles you offer. Clients will find you based on these skills."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {subCategoriesList
              .filter((item) => item.cat === mainCategory)
              .map((item) => {
                const isSelected = selectedSubCategories.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSubCategoryToggle(item.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all text-xs font-bold cursor-pointer ${
                      isSelected
                        ? "bg-amber-800 border-amber-800 text-white shadow-sm"
                        : "bg-[#FAF8F5] border-amber-200/60 text-amber-950 hover:bg-amber-100/30"
                    }`}
                  >
                    <span>{lang === "fr" ? item.labelFR : item.labelEN}</span>
                    {isSelected && <Check className="w-4 h-4 text-white shrink-0" />}
                  </button>
                );
              })}
          </div>

          {mainCategory === ServiceCategory.TRANSPORT && (
            <div className="space-y-1.5 pt-2 border-t border-amber-50">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Type de véhicule transport" : "Transport Vehicle Type"}
              </label>
              <select
                value={transportSubtype}
                onChange={(e: any) => setTransportSubtype(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              >
                <option value="">-- Sélectionner / Select --</option>
                <option value="bike">Conducteur Moto-Taxi (Benskineur)</option>
                <option value="tricycle">Moto-Cargo / Tricycle</option>
                <option value="truck">Camionnette / Camion de chargement</option>
                <option value="car">Voiture personnelle / Taxi Ville</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5 pt-2 border-t border-amber-50">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Autre spécialité (Préciser)" : "Other Service Specialty (Specify)"}
            </label>
            <input
              type="text"
              value={otherCategorySpec}
              onChange={(e) => setOtherCategorySpec(e.target.value)}
              placeholder="e.g. Forgeron traditionnel, Traiteur beignets..."
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
            />
            <p className="text-[9px] text-amber-800/60 font-medium">
              * {lang === "fr" ? "La saisie d'un autre service l'envoie dans la liste d'attente d'approbation administrative." : "Adding another specialty will place it in the admin category-review queue."}
            </p>
          </div>
            </>
          )}
        </div>
      )}

      {/* STEP 3: Location on Map */}
      {step === 3 && (
        <div className="space-y-4 animate-fade-in">
          <div>
            <h4 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
              {lang === "fr" ? "Votre localisation précise à Bertoua" : "Your Exact Location in Bertoua"}
            </h4>
            <p className="text-[11px] text-amber-800/80 font-serif">
              {lang === "fr"
                ? "Cliquez sur la carte pour placer votre repère d'activité. Sélectionnez aussi votre quartier structuré."
                : "Click on the map to place your business pin. Also choose your structured neighborhood."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Quartier de référence" : "Neighborhood reference"}
              </label>
              <select
                value={useFreeTextNeighborhood ? OTHER_NEIGHBORHOOD_VALUE : neighborhoodId}
                onChange={(e) => {
                  if (e.target.value === OTHER_NEIGHBORHOOD_VALUE) {
                    setUseFreeTextNeighborhood(true);
                  } else {
                    setUseFreeTextNeighborhood(false);
                    setNeighborhoodId(e.target.value);
                  }
                }}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              >
                {BERTOUA_NEIGHBORHOODS.map((nh) => (
                  <option key={nh.id} value={nh.id}>
                    {nh.name}
                  </option>
                ))}
                <option value={OTHER_NEIGHBORHOOD_VALUE}>
                  {lang === "fr" ? "Autre (taper mon quartier)" : "Other (type my neighborhood)"}
                </option>
              </select>
              {useFreeTextNeighborhood && (
                <input
                  type="text"
                  value={neighborhoodFreeText}
                  onChange={(e) => setNeighborhoodFreeText(e.target.value)}
                  placeholder={lang === "fr" ? "Nom de votre quartier" : "Your neighborhood name"}
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800 mt-1.5"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Ville / Village" : "City / Village"}
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              />
            </div>
          </div>

          {/* Real Interactive Map (Leaflet + OpenStreetMap) */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Carte Interactive de Bertoua" : "Interactive Map of Bertoua"}
            </span>
            <p className="text-[10px] text-amber-800/70 font-serif">
              {lang === "fr"
                ? "Cliquez sur la carte ou déplacez le repère ambré pour ajuster votre position exacte."
                : "Click on the map or drag the amber pin to fine-tune your exact position."}
            </p>
            <BertouaMap lat={gpsCoords.lat} lng={gpsCoords.lng} onChange={handleMapClick} lang={lang} />
            <div className="flex justify-between items-center text-[10px] text-amber-800 font-medium font-mono">
              <span>Latitude: {gpsCoords.lat.toFixed(5)}</span>
              <span>Longitude: {gpsCoords.lng.toFixed(5)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Adresse Physique (Texte)" : "Physical Address / Landmarks"}
            </label>
            <input
              ref={textAddressRef}
              type="text"
              value={textAddress}
              onChange={(e) => setTextAddress(e.target.value)}
              placeholder="e.g. En face de la Boulangerie du Centre, à côté du tailleur"
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-800"
            />
          </div>
        </div>
      )}

      {/* STEP 4: Contact & Socials */}
      {step === 4 && (
        <div className="space-y-4 animate-fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Téléphone Mobile Money (+237)" : "Mobile Money Phone (+237)"}
              </label>
              <input
                ref={contactPhoneRef}
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+237 6xx xx xx xx"
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Numéro WhatsApp (+237)" : "WhatsApp Number (+237)"}
              </label>
              <input
                ref={whatsappNumberRef}
                type="tel"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+237 6xx xx xx xx"
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Adresse Email (Optionnelle)" : "Email Address (Optional)"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. solange@gmail.com"
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-amber-50">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Lien Facebook (Optionnel)" : "Facebook Profile (Optional)"}
              </label>
              <input
                type="url"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                placeholder="https://facebook.com/..."
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Lien LinkedIn (Optionnel)" : "LinkedIn Profile (Optional)"}
              </label>
              <input
                type="url"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/..."
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Pricing Setup */}
      {step === 5 && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between p-4 bg-[#FAF8F5] border border-amber-200 rounded-2xl">
            <div className="space-y-0.5">
              <span className="font-bold text-xs text-amber-950 block">
                {lang === "fr" ? "Afficher mes Tarifs" : "Display Pricing on Profile"}
              </span>
              <p className="text-[10px] text-amber-800/80 font-serif">
                {lang === "fr"
                  ? "Si activé, votre tarif de base est affiché. Sinon, le badge 'Sur devis' apparaîtra."
                  : "If active, your base pricing is visible. Otherwise, a 'Contact for quote' badge shows."}
              </p>
            </div>
            <button
              onClick={() => setDisplayPricing(!displayPricing)}
              className={`w-12 h-6.5 rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                displayPricing ? "bg-amber-800" : "bg-amber-200"
              }`}
            >
              <div
                className={`w-5.5 h-5.5 bg-white rounded-full shadow-md transform transition-transform ${
                  displayPricing ? "translate-x-5.5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {displayPricing ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5 border border-amber-100 rounded-2xl bg-amber-50/20">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Tarif Minimum Souhaité (FCFA)" : "Minimum Rate (FCFA)"}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={rateFCFA}
                    onChange={(e) => setRateFCFA(e.target.value)}
                    placeholder="e.g. 5000"
                    className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl pl-10 pr-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
                  />
                  <DollarSign className="w-4 h-4 text-amber-700 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                  {lang === "fr" ? "Unité de facturation" : "Rate Unit"}
                </label>
                <select
                  value={rateUnit}
                  onChange={(e) => setRateUnit(e.target.value)}
                  className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
                >
                  <option value="jour">Jour / Day</option>
                  <option value="heure">Heure / Hour</option>
                  <option value="course">Course / Ride</option>
                  <option value="tâche">Tâche / Task</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="p-10 border border-dashed border-amber-200 rounded-2xl text-center bg-amber-50/10">
              <span className="inline-block bg-amber-100 border border-amber-200 px-3.5 py-1.5 rounded-full text-xs font-black text-amber-950 uppercase tracking-wider">
                {lang === "fr" ? "💬 Sur Devis / Contact for Quote" : "💬 Contact for Quote"}
              </span>
              <p className="text-[11px] text-amber-800/80 font-serif mt-3 max-w-sm mx-auto">
                {lang === "fr"
                  ? "Les clients vous contacteront directement pour convenir d'un montant après évaluation de la tâche."
                  : "Clients will call or text to agree on a custom price block once they discuss requirements."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* STEP 6: Media Uploads */}
      {step === 6 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h4 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
              {lang === "fr" ? "Photos de Profil et bannières publicitaires" : "Profile & Banner Media Gallery"}
            </h4>
            <p className="text-[11px] text-amber-800/80 font-serif">
              {lang === "fr"
                ? "Téléchargez votre photo de profil ainsi qu'une bannière de présentation (flyer). Les fichiers sont compressés avant l'envoi."
                : "Upload your business avatar and flyer. Images are automatically compressed to save data speeds."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Avatar block */}
            <div className="border border-amber-100 p-5 rounded-2xl bg-[#FAF8F5] flex flex-col items-center text-center space-y-4">
              <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Photo de Profil" : "Profile Photo / Logo"}
              </span>
              <div className="w-20 h-20 bg-amber-50 border border-amber-200/60 rounded-full flex items-center justify-center overflow-hidden shadow-inner relative">
                {avatarFile ? (
                  <img
                    src={URL.createObjectURL(avatarFile)}
                    alt="avatar"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <User className="w-8 h-8 text-amber-800/60" />
                )}
              </div>
              <label className="px-4 py-2 border border-amber-300 hover:bg-amber-100/40 text-amber-950 font-bold text-[11px] rounded-xl cursor-pointer transition-colors block">
                <Upload className="w-3.5 h-3.5 inline mr-1 text-amber-800" />
                {lang === "fr" ? "Choisir Photo" : "Select Avatar"}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setAvatarFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>

            {/* Banner/Flyer block */}
            <div className="border border-amber-100 p-5 rounded-2xl bg-[#FAF8F5] flex flex-col items-center text-center space-y-4">
              <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
                {lang === "fr" ? "Bannière / Flyer d'activité (optionnel)" : "Banner / Activity Flyer (optional)"}
              </span>
              <div className="w-full h-20 bg-amber-50 border border-amber-200/60 rounded-xl flex items-center justify-center overflow-hidden shadow-inner relative">
                {bannerFile ? (
                  <img
                    src={URL.createObjectURL(bannerFile)}
                    alt="banner"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImageIcon className="w-8 h-8 text-amber-800/60" />
                )}
              </div>
              <label className="px-4 py-2 border border-amber-300 hover:bg-amber-100/40 text-amber-950 font-bold text-[11px] rounded-xl cursor-pointer transition-colors block">
                <Upload className="w-3.5 h-3.5 inline mr-1 text-amber-800" />
                {lang === "fr" ? "Choisir Flyer" : "Select Flyer"}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setBannerFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* STEP 7: ID Verification */}
      {step === 7 && (
        <div className="space-y-4 animate-fade-in">
          <div className="bg-amber-900 text-amber-50 p-4 rounded-2xl flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-xs uppercase tracking-wide block text-amber-300">
                {lang === "fr" ? "Coffre Privé de Vérification" : "Private Secure Verification Locker"}
              </span>
              <p className="text-[10px] text-amber-100 leading-relaxed font-serif">
                {lang === "fr"
                  ? "Vos images d'identité sont enregistrées dans un compartiment d'archivage hautement sécurisé lisible exclusivement par l'administration. Elle n'apparaîtra pas sur votre profil public."
                  : "Your ID images are stored in an encrypted private bucket, readable only by One Village administrators. It will never be shown publicly."}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Numéro Unique de CNI / National ID Number" : "National ID Number (CNI)"}
            </label>
            <input
              ref={idNumberRef}
              type="text"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder="e.g. 102394751 (9 ou 17 chiffres)"
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none font-mono"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="border border-amber-100 p-4 rounded-xl bg-[#FAF8F5] text-center space-y-3">
              <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                {lang === "fr" ? "CNI Recto (Face)" : "ID Card (Front)"}
              </span>
              <div className="h-28 bg-amber-50 border border-amber-200/50 rounded-xl flex items-center justify-center overflow-hidden">
                {idFrontFile ? (
                  <img
                    src={URL.createObjectURL(idFrontFile)}
                    alt="id-front"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <FileText className="w-8 h-8 text-amber-800/40" />
                )}
              </div>
              <label className="px-3.5 py-1.5 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
                {lang === "fr" ? "Télécharger Face" : "Upload Front"}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setIdFrontFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>

            <div className="border border-amber-100 p-4 rounded-xl bg-[#FAF8F5] text-center space-y-3">
              <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
                {lang === "fr" ? "CNI Verso (Dos)" : "ID Card (Back)"}
              </span>
              <div className="h-28 bg-amber-50 border border-amber-200/50 rounded-xl flex items-center justify-center overflow-hidden">
                {idBackFile ? (
                  <img
                    src={URL.createObjectURL(idBackFile)}
                    alt="id-back"
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <FileText className="w-8 h-8 text-amber-800/40" />
                )}
              </div>
              <label className="px-3.5 py-1.5 border border-amber-300 hover:bg-amber-100 text-[10px] font-bold rounded-lg cursor-pointer transition-all inline-block">
                {lang === "fr" ? "Télécharger Dos" : "Upload Back"}
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setIdBackFile(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* STEP 8: Review & Submit */}
      {step === 8 && (
        <div className="space-y-5 animate-fade-in">
          <div>
            <h4 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
              {lang === "fr" ? "Vérification Finale des Informations" : "Final Review of Your Profile"}
            </h4>
            <p className="text-[11px] text-amber-800/80 font-serif">
              {lang === "fr"
                ? "Relisez attentivement vos coordonnées avant d'envoyer votre profil à l'équipe de validation."
                : "Review your information carefully before submitting your profile for validation."}
            </p>
          </div>

          <div className="border border-amber-100 rounded-2xl bg-[#FAF8F5] p-5 space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 border-b border-amber-100/50 pb-3">
              <div>
                <span className="text-amber-800/60 font-medium block">Nom de l'Activité:</span>
                <span className="font-bold text-amber-950">{businessName || fullName}</span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Catégorie Principale:</span>
                <span className="font-bold text-amber-950">
                  {isOtherCategory
                    ? `${otherCategoryName || "—"} (${lang === "fr" ? "en attente d'approbation" : "pending approval"})`
                    : (() => {
                        const builtIn = CATEGORY_DETAILS[mainCategory as ServiceCategory] as { nameFR: string; nameEN: string } | undefined;
                        const live = allCategories.find((c) => c.slug === mainCategory);
                        return lang === "fr" ? (builtIn?.nameFR || live?.nameFr || mainCategory) : (builtIn?.nameEN || live?.nameEn || mainCategory);
                      })()}
                </span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Quartier à Bertoua:</span>
                <span className="font-bold text-amber-950">
                  {useFreeTextNeighborhood ? toTitleCase(neighborhoodFreeText) : BERTOUA_NEIGHBORHOODS.find((n) => n.id === neighborhoodId)?.name} ({city})
                </span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Tarif de Service:</span>
                <span className="font-bold text-amber-950 font-mono">
                  {displayPricing ? `${rateFCFA} F / ${rateUnit}` : "Sur Devis / Quote"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 border-b border-amber-100/50 pb-3">
              <div>
                <span className="text-amber-800/60 font-medium block">Téléphone de Contact:</span>
                <span className="font-bold text-amber-950 font-mono">{contactPhone}</span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Numéro WhatsApp:</span>
                <span className="font-bold text-amber-950 font-mono">{whatsappNumber}</span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Numéro CNI / ID Card:</span>
                <span className="font-bold text-amber-950 font-mono">{idNumber}</span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Services secondaires:</span>
                <span className="font-bold text-amber-950">
                  {selectedSubCategories.join(", ") || "Aucun / None"}
                </span>
              </div>
            </div>

            <div>
              <span className="text-amber-800/60 font-medium block mb-1">Description (Français):</span>
              <p className="font-serif leading-relaxed text-amber-900 bg-white border border-amber-100 p-3 rounded-xl italic">
                "{descriptionFR}"
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            className="w-full sm:w-auto border border-amber-300 hover:bg-amber-100/40 text-amber-950 font-bold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4 text-amber-800" />
            {lang === "fr" ? "Télécharger le résumé PDF" : "Download PDF Summary"}
          </button>
        </div>
      )}

      {/* ACTIONS FOOTER */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-amber-50">
        <button
          onClick={step === 1 ? onCancel : handlePrev}
          disabled={submitting || uploadingMedia}
          className="px-4 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {step === 1 ? (lang === "fr" ? "Annuler" : "Cancel") : (lang === "fr" ? "Retour" : "Back")}
        </button>

        {step < 8 ? (
          <button
            onClick={handleNext}
            disabled={uploadingMedia}
            className="bg-amber-800 hover:bg-amber-900 text-white font-black text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {uploadingMedia ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Chargement...
              </>
            ) : (
              <>
                {lang === "fr" ? "Continuer" : "Next"}
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleSubmitRegistration}
            disabled={submitting}
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-6 py-3 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enregistrement...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                {lang === "fr" ? "Soumettre pour Vérification" : "Submit for Verification"}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
