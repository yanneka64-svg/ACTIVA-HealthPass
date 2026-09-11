import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
  PlusCircle, // === AMÉLIORATION AJOUTÉE : "+" entouré d'un cercle, harmonisé sur toute l'interface ===
  Sliders,
  Edit2,
  Trash2,
  X,
  Building2,
  User,
  Users,
  ShieldCheck,
  Filter,
  Layers,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Check,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  MoreVertical,
  ShieldAlert,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Ceiling, Language, Organization, PeriodicityType } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { ADMIN_THEME } from '../../theme/roleTheme';

interface CeilingsViewProps {
  lang?: Language;
  ceilings: Ceiling[];
  organizations?: Organization[];
  onAddCeiling: (ceiling: Partial<Ceiling>) => void;
  onUpdateCeiling: (ceiling: Ceiling) => void;
  onDeleteCeiling: (id: string) => void;
}

export const ALL_BENEFITS = [
  'Outpatient Consultations',
  'Inpatient Hospitalization',
  'Specialized Dental Care',
  'Optical & Prescription Eyewear',
  'Maternity Care & Delivery',
  'Pharmacy & Prescription Drugs',
  'Laboratory & Diagnostics',
  'Medical Imaging & Radiology',
  'Specialized Care & Rehab',
] as const;

