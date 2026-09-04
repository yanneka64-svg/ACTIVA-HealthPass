import { collection, getDocs, doc, writeBatch } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Member, Organization, Provider, Claim, MedicalForm, UserAccount, InvoiceItem, Ceiling } from '../types';

export const getFullDemoData = () => {
  // 0. DEFAULT ACCOUNTS (Admin, Supervisor, Agent)
  const defaultAccounts: UserAccount[] = [
    {
      id: 'acc-admin-default',
      username: 'admin',
      email: 'admin@activa-assurance.com',
      fullName: 'ACTIVA Administrator',
      position: 'Head of Health Operations',
      phone: '+231 77 000 0001',
      phoneCountryCode: '+231',
      profile: 'Admin',
      entity: 'ACTIVA Liberia',
      country: 'Liberia',
      permissions: ['enrollment', 'identification', 'card_generation', 'claims_management', 'claims_validation', 'enrollment_validation', 'reports'],
      isActive: true,
      isTemporaryPassword: false,
      mustChangePassword: false,
      passwordChangedAt: new Date().toISOString(),
      createdAt: new Date().toISOString().split('T')[0],
    },
    {
      id: 'acc-supervisor-default',
      username: 'supervisor',
      email: 'supervisor@activa-assurance.com',
      fullName: 'Dr. Sarah KONE',
      position: 'Medical Advisor / Supervisor',
      phone: '+231 77 000 0002',
      phoneCountryCode: '+231',
      profile: 'Supervisor',
      entity: 'ACTIVA Liberia',
      country: 'Liberia',
      permissions: ['claims_validation', 'enrollment_validation', 'reports'],
      isActive: true,
      isTemporaryPassword: false,
      mustChangePassword: false,
      passwordChangedAt: new Date().toISOString(),
      createdAt: new Date().toISOString().split('T')[0],
    },
    {
      id: 'acc-agent-default',
      username: 'agent',
      email: 'agent@activa-assurance.com',
      fullName: 'Moussa DIABATE',
      position: 'Front Desk & Enrollment Agent',
      phone: '+231 77 000 0003',
      phoneCountryCode: '+231',
      profile: 'Agent',
      entity: 'ACTIVA Liberia',
      country: 'Liberia',
      permissions: ['identification', 'enrollment', 'claims_management', 'card_generation'],
      isActive: true,
      isTemporaryPassword: false,
      mustChangePassword: false,
      passwordChangedAt: new Date().toISOString(),
      createdAt: new Date().toISOString().split('T')[0],
    }
  ];

  // 1. ORGANIZATIONS
  // === AMÉLIORATION AJOUTÉE : "Orange Liberia Telecom" (org-1) et "Ecobank Liberia Head
  // Office" (org-2) retirées des données de démonstration — sur demande explicite ("supprimer
  // les informations d'Orange et de Ecobank ... sur l'application"). Elles ne réapparaîtront
  // donc plus via getFullDemoData() ni via seedInitialDemoDataIfEmpty()/forceReloadDemoData().
  const orgs: Partial<Organization>[] = [
    {
      id: 'org-3',
      name: 'TotalEnergies Liberia Ltd',
      policyNumber: 'POL-2026-TOT',
      effectiveDate: '2026-01-01',
      expirationDate: '2026-12-31',
      declaredMembers: 180,
      coverageRate: 80,
      status: 'Active',
      email: 'hr@totalenergies.lr',
      phone: '+231 88 123 4567',
      globalCeiling: 180000
    },
    {
      id: 'org-4',
      name: 'Firestone Natural Rubber Co',
      policyNumber: 'POL-2026-FNR',
      effectiveDate: '2026-01-01',
      expirationDate: '2026-12-31',
      declaredMembers: 620,
      coverageRate: 85,
      status: 'Active',
      email: 'medical.desk@firestone.com',
      phone: '+231 77 444 3322',
      globalCeiling: 500000
    },
    {
      id: 'org-5',
      name: 'ArcelorMittal Mining Liberia',
      policyNumber: 'POL-2026-AMM',
      effectiveDate: '2026-01-01',
      expirationDate: '2026-12-31',
      declaredMembers: 540,
      coverageRate: 90,
      status: 'Active',
      email: 'health@arcelormittal.lr',
      phone: '+231 88 999 1111',
      globalCeiling: 450000
    }
  ];

  // 2. PROVIDERS
  const providers: Partial<Provider>[] = [
    {
      id: 'prv-1',
      name: 'John F. Kennedy Mother-Child Hospital',
      type: 'Hospital',
      location: 'Monrovia, Sinkor 22nd Street',
      conventionNumber: 'CONV-2026-JFK-01',
      kypStatus: 'validated',
      contactPhone: '+231 77 111 2222',
      tier: 'Tier 1 - University Teaching Hospital',
      status: 'Contracted'
    },
    {
      id: 'prv-2',
      name: 'Saint Joseph International Clinic',
      type: 'Clinic',
      location: 'Monrovia, Mamba Point',
      conventionNumber: 'CONV-2026-STJ-02',
      kypStatus: 'validated',
      contactPhone: '+231 88 333 4444',
      tier: 'Tier 1 - Medical & Surgical Clinic',
      status: 'Contracted'
    },
    {
      id: 'prv-3',
      name: 'Central Downtown Pharmacy',
      type: 'Pharmacy',
      location: 'Monrovia, Broad Street',
      conventionNumber: 'CONV-2026-PHAR-03',
      kypStatus: 'validated',
      contactPhone: '+231 77 999 8888',
      tier: 'Tier 1 Accredited Partner Pharmacy',
      status: 'Contracted'
    },
    {
      id: 'prv-4',
      name: 'Gulf Diagnostic & Imaging Center',
      type: 'Diagnostic Center',
      location: 'Monrovia, Tubman Boulevard',
      conventionNumber: 'CONV-2026-RAD-04',
      kypStatus: 'validated',
      contactPhone: '+231 88 777 6655',
      tier: 'Tier 1 - Radiology & Ultrasound',
      status: 'Contracted'
    },
    {
      id: 'prv-5',
      name: 'Mamba Dental & Eye Clinic',
      type: 'Dental Clinic',
      location: 'Monrovia, Mamba Point Plaza',
      conventionNumber: 'CONV-2026-DENT-05',
      kypStatus: 'validated',
      contactPhone: '+231 77 666 5544',
      tier: 'Tier 1 Specialized Care Center',
      status: 'Contracted'
    }
  ];

  // 3. MEMBERS
  // === AMÉLIORATION AJOUTÉE : membres démo mem-1 (Orange) et mem-2 (Ecobank) retirés — même
  // motif que pour les organisations ci-dessus. ===
  const membersList: Partial<Member>[] = [
    {
      id: 'mem-3',
      cardNo: 'ACT-2026-66219',
      principalName: 'Marcus TAYLOR',
      spouseName: 'Grace TAYLOR',
      dependentRelationship: 'spouse',
      children: ['Joshua TAYLOR'],
      dependents: [
        {
          id: 'dep-3-1',
          cardNo: 'ACT-2026-66220',
          fullName: 'Joshua TAYLOR',
          relationship: 'child',
          birthDate: '2012-07-25',
          age: 14,
          gender: 'M',
          hasBiometrics: true,
        },
      ],
      birthDate: '1979-11-03',
      relationship: 'Primary',
      organization: 'TotalEnergies Liberia Ltd',
      status: 'Active',
      hasPhoto: true,
      hasBiometrics: true,
      outpatientBalanceUSD: 890,
      outpatientCeilingUSD: 1200,
      inpatientBalanceUSD: 10000,
      inpatientCeilingUSD: 10000,
      gender: 'M',
      phone: '+231 77 600 7890',
      email: 'marcus.taylor@totalenergies.lr',
      createdAt: '2026-01-15',
    },
    {
      id: 'mem-4',
      cardNo: 'ACT-2026-55410',
      principalName: 'Evelyn JOHNSON',
      spouseName: 'Samuel JOHNSON',
      dependentRelationship: 'husband',
      children: ['Hannah JOHNSON', 'Lucas JOHNSON'],
      dependents: [
        {
          id: 'dep-4-1',
          cardNo: 'ACT-2026-55411',
          fullName: 'Samuel JOHNSON',
          relationship: 'husband',
          birthDate: '1985-03-19',
          age: 41,
          gender: 'M',
          hasBiometrics: true,
        },
        {
          id: 'dep-4-2',
          cardNo: 'ACT-2026-55412',
          fullName: 'Hannah JOHNSON',
          relationship: 'child',
          birthDate: '2016-09-14',
          age: 10,
          gender: 'F',
          hasBiometrics: false,
        },
      ],
      birthDate: '1987-06-18',
      relationship: 'Primary',
      organization: 'Firestone Natural Rubber Co',
      status: 'Active',
      hasPhoto: true,
      hasBiometrics: true,
      outpatientBalanceUSD: 610,
      outpatientCeilingUSD: 900,
      inpatientBalanceUSD: 7800,
      inpatientCeilingUSD: 10000,
      gender: 'F',
      phone: '+231 77 222 9900',
      email: 'evelyn.johnson@firestone.com',
      createdAt: '2026-01-20',
    },
    {
      id: 'mem-5',
      cardNo: 'ACT-2026-33982',
      principalName: 'Mamadou N\'DIAYE',
      spouseName: 'Awa N\'DIAYE',
      dependentRelationship: 'spouse',
      children: ['Souleymane N\'DIAYE'],
      dependents: [
        {
          id: 'dep-5-1',
          cardNo: 'ACT-2026-33983',
          fullName: 'Souleymane N\'DIAYE',
          relationship: 'child',
          birthDate: '2011-01-30',
          age: 15,
          gender: 'M',
          hasBiometrics: true,
        },
      ],
      birthDate: '1982-12-05',
      relationship: 'Primary',
      organization: 'ArcelorMittal Mining Liberia',
      status: 'Active',
      hasPhoto: true,
      hasBiometrics: true,
      outpatientBalanceUSD: 950,
      outpatientCeilingUSD: 1500,
      inpatientBalanceUSD: 10000,
      inpatientCeilingUSD: 10000,
      gender: 'M',
      phone: '+231 88 111 4455',
      email: 'mamadou.ndiaye@arcelormittal.lr',
      createdAt: '2026-01-22',
    },
  ];

  // 4. SAMPLE MEDICAL FORMS
  // === AMÉLIORATION AJOUTÉE : Historique des formulaires médicaux purgé sur demande explicite ===
  const forms: Partial<MedicalForm>[] = [];

  // 5. SAMPLE CLAIMS
  // === AMÉLIORATION AJOUTÉE : sinistres démo cl-1 (Orange) et cl-2 (Ecobank) retirés — même
  // motif que ci-dessus. ===
  const sampleClaims: Partial<Claim>[] = [
    {
      id: 'cl-3',
      reference: 'CLM-2026-9043',
      memberCardNo: 'ACT-2026-66219',
      memberName: 'Marcus TAYLOR',
      organization: 'TotalEnergies Liberia Ltd',
      provider: 'Gulf Diagnostic & Imaging Center',
      doctorName: 'Dr. Patrick Henry',
      amount: 110,
      currency: 'USD',
      careType: 'Medical Imaging & Ultrasound',
      medicalActs: [
        { name: 'Abdominal and pelvic ultrasound scan', amount: 110 }
      ],
      serviceDate: '2026-03-19',
      submissionDate: '2026-03-19',
      status: 'approved',
      comments: 'Patient treated: Grace TAYLOR (Spouse).'
    },
    {
      id: 'cl-4',
      reference: 'CLM-2026-9044',
      memberCardNo: 'ACT-2026-55410',
      memberName: 'Evelyn JOHNSON',
      organization: 'Firestone Natural Rubber Co',
      provider: 'Central Downtown Pharmacy',
      doctorName: 'Dr. Roland Cole',
      amount: 45,
      currency: 'USD',
      careType: 'Pharmacy & Prescription Drugs',
      medicalActs: [
        { name: 'Prescription dispensation: Antimalarial & multivitamin treatment', amount: 45 }
      ],
      serviceDate: '2026-03-23',
      submissionDate: '2026-03-23',
      status: 'pending',
      comments: 'Patient treated: Lucas JOHNSON (7 yrs) (Child).'
    },
    {
      id: 'cl-5',
      reference: 'CLM-2026-9045',
      memberCardNo: 'ACT-2026-33982',
      memberName: 'Mamadou N\'DIAYE',
      organization: 'ArcelorMittal Mining Liberia',
      provider: 'Mamba Dental & Eye Clinic',
      doctorName: 'Dr. Arthur Miller',
      amount: 140,
      currency: 'USD',
      careType: 'Dental Care',
      medicalActs: [
        { name: 'Complete scaling and dental filling restoration', amount: 140 }
      ],
      serviceDate: '2026-03-15',
      submissionDate: '2026-03-16',
      status: 'rejected',
      rejectionReason: 'Annual dental care sub-ceiling exceeded without prior authorization.',
      comments: 'Patient treated: Mamadou N\'DIAYE (Primary Insured).'
    }
  ];

  // 6. INVOICES
  // === AMÉLIORATION AJOUTÉE : factures démo inv-1 (Orange) et inv-2 (Ecobank) retirées —
  // même motif que ci-dessus. ===
  const sampleInvoices: Partial<InvoiceItem>[] = [
    {
      id: 'inv-3',
      reference: 'INV-2026-PHAR-03',
      patientName: 'Lucas JOHNSON',
      familyHead: 'Evelyn JOHNSON',
      cardNo: 'ACT-2026-55410',
      provider: 'Central Downtown Pharmacy',
      organization: 'Firestone Natural Rubber Co',
      amount: 680,
      status: 'valid',
      serviceDate: '2026-03-22',
      careType: 'Pharmacy & Prescription Drugs',
      coveragePercentage: 85
    },
    {
      id: 'inv-4',
      reference: 'INV-2026-RAD-03',
      patientName: 'Grace TAYLOR',
      familyHead: 'Marcus TAYLOR',
      cardNo: 'ACT-2026-66219',
      provider: 'Gulf Diagnostic & Imaging Center',
      organization: 'TotalEnergies Liberia Ltd',
      amount: 490,
      status: 'valid',
      serviceDate: '2026-03-19',
      careType: 'Medical Imaging',
      coveragePercentage: 80
    }
  ];

  // 7. CEILINGS
  // === AMÉLIORATION AJOUTÉE : plafonds démo ceil-1 (Orange) et ceil-2 (Ecobank) retirés —
  // même motif que ci-dessus. ===
  const sampleCeilings: Partial<Ceiling>[] = [
    {
      id: 'ceil-3',
      careType: 'Specialized Dental Care',
      organization: 'TotalEnergies Liberia Ltd',
      monthlyLimit: 150,
      individualLimit: 500,
      familyLimit: 1500,
      periodicity: 'Annual',
      consumedPercentage: 45
    },
    {
      id: 'ceil-4',
      careType: 'Optical & Prescription Eyewear',
      organization: 'Firestone Natural Rubber Co',
      monthlyLimit: 100,
      individualLimit: 400,
      familyLimit: 1200,
      periodicity: 'Annual',
      consumedPercentage: 10
    }
  ];

  return {
    defaultAccounts,
    orgs,
    providers,
    membersList,
    forms,
    sampleClaims,
    sampleInvoices,
    sampleCeilings
  };
};

