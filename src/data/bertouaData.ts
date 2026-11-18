/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServiceCategory, ServiceProvider, Neighborhood, CommunityAd } from "../types.ts";

export const CATEGORY_DETAILS: Record<
  ServiceCategory,
  { nameFR: string; nameEN: string; icon: string; descriptionFR: string; descriptionEN: string; color: string }
> = {
  [ServiceCategory.AGRICULTURE]: {
    nameFR: "Agriculture & Élevage",
    nameEN: "Agriculture & Farming",
    icon: "Sprout",
    descriptionFR: "Labour, récoltes, conseils de culture, soins du bétail",
    descriptionEN: "Tilling, harvesting, crop advice, livestock care",
    color: "emerald",
  },
  [ServiceCategory.TRANSPORT]: {
    nameFR: "Transport & Moto-Taxi",
    nameEN: "Transport & Moto-Taxi",
    icon: "Bike",
    descriptionFR: "Déplacements rapides en ville, livraison de colis ou transport de marchandises",
    descriptionEN: "Quick trips around town, parcel delivery or goods transport",
    color: "amber",
  },
  [ServiceCategory.HOME_HELP]: {
    nameFR: "Aide à domicile & Ménage",
    nameEN: "Home Help & Cleaning",
    icon: "Home",
    descriptionFR: "Lessive, nettoyage, cuisine traditionnelle de l'Est",
    descriptionEN: "Laundry, house cleaning, traditional Eastern cuisine cooking",
    color: "blue",
  },
  [ServiceCategory.CHILDCARE]: {
    nameFR: "Garde d'enfants",
    nameEN: "Childcare",
    icon: "Baby",
    descriptionFR: "Garde d'enfants après l'école, accompagnement, jeux",
    descriptionEN: "After-school childcare, school runs, entertainment",
    color: "purple",
  },
  [ServiceCategory.CONSTRUCTION]: {
    nameFR: "Bâtiment & Maçonnerie",
    nameEN: "Building & Masonry",
    icon: "Hammer",
    descriptionFR: "Maçonnerie, charpente, plomberie, électricité, briques de terre stabilisée",
    descriptionEN: "Masonry, carpentry, plumbing, electricity, stabilized soil bricks",
    color: "orange",
  },
  [ServiceCategory.TAILORING]: {
    nameFR: "Couture & Mode",
    nameEN: "Tailoring & Fashion",
    icon: "Scissors",
    descriptionFR: "Création de pagnes, confection de tenues traditionnelles, retouches",
    descriptionEN: "Pagne dressmaking, traditional attire tailoring, alterations",
    color: "rose",
  },
  [ServiceCategory.EDUCATION]: {
    nameFR: "Soutien Scolaire",
    nameEN: "School Tutoring",
    icon: "GraduationCap",
    descriptionFR: "Cours de répétition primaire/secondaire, préparation d'examens",
    descriptionEN: "Primary/secondary tutoring, homework help, exam prep",
    color: "indigo",
  },
  [ServiceCategory.HEALTH]: {
    nameFR: "Santé & Soins Traditionnels",
    nameEN: "Health & Traditional Care",
    icon: "HeartPulse",
    descriptionFR: "Soins infirmiers à domicile, phytothérapie locale, massages",
    descriptionEN: "Home nursing care, local phytotherapy, therapeutic massages",
    color: "teal",
  },
};