export const CeilingsView: React.FC<CeilingsViewProps> = ({
  lang = 'en' as Language,
  ceilings,
  organizations = [],
  onAddCeiling,
  onUpdateCeiling,
  onDeleteCeiling,
}) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('ALL');
  const [selectedBenefitFilter, setSelectedBenefitFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Age Limits Modal for Quick Policy Age Management
  const [ageLimitsModalOpen, setAgeLimitsModalOpen] = useState(false);
  const [ageLimitsOrg, setAgeLimitsOrg] = useState('');
  const [ageLimitPrincipal, setAgeLimitPrincipal] = useState(65);
  const [ageLimitSpouse, setAgeLimitSpouse] = useState(65);
  const [ageLimitChild, setAgeLimitChild] = useState(21);
  const [ageLimitStudent, setAgeLimitStudent] = useState(25);
  const [ageSavedSuccess, setAgeSavedSuccess] = useState(false);

  // Drawer / Wizard State for New Benefit Limit
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [editingCeilingId, setEditingCeilingId] = useState<string | null>(null);

  // Wizard Step Form State
  const [wizardOrg, setWizardOrg] = useState('');
  const [wizardSelectedBenefits, setWizardSelectedBenefits] = useState<string[]>([
    'Outpatient Consultations',
    'Inpatient Hospitalization',
  ]);
  const [activeLimitsTab, setActiveLimitsTab] = useState<'monthly' | 'annual'>('monthly');

  // Wizard Age Limits state
  const [wizardAgePrincipal, setWizardAgePrincipal] = useState(65);
  const [wizardAgeSpouse, setWizardAgeSpouse] = useState(65);
  const [wizardAgeChild, setWizardAgeChild] = useState(21);
  const [wizardAgeStudent, setWizardAgeStudent] = useState(25);

  // Matrix limit configurations per benefit
  interface BenefitLimitConfig {
    outpatientMonthlyPrincipal: number;
    outpatientMonthlyDependent: number;
    inpatientMonthlyPrincipal: number;
    inpatientMonthlyDependent: number;
    outpatientAnnualPrincipal: number;
    outpatientAnnualDependent: number;
    inpatientAnnualPrincipal: number;
    inpatientAnnualDependent: number;
  }

  const [benefitLimits, setBenefitLimits] = useState<Record<string, BenefitLimitConfig>>({});

  // Default values helper for limits
  const getDefaultLimitsForBenefit = (benefit: string): BenefitLimitConfig => {
    switch (benefit) {
      case 'Inpatient Hospitalization':
        return {
          outpatientMonthlyPrincipal: 0,
          outpatientMonthlyDependent: 0,
          inpatientMonthlyPrincipal: 500,
          inpatientMonthlyDependent: 300,
          outpatientAnnualPrincipal: 0,
          outpatientAnnualDependent: 0,
          inpatientAnnualPrincipal: 10000,
          inpatientAnnualDependent: 6600,
        };
      case 'Specialized Dental Care':
        return {
          outpatientMonthlyPrincipal: 150,
          outpatientMonthlyDependent: 100,
          inpatientMonthlyPrincipal: 0,
          inpatientMonthlyDependent: 0,
          outpatientAnnualPrincipal: 500,
          outpatientAnnualDependent: 350,
          inpatientAnnualPrincipal: 0,
          inpatientAnnualDependent: 0,
        };
      case 'Optical & Prescription Eyewear':
        return {
          outpatientMonthlyPrincipal: 100,
          outpatientMonthlyDependent: 80,
          inpatientMonthlyPrincipal: 0,
          inpatientMonthlyDependent: 0,
          outpatientAnnualPrincipal: 400,
          outpatientAnnualDependent: 300,
          inpatientAnnualPrincipal: 0,
          inpatientAnnualDependent: 0,
        };
      case 'Maternity Care & Delivery':
        return {
          outpatientMonthlyPrincipal: 200,
          outpatientMonthlyDependent: 150,
          inpatientMonthlyPrincipal: 600,
          inpatientMonthlyDependent: 400,
          outpatientAnnualPrincipal: 1200,
          outpatientAnnualDependent: 800,
          inpatientAnnualPrincipal: 3500,
          inpatientAnnualDependent: 2500,
        };
      default: // Outpatient Consultations & others
        return {
          outpatientMonthlyPrincipal: 250,
          outpatientMonthlyDependent: 150,
          inpatientMonthlyPrincipal: 0,
          inpatientMonthlyDependent: 0,
          outpatientAnnualPrincipal: 1000,
          outpatientAnnualDependent: 600,
          inpatientAnnualPrincipal: 0,
          inpatientAnnualDependent: 0,
        };
    }
  };

  // Unique list of organizations
  const availableOrgs = useMemo(() => {
    if (organizations && organizations.length > 0) {
      return organizations;
    }
    const orgNames = Array.from(new Set(ceilings.map((c) => c.organization).filter(Boolean)));
    return orgNames.map((name, idx) => ({
      id: `ORG-${idx + 1}`,
      name: name as string,
      policyNumber: `POL-2026-${idx + 1}`,
      effectiveDate: '2026-01-01',
      expirationDate: '2026-12-31',
      declaredMembers: 500,
      coverageRate: 85,
      status: 'Actif' as const,
      contactEmail: 'contact@org.com',
      contactPhone: '+231 777 000',
    }));
  }, [organizations, ceilings]);

  // Unique list of benefit names
  const availableBenefits = useMemo(() => {
    const fromCeilings = ceilings.map((c) => c.careType || c.serviceCategory).filter(Boolean) as string[];
    const set = new Set([...ALL_BENEFITS, ...fromCeilings]);
    return Array.from(set);
  }, [ceilings]);

  // Filtered ceilings
  const filteredCeilings = useMemo(() => {
    return ceilings.filter((c) => {
      const term = searchTerm.toLowerCase().trim();
      const benefitName = c.careType || c.serviceCategory || '';
      const orgName = c.organization || '';

      const matchesSearch =
        !term ||
        benefitName.toLowerCase().includes(term) ||
        orgName.toLowerCase().includes(term);

      const matchesOrg =
        selectedOrgFilter === 'ALL' ||
        c.organization === selectedOrgFilter ||
        c.organizationId === selectedOrgFilter;

      const matchesBenefit =
        selectedBenefitFilter === 'ALL' ||
        benefitName === selectedBenefitFilter ||
        c.serviceCategory === selectedBenefitFilter;

      return matchesSearch && matchesOrg && matchesBenefit;
    });
  }, [ceilings, searchTerm, selectedOrgFilter, selectedBenefitFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredCeilings.length / itemsPerPage));
  const paginatedCeilings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCeilings.slice(start, start + itemsPerPage);
  }, [filteredCeilings, currentPage, itemsPerPage]);

  // Benefit badge styling
  const getBenefitBadgeStyle = (name: string) => {
    if (name.includes('Outpatient')) {
      return 'bg-blue-50 text-blue-800 border-blue-200';
    }
    if (name.includes('Inpatient') || name.includes('Hospital')) {
      return 'bg-indigo-50 text-indigo-800 border-indigo-200';
    }
    if (name.includes('Dental')) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    if (name.includes('Optical') || name.includes('Eyewear')) {
      return 'bg-purple-50 text-purple-800 border-purple-200';
    }
    if (name.includes('Maternity')) {
      return 'bg-rose-50 text-rose-800 border-rose-200';
    }
    if (name.includes('Pharmacy') || name.includes('Drug')) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  // Open Wizard for new benefit limit
  const openNewBenefitLimitWizard = () => {
    setEditingCeilingId(null);
    const initialOrg =
      selectedOrgFilter !== 'ALL'
        ? selectedOrgFilter
        : availableOrgs[0]?.name || 'TotalEnergies Liberia Ltd';
    setWizardOrg(initialOrg);
    setWizardSelectedBenefits(['Outpatient Consultations', 'Inpatient Hospitalization']);

    // Pre-populate age limits from org ceiling if available
    const existingOrgCeiling = ceilings.find((c) => c.organization === initialOrg);
    setWizardAgePrincipal(existingOrgCeiling?.maxAgePrincipal ?? 65);
    setWizardAgeSpouse(existingOrgCeiling?.maxAgeSpouse ?? 65);
    setWizardAgeChild(existingOrgCeiling?.maxAgeChild ?? 21);
    setWizardAgeStudent(existingOrgCeiling?.maxAgeStudent ?? 25);

    const initialLimits: Record<string, BenefitLimitConfig> = {};
    ['Outpatient Consultations', 'Inpatient Hospitalization'].forEach((b) => {
      initialLimits[b] = getDefaultLimitsForBenefit(b);
    });
    setBenefitLimits(initialLimits);
    setWizardStep(1);
    setWizardOpen(true);
  };

  // Open Wizard to edit an existing ceiling
  const openEditCeilingModal = (c: Ceiling) => {
    setEditingCeilingId(c.id);
    const org = c.organization || availableOrgs[0]?.name || 'TotalEnergies Liberia Ltd';
    const benefitName = c.careType || c.serviceCategory || 'Outpatient Consultations';
    setWizardOrg(org);
    setWizardSelectedBenefits([benefitName]);

    setWizardAgePrincipal(c.maxAgePrincipal ?? 65);
    setWizardAgeSpouse(c.maxAgeSpouse ?? 65);
    setWizardAgeChild(c.maxAgeChild ?? 21);
    setWizardAgeStudent(c.maxAgeStudent ?? 25);

    const isOutpatient = !benefitName.toLowerCase().includes('inpatient');
    const existingConfig: BenefitLimitConfig = {
      outpatientMonthlyPrincipal:
        c.outpatientMonthlyPrincipal ?? (isOutpatient ? c.monthlyLimit || 250 : 0),
      outpatientMonthlyDependent:
        c.outpatientMonthlyDependent ?? (isOutpatient ? Math.round((c.monthlyLimit || 250) * 0.6) : 0),
      inpatientMonthlyPrincipal:
        c.inpatientMonthlyPrincipal ?? (!isOutpatient ? c.monthlyLimit || 500 : 0),
      inpatientMonthlyDependent:
        c.inpatientMonthlyDependent ?? (!isOutpatient ? Math.round((c.monthlyLimit || 500) * 0.6) : 0),
      outpatientAnnualPrincipal:
        c.outpatientAnnualPrincipal ?? (isOutpatient ? c.individualLimit || 1000 : 0),
      outpatientAnnualDependent:
        c.outpatientAnnualDependent ?? (isOutpatient ? Math.round((c.individualLimit || 1000) * 0.6) : 0),
      inpatientAnnualPrincipal:
        c.inpatientAnnualPrincipal ?? (!isOutpatient ? c.individualLimit || 10000 : 0),
      inpatientAnnualDependent:
        c.inpatientAnnualDependent ?? (!isOutpatient ? Math.round((c.individualLimit || 10000) * 0.66) : 0),
    };

    setBenefitLimits({ [benefitName]: existingConfig });
    setWizardStep(2);
    setWizardOpen(true);
  };

  // Open Age Limits Quick Editor Modal
  const openAgeLimitsModal = (orgName?: string) => {
    const targetOrg = orgName || (selectedOrgFilter !== 'ALL' ? selectedOrgFilter : availableOrgs[0]?.name || 'TotalEnergies Liberia Ltd');
    setAgeLimitsOrg(targetOrg);
    const existingCeiling = ceilings.find((c) => c.organization === targetOrg);
    setAgeLimitPrincipal(existingCeiling?.maxAgePrincipal ?? 65);
    setAgeLimitSpouse(existingCeiling?.maxAgeSpouse ?? 65);
    setAgeLimitChild(existingCeiling?.maxAgeChild ?? 21);
    setAgeLimitStudent(existingCeiling?.maxAgeStudent ?? 25);
    setAgeSavedSuccess(false);
    setAgeLimitsModalOpen(true);
  };

  // Save Age Limits across ceilings for this organization
  const handleSaveAgeLimits = () => {
    const orgCeilings = ceilings.filter((c) => c.organization === ageLimitsOrg);
    if (orgCeilings.length > 0) {
      orgCeilings.forEach((c) => {
        onUpdateCeiling({
          ...c,
          maxAgePrincipal: ageLimitPrincipal,
          maxAgeSpouse: ageLimitSpouse,
          maxAgeChild: ageLimitChild,
          maxAgeStudent: ageLimitStudent,
        });
      });
    } else {
      // If no ceiling entry exists for this organization yet, create a baseline rule
      onAddCeiling({
        organization: ageLimitsOrg,
        careType: 'Outpatient Consultations',
        serviceCategory: 'Outpatient Consultations',
        maxAgePrincipal: ageLimitPrincipal,
        maxAgeSpouse: ageLimitSpouse,
        maxAgeChild: ageLimitChild,
        maxAgeStudent: ageLimitStudent,
        monthlyLimit: 250,
        individualLimit: 1000,
        familyLimit: 3000,
        periodicity: 'Annual',
        consumedPercentage: 15,
      });
    }

    setAgeSavedSuccess(true);
    setTimeout(() => {
      setAgeLimitsModalOpen(false);
      setAgeSavedSuccess(false);
    }, 1200);
  };

  // Toggle benefit selection in Step 2
  const toggleBenefitSelection = (benefit: string) => {
    if (wizardSelectedBenefits.includes(benefit)) {
      if (wizardSelectedBenefits.length > 1) {
        setWizardSelectedBenefits(wizardSelectedBenefits.filter((b) => b !== benefit));
      }
    } else {
      setWizardSelectedBenefits([...wizardSelectedBenefits, benefit]);
      if (!benefitLimits[benefit]) {
        setBenefitLimits((prev) => ({
          ...prev,
          [benefit]: getDefaultLimitsForBenefit(benefit),
        }));
      }
    }
  };

  // Update limit field for a specific benefit
  const handleLimitChange = (
    benefit: string,
    field: keyof BenefitLimitConfig,
    value: number
  ) => {
    setBenefitLimits((prev) => {
      const current = prev[benefit] || getDefaultLimitsForBenefit(benefit);
      return {
        ...prev,
        [benefit]: {
          ...current,
          [field]: Math.max(0, value),
        },
      };
    });
  };

  // Save wizard configuration
  const handleSaveWizard = () => {
    const targetOrgObj = availableOrgs.find((o) => o.name === wizardOrg || o.id === wizardOrg);
    const orgName = targetOrgObj ? targetOrgObj.name : wizardOrg;
    const orgId = targetOrgObj ? targetOrgObj.id : undefined;

    if (editingCeilingId) {
      const benefitName = wizardSelectedBenefits[0];
      const limits = benefitLimits[benefitName] || getDefaultLimitsForBenefit(benefitName);
      const isOutpatient = !benefitName.toLowerCase().includes('inpatient');

      const updated: Ceiling = {
        id: editingCeilingId,
        organization: orgName,
        organizationId: orgId,
        careType: benefitName,
        serviceCategory: benefitName,
        maxAgePrincipal: wizardAgePrincipal,
        maxAgeSpouse: wizardAgeSpouse,
        maxAgeChild: wizardAgeChild,
        maxAgeStudent: wizardAgeStudent,
        outpatientMonthlyPrincipal: limits.outpatientMonthlyPrincipal,
        outpatientMonthlyDependent: limits.outpatientMonthlyDependent,
        inpatientMonthlyPrincipal: limits.inpatientMonthlyPrincipal,
        inpatientMonthlyDependent: limits.inpatientMonthlyDependent,
        outpatientAnnualPrincipal: limits.outpatientAnnualPrincipal,
        outpatientAnnualDependent: limits.outpatientAnnualDependent,
        inpatientAnnualPrincipal: limits.inpatientAnnualPrincipal,
        inpatientAnnualDependent: limits.inpatientAnnualDependent,
        monthlyLimit: isOutpatient ? limits.outpatientMonthlyPrincipal : limits.inpatientMonthlyPrincipal,
        individualLimit: isOutpatient ? limits.outpatientAnnualPrincipal : limits.inpatientAnnualPrincipal,
        familyLimit: (isOutpatient ? limits.outpatientAnnualPrincipal : limits.inpatientAnnualPrincipal) * 3,
        periodicity: 'Annual',
      };
      onUpdateCeiling(updated);
    } else {
      // Create new ceiling entries for each selected benefit
      wizardSelectedBenefits.forEach((benefitName) => {
        const limits = benefitLimits[benefitName] || getDefaultLimitsForBenefit(benefitName);
        const isOutpatient = !benefitName.toLowerCase().includes('inpatient');

        const newCeiling: Partial<Ceiling> = {
          organization: orgName,
          organizationId: orgId,
          careType: benefitName,
          serviceCategory: benefitName,
          maxAgePrincipal: wizardAgePrincipal,
          maxAgeSpouse: wizardAgeSpouse,
          maxAgeChild: wizardAgeChild,
          maxAgeStudent: wizardAgeStudent,
          outpatientMonthlyPrincipal: limits.outpatientMonthlyPrincipal,
          outpatientMonthlyDependent: limits.outpatientMonthlyDependent,
          inpatientMonthlyPrincipal: limits.inpatientMonthlyPrincipal,
          inpatientMonthlyDependent: limits.inpatientMonthlyDependent,
          outpatientAnnualPrincipal: limits.outpatientAnnualPrincipal,
          outpatientAnnualDependent: limits.outpatientAnnualDependent,
          inpatientAnnualPrincipal: limits.inpatientAnnualPrincipal,
          inpatientAnnualDependent: limits.inpatientAnnualDependent,
          monthlyLimit: isOutpatient ? limits.outpatientMonthlyPrincipal : limits.inpatientMonthlyPrincipal,
          individualLimit: isOutpatient ? limits.outpatientAnnualPrincipal : limits.inpatientAnnualPrincipal,
          familyLimit: (isOutpatient ? limits.outpatientAnnualPrincipal : limits.inpatientAnnualPrincipal) * 3,
          periodicity: 'Annual',
          consumedPercentage: Math.floor(10 + Math.random() * 40),
        };
        onAddCeiling(newCeiling);
      });
    }

    setWizardOpen(false);
  };

  // Active organization details for Age Limits card
  const activeOrgCeiling = useMemo(() => {
    if (selectedOrgFilter !== 'ALL') {
      return ceilings.find((c) => c.organization === selectedOrgFilter) || null;
    }
    return ceilings[0] || null;
  }, [ceilings, selectedOrgFilter]);

  const activeAgePrinc = activeOrgCeiling?.maxAgePrincipal ?? 65;
  const activeAgeSpouse = activeOrgCeiling?.maxAgeSpouse ?? 65;
  const activeAgeChild = activeOrgCeiling?.maxAgeChild ?? 21;
  const activeAgeStudent = activeOrgCeiling?.maxAgeStudent ?? 25;

  return (
    <div className="space-y-6">
      {/* 1. TOP POLICY AGE LIMITS & REAL-TIME ELIGIBILITY CONTROLS BANNER */}
      {/* === AMÉLIORATION AJOUTÉE : retour au gris (retour utilisateur, 2026-09-07) — le fond
          rouge introduit puis affiné à plusieurs reprises est abandonné ("revient au gris comme
          c'était avant"). Ce bandeau suit désormais ADMIN_THEME.palette.bannerGradient, la même
          teinte grise (plus claire qu'avant le rouge) que le reste de l'interface Admin, au lieu
          d'une couleur propre à cette bannière. Le texte/les badges/bulles restent dans les
          mêmes teintes claires translucides (blanc/10, blanc/20) qu'avant, qui fonctionnent sur
          n'importe quel fond sombre — seule la couleur de fond change réellement. */}
      <div className={`${ADMIN_THEME.palette.bannerGradient} rounded-3xl p-6 text-white shadow-xl border ${ADMIN_THEME.palette.bannerBorder} relative overflow-hidden`}>
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        
        {/* === AMÉLIORATION AJOUTÉE : le badge "Policy Age Limits & Real-Time Eligibility
            Verification" (et le paragraphe descriptif sous lui) sont désormais alignés en HAUT
            (items-start, au lieu de items-center) — au même niveau vertical que le libellé
            "PRIMARY INSURED" en haut de sa bulle — et restent justifiés à l'extrême gauche de la
            bannière ; les bulles + le bouton "Configure Benefit Limit" gardent leur position
            initiale à droite, inchangée. === */}
        <div className="relative z-10 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            {/* === AMÉLIORATION AJOUTÉE : le paragraphe descriptif est remonté juste sous le
                badge "Policy Age Limits & Real-Time Eligibility Verification" (au lieu de se
                trouver plus bas, après les bulles d'âge et le bouton), avec un retour à la
                ligne normal et un alignement explicite à gauche. === */}
            {/* === AMÉLIORATION AJOUTÉE : justification du texte corrigée (retour utilisateur :
                "le texte décale un peu") — vérifié visuellement dans le navigateur réel (pas
                seulement en isolation) : text-align: justify était bien appliqué, mais la boîte
                (max-w-md, 448px) était nettement plus étroite que l'espace réellement
                disponible dans la bannière avant les bulles d'âge, forçant la justification à
                étirer très peu de mots sur toute la largeur -> espaces inter-mots visiblement
                inégaux, lus comme un texte "décalé"/mal aligné. Élargi (max-w-lg/lg:max-w-xl) +
                w-full (largeur toujours égale à cette max-width, jamais ambiguë selon le calcul
                flex "auto") pour donner à la justification assez de mots par ligne à répartir. */}
            {/* === AMÉLIORATION AJOUTÉE : largeur du bloc de texte alignée sur celle du badge
                juste au-dessus (retour utilisateur, 2026-09-07) — auparavant plus large
                (max-w-lg/xl) que le badge, le paragraphe s'étirait au-delà du bord droit du
                badge au lieu de revenir à la ligne au même niveau. */}
            {/* === AMÉLIORATION AJOUTÉE : correctif débordement (retour utilisateur, 2026-09-07
                — "le texte déborde toujours la bannière") — `max-w-md shrink-0` fixait une
                largeur MINIMALE non compressible de 448px pour ce bloc ; combiné aux bulles
                d'âge + bouton passés en flex-nowrap juste en dessous (qui ne peuvent plus non
                plus rétrécir), la ligne entière dépassait la largeur de la bannière sur tout
                écran plus étroit que ~1150px. `flex-1 min-w-0` laisse ce bloc de texte être
                celui qui absorbe le rétrécissement (plus de lignes, jamais de débordement),
                pendant que les bulles/bouton, eux, gardent leur taille naturelle fixe. */}
            <div className="space-y-2 flex-1 min-w-0">
              {/* === AMÉLIORATION AJOUTÉE : mention "Age Limits" retirée du libellé affiché
                  (retour utilisateur, 2026-09-07) — la configuration des plafonds d'âge
                  elle-même (bulles Primary/Spouse/Child ci-dessous + bouton "Configure Benefit
                  Limit") reste entièrement inchangée, seul ce libellé est reformulé. */}
              {/* === AMÉLIORATION AJOUTÉE : mention descriptive retirée (retour utilisateur,
                  2026-09-11) — le badge "Real-Time Eligibility Verification" reste seul,
                  le comportement de validation d'âge n'est pas modifié. === */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold tracking-wide uppercase text-slate-200">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
                <span>{t.ceilings.eligibilityBadge}</span>
              </div>
            </div>

            {/* Dynamic Age Limits Display Pills */}
            {/* === AMÉLIORATION AJOUTÉE : flex-nowrap (retour utilisateur, 2026-09-07) — les
                bulles d'âge et le bouton "Configure Benefit Limit" doivent toujours rester sur
                la même ligne (auparavant flex-wrap, pouvait les faire passer sur plusieurs
                lignes). `shrink-0` ajouté pour que ce bloc garde toujours sa taille naturelle :
                c'est le panneau de texte à gauche (flex-1 min-w-0) qui absorbe seul le
                rétrécissement sur un écran étroit, jamais les bulles/bouton. === */}
            <div className="flex flex-nowrap items-center gap-3 shrink-0">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 min-w-[130px]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-200 block">
                {t.ceilings.primaryInsuredLabel}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white">≤ {activeAgePrinc}</span>
                <span className="text-[10px] font-bold text-slate-200">{t.ceilings.yearsUnit}</span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 min-w-[130px]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-200 block">
                {t.ceilings.spouseLabel}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white">≤ {activeAgeSpouse}</span>
                <span className="text-[10px] font-bold text-slate-200">{t.ceilings.yearsUnit}</span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 min-w-[140px]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-200 block">
                {t.ceilings.childDependantLabel}
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white">≤ {activeAgeChild}</span>
                <span className="text-[10px] font-bold text-emerald-400">({t.ceilings.studentSuffixTemplate.replace('{age}', String(activeAgeStudent))})</span>
              </div>
            </div>

            {/* === AMÉLIORATION AJOUTÉE : bouton "Configure Age Limits" retiré — un seul bouton
                subsiste ("Configure Benefit Limit"), restylé en blanc comme demandé.
                openAgeLimitsModal reste disponible dans le code (état ageLimitsModalOpen conservé)
                pour ne rien supprimer côté logique métier, seul le déclencheur visuel est retiré. */}
            <button
              id="configure-benefit-limit-btn"
              onClick={openNewBenefitLimitWizard}
              className="px-4 py-3 rounded-2xl bg-white text-slate-800 hover:bg-slate-100 font-black text-xs transition flex items-center gap-2 shadow-lg cursor-pointer shrink-0"
            >
              <PlusCircle className="w-4 h-4 text-slate-800" />
              <span>{t.ceilings.configureBenefitLimitBtn}</span>
            </button>
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH & FILTERS BAR */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap md:flex-nowrap gap-2.5 items-center flex-1">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t.ceilings.searchPlaceholder}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:bg-white transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          {/* Benefit Filter */}
          <select
            value={selectedBenefitFilter}
            onChange={(e) => {
              setSelectedBenefitFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="ALL">{t.ceilings.allBenefitTypesOption}</option>
            {availableBenefits.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Items per page selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">{t.ceilings.showLabel}</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={999}>{t.ceilings.allOption}</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. MAIN CEILINGS & BENEFIT LIMITS TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Header Section */}
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2.5">
              <Sliders className="w-4 h-4 text-slate-700" />
              <h2 className="font-extrabold text-sm text-slate-900">
                {t.ceilings.tableTitle}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
                {filteredCeilings.length} {t.ceilings.benefitsCountSuffix}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-normal">
              {t.ceilings.tableSubtitle}
            </p>
          </div>
        </div>

        {/* Table Content */}
        {filteredCeilings.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium space-y-2">
            <p>{t.noData}</p>
            {/* === AMÉLIORATION AJOUTÉE : "+" textuel remplacé par l'icône ronde harmonisée === */}
            <button
              onClick={openNewBenefitLimitWizard}
              className="text-slate-700 font-bold hover:underline cursor-pointer inline-flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>{t.ceilings.createNewBenefitLimit}</span>
            </button>
          </div>
        ) : (
          <>
          {/* Desktop/tablet: table (unchanged) */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    {t.members.organization}
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    {t.ceilings.colBenefit}
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    {t.ceilings.colMonthlyLimit}
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    {t.ceilings.colAnnualLimit}
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    {t.ceilings.colAgeLimitsPolicy}
                  </th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">
                    {t.ceilings.colConsumption}
                  </th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">
                    {t.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedCeilings.map((c) => {
                  const benefitName = c.careType || c.serviceCategory || 'Outpatient Consultations';
                  const orgName = c.organization || 'TotalEnergies Liberia Ltd';
                  const isOutpatient = !benefitName.toLowerCase().includes('inpatient');

                  // Resolved amounts with fallbacks
                  const outMoPrinc =
                    c.outpatientMonthlyPrincipal ?? (isOutpatient ? c.monthlyLimit || 250 : 0);
                  const outMoDep =
                    c.outpatientMonthlyDependent ?? (isOutpatient ? Math.round((c.monthlyLimit || 250) * 0.6) : 0);
                  const inMoPrinc =
                    c.inpatientMonthlyPrincipal ?? (!isOutpatient ? c.monthlyLimit || 500 : 0);
                  const inMoDep =
                    c.inpatientMonthlyDependent ?? (!isOutpatient ? Math.round((c.monthlyLimit || 500) * 0.6) : 0);

                  const monthlyPrinc = isOutpatient ? (outMoPrinc || 250) : (inMoPrinc || 500);
                  const monthlyDep = isOutpatient ? (outMoDep || 150) : (inMoDep || 300);

                  const annPrinc =
                    c.outpatientAnnualPrincipal ??
                    c.inpatientAnnualPrincipal ??
                    c.individualLimit ??
                    1000;
                  const annDep =
                    c.outpatientAnnualDependent ??
                    c.inpatientAnnualDependent ??
                    Math.round(annPrinc * 0.66);

                  const maxP = c.maxAgePrincipal ?? 65;
                  const maxS = c.maxAgeSpouse ?? 65;
                  const maxC = c.maxAgeChild ?? 21;
                  const maxSt = c.maxAgeStudent ?? 25;

                  const consumed = c.consumedPercentage || 28;
                  const isHigh = consumed > 75;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Organization */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0 border border-slate-200">
                            <Building2 className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block max-w-[180px] truncate" title={orgName}>
                              {orgName}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Benefit Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getBenefitBadgeStyle(
                            benefitName
                          )}`}
                        >
                          {benefitName}
                        </span>
                      </td>

                      {/* Monthly Limit */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div
                          className="flex flex-col"
                          title={t.ceilings.principalDependentTooltip.replace('{principal}', `$${monthlyPrinc.toLocaleString()}`).replace('{dependent}', `$${monthlyDep.toLocaleString()}`)}
                        >
                          <span className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                            ${monthlyPrinc.toLocaleString()} <span className="text-slate-300 font-normal">/</span> <span className="text-slate-600">${monthlyDep.toLocaleString()}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">{t.ceilings.principalDependentLabel}</span>
                        </div>
                      </td>

                      {/* Annual Limit */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div
                          className="flex flex-col"
                          title={t.ceilings.principalDependentTooltip.replace('{principal}', `$${annPrinc.toLocaleString()}`).replace('{dependent}', `$${annDep.toLocaleString()}`)}
                        >
                          <span className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                            ${annPrinc.toLocaleString()} <span className="text-slate-300 font-normal">/</span> <span className="text-slate-600">${annDep.toLocaleString()}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">{t.ceilings.principalDependentLabel}</span>
                        </div>
                      </td>

                      {/* Age Limits Column */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-100 text-[10px] font-bold" title={t.ceilings.principalAgeTooltip.replace('{age}', String(maxP))}>
                            P: ≤{maxP}y
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold" title={t.ceilings.spouseAgeTooltip.replace('{age}', String(maxS))}>
                            S: ≤{maxS}y
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold" title={t.ceilings.childAgeTooltip.replace('{age}', String(maxC)).replace('{student}', String(maxSt))}>
                            C: ≤{maxC}y
                          </span>
                        </div>
                      </td>

                      {/* Overall Consumption */}
                      <td className="py-3.5 px-4 min-w-[120px]">
                        <div className="space-y-1 max-w-[110px] mx-auto">
                          <div className="flex justify-between text-[11px] font-bold">
                            <span className={isHigh ? 'text-rose-600' : 'text-slate-700'}>
                              {consumed}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${consumed}%`,
                                backgroundColor: isHigh
                                  ? '#e11d48'
                                  : consumed > 50
                                  ? '#f59e0b'
                                  : '#00A859',
                              }}
                            ></div>
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditCeilingModal(c)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            title={t.ceilings.editBenefitLimitsTitle}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteCeiling(c.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title={t.ceilings.deleteRuleTitle}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* === AMÉLIORATION AJOUTÉE : liste de cartes sur mobile, au lieu du tableau à 7
              colonnes qui débordait/se comprimait mal sur petit écran. Mêmes données et
              mêmes actions (Edit / Delete) que le tableau desktop. === */}
          <div className="sm:hidden divide-y divide-slate-100">
            {paginatedCeilings.map((c) => {
              const benefitName = c.careType || c.serviceCategory || 'Outpatient Consultations';
              const orgName = c.organization || 'TotalEnergies Liberia Ltd';
              const isOutpatient = !benefitName.toLowerCase().includes('inpatient');

              const outMoPrinc = c.outpatientMonthlyPrincipal ?? (isOutpatient ? c.monthlyLimit || 250 : 0);
              const outMoDep = c.outpatientMonthlyDependent ?? (isOutpatient ? Math.round((c.monthlyLimit || 250) * 0.6) : 0);
              const inMoPrinc = c.inpatientMonthlyPrincipal ?? (!isOutpatient ? c.monthlyLimit || 500 : 0);
              const inMoDep = c.inpatientMonthlyDependent ?? (!isOutpatient ? Math.round((c.monthlyLimit || 500) * 0.6) : 0);

              const monthlyPrinc = isOutpatient ? (outMoPrinc || 250) : (inMoPrinc || 500);
              const monthlyDep = isOutpatient ? (outMoDep || 150) : (inMoDep || 300);

              const annPrinc = c.outpatientAnnualPrincipal ?? c.inpatientAnnualPrincipal ?? c.individualLimit ?? 1000;
              const annDep = c.outpatientAnnualDependent ?? c.inpatientAnnualDependent ?? Math.round(annPrinc * 0.66);

              const maxP = c.maxAgePrincipal ?? 65;
              const maxS = c.maxAgeSpouse ?? 65;
              const maxC = c.maxAgeChild ?? 21;

              const consumed = c.consumedPercentage || 28;
              const isHigh = consumed > 75;

              return (
                <div key={c.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 border border-slate-200">
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-900 text-xs truncate">{orgName}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEditCeilingModal(c)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                        title={t.ceilings.editBenefitLimitsTitle}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteCeiling(c.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title={t.ceilings.deleteRuleTitle}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getBenefitBadgeStyle(
                      benefitName
                    )}`}
                  >
                    {benefitName}
                  </span>

                  <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{t.ceilings.monthlyPDLabel}</div>
                      <div className="font-mono font-bold text-slate-900">
                        ${monthlyPrinc.toLocaleString()} / ${monthlyDep.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{t.ceilings.annualPDLabel}</div>
                      <div className="font-mono font-bold text-slate-900">
                        ${annPrinc.toLocaleString()} / ${annDep.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-100 text-[10px] font-bold">
                      P: ≤{maxP}y
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold">
                      S: ≤{maxS}y
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold">
                      C: ≤{maxC}y
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-slate-400 font-medium">{t.ceilings.colConsumption}</span>
                      <span className={isHigh ? 'text-rose-600' : 'text-slate-700'}>{consumed}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${consumed}%`,
                          backgroundColor: isHigh ? '#e11d48' : consumed > 50 ? '#f59e0b' : '#00A859',
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}

        {/* Table Pagination Footer */}
        {filteredCeilings.length > 0 && (
          <div className="px-6 py-3.5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              {t.ceilings.showingTemplate
                .replace('{from}', String(Math.min((currentPage - 1) * itemsPerPage + 1, filteredCeilings.length)))
                .replace('{to}', String(Math.min(currentPage * itemsPerPage, filteredCeilings.length)))
                .replace('{total}', String(filteredCeilings.length))}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                title={t.ceilings.previousPageTitle}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                    currentPage === p
                      ? 'bg-slate-700 text-white'
                      : 'border border-slate-200 text-slate-700 hover:bg-white'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                title={t.ceilings.nextPageTitle}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. QUICK AGE LIMITS CONFIGURATION MODAL */}
      {ageLimitsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95">
            <div className="px-6 py-4.5 bg-white border-b border-slate-200 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black text-slate-900">{t.ceilings.ageLimitsModalTitle}</h3>
              </div>
              <button
                onClick={() => setAgeLimitsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {t.ceilings.targetOrgLabel}
                </label>
                <select
                  value={ageLimitsOrg}
                  onChange={(e) => {
                    const newOrg = e.target.value;
                    setAgeLimitsOrg(newOrg);
                    const ex = ceilings.find((c) => c.organization === newOrg);
                    setAgeLimitPrincipal(ex?.maxAgePrincipal ?? 65);
                    setAgeLimitSpouse(ex?.maxAgeSpouse ?? 65);
                    setAgeLimitChild(ex?.maxAgeChild ?? 21);
                    setAgeLimitStudent(ex?.maxAgeStudent ?? 25);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                >
                  {availableOrgs.map((org) => (
                    <option key={org.id} value={org.name}>
                      {org.name} ({org.policyNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-blue-900 mb-1">
                    {t.ceilings.principalInsuredMaxAgeLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="18"
                      max="100"
                      value={ageLimitPrincipal}
                      onChange={(e) => setAgeLimitPrincipal(parseInt(e.target.value, 10) || 65)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <span className="text-xs font-bold text-slate-400">{t.ceilings.yearsUnit}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">{t.ceilings.defaultAge65}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-indigo-900 mb-1">
                    {t.ceilings.spouseHusbandWifeLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="18"
                      max="100"
                      value={ageLimitSpouse}
                      onChange={(e) => setAgeLimitSpouse(parseInt(e.target.value, 10) || 65)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <span className="text-xs font-bold text-slate-400">{t.ceilings.yearsUnit}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">{t.ceilings.defaultAge65}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-emerald-900 mb-1">
                    {t.ceilings.childrenDependantsLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="40"
                      value={ageLimitChild}
                      onChange={(e) => setAgeLimitChild(parseInt(e.target.value, 10) || 21)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <span className="text-xs font-bold text-slate-400">{t.ceilings.yearsUnit}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">{t.ceilings.standardCutoff21}</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-purple-900 mb-1">
                    {t.ceilings.studentsHigherEdLabel}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="18"
                      max="40"
                      value={ageLimitStudent}
                      onChange={(e) => setAgeLimitStudent(parseInt(e.target.value, 10) || 25)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                    <span className="text-xs font-bold text-slate-400">{t.ceilings.yearsUnit}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">{t.ceilings.schoolEnrollment25}</span>
                </div>
              </div>

              {ageSavedSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{t.ceilings.ageLimitsSavedSuccess.replace('{org}', ageLimitsOrg)}</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAgeLimitsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white transition cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleSaveAgeLimits}
                className="px-5 py-2 rounded-xl bg-[#00A859] hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>{t.ceilings.saveAgeLimitsBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. RIGHT SLIDE-OVER DRAWER: NEW / EDIT BENEFIT LIMIT WIZARD */}
      {wizardOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 border-l border-slate-200">
            {/* Drawer Top Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  {editingCeilingId ? t.ceilings.editBenefitLimitTitle : t.ceilings.newBenefitLimitTitle}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.ceilings.wizardSubtitle}
                </p>
              </div>
              <button
                onClick={() => setWizardOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Stepper Progress Bar */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex items-center justify-between text-xs font-bold">
                {/* Step 1 */}
                <div
                  className={`flex items-center gap-1.5 ${
                    wizardStep === 1
                      ? 'text-slate-800 font-bold'
                      : wizardStep > 1
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      wizardStep === 1
                        ? 'bg-slate-700 text-white'
                        : wizardStep > 1
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {wizardStep > 1 ? '✓' : '1'}
                  </span>
                  <span>{t.ceilings.stepOrgAge}</span>
                </div>
                <div className="w-8 h-0.5 bg-slate-200"></div>

                {/* Step 2 */}
                <div
                  className={`flex items-center gap-1.5 ${
                    wizardStep === 2
                      ? 'text-slate-800 font-bold'
                      : wizardStep > 2
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      wizardStep === 2
                        ? 'bg-slate-700 text-white'
                        : wizardStep > 2
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {wizardStep > 2 ? '✓' : '2'}
                  </span>
                  <span>{t.ceilings.stepBenefitsLimits}</span>
                </div>
                <div className="w-8 h-0.5 bg-slate-200"></div>

                {/* Step 3 */}
                <div
                  className={`flex items-center gap-1.5 ${
                    wizardStep === 3 ? 'text-slate-800 font-bold' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      wizardStep === 3
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    3
                  </span>
                  <span>{t.ceilings.stepReviewSave}</span>
                </div>
              </div>
            </div>

            {/* Drawer Body Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* STEP 1: ORGANIZATION & AGE RESTRICTIONS */}
              {wizardStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t.ceilings.selectedOrgLabel}
                    </label>
                    <div className="relative">
                      <select
                        value={wizardOrg}
                        onChange={(e) => {
                          const oName = e.target.value;
                          setWizardOrg(oName);
                          const ex = ceilings.find((c) => c.organization === oName);
                          if (ex) {
                            setWizardAgePrincipal(ex.maxAgePrincipal ?? 65);
                            setWizardAgeSpouse(ex.maxAgeSpouse ?? 65);
                            setWizardAgeChild(ex.maxAgeChild ?? 21);
                            setWizardAgeStudent(ex.maxAgeStudent ?? 25);
                          }
                        }}
                        className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:bg-white appearance-none cursor-pointer"
                      >
                        {availableOrgs.map((org) => (
                          <option key={org.id} value={org.name}>
                            {org.name} ({org.policyNumber})
                          </option>
                        ))}
                      </select>
                      <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                    </div>
                  </div>

                  {/* Age Limits per Policy Configuration */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-slate-700" />
                      <span className="text-xs font-extrabold text-slate-900">
                        {t.ceilings.configurableAgeThresholds}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          {t.ceilings.principalMaxAgeLabel}
                        </label>
                        <input
                          type="number"
                          value={wizardAgePrincipal}
                          onChange={(e) => setWizardAgePrincipal(parseInt(e.target.value, 10) || 65)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          {t.ceilings.spouseMaxAgeLabel}
                        </label>
                        <input
                          type="number"
                          value={wizardAgeSpouse}
                          onChange={(e) => setWizardAgeSpouse(parseInt(e.target.value, 10) || 65)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          {t.ceilings.childDependentMaxAgeLabel}
                        </label>
                        <input
                          type="number"
                          value={wizardAgeChild}
                          onChange={(e) => setWizardAgeChild(parseInt(e.target.value, 10) || 21)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          {t.ceilings.studentMaxAgeLabel}
                        </label>
                        <input
                          type="number"
                          value={wizardAgeStudent}
                          onChange={(e) => setWizardAgeStudent(parseInt(e.target.value, 10) || 25)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: BENEFITS & LIMITS CONFIGURATION */}
              {wizardStep === 2 && (
                <div className="space-y-5">
                  {/* Selected Organization */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      {t.ceilings.selectedOrgLabel}
                    </label>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-slate-700" />
                      <span>{wizardOrg}</span>
                    </div>
                  </div>

                  {/* Select Benefits (Multi-select) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      {t.ceilings.selectBenefitsLabel}
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      {ALL_BENEFITS.map((benefit) => {
                        const isSelected = wizardSelectedBenefits.includes(benefit);
                        return (
                          <button
                            key={benefit}
                            type="button"
                            onClick={() => toggleBenefitSelection(benefit)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                              isSelected
                                ? 'bg-slate-700 text-white shadow-2xs'
                                : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <span>{benefit}</span>
                            {isSelected ? (
                              <X className="w-3 h-3 text-white/80" />
                            ) : (
                              <Plus className="w-3 h-3 text-slate-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Configure Limits Header & Period Tabs */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-bold text-slate-800">
                          {t.ceilings.configureLimitsLabel}
                        </label>
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                      </div>

                      {/* Toggle tabs: Monthly vs Annual */}
                      <div className="flex p-0.5 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setActiveLimitsTab('monthly')}
                          className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                            activeLimitsTab === 'monthly'
                              ? 'bg-white text-slate-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {t.ceilings.monthlyLimitsUsdTab}
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveLimitsTab('annual')}
                          className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                            activeLimitsTab === 'annual'
                              ? 'bg-white text-slate-800 shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {t.ceilings.annualLimitsUsdTab}
                        </button>
                      </div>
                    </div>

                    {/* Matrix table for benefits */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-600 uppercase">
                            <th className="py-2.5 px-3">{t.ceilings.colBenefit}</th>
                            <th className="py-2.5 px-2 text-center bg-blue-50/50 text-blue-900">
                              {t.ceilings.outpatientLabel}
                            </th>
                            <th className="py-2.5 px-2 text-center bg-indigo-50/50 text-indigo-900">
                              {t.ceilings.inpatientLabel}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {wizardSelectedBenefits.map((benefit) => {
                            const config = benefitLimits[benefit] || getDefaultLimitsForBenefit(benefit);
                            return (
                              <tr key={benefit} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3 font-bold text-slate-800 max-w-[140px]">
                                  {benefit}
                                </td>

                                {/* Outpatient Inputs */}
                                <td className="py-3 px-2 bg-[var(--brand-50)]/20">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1">
                                      <span className="block text-[10px] text-slate-400 font-bold">{t.ceilings.principalLabel}</span>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={
                                            activeLimitsTab === 'monthly'
                                              ? config.outpatientMonthlyPrincipal
                                              : config.outpatientAnnualPrincipal
                                          }
                                          onChange={(e) =>
                                            handleLimitChange(
                                              benefit,
                                              activeLimitsTab === 'monthly'
                                                ? 'outpatientMonthlyPrincipal'
                                                : 'outpatientAnnualPrincipal',
                                              parseFloat(e.target.value) || 0
                                            )
                                          }
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <span className="block text-[10px] text-slate-400 font-bold">{t.ceilings.dependentLabel}</span>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={
                                            activeLimitsTab === 'monthly'
                                              ? config.outpatientMonthlyDependent
                                              : config.outpatientAnnualDependent
                                          }
                                          onChange={(e) =>
                                            handleLimitChange(
                                              benefit,
                                              activeLimitsTab === 'monthly'
                                                ? 'outpatientMonthlyDependent'
                                                : 'outpatientAnnualDependent',
                                              parseFloat(e.target.value) || 0
                                            )
                                          }
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Inpatient Inputs */}
                                <td className="py-3 px-2 bg-indigo-50/20">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1">
                                      <span className="block text-[10px] text-slate-400 font-bold">{t.ceilings.principalLabel}</span>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={
                                            activeLimitsTab === 'monthly'
                                              ? config.inpatientMonthlyPrincipal
                                              : config.inpatientAnnualPrincipal
                                          }
                                          onChange={(e) =>
                                            handleLimitChange(
                                              benefit,
                                              activeLimitsTab === 'monthly'
                                                ? 'inpatientMonthlyPrincipal'
                                                : 'inpatientAnnualPrincipal',
                                              parseFloat(e.target.value) || 0
                                            )
                                          }
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <span className="block text-[10px] text-slate-400 font-bold">{t.ceilings.dependentLabel}</span>
                                      <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-slate-400 text-xs">$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          value={
                                            activeLimitsTab === 'monthly'
                                              ? config.inpatientMonthlyDependent
                                              : config.inpatientAnnualDependent
                                          }
                                          onChange={(e) =>
                                            handleLimitChange(
                                              benefit,
                                              activeLimitsTab === 'monthly'
                                                ? 'inpatientMonthlyDependent'
                                                : 'inpatientAnnualDependent',
                                              parseFloat(e.target.value) || 0
                                            )
                                          }
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-500"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: REVIEW & SAVE */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{t.members.organization}</span>
                      <h4 className="text-sm font-bold text-slate-900">{wizardOrg}</h4>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {t.ceilings.reviewAgeLimitsTemplate
                          .replace('{p}', String(wizardAgePrincipal))
                          .replace('{s}', String(wizardAgeSpouse))
                          .replace('{c}', String(wizardAgeChild))}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        {t.ceilings.reviewBenefitsToConfigureTemplate.replace('{n}', String(wizardSelectedBenefits.length))}
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {wizardSelectedBenefits.map((b) => (
                          <span
                            key={b}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Limits summary list */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-800">{t.ceilings.limitsBreakdownLabel}</span>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {wizardSelectedBenefits.map((benefit) => {
                        const cfg = benefitLimits[benefit] || getDefaultLimitsForBenefit(benefit);
                        return (
                          <div
                            key={benefit}
                            className="p-3 bg-white border border-slate-200 rounded-xl text-xs space-y-1.5"
                          >
                            <div className="font-bold text-slate-900">{benefit}</div>
                            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                              <div className="p-2 bg-blue-50/50 rounded-lg">
                                <span className="font-bold text-blue-800 block">{t.ceilings.outpatientLabel}</span>
                                <div>{t.ceilings.monthlyBreakdownTemplate.replace('{princ}', `$${cfg.outpatientMonthlyPrincipal}`).replace('{dep}', `$${cfg.outpatientMonthlyDependent}`)}</div>
                                <div>{t.ceilings.annualBreakdownTemplate.replace('{princ}', `$${cfg.outpatientAnnualPrincipal}`).replace('{dep}', `$${cfg.outpatientAnnualDependent}`)}</div>
                              </div>
                              <div className="p-2 bg-indigo-50/50 rounded-lg">
                                <span className="font-bold text-indigo-900 block">{t.ceilings.inpatientLabel}</span>
                                <div>{t.ceilings.monthlyBreakdownTemplate.replace('{princ}', `$${cfg.inpatientMonthlyPrincipal}`).replace('{dep}', `$${cfg.inpatientMonthlyDependent}`)}</div>
                                <div>{t.ceilings.annualBreakdownTemplate.replace('{princ}', `$${cfg.inpatientAnnualPrincipal}`).replace('{dep}', `$${cfg.inpatientAnnualDependent}`)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (wizardStep === 1) setWizardOpen(false);
                  else setWizardStep((s) => (s - 1) as 1 | 2 | 3);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white transition cursor-pointer"
              >
                {wizardStep === 1 ? t.cancel : t.ceilings.backBtn}
              </button>

              <div className="flex items-center gap-2">
                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3)}
                    className={`px-4 py-2 rounded-xl ${ADMIN_THEME.palette.primaryColor} text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs`}
                  >
                    <span>{wizardStep === 1 ? t.ceilings.nextBenefitsLimitsBtn : t.ceilings.nextReviewSaveBtn}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveWizard}
                    className="px-5 py-2 rounded-xl bg-[#00A859] hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>{t.ceilings.saveBenefitLimitsBtn}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
