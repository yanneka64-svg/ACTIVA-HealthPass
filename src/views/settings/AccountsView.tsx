import { FirestoreService } from '../../services/firestore';
import { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { auth, secondaryAuth, db } from '../../lib/firebase';
import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  UserCheck,
  CheckCircle2,
  Mail,
  Calendar,
  Lock,
  Smartphone,
  Shield,
  Plus,
  Download,
  Search,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Edit2,
  RefreshCw,
  X,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  UserPlus,
  Users,
  Sliders,
  HelpCircle,
  CheckSquare,
  Square,
  Info,
} from 'lucide-react';
import { Language, UserAccount, UserProfile, PermissionKey, ACTIVA_ENTITIES } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { PERMISSIONS_MATRIX, MatrixRow } from '../../services/permissions';

export interface HabilitationDefinition {
  key: string;
  label: string;
  category: 'Dossier & Claim Management' | 'Validation & Decision' | 'Statistics & Reporting' | 'Administration & System';
  description: string;
  defaultForRoles: UserProfile[];
  sodRule?: string;
}

export const HABILITATIONS_SCHEMA: HabilitationDefinition[] = [
  {
    key: 'login_portal',
    label: 'Log in to Portal',
    category: 'Administration & System',
    description: 'Access the system with secure multi-factor credentials',
    defaultForRoles: ['Agent', 'Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'view_dashboard',
    label: 'View Operational Dashboard',
    category: 'Statistics & Reporting',
    description: 'Consult key performance indicators and operational activity',
    defaultForRoles: ['Agent', 'Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'create_dossier',
    label: 'Create Dossier / New Record',
    category: 'Dossier & Claim Management',
    description: 'Enter new claims, medical vouchers, or biometric enrollments',
    defaultForRoles: ['Agent', 'Admin'],
  },
  {
    key: 'edit_own_dossiers',
    label: 'Edit Own Dossiers',
    category: 'Dossier & Claim Management',
    description: 'Update records filed by oneself prior to final validation',
    defaultForRoles: ['Agent', 'Admin'],
  },
  {
    key: 'edit_other_dossiers',
    label: 'Edit Dossiers from Other Agents',
    category: 'Dossier & Claim Management',
    description: 'Modify files and entries submitted by other staff members',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'validate_approve_dossiers',
    label: 'Validate & Approve Dossiers',
    category: 'Validation & Decision',
    description: 'Grant medical and administrative approval on submitted claims and files',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
    sodRule: 'Restricted to Supervisor / Medical Auditor (Strict Separation of Duties)',
  },
  {
    key: 'reject_dossiers',
    label: 'Reject Dossiers',
    category: 'Validation & Decision',
    description: 'Decline invalid claims or non-compliant membership files',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'return_dossiers',
    label: 'Return Dossiers for Correction',
    category: 'Validation & Decision',
    description: 'Send back dossiers with detailed medical/administrative queries',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'biometric_enrollment',
    label: 'Biometric Enrollment & Photo Capture',
    category: 'Dossier & Claim Management',
    description: 'Register fingerprint templates and facial identity photos',
    defaultForRoles: ['Agent', 'Admin'],
  },
  {
    key: 'identity_verification',
    label: 'Identity Verification & Biometric Match',
    category: 'Dossier & Claim Management',
    description: 'Match biometric QR codes and live finger scans against stored identity',
    defaultForRoles: ['Agent', 'Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'generate_print_cards',
    label: 'Generate & Print Physical Cards',
    category: 'Dossier & Claim Management',
    description: 'Issue and print PVC member cards with security QR codes',
    defaultForRoles: ['Agent', 'Admin'],
  },
  {
    key: 'generate_reports',
    label: 'Generate Statistical & Financial Reports',
    category: 'Statistics & Reporting',
    description: 'Export claims data, utilization stats, and audit records in Excel/CSV',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'export_archives',
    label: 'Export Dossier Archives (PDF/Excel)',
    category: 'Statistics & Reporting',
    description: 'Download bulk packages of claims and vouchers for accounting',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'manage_members_policies',
    label: 'Manage Member & Policy Database',
    category: 'Administration & System',
    description: 'Create and update policyholder, dependent, and ceiling registries',
    defaultForRoles: ['Admin'],
  },
  {
    key: 'manage_providers_tariffs',
    label: 'Manage Providers & Medical Tariffs',
    category: 'Administration & System',
    description: 'Configure partner healthcare facilities, contracted rates, and ceilings',
    defaultForRoles: ['Admin'],
  },
  {
    key: 'manage_user_accounts',
    label: 'User Account Creation & Role Assignment',
    category: 'Administration & System',
    description: 'Provision new staff logins, roles, and credential parameters',
    defaultForRoles: ['Admin'],
  },
  {
    key: 'revoke_delete_accounts',
    label: 'Revoke & Delete User Accounts',
    category: 'Administration & System',
    description: 'Permanently remove or suspend user accounts and access tokens',
    defaultForRoles: ['Admin'],
  },
  {
    key: 'audit_trail_logs',
    label: 'Audit Trail & System Logs Access',
    category: 'Administration & System',
    description: 'Consult immutable security logs and authentication event timelines',
    defaultForRoles: ['Supervisor', 'Superviseur', 'Admin'],
  },
  {
    key: 'system_configuration',
    label: 'System Configuration & Security Settings',
    category: 'Administration & System',
    description: 'Configure multi-factor policies, API endpoints, and backup settings',
    defaultForRoles: ['Admin'],
  },
];

interface AccountsViewProps {
  lang: Language;
  onNavigateToLogs?: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({ lang, onNavigateToLogs }) => {
  const t = useTranslation(lang);
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  React.useEffect(() => {
    const unsub = FirestoreService.subscribeToAccounts(setAccounts);
    return () => unsub();
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [profileFilter, setProfileFilter] = useState<string>('ALL');

  // Matrix of Entitlements Modal State
  const [matrixModalOpen, setMatrixModalOpen] = useState(false);
  const [activeMatrixTab, setActiveMatrixTab] = useState<string>('all');
  const [activePermCategory, setActivePermCategory] = useState<string>('all');

  const getPermissionsForProfile = (profile: UserProfile): string[] => {
    return HABILITATIONS_SCHEMA.filter((h) => h.defaultForRoles.includes(profile)).map((h) => h.key);
  };

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<UserAccount | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<{ id: string; email: string; name?: string } | null>(null);

  // Credential Display Dialog (shows passwords on creation or reset)
  const [credentialDialog, setCredentialDialog] = useState<{
    isOpen: boolean;
    title: string;
    fullName?: string;
    email: string;
    username?: string;
    password: string;
    profile: string;
    actionType: 'created' | 'reset';
  }>({
    isOpen: false,
    title: '',
    fullName: '',
    email: '',
    username: '',
    password: '',
    profile: '',
    actionType: 'created',
  });

  // Password visibility map for table
  const [visiblePasswords, setVisiblePasswords] = useState<{ [id: string]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State for Creation / Edit
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    fullName: '',
    position: '',
    entity: 'ACTIVA Liberia',
    phoneCountryCode: '+231',
    phone: '',
    profile: 'Agent' as UserProfile,
    mobileAccessEnabled: true,
    password: '',
    permissions: getPermissionsForProfile('Agent'),
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast('Password copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Generate strong random temporary password matching ActivaDAV2Z%!2025 pattern
  const generateStrongPassword = () => {
    const charsUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const charsNum = '23456789';
    const charsSpec = '!@#$%&*';

    let rUpper = '';
    for (let i = 0; i < 3; i++) rUpper += charsUpper.charAt(Math.floor(Math.random() * charsUpper.length));
    
    let rNum = charsNum.charAt(Math.floor(Math.random() * charsNum.length));
    let rUpper2 = charsUpper.charAt(Math.floor(Math.random() * charsUpper.length));
    let rSpec = charsSpec.charAt(Math.floor(Math.random() * charsSpec.length));
    
    return `Activa${rUpper}${rNum}${rUpper2}${rSpec}!2025`;
  };

  // Generate clean first.last username automatically
  const generateAutoUsername = (fullName: string): string => {
    if (!fullName.trim()) {
      return '';
    }

    const cleanName = fullName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    const parts = cleanName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return `${parts[0]}.${parts[parts.length - 1]}`;
  };

  const [usernameManuallyEdited, setUsernameManuallyEdited] = useState(false);
  const [emailManuallyEdited, setEmailManuallyEdited] = useState(false);

  const handleOpenCreate = () => {
    const initialProfile: UserProfile = 'Agent';
    const initialPassword = generateStrongPassword();

    setFormData({
      email: '',
      username: '',
      fullName: '',
      position: 'Field Operations Agent',
      entity: 'ACTIVA Liberia',
      phoneCountryCode: '+231',
      phone: '',
      profile: initialProfile,
      mobileAccessEnabled: true,
      password: initialPassword,
      permissions: getPermissionsForProfile(initialProfile),
    });
    setUsernameManuallyEdited(false);
    setEmailManuallyEdited(false);
    setActivePermCategory('all');
    setCreateModalOpen(true);
    setFormError(null);
  };

  const handleAutoUsername = () => {
    const autoUname = generateAutoUsername(formData.fullName) || 'first.last';
    setFormData((prev) => ({
      ...prev,
      username: autoUname,
      email: !emailManuallyEdited && autoUname !== 'first.last' ? `${autoUname}@activa-liberia.com` : prev.email,
    }));
    setUsernameManuallyEdited(false);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!formData.email || !formData.fullName || !formData.position) {
      setFormError('Please fill all required fields.');
      return;
    }

    setIsSubmitting(true);
    const emailLower = formData.email.toLowerCase().trim();
    const selectedEntity = formData.entity || 'ACTIVA Liberia';
    const selectedCountry = selectedEntity.replace(/^ACTIVA\s+/i, '');

    const pwdToSave = formData.password || generateStrongPassword();

    // Create user in Firebase Auth using secondary app to prevent log-out
    let uid = 'USR-' + Date.now();
    const cleanUsername = formData.username.trim() || generateAutoUsername(formData.fullName) || ('act_' + Math.floor(1000 + Math.random() * 9000));
    let authEmailUsed = `${cleanUsername.toLowerCase()}@activa.local`;

    try {
      if (emailLower.includes('@') && !emailLower.endsWith('@activa.local')) {
        try {
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailLower, pwdToSave);
          uid = userCredential.user.uid;
          authEmailUsed = emailLower;
        } catch (emailErr: any) {
          console.warn('Could not register with contact email, using sanitized corporate email:', emailErr);
          const fallbackEmail = `${cleanUsername.toLowerCase()}@activa.local`;
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, fallbackEmail, pwdToSave);
          uid = userCredential.user.uid;
          authEmailUsed = fallbackEmail;
        }
      } else {
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, authEmailUsed, pwdToSave);
        uid = userCredential.user.uid;
      }
      
      // Save profile to Firestore
      const newAccountDoc: UserAccount = {
        id: uid,
        username: cleanUsername.toLowerCase(),
        email: formData.email.trim(),
        authEmail: authEmailUsed,
        fullName: formData.fullName.trim(),
        position: formData.position.trim(),
        entity: selectedEntity,
        country: selectedCountry,
        phone: formData.phone ? `${formData.phoneCountryCode} ${formData.phone}` : '',
        phoneCountryCode: formData.phoneCountryCode || '+231',
        profile: formData.profile,
        permissions: (formData.permissions as PermissionKey[]) || (getPermissionsForProfile(formData.profile) as PermissionKey[]),
        isActive: true,
        isTemporaryPassword: true,
        mustChangePassword: true,
        password: pwdToSave,
        tempPassword: pwdToSave,
        passwordChangedAt: new Date().toISOString(),
        createdAt: new Date().toISOString().split('T')[0]
      };
      await setDoc(doc(db, 'accounts', uid), newAccountDoc);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || "Firebase creation error");
      setIsSubmitting(false);
      return;
    }

    const created: UserAccount = {
      id: uid,
      email: formData.email.trim(),
      authEmail: authEmailUsed,
      fullName: formData.fullName.trim(),
      position: formData.position.trim(),
      entity: selectedEntity,
      country: selectedCountry,
      username: cleanUsername.toLowerCase(),
      isTemporaryPassword: true,
      mustChangePassword: true,
      passwordChangedAt: new Date().toISOString(),
      phone: formData.phone ? `${formData.phoneCountryCode} ${formData.phone}` : '',
      phoneCountryCode: formData.phoneCountryCode || '+231',
      profile: formData.profile,
      permissions: (formData.permissions as PermissionKey[]) || (getPermissionsForProfile(formData.profile) as PermissionKey[]),
      password: pwdToSave,
      tempPassword: pwdToSave,
      isActive: true,
      createdAt: new Date().toISOString().split('T')[0]
    };
    await FirestoreService.addAccount(created);

    setCreateModalOpen(false);
    setIsSubmitting(false);

    // Prompt the on-screen credentials dialog matching Screenshot 3
    setCredentialDialog({
      isOpen: true,
      title: 'User Account Created Successfully',
      fullName: formData.fullName.trim(),
      email: formData.email.trim(),
      username: cleanUsername.toLowerCase(),
      password: pwdToSave,
      profile: formData.profile,
      actionType: 'created',
    });
    showToast(`Account for ${formData.fullName} created successfully.`);
  };

  const handleOpenEdit = (acc: UserAccount) => {
    setSelectedAccount(acc);
    setFormData({
      email: acc.email,
      username: acc.username,
      fullName: acc.fullName,
      position: acc.position,
      entity: acc.entity || (acc.country ? (acc.country.startsWith('ACTIVA') ? acc.country : `ACTIVA ${acc.country}`) : 'ACTIVA Liberia'),
      phoneCountryCode: acc.phoneCountryCode || '+231',
      phone: acc.phone || '',
      profile: acc.profile as UserProfile,
      mobileAccessEnabled: acc.mobileAccessEnabled ?? true,
      password: '',
      permissions: acc.permissions && acc.permissions.length > 0 ? acc.permissions : getPermissionsForProfile(acc.profile as UserProfile),
    });
    setEditModalOpen(true);
    setFormError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedAccount) return;
    if (!formData.email || !formData.fullName || !formData.position) {
      setFormError('Please fill all required fields.');
      return;
    }

    setIsSubmitting(true);
    const selectedEntity = formData.entity || 'ACTIVA Liberia';
    const selectedCountry = selectedEntity.replace(/^ACTIVA\s+/i, '');

    try {
      // Update in Firestore
      await updateDoc(doc(db, 'accounts', selectedAccount.id), {
        email: formData.email,
        fullName: formData.fullName,
        position: formData.position,
        entity: selectedEntity,
        country: selectedCountry,
        phone: formData.phone,
        phoneCountryCode: formData.phoneCountryCode,
        profile: formData.profile,
        permissions: formData.permissions || getPermissionsForProfile(formData.profile),
      });

      // Update locally
      const updatedAcc: UserAccount = {
        ...selectedAccount,
        email: formData.email,
        fullName: formData.fullName,
        position: formData.position,
        entity: selectedEntity,
        country: selectedCountry,
        phone: formData.phone,
        phoneCountryCode: formData.phoneCountryCode,
        profile: formData.profile,
        permissions: formData.permissions || getPermissionsForProfile(formData.profile),
      };
      await FirestoreService.updateAccount(updatedAcc);
      
      setEditModalOpen(false);
      showToast(`Account ${updatedAcc.username} updated.`);
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Firebase update error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (acc: UserAccount) => {
    const newPwd = generateStrongPassword();
    const newPassword = newPwd; 
    
    try {
      await updateDoc(doc(db, 'accounts', acc.id), {
        password: newPassword,
        tempPassword: newPassword,
        isTemporaryPassword: true,
        mustChangePassword: true,
        passwordChangedAt: new Date().toISOString(),
      });
      await FirestoreService.updateAccount({
        id: acc.id,
        password: newPassword,
        tempPassword: newPassword,
        isTemporaryPassword: true,
        mustChangePassword: true,
        passwordChangedAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Firestore password update note:', e);
      await FirestoreService.updateAccount({
        id: acc.id,
        password: newPassword,
        tempPassword: newPassword,
        isTemporaryPassword: true,
        mustChangePassword: true,
        passwordChangedAt: new Date().toISOString(),
      });
    }

    // Prompt the on-screen credentials dialog with new password
    setCredentialDialog({
      isOpen: true,
      title: 'Password Reset Successfully / Mot de Passe Réinitialisé',
      email: acc.email,
      username: acc.username,
      password: newPassword,
      profile: acc.profile,
      actionType: 'reset',
    });
  };

  const handleToggleStatus = (acc: UserAccount) => {
    const updatedStatus = !acc.isActive;
    
    // Sync with Firestore
    import('firebase/firestore').then(({ doc, updateDoc }) => {
      updateDoc(doc(db, 'accounts', acc.id), { isActive: updatedStatus }).catch(() => {});
    });
    
    showToast(`Account ${acc.fullName || acc.username} ${updatedStatus ? 'activated' : 'deactivated'}.`);
  };

  const handleDeleteAccount = async (id: string, email: string) => {
    try {
      await FirestoreService.deleteAccount(id);
    } catch (err: any) {
      console.error("Firestore delete error:", err);
    }
    // Optimistically update local state immediately
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setAccountToDelete(null);
    showToast(`Account ${email} deleted.`);
  };

  const handleToggleMobileAccess = async (acc: UserAccount) => {
    const updatedAcc = { ...acc, mobileAccessEnabled: !acc.mobileAccessEnabled };
    await FirestoreService.updateAccount(updatedAcc);
    setAccounts((prev) => prev.map((a) => (a.id === acc.id ? updatedAcc : a)));
    showToast(
      updatedAcc.mobileAccessEnabled
        ? `Mobile access enabled for ${acc.email}`
        : `Mobile access disabled for ${acc.email}`
    );
  };

  // Download accounts as CSV
  const handleDownloadAccountsCSV = () => {
    const headers = ['ID', 'User_Name', 'Email', 'Full_Name', 'Profile', 'Status', 'Created_At'];
    const rows = filteredAccounts.map((acc) => [
      acc.id,
      `"${acc.username || ''}"`,
      `"${acc.email}"`,
      `"${acc.fullName}"`,
      `"${acc.profile}"`,
      `"${acc.isActive ? 'Active' : 'Inactive'}"`,
      `"${acc.createdAt}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `user_accounts_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Accounts downloaded in CSV!');
  };

  // Filtered unique accounts
  const uniqueAccounts = React.useMemo(() => {
    const map = new Map<string, UserAccount>();
    accounts.forEach((acc, idx) => {
      const id = acc.id || `acc-${acc.email || idx}`;
      if (!map.has(id)) {
        map.set(id, { ...acc, id });
      }
    });
    return Array.from(map.values());
  }, [accounts]);

  const filteredAccounts = uniqueAccounts.filter((acc) => {
    const matchSearch =
      (acc.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.fullName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.position || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (acc.phone || '').includes(searchTerm);

    const matchProfile = profileFilter === 'ALL' || acc.profile === profileFilter;
    return matchSearch && matchProfile;
  });

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2 shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-[#00A859] flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Action and Filter Control Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-3.5 sm:p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto flex-1">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, email, phone..."
              className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] focus:bg-white transition"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] cursor-pointer"
          >
            <option value="ALL">All Profiles</option>
            <option value="Admin">Administrators</option>
            <option value="Supervisor">Supervisors</option>
            <option value="Superviseur">Supervisors</option>
            <option value="Agent">Field Agents</option>
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap sm:flex-nowrap">
          {/* Permissions Matrix Button */}
          <button
            type="button"
            onClick={() => setMatrixModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 shadow-2xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            title="View permissions matrix by role (Agent, Supervisor, Admin)"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#0a2e6b]" />
            <span>Role Permissions Matrix</span>
          </button>

          {/* Create Account Button */}
          <button
            type="button"
            onClick={handleOpenCreate}
            className="px-3.5 py-2 rounded-xl bg-[#0a2e6b] hover:bg-[#0b357a] text-white text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ New Account</span>
          </button>
        </div>
      </div>

      {/* Accounts List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-4 h-4 text-[#0a2e6b]" />
            <h3 className="font-extrabold text-sm text-slate-900">
              User Accounts & Mobile Access
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
              {filteredAccounts.length}
            </span>
          </div>
        </div>

        {filteredAccounts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">
            No user accounts match your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">User ID & Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role & Entitlements</th>
                  <th className="py-3 px-4 text-center">Mobile Access</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.map((acc) => {
                  return (
                    <tr key={acc.id} className="hover:bg-slate-50 transition-colors">
                      {/* ID & Name with Entity Badge */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 font-mono">
                            {acc.username || 'Not assigned'}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#0a2e6b]/10 border border-[#0a2e6b]/20 text-[#0a2e6b] text-[10px] font-extrabold">
                            {acc.entity || (acc.country ? (acc.country.startsWith('ACTIVA') ? acc.country : `ACTIVA ${acc.country}`) : 'ACTIVA Liberia')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {acc.fullName} ({acc.position})
                        </div>
                      </td>

                      {/* Email */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-sm text-slate-700">
                          {acc.email}
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Created on {acc.createdAt}
                          {!acc.isActive && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-700">
                              Inactive
                            </span>
                          )}
                        </span>
                      </td>

                      {/* Profile Badge */}
                      <td className="py-3.5 px-4">
                        {acc.profile === 'Admin' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-[#0a2e6b] border border-blue-200 text-[11px] font-black">
                            <ShieldCheck className="w-3 h-3 text-[#0a2e6b]" />
                            <span>Admin</span>
                          </span>
                        )}
                        {(acc.profile === 'Supervisor' || acc.profile === 'Superviseur') && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-black">
                            <UserCheck className="w-3 h-3 text-indigo-600" />
                            <span>Supervisor</span>
                          </span>
                        )}
                        {acc.profile === 'Agent' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-black">
                            <Smartphone className="w-3 h-3 text-emerald-600" />
                            <span>Agent</span>
                          </span>
                        )}
                        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                          <Shield className="w-2.5 h-2.5 text-[#0a2e6b]" />
                          <span>{(acc.permissions?.length || getPermissionsForProfile(acc.profile)).length} active permissions</span>
                        </div>
                      </td>

                      {/* Mobile Access Switch */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleMobileAccess(acc)}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            acc.mobileAccessEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              acc.mobileAccessEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Toggle Status Button */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(acc)}
                            className={`px-2.5 py-1.5 rounded-lg ${acc.isActive ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'} border border-transparent text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer`}
                            title={acc.isActive ? "Deactivate account" : "Activate account"}
                          >
                            <Shield className="w-3 h-3" />
                            <span>{acc.isActive ? 'Deactivate' : 'Activate'}</span>
                          </button>
                          
                          {/* Reset Password Button */}
                          <button
                            type="button"
                            onClick={() => handleResetPassword(acc)}
                            className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-extrabold transition flex items-center gap-1 cursor-pointer"
                            title="Reset password and display on screen"
                          >
                            <KeyRound className="w-3 h-3 text-amber-600" />
                            <span>Reset</span>
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(acc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#0a2e6b] hover:bg-blue-50 transition cursor-pointer"
                            title="Edit account"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => setAccountToDelete({ id: acc.id, email: acc.email, name: acc.fullName || acc.username })}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                            title="Delete account"
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
      </div>

      {/* CONFIRM DELETE DIALOG */}
      {accountToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto text-rose-600">
                <Trash2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Delete User Account</h3>
                <p className="text-xs text-slate-500 mt-1.5">
                  Are you sure you want to permanently delete the account for{' '}
                  <span className="font-bold text-slate-800">{accountToDelete.name ? `${accountToDelete.name} (${accountToDelete.email})` : accountToDelete.email}</span>?
                </p>
              </div>
              <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-[11px] text-rose-800 text-left">
                ⚠️ This action will remove the account credentials and all associated system permissions.
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAccountToDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteAccount(accountToDelete.id, accountToDelete.email)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREDENTIAL DISPLAY MODAL */}
      {credentialDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden text-center p-6 sm:p-8 space-y-5">
            {/* Top Success Badge */}
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 border border-emerald-200/60 flex items-center justify-center mx-auto text-emerald-600 shadow-2xs">
              <Check className="w-7 h-7 stroke-[3]" />
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                {credentialDialog.title || 'User Account Created Successfully'}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Please securely deliver these authentication credentials to the user:
              </p>
            </div>

            {/* Credentials Card */}
            <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200/80 rounded-2xl text-left space-y-3.5 shadow-2xs">
              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Full Name & Role
                </span>
                <p className="font-mono text-xs font-black text-slate-900 uppercase tracking-wide mt-0.5">
                  {credentialDialog.fullName || credentialDialog.email} ({(credentialDialog.profile || 'AGENT').toUpperCase()})
                </p>
              </div>

              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Username (Login ID)
                </span>
                <div className="mt-0.5 inline-block px-3 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-900 font-mono text-xs font-bold">
                  {credentialDialog.username || credentialDialog.email}
                </div>
              </div>

              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Work Email
                </span>
                <p className="font-mono text-xs font-semibold text-slate-700 mt-0.5">
                  {credentialDialog.email}
                </p>
              </div>

              <div>
                <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                  Temporary Password
                </span>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <div className="inline-block px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 font-mono text-xs font-bold tracking-wide">
                    {credentialDialog.password}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(credentialDialog.password, 'modal-pwd')}
                    className="p-1 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    title="Copy password"
                  >
                    {copiedId === 'modal-pwd' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-xs text-blue-900 leading-relaxed text-left">
              <strong>Security Notice:</strong> The user will be required to change this password on their first login before accessing their dashboard.
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  const fullSummary = `ACTIVA HealthPass Credentials:\n- Name: ${credentialDialog.fullName || ''} (${credentialDialog.profile})\n- Username: ${credentialDialog.username || credentialDialog.email}\n- Email: ${credentialDialog.email}\n- Temporary Password: ${credentialDialog.password}\n- Note: User must change password on first login.`;
                  navigator.clipboard.writeText(fullSummary);
                  setCopiedId('modal-all');
                  showToast('Credentials copied to clipboard!');
                  setTimeout(() => setCopiedId(null), 2500);
                }}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                {copiedId === 'modal-all' ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-500" />}
                <span>{copiedId === 'modal-all' ? 'Copied!' : 'Copy Credentials'}</span>
              </button>
              <button
                type="button"
                onClick={() => setCredentialDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2.5 px-8 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {editModalOpen && selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50/80 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Modifier le Compte & Habilitations ({selectedAccount.username})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mise à jour des coordonnées et des droits d'accès
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleEditSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
              {formError && (
                <div className="bg-rose-50 text-rose-600 p-3.5 rounded-2xl text-xs border border-rose-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Profile Selection */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-slate-900">Profil & Rôle Principal :</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { role: 'Agent' as UserProfile, desc: 'Enrôlement, saisie & suivi de son périmètre' },
                    { role: 'Supervisor' as UserProfile, desc: 'Validation, rejet, retour & reporting' },
                    { role: 'Admin' as UserProfile, desc: 'Gestion globale, suppression & système' },
                  ].map(({ role, desc }) => {
                    const isSelected = formData.profile === role || (role === 'Supervisor' && formData.profile === 'Superviseur');
                    return (
                      <div
                        key={role}
                        onClick={() => {
                          setFormData({
                            ...formData,
                            profile: role,
                            permissions: getPermissionsForProfile(role),
                          });
                        }}
                        className={`rounded-2xl p-4 text-left relative transition cursor-pointer ${
                          isSelected
                            ? 'border-2 border-emerald-500 bg-white shadow-2xs'
                            : 'border border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                        <h4 className="text-sm font-extrabold text-slate-900">{role}</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-snug">{desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attribution des Habilitations */}
              <div className="bg-sky-50/40 border border-sky-200/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#0a2e6b] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                        Attribution des Habilitations ({formData.permissions?.length || 0} / {HABILITATIONS_SCHEMA.length} actives)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Modifiez individuellement les droits ou appliquez un profil type
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: getPermissionsForProfile(formData.profile) })}
                      className="px-3 py-1 bg-white border border-blue-400 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-50 transition cursor-pointer shadow-2xs"
                    >
                      Profil par défaut ({formData.profile})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: HABILITATIONS_SCHEMA.map((h) => h.key) })}
                      className="px-3 py-1 bg-white border border-emerald-400 text-emerald-700 text-xs font-semibold rounded-full hover:bg-emerald-50 transition cursor-pointer shadow-2xs"
                    >
                      Tout Activer
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: [] })}
                      className="px-3 py-1 bg-white border border-rose-400 text-rose-700 text-xs font-semibold rounded-full hover:bg-rose-50 transition cursor-pointer shadow-2xs"
                    >
                      Tout Désactiver
                    </button>
                  </div>
                </div>

                {/* Filter Categories Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                  {[
                    { id: 'all', label: 'Toutes les catégories' },
                    { id: 'Dossier & Claim Management', label: 'Dossier & Claim Management' },
                    { id: 'Validation & Decision', label: 'Validation & Decision' },
                    { id: 'Statistics & Reporting', label: 'Statistics & Reporting' },
                    { id: 'Administration & System', label: 'Administration & System' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActivePermCategory(cat.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs transition whitespace-nowrap cursor-pointer ${
                        activePermCategory === cat.id
                          ? 'bg-[#0a2e6b] text-white font-bold shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Permissions List */}
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1.5">
                  {HABILITATIONS_SCHEMA.filter(
                    (hab) => activePermCategory === 'all' || hab.category === activePermCategory
                  ).map((hab) => {
                    const isChecked = (formData.permissions || []).includes(hab.key);
                    return (
                      <div
                        key={hab.key}
                        onClick={() => {
                          const current = formData.permissions || [];
                          const updated = isChecked
                            ? current.filter((k) => k !== hab.key)
                            : [...current, hab.key];
                          setFormData({ ...formData, permissions: updated });
                        }}
                        className="bg-white border border-blue-100 hover:border-blue-300 rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs transition cursor-pointer"
                      >
                        <div className="pr-3">
                          <span className="text-xs font-extrabold text-slate-900 block">{hab.label}</span>
                          <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                            {hab.description}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600 pointer-events-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* User Inputs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Full Name:</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g. Patricia Tweh"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Job Title / Designation:</label>
                  <input
                    type="text"
                    required
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Field Operations Agent"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-extrabold text-slate-900">Username (Login ID):</label>
                  </div>
                  <input
                    type="text"
                    disabled
                    value={formData.username}
                    className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                  />
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Unique identifier generated for authentication
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Email Address:</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="first.last@activa-liberia.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    For notifications and correspondence
                  </span>
                </div>
              </div>

              {/* Phone & Mobile Access */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Phone Number:</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.phoneCountryCode}
                      onChange={(e) => setFormData({ ...formData, phoneCountryCode: e.target.value })}
                      className="w-40 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="+231">Liberia (+231)</option>
                      <option value="+237">Cameroon (+237)</option>
                      <option value="+225">Côte d'Ivoire (+225)</option>
                      <option value="+233">Ghana (+233)</option>
                      <option value="+224">Guinea (+224)</option>
                      <option value="+243">DRC (+243)</option>
                      <option value="+232">Sierra Leone (+232)</option>
                      <option value="+33">France (+33)</option>
                    </select>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="77 123 4567"
                      className="flex-1 px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">ACTIVA Entity / Subsidiary:</label>
                  <select
                    value={formData.entity || 'ACTIVA Liberia'}
                    onChange={(e) => setFormData({ ...formData, entity: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-[#0a2e6b] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ACTIVA_ENTITIES.map((ent) => (
                      <option key={ent.id} value={ent.name}>
                        {ent.name} ({ent.country})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Mobile Access Checkbox */}
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.mobileAccessEnabled}
                    onChange={(e) => setFormData({ ...formData, mobileAccessEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded accent-blue-600 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Grant access to Field Mobile Application (HealthPass Android / iOS)
                  </span>
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-[#0a2e6b] hover:bg-[#07214f] disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Enregistrer les Modifications</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ACCOUNT MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-blue-50/80 border border-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900">
                    Créer un compte utilisateur & Attribuer les habilitations
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Définissez le profil et ajustez précisément les droits d'accès
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateSubmit} className="p-6 sm:p-8 space-y-5 overflow-y-auto flex-1">
              {formError && (
                <div className="bg-rose-50 text-rose-600 p-3.5 rounded-2xl text-xs border border-rose-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Profil & Rôle Principal Selection (Screenshot 1) */}
              <div className="space-y-2">
                <h3 className="text-xs font-extrabold text-slate-900">Profil & Rôle Principal :</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { role: 'Agent' as UserProfile, desc: 'Enrôlement, saisie & suivi de son périmètre' },
                    { role: 'Supervisor' as UserProfile, desc: 'Validation, rejet, retour & reporting' },
                    { role: 'Admin' as UserProfile, desc: 'Gestion globale, suppression & système' },
                  ].map(({ role, desc }) => {
                    const isSelected = formData.profile === role || (role === 'Supervisor' && formData.profile === 'Superviseur');
                    return (
                      <div
                        key={role}
                        onClick={() => {
                          const newPerms = getPermissionsForProfile(role);
                          setFormData({
                            ...formData,
                            profile: role,
                            permissions: newPerms,
                          });
                        }}
                        className={`rounded-2xl p-4 text-left relative transition cursor-pointer ${
                          isSelected
                            ? 'border-2 border-emerald-500 bg-white shadow-2xs'
                            : 'border border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </div>
                        )}
                        <h4 className="text-sm font-extrabold text-slate-900">{role}</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-snug">{desc}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Attribution des Habilitations (Screenshot 1) */}
              <div className="bg-sky-50/40 border border-sky-200/80 rounded-2xl p-4 sm:p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-[#0a2e6b] shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                        Attribution des Habilitations ({formData.permissions?.length || 0} / {HABILITATIONS_SCHEMA.length} actives)
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Modifiez individuellement les droits ou appliquez un profil type
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: getPermissionsForProfile(formData.profile) })}
                      className="px-3 py-1 bg-white border border-blue-400 text-blue-700 text-xs font-semibold rounded-full hover:bg-blue-50 transition cursor-pointer shadow-2xs"
                    >
                      Profil par défaut ({formData.profile})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: HABILITATIONS_SCHEMA.map((h) => h.key) })}
                      className="px-3 py-1 bg-white border border-emerald-400 text-emerald-700 text-xs font-semibold rounded-full hover:bg-emerald-50 transition cursor-pointer shadow-2xs"
                    >
                      Tout Activer
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: [] })}
                      className="px-3 py-1 bg-white border border-rose-400 text-rose-700 text-xs font-semibold rounded-full hover:bg-rose-50 transition cursor-pointer shadow-2xs"
                    >
                      Tout Désactiver
                    </button>
                  </div>
                </div>

                {/* Filter Categories Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                  {[
                    { id: 'all', label: 'Toutes les catégories' },
                    { id: 'Dossier & Claim Management', label: 'Dossier & Claim Management' },
                    { id: 'Validation & Decision', label: 'Validation & Decision' },
                    { id: 'Statistics & Reporting', label: 'Statistics & Reporting' },
                    { id: 'Administration & System', label: 'Administration & System' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActivePermCategory(cat.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs transition whitespace-nowrap cursor-pointer ${
                        activePermCategory === cat.id
                          ? 'bg-[#0a2e6b] text-white font-bold shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Permissions List */}
                <div className="max-h-56 overflow-y-auto space-y-2 pr-1.5">
                  {HABILITATIONS_SCHEMA.filter(
                    (hab) => activePermCategory === 'all' || hab.category === activePermCategory
                  ).map((hab) => {
                    const isChecked = (formData.permissions || []).includes(hab.key);
                    return (
                      <div
                        key={hab.key}
                        onClick={() => {
                          const current = formData.permissions || [];
                          const updated = isChecked
                            ? current.filter((k) => k !== hab.key)
                            : [...current, hab.key];
                          setFormData({ ...formData, permissions: updated });
                        }}
                        className="bg-white border border-blue-100 hover:border-blue-300 rounded-xl p-3 sm:p-3.5 flex items-center justify-between shadow-2xs transition cursor-pointer"
                      >
                        <div className="pr-3">
                          <span className="text-xs font-extrabold text-slate-900 block">{hab.label}</span>
                          <span className="text-[11px] text-slate-500 leading-relaxed block mt-0.5">
                            {hab.description}
                          </span>
                        </div>
                        <div className="shrink-0 flex items-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="w-4 h-4 text-blue-600 rounded cursor-pointer accent-blue-600 pointer-events-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form Inputs (Screenshot 2) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Full Name:</label>
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => {
                      const newName = e.target.value;
                      const autoUname = generateAutoUsername(newName);
                      setFormData({
                        ...formData,
                        fullName: newName,
                        username: !usernameManuallyEdited && autoUname ? autoUname : formData.username,
                        email: !emailManuallyEdited && autoUname ? `${autoUname}@activa-liberia.com` : formData.email,
                      });
                    }}
                    placeholder="e.g. Patricia Tweh"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Job Title / Designation:</label>
                  <input
                    type="text"
                    required
                    value={formData.position}
                    onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                    placeholder="Field Operations Agent"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Username and Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-extrabold text-slate-900">Username (Login ID):</label>
                    <button
                      type="button"
                      onClick={handleAutoUsername}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Auto</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => {
                      setUsernameManuallyEdited(true);
                      setFormData({ ...formData, username: e.target.value });
                    }}
                    placeholder="first.last"
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-[11px] text-slate-400 block mt-1">
                    Unique identifier generated for authentication
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Email Address:</label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => {
                        setEmailManuallyEdited(true);
                        setFormData({ ...formData, email: e.target.value });
                      }}
                      placeholder="first.last@activa-liberia.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">
                    For notifications and correspondence
                  </span>
                </div>
              </div>

              {/* Phone and Entity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">Phone Number:</label>
                  <div className="flex gap-2">
                    <select
                      value={formData.phoneCountryCode}
                      onChange={(e) => setFormData({ ...formData, phoneCountryCode: e.target.value })}
                      className="w-40 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="+231">Liberia (+231)</option>
                      <option value="+237">Cameroon (+237)</option>
                      <option value="+225">Côte d'Ivoire (+225)</option>
                      <option value="+233">Ghana (+233)</option>
                      <option value="+224">Guinea (+224)</option>
                      <option value="+243">DRC (+243)</option>
                      <option value="+232">Sierra Leone (+232)</option>
                      <option value="+33">France (+33)</option>
                    </select>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="77 123 4567"
                      className="flex-1 px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-900 mb-1">ACTIVA Entity / Subsidiary:</label>
                  <select
                    value={formData.entity || 'ACTIVA Liberia'}
                    onChange={(e) => setFormData({ ...formData, entity: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50/50 border border-slate-200 rounded-xl text-xs font-bold text-[#0a2e6b] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ACTIVA_ENTITIES.map((ent) => (
                      <option key={ent.id} value={ent.name}>
                        {ent.name} ({ent.country})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Initial Password (Generated) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-extrabold text-slate-900">Initial Password (Generated):</label>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, password: generateStrongPassword() })}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Regenerate</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    This temporary password will be securely displayed upon creation. The user will be required to change it on their first login.
                  </span>
                </div>
              </div>

              {/* Mobile Access Checkbox */}
              <div>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formData.mobileAccessEnabled}
                    onChange={(e) => setFormData({ ...formData, mobileAccessEnabled: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded accent-blue-600 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Grant access to Field Mobile Application (HealthPass Android / iOS)
                  </span>
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-[#0a2e6b] hover:bg-[#07214f] disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Créer le Compte & Attribuer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FULL PERMISSIONS COMPARISON MATRIX MODAL */}
      {matrixModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-[#0a2e6b] p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base">Role Entitlements & Permissions Matrix</h3>
                  <p className="text-xs text-blue-100">
                    Rights reference by profile (Agent, Supervisor, Admin) and Segregation of Duties (SoD) rules
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMatrixModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Tabs */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
              {[
                { id: 'all', label: 'All Modules' },
                { id: 'Access & Dashboard', label: 'Access & Dashboard' },
                { id: 'Records Management', label: 'Records Management' },
                { id: 'Workflow & Validation', label: 'Workflow & Validation' },
                { id: 'Statistics & Reports', label: 'Statistics & Reports' },
                { id: 'Administration & Security', label: 'Administration & Audit' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveMatrixTab(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    activeMatrixTab === tab.id
                      ? 'bg-[#0a2e6b] text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Table Body */}
            <div className="p-6 overflow-y-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-3">Module & Capability</th>
                    <th className="py-3 px-3">System Action</th>
                    <th className="py-3 px-3 text-center">Agent</th>
                    <th className="py-3 px-3 text-center">Supervisor</th>
                    <th className="py-3 px-3 text-center">Admin</th>
                    <th className="py-3 px-3">Internal Control / SoD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {PERMISSIONS_MATRIX
                    .filter((row) => activeMatrixTab === 'all' || row.category === activeMatrixTab)
                    .map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{row.feature}</div>
                          <div className="text-[10.5px] text-slate-500">{row.description}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                            {row.action}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {row.agent === true ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs">
                              ✓
                            </span>
                          ) : row.agent === 'scope' ? (
                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px]">
                              Scope
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 font-bold text-xs">
                              ✗
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {row.supervisor ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs">
                              ✓
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 font-bold text-xs">
                              ✗
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {row.admin ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs">
                              ✓
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-50 text-rose-500 font-bold text-xs">
                              ✗
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-600">
                          {row.sodRule ? (
                            <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold text-[10px]">
                              ⚠️ SoD: No self-approval
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <Shield className="w-4 h-4 text-[#0a2e6b]" />
                <span>Entitlements are automatically assigned according to the selected role profile and can be customized per staff member.</span>
              </div>
              <button
                type="button"
                onClick={() => setMatrixModalOpen(false)}
                className="px-4 py-2 bg-[#0a2e6b] hover:bg-[#07214f] text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Close Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