export const forceReloadDemoData = async () => {
  try {
    const data = getFullDemoData();
    const batch = writeBatch(db);

    data.defaultAccounts.forEach(acc => {
      batch.set(doc(db, 'accounts', acc.id), acc);
    });

    data.orgs.forEach(o => {
      batch.set(doc(db, 'organizations', o.id!), o);
    });

    data.providers.forEach(p => {
      batch.set(doc(db, 'providers', p.id!), p);
    });

    data.membersList.forEach(m => {
      batch.set(doc(db, 'members', m.id!), m);
    });

    data.forms.forEach(f => {
      batch.set(doc(db, 'medicalForms', f.id!), f);
    });

    data.sampleClaims.forEach(c => {
      batch.set(doc(db, 'claims', c.id!), c);
    });

    data.sampleInvoices.forEach(i => {
      batch.set(doc(db, 'invoices', i.id!), i);
    });

    data.sampleCeilings.forEach(ceil => {
      batch.set(doc(db, 'ceilings', ceil.id!), ceil);
    });

    await batch.commit();
    console.log('Demo data successfully reloaded to Firestore in English.');
    return { success: true };
  } catch (err: any) {
    console.error('Error reloading demo data:', err);
    throw err;
  }
};

export const seedInitialDemoDataIfEmpty = async () => {
  try {
    const data = getFullDemoData();

    // 1. Members
    try {
      const snap = await getDocs(collection(db, 'members'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.membersList.forEach((m) => batch.set(doc(db, 'members', m.id!), m));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed members fallback notice:', e);
    }

    // 2. Organizations
    try {
      const snap = await getDocs(collection(db, 'organizations'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.orgs.forEach((o) => batch.set(doc(db, 'organizations', o.id!), o));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed orgs fallback notice:', e);
    }

    // 3. Providers
    try {
      const snap = await getDocs(collection(db, 'providers'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.providers.forEach((p) => batch.set(doc(db, 'providers', p.id!), p));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed providers fallback notice:', e);
    }

    // 4. Claims
    try {
      const snap = await getDocs(collection(db, 'claims'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.sampleClaims.forEach((c) => batch.set(doc(db, 'claims', c.id!), c));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed claims fallback notice:', e);
    }

    // 5. Invoices
    try {
      const snap = await getDocs(collection(db, 'invoices'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.sampleInvoices.forEach((i) => batch.set(doc(db, 'invoices', i.id!), i));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed invoices fallback notice:', e);
    }

    // 6. Ceilings
    try {
      const snap = await getDocs(collection(db, 'ceilings'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.sampleCeilings.forEach((c) => batch.set(doc(db, 'ceilings', c.id!), c));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed ceilings fallback notice:', e);
    }

    // 7. Medical Forms (Empty by request)
    try {
      if (data.forms && data.forms.length > 0) {
        const snap = await getDocs(collection(db, 'medicalForms'));
        if (snap.empty) {
          const batch = writeBatch(db);
          data.forms.forEach((f) => batch.set(doc(db, 'medicalForms', f.id!), f));
          await batch.commit();
        }
      }
    } catch (e) {
      console.warn('Seed medicalForms fallback notice:', e);
    }

    // 8. Accounts
    try {
      const snap = await getDocs(collection(db, 'accounts'));
      if (snap.empty) {
        const batch = writeBatch(db);
        data.defaultAccounts.forEach((acc) => batch.set(doc(db, 'accounts', acc.id), acc));
        await batch.commit();
      }
    } catch (e) {
      console.warn('Seed accounts fallback notice:', e);
    }

    console.log('Initial verification and seeding completed successfully.');
  } catch (err) {
    console.warn('Seeding check notice:', err);
  }
};