export const BERTOUA_NEIGHBORHOODS: Neighborhood[] = [
  { id: "mokolo", name: "Mokolo", description: "Quartier historique et animé de Bertoua, proche du grand marché." },
  { id: "tigaza", name: "Tigaza", description: "Secteur résidentiel et administratif paisible, très accessible." },
  { id: "ndouan", name: "Ndouan", description: "Quartier à vocation résidentielle et agricole, chaleureux." },
  { id: "enia", name: "Enia", description: "District dynamique en pleine expansion avec une forte vie associative." },
  { id: "kano", name: "Kano", description: "Carrefour commercial stratégique, idéal pour le commerce et le transport." },
  { id: "gbazi", name: "Gbazi", description: "Zone périphérique paisible, réputée pour ses maraîchers et son calme." },
  { id: "yademe", name: "Yademe", description: "Proche des centres scolaires et universitaires, quartier jeune." },
  { id: "tengue", name: "Tengue", description: "Secteur d'artisans, chaud et soudé autour de ses traditions." },
  { id: "nkolbikon", name: "Nkolbikon", description: "Quartier résidentiel calme au nord de la ville, proche des services administratifs." },
  { id: "madagascar", name: "Madagascar", description: "Zone populaire et commerçante, connue pour son marché de quartier animé." },
  { id: "sic", name: "Camp SIC", description: "Cité résidentielle planifiée, prisée pour son calme et ses habitations modernes." },
  { id: "nkolaba", name: "Nkolaba", description: "Secteur en expansion à la périphérie, mélange d'habitations et de petites exploitations." },
  { id: "haoussa", name: "Quartier Haoussa", description: "Zone commerçante animée, réputée pour ses échoppes et son artisanat." },
  { id: "zokoe", name: "Zokoé", description: "Quartier excentré et paisible, apprécié pour l'agriculture de proximité." },
  { id: "nkolinda", name: "Nkolinda", description: "Secteur résidentiel en développement proche des grands axes routiers." },
  { id: "aviation", name: "Aviation", description: "Quartier proche de l'aéroport de Bertoua, résidentiel et bien desservi." },
  { id: "koume", name: "Koumé", description: "Quartier résidentiel en développement, apprécié pour son calme et sa proximité avec la nature." },
  { id: "bonis", name: "Bonis", description: "Secteur populaire connu pour son dynamisme commercial de proximité." },
  { id: "ndoumbi", name: "Ndoumbi", description: "Zone résidentielle excentrée, prisée pour ses grandes parcelles et son calme." },
  { id: "ekounou", name: "Ékounou", description: "Quartier en pleine croissance, mélange d'habitations et de petites activités commerçantes." },
  { id: "nyangaza", name: "Nyangaza", description: "Secteur périphérique paisible, à vocation résidentielle et agricole." },
  { id: "dabadji", name: "Dabadji", description: "Quartier traditionnel convivial, connu pour sa vie communautaire animée." },
  { id: "mandjou", name: "Mandjou", description: "Zone stratégique en bordure de route nationale, avec un fort passage commercial." },
  { id: "kpoklota", name: "Kpoklota", description: "Secteur résidentiel tranquille à la périphérie de Bertoua." },
  { id: "ngaikada", name: "Ngaikada", description: "Quartier populaire connu pour son marché de proximité et son ambiance chaleureuse." },
  { id: "monou", name: "Monou", description: "Zone résidentielle et agricole, appréciée pour son cadre paisible." },
];

// Sub-category (specific trade/job) options shown in ProviderWizard Step 2, grouped under one of
// the 8 top-level ServiceCategory values above. Unlike the top-level categories, these are NOT
// backed by any database table — they're stored as free text in provider_services.subcategory —
// so adding/removing entries here never requires a migration.
export interface SubCategoryOption {
  id: string;
  labelFR: string;
  labelEN: string;
  cat: ServiceCategory;
}

