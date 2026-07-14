import React, { useState } from "react";
import { ServiceCategory } from "../types.ts";
import { BERTOUA_NEIGHBORHOODS } from "../data/bertouaData.ts";
import { supabaseService } from "../lib/supabase.ts";
import {
  Sparkles,
  MapPin,
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
} from "lucide-react";

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
  const [mainCategory, setMainCategory] = useState<ServiceCategory>(ServiceCategory.AGRICULTURE);
  const [selectedSubCategories, setSelectedSubCategories] = useState<string[]>([]);
  const [otherCategorySpec, setOtherCategorySpec] = useState("");
  const [transportSubtype, setTransportSubtype] = useState<"truck" | "tricycle" | "bike" | "car" | "">("");

  // Location State
  const [neighborhoodId, setNeighborhoodId] = useState("mokolo");
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

  // Helper to handle client-side compressed image uploads
  const handleFileUpload = async (file: File, bucket: string, setUrl: (url: string) => void) => {
    try {
      const publicUrl = await supabaseService.uploadFile(bucket, file);
      setUrl(publicUrl);
      return publicUrl;
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
        setErrorMsg(lang === "fr" ? "Veuillez fournir une description en français." : "Please provide a description in French.");
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedSubCategories.length === 0 && !otherCategorySpec.trim()) {
        setErrorMsg(lang === "fr" ? "Veuillez choisir au moins une catégorie de service." : "Please select at least one service category.");
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!textAddress.trim()) {
        setErrorMsg(lang === "fr" ? "Veuillez indiquer votre adresse textuelle." : "Please specify your physical address.");
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (!validatePhone(contactPhone)) {
        setErrorMsg(lang === "fr" ? "Format de téléphone incorrect. Doit commencer par +237." : "Incorrect phone format. Must start with +237.");
        return;
      }
      if (!validatePhone(whatsappNumber)) {
        setErrorMsg(lang === "fr" ? "Format WhatsApp incorrect. Doit commencer par +237." : "Incorrect WhatsApp format. Must start with +237.");
        return;
      }
      setStep(5);
    } else if (step === 5) {
      if (displayPricing && (!rateFCFA || Number(rateFCFA) <= 0)) {
        setErrorMsg(lang === "fr" ? "Veuillez entrer un tarif valide en FCFA." : "Please enter a valid rate in FCFA.");
        return;
      }
      setStep(6);
    } else if (step === 6) {
      // Upload media if present before going to ID verification
      setUploadingMedia(true);
      try {
        if (avatarFile && !avatarUrl) {
          await handleFileUpload(avatarFile, "avatars", setAvatarUrl);
        }
        if (bannerFile && !bannerUrl) {
          await handleFileUpload(bannerFile, "banners", setBannerUrl);
        }
      } catch (e) {
        console.error("Media pre-upload failed", e);
      } finally {
        setUploadingMedia(false);
      }
      setStep(7);
    } else if (step === 7) {
      if (!idNumber.trim()) {
        setErrorMsg(lang === "fr" ? "Veuillez saisir votre numéro de carte d'identité." : "Please enter your National ID card number.");
        return;
      }
      if (!idFrontFile && !idFrontUrl) {
        setErrorMsg(lang === "fr" ? "La photo de face de la CNI est requise." : "Front photo of ID card is required.");
        return;
      }
      // Upload ID files
      setUploadingMedia(true);
      try {
        if (idFrontFile && !idFrontUrl) {
          await handleFileUpload(idFrontFile, "id-private", setIdFrontUrl);
        }
        if (idBackFile && !idBackUrl) {
          await handleFileUpload(idBackFile, "id-private", setIdBackUrl);
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
      const categoriesList = [...selectedSubCategories];
      if (otherCategorySpec.trim()) {
        categoriesList.push(`OTHER:${otherCategorySpec.trim()}`);
      }

      const payload = {
        id: userId,
        name: fullName || businessName,
        businessName: businessName || fullName,
        phone: contactPhone,
        whatsappNumber: whatsappNumber,
        email: email,
        category: mainCategory,
        categories: categoriesList,
        otherCategory: otherCategorySpec.trim(),
        transportSubtype: transportSubtype,
        neighborhoodId: neighborhoodId,
        city: city,
        textAddress: textAddress,
        gpsCoords: gpsCoords,
        rateFCFA: displayPricing ? Number(rateFCFA) : 0,
        rateUnit: rateUnit,
        displayPricing: displayPricing,
        description: descriptionFR,
        descriptionFR: descriptionFR,
        descriptionEN: descriptionEN || descriptionFR,
        avatarUrl: avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(businessName)}`,
        bannerUrl: bannerUrl || "",
        idNumber: idNumber,
        idCardFrontUrl: idFrontUrl,
        idCardBackUrl: idBackUrl,
        languages: ["FR", "EN"],
        created_by_admin: isAdminCreating,
        status: "pending",
      };

      const result = await supabaseService.registerProvider(payload);
      
      // Update the user profile as role: provider and onboarding completed
      if (!isAdminCreating) {
        await supabaseService.updateUserProfile({
          fullName: fullName || businessName,
          phone: contactPhone,
          whatsappNumber: whatsappNumber,
          role: "provider",
          onboarding_completed: true,
        });
      }

      onSuccess(result);
    } catch (err: any) {
      console.error("Registration error:", err);
      setErrorMsg(err.message || "Erreur de soumission. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  };

  const subCategoriesList = [
    { id: "plumbing", labelFR: "Plomberie 🚰", labelEN: "Plumbing 🚰", cat: ServiceCategory.CONSTRUCTION },
    { id: "electrical", labelFR: "Électricité ⚡", labelEN: "Electrical ⚡", cat: ServiceCategory.CONSTRUCTION },
    { id: "carpentry", labelFR: "Menuiserie 🪵", labelEN: "Carpentry 🪵", cat: ServiceCategory.CONSTRUCTION },
    { id: "masonry", labelFR: "Maçonnerie 🧱", labelEN: "Masonry 🧱", cat: ServiceCategory.CONSTRUCTION },
    
    { id: "transport_truck", labelFR: "Camion de transport 🚛", labelEN: "Truck Transport 🚛", cat: ServiceCategory.TRANSPORT },
    { id: "transport_tricycle", labelFR: "Tricycle / Moto-cargo 🛺", labelEN: "Tricycle / Cargo 🛺", cat: ServiceCategory.TRANSPORT },
    { id: "transport_bike", labelFR: "Conducteur Moto-Taxi 🏍️", labelEN: "Moto-Taxi Rider 🏍️", cat: ServiceCategory.TRANSPORT },
    { id: "transport_car", labelFR: "Chauffeur de voiture 🚗", labelEN: "Car Driver 🚗", cat: ServiceCategory.TRANSPORT },
    
    { id: "cleaning", labelFR: "Ménage & Nettoyage 🧹", labelEN: "Cleaning & Housework 🧹", cat: ServiceCategory.HOME_HELP },
    { id: "dry_cleaning", labelFR: "Blanchisserie / Pressing 🧺", labelEN: "Laundry / Dry cleaning 🧺", cat: ServiceCategory.HOME_HELP },
    
    { id: "tutoring", labelFR: "Répétiteur primaire/secondaire 📚", labelEN: "Primary/Secondary Tutoring 📚", cat: ServiceCategory.EDUCATION },
    { id: "it_services", labelFR: "Bureautique & Informatique 💻", labelEN: "IT & Office services 💻", cat: ServiceCategory.EDUCATION },
    
    { id: "farm_labor", labelFR: "Labour & Aide aux champs 🧑‍🌾", labelEN: "Farm labor & Tilling 🧑‍🌾", cat: ServiceCategory.AGRICULTURE },
    { id: "livestock", labelFR: "Soin bétail / Élevage 🐓", labelEN: "Livestock care 🐓", cat: ServiceCategory.AGRICULTURE },
    
    { id: "childcare", labelFR: "Garde d'enfants à domicile 👶", labelEN: "Home Childcare 👶", cat: ServiceCategory.CHILDCARE },
    
    { id: "tailoring_dress", labelFR: "Couture Robes & Tenues de fête 👗", labelEN: "Tailoring Dresses & Pagne 👗", cat: ServiceCategory.TAILORING },
    { id: "tailoring_alter", labelFR: "Retouches de vêtements 🪡", labelEN: "Clothing alterations 🪡", cat: ServiceCategory.TAILORING },
    
    { id: "tech_fridge", labelFR: "Réparateur Frigo & Climatisation ❄️", labelEN: "Fridge & AC Repair ❄️", cat: ServiceCategory.HEALTH },
    { id: "tech_phone", labelFR: "Dépannage Téléphone / Électronique 📱", labelEN: "Phone & Electronics Repair 📱", cat: ServiceCategory.HEALTH },
    { id: "tech_tv", labelFR: "Dépannage Télévision / Radio 📺", labelEN: "TV & Radio troubleshooting 📺", cat: ServiceCategory.HEALTH },
    
    { id: "delivery_gas", labelFR: "Livraison de Gaz Domestique 🔋", labelEN: "Gas cylinder delivery 🔋", cat: ServiceCategory.TRANSPORT },
    { id: "delivery_wood", labelFR: "Fournisseur de bois de chauffe 🪵", labelEN: "Firewood Delivery 🪵", cat: ServiceCategory.TRANSPORT },
    
    { id: "trash_collection", labelFR: "Ramassage d'ordures 🗑️", labelEN: "Trash collection 🗑️", cat: ServiceCategory.HOME_HELP },
    { id: "content_creation", labelFR: "Créateur de contenu / Sono / Photo 📸", labelEN: "Content creation / Photo / Sound 📸", cat: ServiceCategory.EDUCATION },
    { id: "buy_sell_gadgets", labelFR: "Vente/Achat Gadgets & Électronique 🔌", labelEN: "Gadgets buy/sell 🔌", cat: ServiceCategory.EDUCATION },
  ];

  const handleSubCategoryToggle = (id: string) => {
    if (selectedSubCategories.includes(id)) {
      setSelectedSubCategories(selectedSubCategories.filter((x) => x !== id));
    } else {
      setSelectedSubCategories([...selectedSubCategories, id]);
    }
  };

  const handleMapClick = (lat: number, lng: number) => {
    setGpsCoords({ lat, lng });
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
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-4 text-xs font-bold flex items-center gap-2">
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
              value={mainCategory}
              onChange={(e) => setMainCategory(e.target.value as ServiceCategory)}
              className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
            >
              {Object.values(ServiceCategory).map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

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
              required
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
        </div>
      )}

      {/* STEP 2: Sub-categories Selection */}
      {step === 2 && (
        <div className="space-y-5 animate-fade-in">
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
                value={neighborhoodId}
                onChange={(e) => setNeighborhoodId(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-950 focus:outline-none"
              >
                {BERTOUA_NEIGHBORHOODS.map((nh) => (
                  <option key={nh.id} value={nh.id}>
                    {nh.name}
                  </option>
                ))}
              </select>
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

          {/* Interactive Map Mockup */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-amber-950 uppercase tracking-wider block">
              {lang === "fr" ? "Carte Interactive de Bertoua" : "Interactive Map of Bertoua"}
            </span>
            <div className="relative h-48 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden cursor-crosshair group shadow-inner">
              {/* Fake abstract map elements representing major landmarks in Bertoua */}
              <div className="absolute top-4 left-6 bg-emerald-100 text-emerald-800 text-[9px] px-2 py-0.5 rounded border border-emerald-200 font-bold">
                Mokolo Market
              </div>
              <div className="absolute bottom-6 right-12 bg-blue-100 text-blue-800 text-[9px] px-2 py-0.5 rounded border border-blue-200 font-bold">
                Tigaza Station
              </div>
              <div className="absolute top-1/2 left-1/3 -translate-y-1/2 bg-orange-100 text-orange-800 text-[9px] px-2 py-0.5 rounded border border-orange-200 font-bold">
                Kano Commercial
              </div>
              <div className="absolute bottom-1/3 left-6 bg-purple-100 text-purple-800 text-[9px] px-2 py-0.5 rounded border border-purple-200 font-bold">
                Ndouan Farmland
              </div>

              {/* Grid line grid */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] bg-[size:1.5rem_1.5rem] opacity-30" />

              {/* Map click listener wrapper */}
              <div
                className="absolute inset-0 z-10"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width) * 100;
                  const y = ((e.clientY - rect.top) / rect.height) * 100;
                  // Map relative cords to Bertoua-like lat/lng
                  const calculatedLat = 4.5772 + (y - 50) * -0.001;
                  const calculatedLng = 13.6826 + (x - 50) * 0.001;
                  handleMapClick(calculatedLat, calculatedLng);
                }}
              />

              {/* Placed PIN representation */}
              <div
                className="absolute z-20 -translate-x-1/2 -translate-y-full transition-all duration-300"
                style={{
                  left: `${((gpsCoords.lng - 13.6826) / 0.001 + 50)}%`,
                  top: `${((gpsCoords.lat - 4.5772) / -0.001 + 50)}%`,
                }}
              >
                <div className="flex flex-col items-center">
                  <div className="bg-amber-800 text-white text-[9px] font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap mb-0.5 flex items-center gap-1">
                    <MapPin className="w-2.5 h-2.5" />
                    Mon Emplacement / My Spot
                  </div>
                  <div className="w-2.5 h-2.5 bg-amber-800 rounded-full border-2 border-white animate-ping absolute bottom-0" />
                  <div className="w-3 h-3 bg-amber-800 rounded-full border-2 border-white" />
                </div>
              </div>
            </div>
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
              type="text"
              required
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
                type="tel"
                required
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
                type="tel"
                required
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
                  accept="image/*"
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
                {lang === "fr" ? "Bannière / Flyer d'activité" : "Banner / Activity Flyer"}
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
                  accept="image/*"
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
              type="text"
              required
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
                  accept="image/*"
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
                  accept="image/*"
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
            <div className="grid grid-cols-2 gap-y-3 border-b border-amber-100/50 pb-3">
              <div>
                <span className="text-amber-800/60 font-medium block">Nom de l'Activité:</span>
                <span className="font-bold text-amber-950">{businessName || fullName}</span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Catégorie Principale:</span>
                <span className="font-bold text-amber-950">{mainCategory}</span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Quartier à Bertoua:</span>
                <span className="font-bold text-amber-950">
                  {BERTOUA_NEIGHBORHOODS.find((n) => n.id === neighborhoodId)?.name} ({city})
                </span>
              </div>
              <div>
                <span className="text-amber-800/60 font-medium block">Tarif de Service:</span>
                <span className="font-bold text-amber-950 font-mono">
                  {displayPricing ? `${rateFCFA} F / ${rateUnit}` : "Sur Devis / Quote"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-y-3 border-b border-amber-100/50 pb-3">
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
        </div>
      )}

      {/* ACTIONS FOOTER */}
      <div className="flex items-center justify-between pt-4 border-t border-amber-50">
        <button
          onClick={step === 1 ? onCancel : handlePrev}
          disabled={submitting || uploadingMedia}
          className="px-4 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {step === 1 ? (lang === "fr" ? "Annuler" : "Cancel") : (lang === "fr" ? "Retour" : "Back")}
        </button>

        {step < 8 ? (
          <button
            onClick={handleNext}
            disabled={uploadingMedia}
            className="bg-amber-800 hover:bg-amber-900 text-white font-black text-xs px-5 py-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
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
            className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs px-6 py-3 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
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
