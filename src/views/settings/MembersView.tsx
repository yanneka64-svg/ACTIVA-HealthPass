import React, { useState, useMemo } from 'react';
import {
  Search,
  UploadCloud,
  Download,
  Users,
  User,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  X,
  PlusCircle,
  Image as ImageIcon,
  Camera,
  Fingerprint,
  Scan,
  Eye,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Building2,
  Calendar,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Phone,
  Mail,
  Upload,
} from 'lucide-react';
import { Member, Language, Organization, RelationshipType, MemberStatus, DependentRelationship, DependentItem, Ceiling } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { ExcelImportModal } from '../../components/ExcelImportModal';
import { exportMembersToCSV, exportMembersToExcel, parseMemberExcel, parseActivaMultiOrgExcel, generateMultiOrgTemplateExcel } from '../../utils/excelUtils';
import { uploadPhotoOrFallback } from '../../utils/storageUtils';
import { dedupeMembersByCardNo } from '../../utils/memberUtils';
import { AttachmentBiometricViewerModal } from '../../components/AttachmentBiometricViewerModal';
import { WebcamCaptureModal } from '../../components/WebcamCaptureModal';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';
import { checkMemberEligibility } from '../../services/eligibilityService';
import { generateNextCardNumber, reserveExistingCardNumber } from '../../services/cardNumberService';

export interface FormattedDependent {
  id: string;
  cardNo: string;
  fullName: string;
  birthDate: string;
  age?: number | string;
  relationship: string;
  gender?: 'M' | 'F';
  hasBiometrics?: boolean;
}

export function formatRelationship(rel: string): string {
  if (!rel) return 'Spouse';
  const lower = rel.toLowerCase().trim();
  if (lower === 'husband') return 'Husband';
  if (lower === 'wife') return 'Wife';
  if (lower === 'spouse') return 'Spouse';
  if (lower === 'child') return 'Child';
  if (lower === 'parent') return 'Parent';
  if (lower === 'other') return 'Other';
  return rel.charAt(0).toUpperCase() + rel.slice(1);
}

export function deriveDependentCardNo(primaryCardNo: string, offset: number): string {
  if (!primaryCardNo) return `ACT-DEP-${offset}`;
  const match = primaryCardNo.match(/^(.*?)-(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2], 10);
    return `${prefix}-${num + offset}`;
  }
  return `${primaryCardNo}-${offset}`;
}

export function calculateAge(birthDate: string): number | undefined {
  try {
    const b = new Date(birthDate);
    if (isNaN(b.getTime())) return undefined;
    const today = new Date(2026, 7, 31);
    let age = today.getFullYear() - b.getFullYear();
    const m = today.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < b.getDate())) {
      age--;
    }
    return age >= 0 ? age : undefined;
  } catch {
    return undefined;
  }
}

export const getMemberDependents = (m: Member): FormattedDependent[] => {
  if (!m) return [];

  if (m.dependents && m.dependents.length > 0) {
    return m.dependents.map((d, index) => {
      const cardSeq = d.cardNo || deriveDependentCardNo(m.cardNo, index + 1);
      const relFormatted = formatRelationship(d.relationship);
      return {
        id: d.id || `dep-${m.id}-${index}`,
        cardNo: cardSeq,
        fullName: d.fullName,
        birthDate: d.birthDate || '1995-01-01',
        age: d.age || (d.birthDate ? calculateAge(d.birthDate) : undefined),
        relationship: relFormatted,
        gender: d.gender,
        hasBiometrics: d.hasBiometrics ?? true,
      };
    });
  }

  const result: FormattedDependent[] = [];
  let seq = 1;

  if (m.spouseName && m.spouseName.trim()) {
    const rel = m.dependentRelationship ? formatRelationship(m.dependentRelationship) : 'Spouse';
    result.push({
      id: `dep-spouse-${m.id}`,
      cardNo: deriveDependentCardNo(m.cardNo, seq++),
      fullName: m.spouseName.trim(),
      birthDate: '1986-05-14',
      age: 39,
      relationship: rel,
      gender: rel.toLowerCase() === 'husband' ? 'M' : 'F',
      hasBiometrics: true,
    });
  }

  if (m.children && m.children.length > 0) {
    m.children.forEach((childStr, i) => {
      const match = childStr.match(/^(.*?)(?:\s*\((.*?)\))?$/);
      const name = match && match[1] ? match[1].trim() : childStr;
      const ageStr = match && match[2] ? match[2].trim() : undefined;
      const parsedAge = ageStr ? parseInt(ageStr, 10) : undefined;
      const birthYear = parsedAge ? 2026 - parsedAge : 2018 + i;
      const birthDate = `${birthYear}-08-15`;

      result.push({
        id: `dep-child-${m.id}-${i}`,
        cardNo: deriveDependentCardNo(m.cardNo, seq++),
        fullName: name,
        birthDate: birthDate,
        age: parsedAge || (2026 - birthYear),
        relationship: 'Child',
        gender: i % 2 === 0 ? 'M' : 'F',
        hasBiometrics: (parsedAge || 10) >= 6,
      });
    });
  }

  return result;
};