export const SUB_CATEGORIES: SubCategoryOption[] = [
  { id: "plumbing", labelFR: "Plomberie 🚰", labelEN: "Plumbing 🚰", cat: ServiceCategory.CONSTRUCTION },
  { id: "electrical", labelFR: "Électricité ⚡", labelEN: "Electrical ⚡", cat: ServiceCategory.CONSTRUCTION },
  { id: "carpentry", labelFR: "Menuiserie 🪵", labelEN: "Carpentry 🪵", cat: ServiceCategory.CONSTRUCTION },
  { id: "masonry", labelFR: "Maçonnerie 🧱", labelEN: "Masonry 🧱", cat: ServiceCategory.CONSTRUCTION },

  { id: "transport_truck", labelFR: "Camion de transport 🚛", labelEN: "Truck Transport 🚛", cat: ServiceCategory.TRANSPORT },
  { id: "transport_tricycle", labelFR: "Tricycle / Moto-cargo 🛺", labelEN: "Tricycle / Cargo 🛺", cat: ServiceCategory.TRANSPORT },
  { id: "transport_bike", labelFR: "Conducteur Moto-Taxi 🏍️", labelEN: "Moto-Taxi Rider 🏍️", cat: ServiceCategory.TRANSPORT },
  { id: "transport_car", labelFR: "Chauffeur de voiture 🚗", labelEN: "Car Driver 🚗", cat: ServiceCategory.TRANSPORT },
  { id: "delivery_general", labelFR: "Livreur de colis & marchandises 📦", labelEN: "Parcel & Goods Delivery 📦", cat: ServiceCategory.TRANSPORT },

  { id: "cleaning", labelFR: "Ménage & Nettoyage 🧹", labelEN: "Cleaning & Housework 🧹", cat: ServiceCategory.HOME_HELP },
  { id: "dry_cleaning", labelFR: "Blanchisserie / Pressing 🧺", labelEN: "Laundry / Dry cleaning 🧺", cat: ServiceCategory.HOME_HELP },

  { id: "tutoring", labelFR: "Répétiteur primaire/secondaire 📚", labelEN: "Primary/Secondary Tutoring 📚", cat: ServiceCategory.EDUCATION },
  { id: "it_services", labelFR: "Bureautique & Informatique 💻", labelEN: "IT & Office services 💻", cat: ServiceCategory.EDUCATION },
  { id: "computer_repair", labelFR: "Réparateur d'Ordinateurs 🖥️", labelEN: "Computer Repair 🖥️", cat: ServiceCategory.EDUCATION },
  { id: "it_specialist", labelFR: "Spécialiste IT & Réseaux 🌐", labelEN: "IT & Network Specialist 🌐", cat: ServiceCategory.EDUCATION },
  { id: "legal_advice", labelFR: "Conseiller Juridique ⚖️", labelEN: "Legal Adviser ⚖️", cat: ServiceCategory.EDUCATION },

  { id: "farm_labor", labelFR: "Labour & Aide aux champs 🧑‍🌾", labelEN: "Farm labor & Tilling 🧑‍🌾", cat: ServiceCategory.AGRICULTURE },
  { id: "livestock", labelFR: "Soin bétail / Élevage 🐓", labelEN: "Livestock care 🐓", cat: ServiceCategory.AGRICULTURE },

  { id: "childcare", labelFR: "Garde d'enfants à domicile 👶", labelEN: "Home Childcare 👶", cat: ServiceCategory.CHILDCARE },

  { id: "tailoring_dress", labelFR: "Couture Robes & Tenues de fête 👗", labelEN: "Tailoring Dresses & Pagne 👗", cat: ServiceCategory.TAILORING },
  { id: "tailoring_alter", labelFR: "Retouches de vêtements 🪡", labelEN: "Clothing alterations 🪡", cat: ServiceCategory.TAILORING },
  { id: "shoe_repair", labelFR: "Cordonnerie / Réparation de chaussures 👞", labelEN: "Shoe Repair (Cobbler) 👞", cat: ServiceCategory.TAILORING },

  { id: "tech_fridge", labelFR: "Réparateur Frigo & Climatisation ❄️", labelEN: "Fridge & AC Repair ❄️", cat: ServiceCategory.HEALTH },
  { id: "tech_phone", labelFR: "Dépannage Téléphone / Électronique 📱", labelEN: "Phone & Electronics Repair 📱", cat: ServiceCategory.HEALTH },
  { id: "tech_tv", labelFR: "Dépannage Télévision / Radio 📺", labelEN: "TV & Radio troubleshooting 📺", cat: ServiceCategory.HEALTH },
  { id: "nursing_aide", labelFR: "Aide-soignant(e) à domicile 🩺", labelEN: "Home Nursing Aide 🩺", cat: ServiceCategory.HEALTH },

  { id: "delivery_gas", labelFR: "Livraison de Gaz Domestique 🔋", labelEN: "Gas cylinder delivery 🔋", cat: ServiceCategory.TRANSPORT },
  { id: "delivery_wood", labelFR: "Fournisseur de bois de chauffe 🪵", labelEN: "Firewood Delivery 🪵", cat: ServiceCategory.TRANSPORT },

  { id: "trash_collection", labelFR: "Ramassage d'ordures 🗑️", labelEN: "Trash collection 🗑️", cat: ServiceCategory.HOME_HELP },
  { id: "content_creation", labelFR: "Créateur de contenu / Sono / Photo 📸", labelEN: "Content creation / Photo / Sound 📸", cat: ServiceCategory.EDUCATION },
  { id: "buy_sell_gadgets", labelFR: "Vente/Achat Gadgets & Électronique 🔌", labelEN: "Gadgets buy/sell 🔌", cat: ServiceCategory.EDUCATION },
];

