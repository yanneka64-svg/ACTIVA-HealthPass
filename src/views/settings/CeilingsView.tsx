import React, { useState, useMemo } from 'react';
import {
  Search,
  Plus,
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
  Settings,
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
  lang = 'en',
  ceilings,
  organizations = [],
  onAddCeiling,
  onUpdateCeiling,
  onDeleteCeiling,
}) => {
  const t = useTranslation('en');
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
      return 'bg-[var(--brand-50)] text-[var(--brand-900)] border-[var(--brand-200)]';
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
        : availableOrgs[0]?.name || 'Orange Liberia Telecom';
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
    const org = c.organization || availableOrgs[0]?.name || 'Orange Liberia Telecom';
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
    const targetOrg = orgName || (selectedOrgFilter !== 'ALL' ? selectedOrgFilter : availableOrgs[0]?.name || 'Orange Liberia Telecom');
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
      <div className="bg-gradient-to-r from-[var(--brand-900)] via-[var(--brand-900)] to-[var(--brand-900)] rounded-3xl p-6 text-white shadow-xl border border-[var(--brand-800)]/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-xs font-bold tracking-wide uppercase text-[var(--brand-200)]">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />
              <span>Policy Age Limits & Real-Time Eligibility Verification</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Coverage Ceilings & Age Thresholds
            </h2>
            <p className="text-xs text-[var(--brand-100)]/90 leading-relaxed font-medium">
              Real-time age validation automatically blocks claims and invalidates coverage if an insured person exceeds the configured policy age limit on the date of care.
            </p>
          </div>

          {/* Dynamic Age Limits Display Pills */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 min-w-[130px]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--brand-200)] block">
                Primary Insured
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white">≤ {activeAgePrinc}</span>
                <span className="text-[10px] font-bold text-[var(--brand-200)]">years</span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 min-w-[130px]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--brand-200)] block">
                Spouse
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white">≤ {activeAgeSpouse}</span>
                <span className="text-[10px] font-bold text-[var(--brand-200)]">years</span>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 min-w-[140px]">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--brand-200)] block">
                Child / Dependant
              </span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-xl font-black text-white">≤ {activeAgeChild}</span>
                <span className="text-[10px] font-bold text-emerald-300">({activeAgeStudent}y student)</span>
              </div>
            </div>

            <button
              id="configure-age-limits-btn"
              onClick={() => openAgeLimitsModal()}
              className="px-4 py-3 rounded-2xl bg-white text-[var(--brand-900)] hover:bg-[var(--brand-50)] font-black text-xs transition flex items-center gap-2 shadow-lg cursor-pointer shrink-0"
            >
              <Settings className="w-4 h-4 text-[var(--brand-900)]" />
              <span>Configure Age Limits</span>
            </button>

            <button
              id="configure-benefit-limit-btn"
              onClick={openNewBenefitLimitWizard}
              className="px-4 py-3 rounded-2xl bg-[#DC2626] hover:bg-[#B91C1C] text-white font-black text-xs transition flex items-center gap-2 shadow-lg cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Configure Benefit Limit</span>
            </button>
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
              placeholder="Search benefit name or organization..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)] focus:bg-white transition"
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
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
          >
            <option value="ALL">All Benefit Types</option>
            {availableBenefits.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Items per page selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={999}>All</option>
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
              <Sliders className="w-4 h-4 text-[var(--brand-900)]" />
              <h2 className="font-extrabold text-sm text-slate-900">
                Coverage Ceilings & Limits Matrix
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
                {filteredCeilings.length} benefits
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 font-normal">
              Monthly and annual coverage rules, member allowances, and policy age restrictions.
            </p>
          </div>
        </div>

        {/* Table Content */}
        {filteredCeilings.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium space-y-2">
            <p>{t.noData}</p>
            <button
              onClick={openNewBenefitLimitWizard}
              className="text-[var(--brand-900)] font-bold hover:underline cursor-pointer"
            >
              + Create a new benefit limit
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    Organization
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    Benefit
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    Monthly Limit
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    Annual Limit
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">
                    Age Limits (Policy)
                  </th>
                  <th className="py-3.5 px-4 text-center whitespace-nowrap">
                    Consumption
                  </th>
                  <th className="py-3.5 px-4 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {paginatedCeilings.map((c) => {
                  const benefitName = c.careType || c.serviceCategory || 'Outpatient Consultations';
                  const orgName = c.organization || 'Orange Liberia Telecom';
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
                          <div className="w-6 h-6 rounded-lg bg-[var(--brand-50)] text-[var(--brand-900)] flex items-center justify-center font-bold text-[10px] shrink-0 border border-[var(--brand-100)]">
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
                          title={`Principal: $${monthlyPrinc.toLocaleString()} | Dependent: $${monthlyDep.toLocaleString()}`}
                        >
                          <span className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                            ${monthlyPrinc.toLocaleString()} <span className="text-slate-300 font-normal">/</span> <span className="text-slate-600">${monthlyDep.toLocaleString()}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">Principal / Dependent</span>
                        </div>
                      </td>

                      {/* Annual Limit */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div
                          className="flex flex-col"
                          title={`Principal: $${annPrinc.toLocaleString()} | Dependent: $${annDep.toLocaleString()}`}
                        >
                          <span className="font-mono font-bold text-slate-900 text-xs tracking-tight">
                            ${annPrinc.toLocaleString()} <span className="text-slate-300 font-normal">/</span> <span className="text-slate-600">${annDep.toLocaleString()}</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">Principal / Dependent</span>
                        </div>
                      </td>

                      {/* Age Limits Column */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-[var(--brand-50)] text-[var(--brand-900)] border border-[var(--brand-100)] text-[10px] font-bold" title={`Principal ≤ ${maxP} yrs`}>
                            P: ≤{maxP}y
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 text-[10px] font-bold" title={`Spouse ≤ ${maxS} yrs`}>
                            S: ≤{maxS}y
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold" title={`Child ≤ ${maxC} yrs (${maxSt}y student)`}>
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
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[var(--brand-900)] hover:bg-[var(--brand-50)] transition cursor-pointer"
                            title="Edit benefit limits"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteCeiling(c.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete rule"
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
        )}

        {/* Table Pagination Footer */}
        {filteredCeilings.length > 0 && (
          <div className="px-6 py-3.5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
            <span>
              Showing {Math.min((currentPage - 1) * itemsPerPage + 1, filteredCeilings.length)} to{' '}
              {Math.min(currentPage * itemsPerPage, filteredCeilings.length)} of {filteredCeilings.length} benefits
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition"
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition cursor-pointer ${
                    currentPage === p
                      ? 'bg-[var(--brand-900)] text-white'
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
                title="Next page"
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
            <div className="px-6 py-4.5 bg-gradient-to-r from-[var(--brand-900)] to-[var(--brand-900)] text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-300" />
                <h3 className="text-base font-black">Configure Policy Age Limits</h3>
              </div>
              <button
                onClick={() => setAgeLimitsModalOpen(false)}
                className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Target Organization / Policy
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
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
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
                  <label className="block text-xs font-extrabold text-[var(--brand-900)] mb-1">
                    Principal Insured (Max Age)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="18"
                      max="100"
                      value={ageLimitPrincipal}
                      onChange={(e) => setAgeLimitPrincipal(parseInt(e.target.value, 10) || 65)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                    />
                    <span className="text-xs font-bold text-slate-400">years</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Default: 65 years</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-indigo-900 mb-1">
                    Spouse / Husband / Wife
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="18"
                      max="100"
                      value={ageLimitSpouse}
                      onChange={(e) => setAgeLimitSpouse(parseInt(e.target.value, 10) || 65)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                    />
                    <span className="text-xs font-bold text-slate-400">years</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Default: 65 years</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-emerald-900 mb-1">
                    Children / Dependants
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="40"
                      value={ageLimitChild}
                      onChange={(e) => setAgeLimitChild(parseInt(e.target.value, 10) || 21)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                    />
                    <span className="text-xs font-bold text-slate-400">years</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Standard cutoff: 21 years</span>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <label className="block text-xs font-extrabold text-purple-900 mb-1">
                    Students (Higher Ed)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="18"
                      max="40"
                      value={ageLimitStudent}
                      onChange={(e) => setAgeLimitStudent(parseInt(e.target.value, 10) || 25)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                    />
                    <span className="text-xs font-bold text-slate-400">years</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">With school enrollment: 25 years</span>
                </div>
              </div>

              {ageSavedSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Age limits saved successfully for {ageLimitsOrg}!</span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAgeLimitsModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAgeLimits}
                className="px-5 py-2 rounded-xl bg-[#00A859] hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>Save Age Limits</span>
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
                <h3 className="text-base font-bold text-[var(--brand-900)] tracking-tight">
                  {editingCeilingId ? 'Edit Benefit Limit' : 'New Benefit Limit'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure benefit limits and policy age restrictions for an organization
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
                      ? 'text-[var(--brand-900)]'
                      : wizardStep > 1
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      wizardStep === 1
                        ? 'bg-[var(--brand-900)] text-white'
                        : wizardStep > 1
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {wizardStep > 1 ? '✓' : '1'}
                  </span>
                  <span>Organization & Age</span>
                </div>
                <div className="w-8 h-0.5 bg-slate-200"></div>

                {/* Step 2 */}
                <div
                  className={`flex items-center gap-1.5 ${
                    wizardStep === 2
                      ? 'text-[var(--brand-900)]'
                      : wizardStep > 2
                      ? 'text-emerald-700'
                      : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      wizardStep === 2
                        ? 'bg-[var(--brand-900)] text-white'
                        : wizardStep > 2
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {wizardStep > 2 ? '✓' : '2'}
                  </span>
                  <span>Benefits & Limits</span>
                </div>
                <div className="w-8 h-0.5 bg-slate-200"></div>

                {/* Step 3 */}
                <div
                  className={`flex items-center gap-1.5 ${
                    wizardStep === 3 ? 'text-[var(--brand-900)]' : 'text-slate-400'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                      wizardStep === 3
                        ? 'bg-[var(--brand-900)] text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    3
                  </span>
                  <span>Review & Save</span>
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
                      Selected Organization
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
                        className="w-full pl-9 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)] focus:bg-white appearance-none cursor-pointer"
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
                      <ShieldAlert className="w-4 h-4 text-[var(--brand-900)]" />
                      <span className="text-xs font-extrabold text-slate-900">
                        Configurable Policy Age Thresholds
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Principal Max Age
                        </label>
                        <input
                          type="number"
                          value={wizardAgePrincipal}
                          onChange={(e) => setWizardAgePrincipal(parseInt(e.target.value, 10) || 65)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Spouse Max Age
                        </label>
                        <input
                          type="number"
                          value={wizardAgeSpouse}
                          onChange={(e) => setWizardAgeSpouse(parseInt(e.target.value, 10) || 65)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Child / Dependent Max Age
                        </label>
                        <input
                          type="number"
                          value={wizardAgeChild}
                          onChange={(e) => setWizardAgeChild(parseInt(e.target.value, 10) || 21)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Student Max Age (Higher Ed)
                        </label>
                        <input
                          type="number"
                          value={wizardAgeStudent}
                          onChange={(e) => setWizardAgeStudent(parseInt(e.target.value, 10) || 25)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[var(--brand-900)]"
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
                      Selected Organization
                    </label>
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[var(--brand-900)]" />
                      <span>{wizardOrg}</span>
                    </div>
                  </div>

                  {/* Select Benefits (Multi-select) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Select Benefits
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
                                ? 'bg-[var(--brand-900)] text-white shadow-2xs'
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
                          Configure Limits
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
                              ? 'bg-white text-[var(--brand-900)] shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Monthly Limits (USD)
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveLimitsTab('annual')}
                          className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                            activeLimitsTab === 'annual'
                              ? 'bg-white text-[var(--brand-900)] shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          Annual Limits (USD)
                        </button>
                      </div>
                    </div>

                    {/* Matrix table for benefits */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-600 uppercase">
                            <th className="py-2.5 px-3">Benefit</th>
                            <th className="py-2.5 px-2 text-center bg-[var(--brand-50)]/50 text-[var(--brand-900)]">
                              Outpatient
                            </th>
                            <th className="py-2.5 px-2 text-center bg-indigo-50/50 text-indigo-900">
                              Inpatient
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
                                      <span className="block text-[9px] text-slate-400 font-bold">Principal</span>
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
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--brand-900)]"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <span className="block text-[9px] text-slate-400 font-bold">Dependent</span>
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
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--brand-900)]"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </td>

                                {/* Inpatient Inputs */}
                                <td className="py-3 px-2 bg-indigo-50/20">
                                  <div className="flex items-center gap-1.5">
                                    <div className="flex-1">
                                      <span className="block text-[9px] text-slate-400 font-bold">Principal</span>
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
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--brand-900)]"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <span className="block text-[9px] text-slate-400 font-bold">Dependent</span>
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
                                          className="w-full pl-5 pr-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[var(--brand-900)]"
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
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Organization</span>
                      <h4 className="text-sm font-bold text-slate-900">{wizardOrg}</h4>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Age Limits ({wizardAgePrincipal}y Principal, {wizardAgeSpouse}y Spouse, {wizardAgeChild}y Child)
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">
                        Benefits to Configure ({wizardSelectedBenefits.length})
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {wizardSelectedBenefits.map((b) => (
                          <span
                            key={b}
                            className="px-2.5 py-1 rounded-lg bg-[var(--brand-50)] text-[var(--brand-900)] border border-[var(--brand-200)] text-xs font-bold"
                          >
                            {b}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Limits summary list */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-800">Limits Breakdown</span>
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
                              <div className="p-2 bg-[var(--brand-50)]/50 rounded-lg">
                                <span className="font-bold text-[var(--brand-900)] block">Outpatient</span>
                                <div>Monthly: Princ ${cfg.outpatientMonthlyPrincipal} | Dep ${cfg.outpatientMonthlyDependent}</div>
                                <div>Annual: Princ ${cfg.outpatientAnnualPrincipal} | Dep ${cfg.outpatientAnnualDependent}</div>
                              </div>
                              <div className="p-2 bg-indigo-50/50 rounded-lg">
                                <span className="font-bold text-indigo-900 block">Inpatient</span>
                                <div>Monthly: Princ ${cfg.inpatientMonthlyPrincipal} | Dep ${cfg.inpatientMonthlyDependent}</div>
                                <div>Annual: Princ ${cfg.inpatientAnnualPrincipal} | Dep ${cfg.inpatientAnnualDependent}</div>
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
                {wizardStep === 1 ? 'Cancel' : 'Back'}
              </button>

              <div className="flex items-center gap-2">
                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3)}
                    className="px-4 py-2 rounded-xl bg-[var(--brand-900)] hover:bg-[#072559] text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>{wizardStep === 1 ? 'Next: Benefits & Limits' : 'Next: Review & Save'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveWizard}
                    className="px-5 py-2 rounded-xl bg-[#00A859] hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Benefit Limits</span>
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