export const getRelationshipBadgeClass = (rel: string): string => {
  const lower = rel.toLowerCase();
  if (lower === 'husband') {
    return 'bg-[var(--brand-50)] text-[var(--brand-900)] border-[var(--brand-200)]';
  }
  if (lower === 'wife') {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  }
  if (lower === 'spouse') {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  }
  if (lower === 'child') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (lower === 'parent') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

interface MembersViewProps {
  userRole?: string;
  lang: Language;
  members: Member[];
  organizations: Organization[];
  ceilings?: Ceiling[];
  onAddMember: (member: Partial<Member>) => void;
  onUpdateMember: (member: Member) => void;
  onDeleteMember: (id: string) => void;
  // === AMÉLIORATION AJOUTÉE : accepte désormais aussi une version asynchrone qui peut lever
  // une erreur (ex: échec d'écriture Firestore), afin que l'échec réel de persistance remonte
  // jusqu'au modal d'import au lieu d'être ignoré.
  onImportMembers: (imported: Partial<Member>[]) => void | Promise<void>;
  onSuspendMember?: (member: Member) => void;
  onReactivateMember?: (member: Member) => void;
  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — nécessaire pour
  // renseigner "Assigned By" lors de la génération/réservation d'un numéro de carte.
  currentUser?: any;
}

export const MembersView: React.FC<MembersViewProps> = ({ userRole = 'Admin',
  lang,
  members,
  organizations,
  ceilings = [],
  onAddMember,
  onUpdateMember,
  onDeleteMember,
  onImportMembers,
  onSuspendMember,
  onReactivateMember,
  currentUser,
}) => {
  const t = useTranslation(lang);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrg, setSelectedOrg] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [importModalOpen, setImportModalOpen] = useState(false);
  // === ADDED IMPROVEMENT: dedicated multi-organization import (Staff / Deps workbook)
  const [importMultiOrgModalOpen, setImportMultiOrgModalOpen] = useState(false);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [isSavingCard, setIsSavingCard] = useState(false);

  // Suspend/Reactivate confirmation modal
  const [confirmMemberAction, setConfirmMemberAction] = useState<{ member: Member; action: 'suspend' | 'reactivate' } | null>(null);

  // Biometric details modal
  const [biometricModalOpen, setBiometricModalOpen] = useState(false);
  const [memberViewModalOpen, setMemberViewModalOpen] = useState(false);
  const [selectedMemberForView, setSelectedMemberForView] = useState<Member | null>(null);
  const [memberClaims, setMemberClaims] = useState<any[]>([]);
  const [frequencyAlert, setFrequencyAlert] = useState<string | null>(null);
  const [selectedMemberForBiometrics, setSelectedMemberForBiometrics] = useState<Member | null>(null);

  // Form State
  const [formError, setFormError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [formCardNo, setFormCardNo] = useState('');
  const [formPrincipalName, setFormPrincipalName] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formGender, setFormGender] = useState<'M' | 'F'>('M');
  const [formOrg, setFormOrg] = useState('');
  const [formRelationship, setFormRelationship] = useState<RelationshipType>('Principal');
  const [mainInsuredName, setMainInsuredName] = useState('');
  const [mainInsuredCardNo, setMainInsuredCardNo] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formStatus, setFormStatus] = useState<MemberStatus>('Actif');
  const [formHasPhoto, setFormHasPhoto] = useState(false);
  const [formHasBiometrics, setFormHasBiometrics] = useState(false);
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [biometricData, setBiometricData] = useState<{ score: number; template: string; finger: string } | null>(null);

  // Live capture modals
  const [isWebcamModalOpen, setIsWebcamModalOpen] = useState(false);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);

  // Deprecated/Legacy secondary support
  const [formSpouseName, setFormSpouseName] = useState('');
  const [formDependentRelationship, setFormDependentRelationship] = useState<DependentRelationship>('spouse');
  const [formChildren, setFormChildren] = useState<string[]>([]);
  const [newChildInput, setNewChildInput] = useState('');

  const filteredMembers = useMemo(() => {
    // === AMÉLIORATION AJOUTÉE : dédoublonnage par numéro de carte avant filtrage/affichage
    // — voir dedupeMembersByCardNo pour le contexte (données Firestore inchangées).
    const uniqueMembers = dedupeMembersByCardNo(members);
    return uniqueMembers.filter((m) => {
      // In Admin/Supervisor members table, only show primary insured members (dependents are viewed in details modal)
      // NOTE: the `=== ''` branch here was always dead code (an empty string is already
      // falsy and covered by `!m.relationship`; RelationshipType's members are all non-empty
      // literals so that comparison could never be true) — removed only because it started
      // tripping a real TS2367 compile error once this array went through
      // dedupeMembersByCardNo() first; behavior is unchanged.
      const isPrincipal = !m.relationship || m.relationship === 'Principal';
      if (!isPrincipal) return false;

      const matchSearch =
        m.cardNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.principalName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.spouseName && m.spouseName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (m.dependents && m.dependents.some((d) => d.fullName.toLowerCase().includes(searchTerm.toLowerCase()))) ||
        m.children.some((c) => c.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchOrg = selectedOrg === 'ALL' || m.organization === selectedOrg;
      const matchStatus =
        selectedStatus === 'ALL' ||
        m.status.toLowerCase() === selectedStatus.toLowerCase() ||
        (selectedStatus === 'Actif' && m.status.toLowerCase() === 'active') ||
        (selectedStatus === 'active' && m.status.toLowerCase() === 'actif');

      return matchSearch && matchOrg && matchStatus;
    });
  }, [members, searchTerm, selectedOrg, selectedStatus]);

  const renderDependents = (m: Member) => {
    const items: { label: string; name: string }[] = [];

    if (m.dependents && m.dependents.length > 0) {
      m.dependents.forEach((d) => {
        const relLabel = d.relationship.charAt(0).toUpperCase() + d.relationship.slice(1);
        items.push({
          label: relLabel,
          name: d.fullName + (d.age ? ` (${d.age} yrs)` : ''),
        });
      });
    } else {
      if (m.spouseName) {
        const relLabel = m.dependentRelationship
          ? m.dependentRelationship.charAt(0).toUpperCase() + m.dependentRelationship.slice(1)
          : 'Spouse';
        items.push({ label: relLabel, name: m.spouseName });
      }
      if (m.children && m.children.length > 0) {
        m.children.forEach((c) => {
          items.push({ label: 'Child', name: c });
        });
      }
    }

    if (items.length === 0) {
      return <span className="text-slate-300 italic">—</span>;
    }

    return (
      <div className="space-y-1.5 max-w-[200px]">
        {items.map((item, idx) => (
          <div key={idx} className="text-xs leading-tight">
            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 uppercase mr-1.5">
              {item.label}
            </span>
            <span className="font-semibold text-slate-800">{item.name}</span>
          </div>
        ))}
      </div>
    );
  };

  
  const openMemberView = (m: Member) => {
    setSelectedMemberForView(m);
    
    // Fetch claims for this member from Firestore
    import('firebase/firestore').then(({ collection, query, where, getDocs }) => {
      import('../../lib/firebase').then(({ db }) => {
        const q = query(collection(db, 'claims'), where('memberCardNo', '==', m.cardNo));
        getDocs(q).then(snapshot => {
          const memberClaims = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setMemberClaims(memberClaims as any[]);
        });
      });
    });
    
    // Frequency calculation
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let monthCount = 0;
    let weekCount = 0;
    
    memberClaims.forEach(c => {
      const d = new Date(c.serviceDate);
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        monthCount++;
      }
      const diffTime = Math.abs(now.getTime() - d.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      if (diffDays <= 7) {
        weekCount++;
      }
    });
    
    if (weekCount > 3 || monthCount > 4) {
      setFrequencyAlert(
        'Frequency Alert: This member has visited the healthcare facility more than 3 times in 7 days or more than 4 times this month.'
      );
    } else {
      setFrequencyAlert(null);
    }
    
    setMemberViewModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingMember(null);
    // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — le champ était
    // auparavant pré-rempli avec une valeur aléatoire au format obsolète "ACT-2026-XXXX",
    // masquant le fait que le champ pouvait rester vide pour déclencher la génération
    // automatique (AMID-YYMMDD-NNNNN) et risquant, si laissé tel quel, d'enregistrer un
    // numéro de carte invalide. Laissé vide par défaut, comme l'indique désormais le
    // libellé "leave blank to auto-generate".
    setFormCardNo('');
    setFormPrincipalName('');
    setFormBirthDate('');
    setFormGender('M');
    setFormOrg(organizations.length > 0 ? organizations[0].name : 'TotalEnergies Liberia Ltd');
    setFormRelationship('Principal');
    setMainInsuredName('');
    setMainInsuredCardNo('');
    setFormPhone('');
    setFormEmail('');
    setFormStatus('Actif');
    setFormHasPhoto(false);
    setFormHasBiometrics(false);
    setPhotoData(null);
    setBiometricData(null);
    setFormSpouseName('');
    setFormDependentRelationship('spouse');
    setFormChildren([]);
    setMemberModalOpen(true);
  };

  const openEditModal = (m: Member) => {
    setEditingMember(m);
    setFormCardNo(m.cardNo);
    setFormPrincipalName(m.principalName);
    setFormBirthDate(m.birthDate || '');
    setFormGender(m.gender || 'M');
    setFormOrg(m.organization || (organizations[0]?.name || ''));
    setFormRelationship(m.relationship || 'Principal');
    setMainInsuredName(m.relationship !== 'Principal' ? (m.principalName || '') : '');
    setMainInsuredCardNo(m.relationship !== 'Principal' ? (m.cardNo || '') : '');
    setFormPhone(m.phone || '');
    setFormEmail(m.email || '');
    setFormStatus(m.status);
    setFormHasPhoto(m.hasPhoto || !!m.photoUrl);
    setFormHasBiometrics(m.hasBiometrics || !!m.fingerprintScore);
    setPhotoData(m.photoUrl || null);
    setBiometricData(
      m.hasBiometrics || m.fingerprintScore
        ? { score: m.fingerprintScore || 96, template: 'FP_TEMPLATE_MATCH', finger: 'Right Thumb' }
        : null
    );
    setFormSpouseName(m.spouseName || (m.dependents && m.dependents[0]?.fullName) || '');
    setFormDependentRelationship(m.dependentRelationship || (m.dependents && m.dependents[0]?.relationship) || 'spouse');
    setFormChildren(m.children || (m.dependents ? m.dependents.filter((d) => d.relationship === 'child').map((d) => d.fullName) : []));
    setMemberModalOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setPhotoData(uploadEvent.target?.result as string);
        setFormHasPhoto(true);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const handlePhotoCaptured = (capturedPhotoUrl: string) => {
    setPhotoData(capturedPhotoUrl);
    setFormHasPhoto(true);
  };

  const handleFingerprintCaptured = (data: { score: number; template: string; finger: string }) => {
    setBiometricData(data);
    setFormHasBiometrics(true);
  };

  const handleAddChild = () => {
    if (newChildInput.trim() && formChildren.length < 6) {
      setFormChildren([...formChildren, newChildInput.trim()]);
      setNewChildInput('');
    }
  };

  const handleRemoveChild = (index: number) => {
    setFormChildren(formChildren.filter((_, i) => i !== index));
  };

  // === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — handleSubmit est
  // désormais asynchrone. En édition, le numéro de carte n'est jamais touché (le champ est
  // d'ailleurs désactivé dans le formulaire). En création : vide -> génération automatique et
  // transactionnelle ; saisi -> validation du format puis réservation transactionnelle
  // (rejeté si déjà attribué à un autre assuré) — jamais fait confiance sans vérification.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formPrincipalName.trim() || !formOrg.trim()) {
      setFormError('Please fill in all mandatory fields (Name and Organization).');
      return;
    }

    let finalCardNo = formCardNo.trim();
    if (!editingMember) {
      setIsSavingCard(true);
      try {
        if (finalCardNo) {
          await reserveExistingCardNumber(finalCardNo, {
            organization: formOrg,
            insuredName: formPrincipalName.trim(),
            assignedBy: currentUser?.uid,
            assignedByName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
            method: 'MANUAL',
          });
        } else {
          finalCardNo = await generateNextCardNumber({
            organization: formOrg,
            insuredName: formPrincipalName.trim(),
            assignedBy: currentUser?.uid,
            assignedByName: currentUser?.fullName || currentUser?.displayName || currentUser?.email,
            method: 'MANUAL',
          });
        }
      } catch (err: any) {
        setFormError(err?.message || 'Could not assign a card number. Please try again.');
        setIsSavingCard(false);
        return;
      }
      setIsSavingCard(false);
    }

    // Construct dependents array
    const dependentsList: DependentItem[] = [];
    if (formSpouseName.trim()) {
      dependentsList.push({
        id: `dep-${Date.now()}-1`,
        fullName: formSpouseName.trim(),
        relationship: formDependentRelationship,
      });
    }
    formChildren.forEach((child, i) => {
      dependentsList.push({
        id: `dep-${Date.now()}-${i + 2}`,
        fullName: child,
        relationship: 'child',
      });
    });

    // === ADDED IMPROVEMENT: upload the captured/uploaded photo to Firebase Storage
    // (instead of saving it as base64 in the Firestore document) once, at save time.
    // Automatic, transparent fallback to the existing behavior (inline base64) if the
    // upload fails — see storageUtils.ts.
    const resolvedPhotoUrl = photoData
      ? await uploadPhotoOrFallback(photoData, 'member-photos', formCardNo.trim(), formOrg)
      : editingMember?.photoUrl;

    if (editingMember) {
      onUpdateMember({
        ...editingMember,
        cardNo: formCardNo.trim(),
        principalName: formPrincipalName.trim(),
        birthDate: formBirthDate || '1990-01-01',
        gender: formGender,
        organization: formOrg,
        relationship: formRelationship,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        spouseName: formSpouseName.trim() || undefined,
        dependentRelationship: formDependentRelationship,
        dependents: dependentsList,
        children: formChildren,
        status: formStatus,
        hasPhoto: formHasPhoto || !!photoData,
        photoUrl: resolvedPhotoUrl || undefined,
        hasBiometrics: formHasBiometrics || !!biometricData,
        fingerprintScore: biometricData?.score || editingMember.fingerprintScore || (formHasBiometrics ? 96 : undefined),
        fingerprintSensor: 'FAP-20 USB Optical Scanner',
        fingerprintDate: new Date().toISOString().split('T')[0],
      });
    } else {
      onAddMember({
        cardNo: finalCardNo,
        principalName: formPrincipalName.trim(),
        birthDate: formBirthDate || '1990-01-01',
        gender: formGender,
        organization: formOrg,
        relationship: formRelationship,
        phone: formPhone.trim() || undefined,
        email: formEmail.trim() || undefined,
        spouseName: formSpouseName.trim() || undefined,
        dependentRelationship: formDependentRelationship,
        dependents: dependentsList,
        children: formChildren,
        status: formStatus,
        hasPhoto: formHasPhoto || !!photoData,
        photoUrl: resolvedPhotoUrl || undefined,
        hasBiometrics: formHasBiometrics || !!biometricData,
        fingerprintScore: biometricData?.score || (formHasBiometrics ? 96 : undefined),
        fingerprintSensor: 'FAP-20 USB Optical Scanner',
        fingerprintDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString().split('T')[0],
        outpatientCeilingUSD: 500,
        outpatientBalanceUSD: 500,
        inpatientCeilingUSD: 5000,
        inpatientBalanceUSD: 5000,
      });
    }
    setMemberModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Action Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="flex flex-wrap sm:flex-nowrap gap-2.5 items-center flex-1">
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, card number..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:bg-white transition"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          <select
            value={selectedOrg}
            onChange={(e) => setSelectedOrg(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="ALL">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.name}>
                {org.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            <option value="ALL">All Status</option>
            <option value="Actif">Active</option>
            <option value="Suspendu">Suspended</option>
            <option value="Inactif">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Single Unified Export Button */}
          {userRole !== 'Agent' && (
          <div className="relative">
            <button
              id="export-members-dropdown-btn"
              type="button"
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {exportMenuOpen && (
              <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-44 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-30 animate-in fade-in zoom-in-95">
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    exportMembersToExcel(filteredMembers, lang);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 flex items-center gap-2 transition cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportMenuOpen(false);
                    exportMembersToCSV(filteredMembers, lang);
                  }}
                  className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900 flex items-center gap-2 transition cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>CSV (.csv)</span>
                </button>
              </div>
            )}
          </div>
          )}

          {userRole === 'Admin' && (
            <button
              id="import-members-excel-btn"
              onClick={() => setImportModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <UploadCloud className="w-4 h-4 text-[#10B981]" />
            <span>Import Excel</span>
          </button>
          )}

          {/* === ADDED IMPROVEMENT: dedicated import for multi-organization workbooks
              (sheet pairs "<Organization> - Staff" / "<Organization> - Deps"), distinct
              from the "Import Excel" button above, which only reads a single sheet/organization === */}
          {userRole === 'Admin' && (
            <button
              id="import-members-multi-org-btn"
              onClick={() => setImportMultiOrgModalOpen(true)}
              title="Import a multi-organization workbook (sheets &quot;Organization - Staff&quot; / &quot;Organization - Deps&quot;)"
              className="px-3.5 py-2 rounded-xl bg-[var(--brand-50)] hover:bg-[var(--brand-100)] text-[var(--brand-900)] border border-[var(--brand-200)] text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <UploadCloud className="w-4 h-4 text-[var(--brand-900)]" />
              <span>Import Multi-Org (Staff/Deps)</span>
            </button>
          )}

          {userRole === 'Admin' && (
            <button
              id="create-member-btn"
              onClick={openCreateModal}
            className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Member</span>
          </button>
          )}
        </div>
      </div>

      {/* Members Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-slate-800" />
            <h3 className="font-bold text-base text-slate-800">Primary Insured Members</h3>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-xs font-bold border border-slate-200">
              {filteredMembers.length}
            </span>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            {t.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">CARD NO.</th>
                  <th className="py-3.5 px-4">PRIMARY INSURED</th>
                  <th className="py-3.5 px-4">DEPENDANTS</th>
                  <th className="py-3.5 px-4">ORGANIZATION</th>
                  <th className="py-3.5 px-4 text-center">BIOMETRICS</th>
                  <th className="py-3.5 px-4 text-center">STATUS</th>
                  <th className="py-3.5 px-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMembers.map((m) => {
                  const currentDeps = getMemberDependents(m);
                  const depCount = currentDeps.length;

                  const memberCeiling = ceilings.find(
                    (c) => c.organization === m.organization || c.organizationId === m.organizationId
                  );
                  const eligResult = checkMemberEligibility(m, null, memberCeiling);
                  const isAgeExceeded = !eligResult.isEligible && eligResult.code === 'AGE_LIMIT_EXCEEDED';

                  return (
                    <tr
                      key={m.id}
                      onClick={() => openMemberView(m)}
                      className="hover:bg-[#F8FAFC] transition-colors cursor-pointer group"
                    >
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {m.cardNo}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800 group-hover:text-slate-900 transition-colors flex items-center gap-2 flex-wrap">
                          <span>{m.principalName}</span>
                          {isAgeExceeded && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black">
                              <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                              <span>Age limit exceeded ({eligResult.age} yrs &gt; Limit {eligResult.maxAgeAllowed} yrs)</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#64748B] font-medium mt-0.5">
                          Born on {m.birthDate || 'N/A'} {eligResult.age !== undefined ? `(${eligResult.age} yrs)` : ''}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 group-hover:bg-slate-200 transition-colors">
                          <Users className="w-3.5 h-3.5 text-slate-600" />
                          <span>{depCount === 1 ? '1 Dependant' : `${depCount} Dependants`}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-700 overflow-hidden shrink-0">
                            {m.organization.charAt(0)}
                          </div>
                          <span className="font-medium text-xs text-slate-800">{m.organization}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMemberForBiometrics(m);
                            setBiometricModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                          title="View biometric profile"
                        >
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center border ${m.hasPhoto ? 'bg-emerald-50 text-[#10B981] border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            <Camera className="w-3 h-3" />
                          </span>
                          <span className={`w-5 h-5 rounded-md flex items-center justify-center border ${m.hasBiometrics ? 'bg-emerald-50 text-[#10B981] border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            <Fingerprint className="w-3 h-3" />
                          </span>
                          <span className="text-xs font-semibold text-slate-700 hover:underline ml-0.5">
                            View
                          </span>
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {m.status === 'Actif' || m.status === 'Active' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#047857] border border-emerald-200 text-xs font-semibold">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]"></div>
                            <span>Active</span>
                          </span>
                        ) : m.status === 'Suspendu' || m.status === 'Suspended' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                            <span>Suspended</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500"></div>
                            <span>Inactive</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {(userRole === 'Admin' || userRole === 'Superviseur' || userRole === 'Supervisor') && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const isSusp = m.status === 'Suspendu' || m.status === 'Suspended';
                                  setConfirmMemberAction({
                                    member: m,
                                    action: isSusp ? 'reactivate' : 'suspend',
                                  });
                                }}
                                className={`px-2 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                                  m.status === 'Suspendu' || m.status === 'Suspended'
                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                                }`}
                                title={
                                  m.status === 'Suspendu' || m.status === 'Suspended'
                                    ? 'Reactivate principal & dependants'
                                    : 'Suspend member & all dependants'
                                }
                              >
                                {m.status === 'Suspendu' || m.status === 'Suspended' ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Reactivate</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Suspend</span>
                                  </>
                                )}
                              </button>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditModal(m);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                                title={t.edit}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          {userRole === 'Admin' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteMember(m.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                              title={t.delete}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer with Showing Count & Pagination */}
        <div className="px-6 py-3.5 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-[#64748B] font-medium">
            Showing 1 to {filteredMembers.length} of {filteredMembers.length} members
          </span>
          <div className="flex items-center gap-1">
            <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 text-xs cursor-pointer">
              ‹
            </button>
            <button className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-700 text-white text-xs font-bold">
              1
            </button>
            <button className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 text-xs cursor-pointer">
              ›
            </button>
          </div>
        </div>
      </div>

      {/* 2 Bottom Information Cards matching Screenshot */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        {/* Card 1: About Insured Members */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-[#10B981] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">About Insured Members</h4>
            </div>
          </div>
          <p className="text-xs text-[#64748B] mb-4">
            Manage policyholder profiles, dependent relationships, and coverage eligibility.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-100/60 text-[#10B981] flex items-center justify-center shrink-0 mt-0.5">
                <UserCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Accurate Profiles</div>
                <div className="text-[10px] text-[#64748B] mt-0.5">Maintain up-to-date member information</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-slate-200/60 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Dependants Management</div>
                <div className="text-[10px] text-[#64748B] mt-0.5">Track dependants and their relationships</div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-purple-100/60 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Coverage Validity</div>
                <div className="text-[10px] text-[#64748B] mt-0.5">Ensure valid coverage and plan eligibility</div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Supported Relationship Types */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Supported Relationship Types</h4>
            </div>
          </div>
          <p className="text-xs text-[#64748B] mb-4">
            Dependants can be any of the following relationship types:
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            {['Spouse', 'Husband', 'Wife', 'Child', 'Parent', 'Other'].map((rel) => (
              <span
                key={rel}
                className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                {rel}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* MEMBER & DEPENDANTS DETAILS MODAL */}
      
      {memberViewModalOpen && selectedMemberForView && (() => {
        const viewDependents = getMemberDependents(selectedMemberForView);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setMemberViewModalOpen(false)}></div>
            <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95">
              
              {/* Modal Header */}
              <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-200/70 flex items-center justify-center">
                    <Users className="w-5 h-5 text-slate-700" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                      Member & Dependants Details
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">
                      Beneficiary profile and enrolled family members breakdown
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMemberViewModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                {frequencyAlert && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold p-4 rounded-2xl flex items-center gap-3 shadow-2xs">
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                    <span>{frequencyAlert}</span>
                  </div>
                )}

                {/* Real-time age eligibility calculation */}
                {(() => {
                  const policyCeiling = ceilings.find(
                    (c) => c.organization === selectedMemberForView.organization || c.organizationId === selectedMemberForView.organizationId
                  );
                  const pElig = checkMemberEligibility(selectedMemberForView, null, policyCeiling);

                  return (
                    <>
                      {!pElig.isEligible && (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-xs font-bold text-rose-800 shadow-2xs">
                          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                          <div className="flex-1">
                            <span className="font-extrabold block">Care Eligibility Alert: Ineligible</span>
                            <span className="font-normal text-rose-700">{pElig.reason}</span>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white text-[10px] font-black uppercase">
                            Claims Blocked
                          </span>
                        </div>
                      )}

                      {/* PRIMARY INSURED RECALL SUMMARY CARD */}
                      <div className="bg-gradient-to-r from-slate-50 via-slate-100/40 to-slate-50 border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
                        <div className="text-[10px] font-extrabold tracking-wider uppercase text-slate-400 mb-2.5">
                          PRIMARY INSURED
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3.5">
                            <div className="w-12 h-12 rounded-2xl bg-slate-700 text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0">
                              {selectedMemberForView.principalName.charAt(0)}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 leading-tight">
                                  {selectedMemberForView.principalName}
                                </h3>
                                {!pElig.isEligible && pElig.code === 'AGE_LIMIT_EXCEEDED' && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black">
                                    Age limit exceeded ({pElig.age} yrs &gt; Limit {pElig.maxAgeAllowed} yrs)
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                                <span className="font-mono font-bold text-slate-700 bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                  Card No: {selectedMemberForView.cardNo}
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className="font-semibold text-slate-700 flex items-center gap-1.5 bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                  {selectedMemberForView.organization}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5">
                            {selectedMemberForView.birthDate && (
                              <div className="bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs text-left">
                                <div className="text-[9px] uppercase font-bold text-slate-400">Date of Birth</div>
                                <div className="text-xs font-bold text-slate-800">
                                  {selectedMemberForView.birthDate} {pElig.age !== undefined ? `(${pElig.age} yrs)` : ''}
                                </div>
                              </div>
                            )}
                            <span className={`px-3 py-1.5 rounded-xl border text-xs font-extrabold shadow-2xs ${
                              pElig.isEligible
                                ? 'bg-emerald-50 text-[#047857] border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              {pElig.isEligible ? 'Eligible for Care' : 'Ineligible'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* DEPENDANTS SECTION */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-[var(--brand-900)]" />
                      <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                        DEPENDANTS ({viewDependents.length})
                      </h4>
                    </div>
                    {viewDependents.length > 0 && (
                      <span className="text-xs text-slate-500 font-semibold">
                        {viewDependents.length === 1
                          ? '1 family member attached'
                          : `${viewDependents.length} family members attached`}
                      </span>
                    )}
                  </div>

                  {viewDependents.length > 0 ? (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                              <th className="py-3 px-4 whitespace-nowrap">Card No.</th>
                              <th className="py-3 px-4 whitespace-nowrap">Dependants Name</th>
                              <th className="py-3 px-4 whitespace-nowrap">Date of Birth</th>
                              <th className="py-3 px-4 whitespace-nowrap">Relationship</th>
                              <th className="py-3 px-4 whitespace-nowrap">Primary Insured</th>
                              <th className="py-3 px-4 whitespace-nowrap">Primary Card No.</th>
                              <th className="py-3 px-4 whitespace-nowrap">Organization</th>
                              <th className="py-3 px-4 text-center whitespace-nowrap">Biometrics</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {viewDependents.map((dep) => {
                              const policyCeiling = ceilings.find(
                                (c) => c.organization === selectedMemberForView.organization || c.organizationId === selectedMemberForView.organizationId
                              );
                              const depElig = checkMemberEligibility(selectedMemberForView, dep, policyCeiling);
                              const depAgeExceeded = !depElig.isEligible && depElig.code === 'AGE_LIMIT_EXCEEDED';

                              return (
                                <tr key={dep.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="py-3.5 px-4 font-mono font-bold text-slate-700 whitespace-nowrap">
                                    {dep.cardNo}
                                  </td>
                                  <td className="py-3.5 px-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-slate-900">{dep.fullName}</span>
                                      {depAgeExceeded && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-black">
                                          <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                                          <span>Age limit exceeded ({depElig.age} yrs &gt; Limit {depElig.maxAgeAllowed} yrs)</span>
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3.5 px-4 whitespace-nowrap text-slate-700">
                                    <div className="font-medium">{dep.birthDate}</div>
                                    {depElig.age !== undefined && (
                                      <div className="text-[10px] text-slate-400 font-semibold">{depElig.age} yrs</div>
                                    )}
                                  </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border ${getRelationshipBadgeClass(
                                      dep.relationship
                                    )}`}
                                  >
                                    {dep.relationship}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap text-slate-800 font-medium">
                                  {selectedMemberForView.principalName}
                                </td>
                                <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                                  {selectedMemberForView.cardNo}
                                </td>
                                <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                                  {selectedMemberForView.organization}
                                </td>
                                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                                      dep.hasBiometrics
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                                    }`}
                                  >
                                    {dep.hasBiometrics ? (
                                      <>
                                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        Enrolled
                                      </>
                                    ) : (
                                      <>
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                        Pending
                                      </>
                                    )}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center bg-slate-50/60 border border-slate-200 rounded-2xl">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <UserX className="w-6 h-6" />
                      </div>
                      <h5 className="text-sm font-bold text-slate-800">No dependants registered</h5>
                      <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                        This primary insured currently has no registered dependants under this policy.
                      </p>
                    </div>
                  )}
                </div>

                {/* CARE CEILINGS & CLAIMS SECTION */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                  {/* Outpatient */}
                  <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">Outpatient Care Limits</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Ceiling USD:</span>
                        <span className="font-bold text-slate-800">$ {selectedMemberForView.outpatientCeilingUSD || 500}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Balance USD:</span>
                        <span className="font-black text-emerald-600">$ {selectedMemberForView.outpatientBalanceUSD || 420}</span>
                      </div>
                      <div className="h-px bg-slate-200 w-full my-1.5"></div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Ceiling LRD:</span>
                        <span className="font-bold text-slate-800">L$ {selectedMemberForView.outpatientCeilingLRD || 97500}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Balance LRD:</span>
                        <span className="font-black text-emerald-600">L$ {selectedMemberForView.outpatientBalanceLRD || 81900}</span>
                      </div>
                    </div>
                  </div>

                  {/* Inpatient */}
                  <div className="bg-slate-50 border border-slate-200 p-4.5 rounded-2xl">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">Inpatient Care Limits</h4>
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Ceiling USD:</span>
                        <span className="font-bold text-slate-800">$ {selectedMemberForView.inpatientCeilingUSD || 5000}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Balance USD:</span>
                        <span className="font-black text-emerald-600">$ {selectedMemberForView.inpatientBalanceUSD || 5000}</span>
                      </div>
                      <div className="h-px bg-slate-200 w-full my-1.5"></div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Ceiling LRD:</span>
                        <span className="font-bold text-slate-800">L$ {selectedMemberForView.inpatientCeilingLRD || 975000}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-medium">Balance LRD:</span>
                        <span className="font-black text-emerald-600">L$ {selectedMemberForView.inpatientBalanceLRD || 975000}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Claims History */}
                <div className="pt-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3">Claims History</h4>
                  {memberClaims.length > 0 ? (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="py-2.5 px-4 font-bold text-slate-600">Date</th>
                            <th className="py-2.5 px-4 font-bold text-slate-600">Provider</th>
                            <th className="py-2.5 px-4 font-bold text-slate-600">Acts</th>
                            <th className="py-2.5 px-4 font-bold text-slate-600">Amount</th>
                            <th className="py-2.5 px-4 font-bold text-slate-600">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {memberClaims.map(c => (
                            <tr key={c.id}>
                              <td className="py-2.5 px-4 text-slate-700 font-medium">{c.serviceDate}</td>
                              <td className="py-2.5 px-4 text-slate-700 font-medium">{c.provider}</td>
                              <td className="py-2.5 px-4 text-slate-500 max-w-[150px] truncate">
                                 {c.medicalActs?.map((a: any) => a.name).join(', ') || c.careType}
                              </td>
                              <td className="py-2.5 px-4 text-slate-900 font-bold">{c.currency === 'LRD' ? 'L$' : '$'} {c.amount}</td>
                              <td className="py-2.5 px-4">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  c.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 
                                  c.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {c.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 italic p-4 text-center border border-slate-200 rounded-2xl bg-slate-50/60">
                      No claims history found
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setMemberViewModalOpen(false)}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 transition shadow-2xs cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* INSURED BIOMETRIC ENROLLMENT MODAL (+ NEW MEMBER / EDIT MEMBER) */}
      {memberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="bg-white border-b border-slate-200 px-6 sm:px-8 py-5 text-slate-900 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg text-slate-900">
                    {editingMember ? 'Edit Insured Member' : 'Insured Biometric Enrollment'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Identity capture and biometric enrollment for health card issuance
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-slate-700" />
                </div>
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer ml-1 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto">
              {formError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{formError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormError(null)}
                    className="text-rose-500 hover:text-rose-800 text-xs font-bold px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* SECTION 1: BENEFICIARY IDENTITY */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
                  <Shield className="w-4 h-4 text-slate-700" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Beneficiary Identity
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* === AMÉLIORATION AJOUTÉE : Centralized Card Number Management System — sur
                      demande explicite. À la création, laisser vide génère automatiquement un
                      numéro unique (AMID-XXXXX-XXXX) ; un numéro saisi manuellement est validé
                      (format) et réservé (rejeté s'il est déjà attribué à quelqu'un d'autre).
                      En modification, le numéro existant n'est jamais modifiable ici — un
                      numéro déjà attribué est définitif (section 15 de la demande). === */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Health Card No {editingMember ? '(cannot be changed)' : '(leave blank to auto-generate)'}
                    </label>
                    <input
                      type="text"
                      value={formCardNo}
                      onChange={(e) => setFormCardNo(e.target.value)}
                      placeholder={editingMember ? undefined : 'e.g. AMID-260903-00497 — leave blank to auto-assign'}
                      disabled={!!editingMember}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-70 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Full Legal Name *
                    </label>
                    <input
                      type="text"
                      value={formPrincipalName}
                      onChange={(e) => setFormPrincipalName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Date of Birth *
                    </label>
                    <input
                      type="date"
                      value={formBirthDate}
                      onChange={(e) => setFormBirthDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Gender *
                    </label>
                    <select
                      value={formGender}
                      onChange={(e) => setFormGender(e.target.value as 'M' | 'F')}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer"
                    >
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Organization / Employer *
                    </label>
                    <select
                      value={formOrg}
                      onChange={(e) => setFormOrg(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer"
                      required
                    >
                      {organizations.map((org) => (
                        <option key={org.id} value={org.name}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION 2: POLICY STATUS & BENEFICIARY TIER */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
                  <User className="w-4 h-4 text-slate-700" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Policy Status & Beneficiary Tier
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Relationship *
                    </label>
                    <select
                      value={formRelationship}
                      onChange={(e) => setFormRelationship(e.target.value as RelationshipType)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer"
                    >
                      <option value="Principal">Principal Insured</option>
                      <option value="Spouse">Spouse</option>
                      <option value="Child">Child / Dependent</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Member Status
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as MemberStatus)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500 cursor-pointer"
                    >
                      <option value="Actif">{t.active}</option>
                      <option value="Suspendu">{t.suspended}</option>
                      <option value="Inactif">{t.inactive}</option>
                    </select>
                  </div>
                </div>

                {formRelationship !== 'Principal' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Principal Insured Full Name *
                      </label>
                      <input
                        type="text"
                        value={mainInsuredName}
                        onChange={(e) => setMainInsuredName(e.target.value)}
                        placeholder="e.g. Samuel Cooper"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Principal Health Card No *
                      </label>
                      <input
                        type="text"
                        value={mainInsuredCardNo}
                        onChange={(e) => setMainInsuredCardNo(e.target.value)}
                        placeholder="e.g. AMID-260903-00001"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        required
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: CONTACT DETAILS */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
                  <Phone className="w-4 h-4 text-slate-700" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Contact Details
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+231 77 123 4567"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="insured@organization.com"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 4: BIOMETRIC CAPTURE & FACIAL IDENTIFICATION */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-slate-800 border-b border-slate-100 pb-2">
                  <Fingerprint className="w-4 h-4 text-slate-700" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Biometric Capture & Facial Identification
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Photo Box */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-between text-center space-y-3">
                    <div className="w-24 h-24 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden bg-white shadow-2xs relative">
                      {photoData ? (
                        <img
                          src={photoData}
                          alt="Beneficiary Captured"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera className="w-8 h-8 text-slate-400" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-800">Facial Identification</p>
                      <p className="text-[11px] text-slate-500">Live webcam snap or picture upload</p>
                    </div>

                    <div className="w-full flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsWebcamModalOpen(true)}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Webcam</span>
                      </button>

                      <label className="flex-1 py-2 px-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs">
                        <Upload className="w-3.5 h-3.5 text-slate-500" />
                        <span>Upload</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {photoData && (
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Photo Captured & Attached
                      </span>
                    )}
                  </div>

                  {/* Fingerprint Box */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center justify-between text-center space-y-3">
                    <div className={`w-24 h-24 rounded-2xl border-2 border-dashed ${biometricData ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white'} flex items-center justify-center shadow-2xs`}>
                      <Fingerprint className={`w-10 h-10 ${biometricData ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-800">Fingerprint Biometrics</p>
                      <p className="text-[11px] text-slate-500">Optical sensor live hardware scan</p>
                    </div>

                    <div className="w-full pt-1">
                      <button
                        type="button"
                        onClick={() => setIsFingerprintModalOpen(true)}
                        className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Fingerprint className="w-3.5 h-3.5" />
                        <span>{biometricData ? 'Rescan Fingerprint ✓' : 'Scan Fingerprint'}</span>
                      </button>
                    </div>

                    {biometricData && (
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified (Score: {biometricData.score}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer / Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setMemberModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSavingCard}
                  className="px-6 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-extrabold shadow-md shadow-slate-900/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>{isSavingCard ? 'Assigning card number…' : editingMember ? 'Update Member' : 'Submit Enrollment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WEBCAM CAPTURE MODAL */}
      {/* === FIX (pre-existing bug): the prop passed was "onCapture", which doesn't exist
          on WebcamCaptureModal (whose real prop is "onPhotoCaptured") — the
          handlePhotoCaptured callback was therefore NEVER called. Concretely, on this
          screen (Members), clicking "Capture Photo" did open the camera and the capture
          animation did play out, but the captured photo was never attached to the
          member's record. tsc does not catch this kind of prop error in this project
          (verified empirically), hence its silent presence. === */}
      <WebcamCaptureModal
        isOpen={isWebcamModalOpen}
        onClose={() => setIsWebcamModalOpen(false)}
        onPhotoCaptured={handlePhotoCaptured}
      />

      {/* BIOMETRIC FINGERPRINT SCANNER MODAL */}
      {/* === FIX (same bug): "onCapture" -> "onFingerprintCaptured" (the component's real
          prop) === */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onFingerprintCaptured={handleFingerprintCaptured}
      />

      {/* EXCEL IMPORT MODAL */}
      <ExcelImportModal<Member>
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        lang={lang}
        title={t.members.importExcel}
        targetType="members"
        currentUser={currentUser}
        onImport={(file) => parseMemberExcel(file, members)}
        onSuccess={async (importedList) => {
          // === AMÉLIORATION AJOUTÉE : on attend désormais la persistance réelle avant de
          // fermer le modal. Si onImportMembers échoue (ex: écritures Firestore en échec),
          // l'erreur remonte au modal (qui affichera un message d'erreur au lieu d'un faux
          // succès) et le modal reste ouvert pour permettre à l'utilisateur de réessayer.
          await onImportMembers(importedList);
          setImportModalOpen(false);
        }}
      />

      {/* === ADDED IMPROVEMENT: MULTI-ORGANIZATION IMPORT MODAL (Staff / Deps) ===
          Reuses the same ExcelImportModal component and the same onImportMembers (so the same
          Firestore persistence fixed in App.tsx) — only the parser and template differ. */}
      <ExcelImportModal<Member>
        isOpen={importMultiOrgModalOpen}
        onClose={() => setImportMultiOrgModalOpen(false)}
        lang={lang}
        title="Import Multi-Organisations (Staff / Deps)"
        targetType="members-multi-org"
        onImport={(file) => parseActivaMultiOrgExcel(file, members, organizations)}
        onDownloadTemplate={generateMultiOrgTemplateExcel}
        onSuccess={(importedList) => {
          onImportMembers(importedList);
          setImportMultiOrgModalOpen(false);
        }}
      />

      {/* BIOMETRIC & PROFILE CONSULTATION MODAL */}
      <AttachmentBiometricViewerModal
        isOpen={biometricModalOpen}
        onClose={() => {
          setBiometricModalOpen(false);
          setSelectedMemberForBiometrics(null);
        }}
        lang={lang}
        type="member"
        data={selectedMemberForBiometrics}
      />

      {/* SUSPEND / REACTIVATE MEMBER CONFIRMATION MODAL */}
      {confirmMemberAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  confirmMemberAction.action === 'suspend' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {confirmMemberAction.action === 'suspend' ? (
                  <XCircle className="w-6 h-6" />
                ) : (
                  <CheckCircle2 className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-base font-extrabold text-slate-900">
                  {confirmMemberAction.action === 'suspend'
                    ? 'Suspend Insured Member & Dependants?'
                    : 'Reactivate Insured Member?'}
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {confirmMemberAction.action === 'suspend' ? (
                    <>
                      Suspending <strong>{confirmMemberAction.member.principalName}</strong> (Card #{confirmMemberAction.member.cardNo})
                      will automatically <strong>suspend all linked dependants and children</strong> and block any new claim submissions at healthcare provider centers.
                    </>
                  ) : (
                    <>
                      Reactivating <strong>{confirmMemberAction.member.principalName}</strong> will restore full insurance
                      entitlements and active coverage for both the principal and all eligible dependants.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmMemberAction(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { member, action } = confirmMemberAction;
                  if (action === 'suspend') {
                    if (onSuspendMember) {
                      onSuspendMember(member);
                    } else {
                      onUpdateMember({ ...member, status: 'Suspendu' });
                    }
                  } else {
                    if (onReactivateMember) {
                      onReactivateMember(member);
                    } else {
                      onUpdateMember({ ...member, status: 'Actif' });
                    }
                  }
                  setConfirmMemberAction(null);
                }}
                className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-md cursor-pointer transition ${
                  confirmMemberAction.action === 'suspend'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                }`}
              >
                {confirmMemberAction.action === 'suspend' ? 'Confirm Suspension' : 'Confirm Reactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