export const INITIAL_PROVIDERS: ServiceProvider[] = [
  {
    id: "p1",
    name: "Jean-Pierre Ndouan",
    phone: "+237 677 89 45 12",
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
  },
  {
    id: "p2",
    name: "Alhadji Bouba",
    phone: "+237 699 12 34 56",
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
  },
  {
    id: "p3",
    name: "Maman Solange",
    phone: "+237 655 43 21 09",
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
  },
  {
    id: "p4",
    name: "Abel Dzang",
    phone: "+237 675 32 89 43",
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
  },
  {
    id: "p5",
    name: "Clarisse Belinga",
    phone: "+237 691 54 87 23",
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
  },
  {
    id: "p6",
    name: "Professeur Samuel",
    phone: "+237 670 11 22 33",
    category: ServiceCategory.EDUCATION,
    neighborhoodId: "yademe",
    rateFCFA: 2000,
    rateUnit: "heure",
    description: "Enseignant certifié. Je propose des répétitions de Mathématiques, Physique et Chimie pour élèves de Troisième, Seconde, Première et Terminale.",
    languages: ["FR", "EN"],
    rating: 4.8,
    reviewCount: 29,
    verified: true,
    available: true,
  },
  {
    id: "p7",
    name: "Papa Jacques",
    phone: "+237 694 88 77 66",
    category: ServiceCategory.HEALTH,
    neighborhoodId: "tengue",
    rateFCFA: 4000,
    rateUnit: "tâche",
    description: "Spécialiste de la médecine par les plantes traditionnelles de l'Est. Tisanes pour le bien-être général, massages musculaires pour agriculteurs.",
    languages: ["FR", "Gbaya"],
    rating: 4.5,
    reviewCount: 9,
    verified: false,
    available: true,
  },
];

export const INITIAL_ADS: CommunityAd[] = [
  {
    id: "ad1",
    title: "Urgent : Labour d'un demi-hectare de manioc",
    description: "Recherche agriculteur vigoureux pour préparer la terre avant le retour des pluies la semaine prochaine. Terrain situé près du fleuve à Ndouan.",
    category: ServiceCategory.AGRICULTURE,
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
    category: ServiceCategory.TAILORING,
    neighborhoodId: "yademe",
    authorName: "Directrice Marie-Claire",
    authorPhone: "+237 691 12 87 55",
    budgetFCFA: 40000,
    createdAt: "2026-07-09T08:30:00Z",
    urgency: "MEDIUM",
  },
  {
    id: "ad3",
    title: "Déménagement d'armoires et lits de Tigaza à Mokolo",
    description: "Cherche porteur ou moto-cargo pour déplacer des meubles lourds ce samedi matin. Personnes sérieuses uniquement.",
    category: ServiceCategory.TRANSPORT,
    neighborhoodId: "tigaza",
    authorName: "Benjamin Atangana",
    authorPhone: "+237 655 88 11 00",
    budgetFCFA: 15000,
    createdAt: "2026-07-09T11:00:00Z",
    urgency: "HIGH",
  },
];
