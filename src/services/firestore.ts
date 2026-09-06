import { collection, collectionGroup, addDoc, updateDoc, deleteDoc, doc, getDoc, setDoc, onSnapshot, query, orderBy, limit, where, getDocs, writeBatch, DocumentReference } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Member, Organization, Provider, Claim, InvoiceItem, Enrollment, Ceiling, LoginLog, AuditLog, MedicalForm, AppNotification, HealthPolicy, PolicyPayment } from '../types';
import { getFullDemoData, seedInitialDemoDataIfEmpty } from './seedData';
import { isNewSecurityNumberFormat, normalizeMedicalFormSecurityNumber } from '../utils/medicalFormUtils';
import { computeMedicalFormRetentionUntil } from '../config/dataRetention';
import { isDemoFallbackAllowed } from '../config/demoFallback';
import { reportSyncIssue, clearSyncIssue } from '../utils/systemStatus';

// === AMÉLIORATION AJOUTÉE : sécurité/protection des données (revue 2026-09-05, section 2.5) —
// voir deleteMedicalForm/deleteAllMedicalForms ci-dessous.
const MEDICAL_FORMS_ARCHIVE_COLLECTION = 'medicalFormsDeletionArchive';
// 3 écritures par document désormais possible (archive + suppression du parent + suppression
// de la sous-collection clinical, voir section 2.1) — 150 * 3 = 450, sous la limite de 500
// écritures par batch Firestore.
const MEDICAL_FORMS_ARCHIVE_BATCH_SIZE = 150;
// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.1) — voir
// addMedicalForm/deleteMedicalForm/deleteAllMedicalForms ci-dessous.
const MEDICAL_FORM_CLINICAL_SUBCOLLECTION = 'clinical';
const MEDICAL_FORM_CLINICAL_DOC_ID = 'content';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.warn('Firestore Error Context:', JSON.stringify(errInfo));
}

// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (Phase 1.3 — isolation par organisation) —
// contrepartie côté lecture du cloisonnement ajouté dans firestore.rules (accounts.
// assignedOrganizations / hasOrgAccess()). Une règle Firestore qui dépend d'un champ du
// document (ici `organization`/`organizationId`) refuse la requête ENTIÈRE si elle n'est pas
// elle-même filtrée sur ce même champ — sans ce filtre côté client, un compte auquel un Admin
// aurait assigné un périmètre d'organisations se verrait purement et simplement bloqué (écran
// vide ou données de démo) au lieu de voir ses propres organisations. `orgScope` est optionnel
// et vaut `undefined`/`null` par défaut : dans ce cas, la requête reste EXACTEMENT celle
// d'avant (aucune régression pour les comptes sans périmètre assigné, soit 100% des comptes
// à ce jour). La limite `in` de Firestore (30 valeurs) est documentée ici : un compte assigné
// à plus de 30 organisations verrait sa liste tronquée aux 30 premières — cas non rencontré
// en pratique aujourd'hui (aucune UI ne permet encore de renseigner ce champ).
function scopedQuery(collectionName: string, field: 'organization' | 'organizationId', orgScope?: string[] | null) {
  const base = collection(db, collectionName);
  if (!orgScope || orgScope.length === 0) return base;
  return query(base, where(field, 'in', orgScope.slice(0, 30)));
}

export const FirestoreService = {
  // Listeners with explicit error callbacks and demo fallback
  subscribeToMembers: (cb: (data: Member[]) => void, orgScope?: string[] | null) =>
    onSnapshot(
      scopedQuery('members', 'organization', orgScope),
      (snap) => {
        clearSyncIssue('members');
        if (!snap.empty) {
          const map = new Map<string, Member>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Member));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.membersList || []) as Member[]);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'members');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.membersList || []) as Member[]);
        } else {
          reportSyncIssue('members', err);
          cb([]);
        }
      }
    ),

  subscribeToOrganizations: (cb: (data: Organization[]) => void) =>
    onSnapshot(
      collection(db, 'organizations'),
      (snap) => {
        clearSyncIssue('organizations');
        if (!snap.empty) {
          const map = new Map<string, Organization>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Organization));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.orgs || []) as Organization[]);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'organizations');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.orgs || []) as Organization[]);
        } else {
          reportSyncIssue('organizations', err);
          cb([]);
        }
      }
    ),

  subscribeToProviders: (cb: (data: Provider[]) => void) =>
    onSnapshot(
      collection(db, 'providers'),
      (snap) => {
        clearSyncIssue('providers');
        if (!snap.empty) {
          const map = new Map<string, Provider>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Provider));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.providers || []) as Provider[]);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'providers');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.providers || []) as Provider[]);
        } else {
          reportSyncIssue('providers', err);
          cb([]);
        }
      }
    ),

  subscribeToClaims: (cb: (data: Claim[]) => void, orgScope?: string[] | null) =>
    onSnapshot(
      scopedQuery('claims', 'organization', orgScope),
      (snap) => {
        clearSyncIssue('claims');
        if (!snap.empty) {
          const map = new Map<string, Claim>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Claim));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.sampleClaims || []) as Claim[]);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'claims');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.sampleClaims || []) as Claim[]);
        } else {
          reportSyncIssue('claims', err);
          cb([]);
        }
      }
    ),

  subscribeToInvoices: (cb: (data: InvoiceItem[]) => void, orgScope?: string[] | null) =>
    onSnapshot(
      scopedQuery('invoices', 'organization', orgScope),
      (snap) => {
        clearSyncIssue('invoices');
        if (!snap.empty) {
          const map = new Map<string, InvoiceItem>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as InvoiceItem));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.sampleInvoices || []) as InvoiceItem[]);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'invoices');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.sampleInvoices || []) as InvoiceItem[]);
        } else {
          reportSyncIssue('invoices', err);
          cb([]);
        }
      }
    ),

  subscribeToEnrollments: (cb: (data: Enrollment[]) => void, orgScope?: string[] | null) =>
    onSnapshot(
      scopedQuery('enrollments', 'organization', orgScope),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, Enrollment>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Enrollment));
          cb(Array.from(map.values()));
        } else {
          cb([]);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'enrollments')
    ),

  subscribeToCeilings: (cb: (data: Ceiling[]) => void) =>
    onSnapshot(
      collection(db, 'ceilings'),
      (snap) => {
        clearSyncIssue('ceilings');
        if (!snap.empty) {
          const map = new Map<string, Ceiling>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Ceiling));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.sampleCeilings || []) as Ceiling[]);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'ceilings');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb((demo.sampleCeilings || []) as Ceiling[]);
        } else {
          reportSyncIssue('ceilings', err);
          cb([]);
        }
      }
    ),

  subscribeToLogs: (cb: (data: LoginLog[]) => void) =>
    onSnapshot(
      collection(db, 'auditLogs'),
      (snap) => {
        const map = new Map<string, LoginLog>();
        snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as LoginLog));
        cb(Array.from(map.values()));
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'auditLogs')
    ),

  subscribeToAccounts: (cb: (data: any[]) => void) =>
    onSnapshot(
      collection(db, 'accounts'),
      (snap) => {
        clearSyncIssue('accounts');
        if (!snap.empty) {
          const map = new Map<string, any>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id }));
          cb(Array.from(map.values()));
        } else if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb(demo.defaultAccounts);
          seedInitialDemoDataIfEmpty();
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'accounts');
        if (isDemoFallbackAllowed()) {
          const demo = getFullDemoData();
          cb(demo.defaultAccounts);
        } else {
          reportSyncIssue('accounts', err);
          cb([]);
        }
      }
    ),

  subscribeToMedicalForms: (cb: (data: MedicalForm[]) => void, orgScope?: string[] | null) =>
    onSnapshot(
      scopedQuery('medicalForms', 'organization', orgScope),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, MedicalForm>();
          snap.docs.forEach((d) => {
            const raw = { ...d.data(), id: d.id } as MedicalForm;
            // Ensure every existing medical form follows the new AMID-XX-XX-XXXX structure
            if (!isNewSecurityNumberFormat(raw.securityNumber)) {
              const updatedSecNum = normalizeMedicalFormSecurityNumber(raw);
              raw.securityNumber = updatedSecNum;
              raw.barcode = updatedSecNum;
              // Silently migrate the document in Firestore
              updateDoc(doc(db, 'medicalForms', d.id), {
                securityNumber: updatedSecNum,
                barcode: updatedSecNum,
              }).catch(() => {});
            }
            map.set(d.id, raw);
          });
          cb(Array.from(map.values()));
        } else {
          cb([]);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'medicalForms');
        cb([]);
      }
    ),

  // === AMÉLIORATION AJOUTÉE : module Health Insurance Policy Management & Premium
  // Monitoring — écoute des collections `healthPolicies` (une par organisation, voir
  // upsertHealthPolicy ci-dessous) et `policyPayments` (historique de paiement).
  subscribeToHealthPolicies: (cb: (data: HealthPolicy[]) => void) =>
    onSnapshot(
      collection(db, 'healthPolicies'),
      (snap) => {
        const map = new Map<string, HealthPolicy>();
        snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as HealthPolicy));
        cb(Array.from(map.values()));
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'healthPolicies')
    ),

  subscribeToPolicyPayments: (cb: (data: PolicyPayment[]) => void, orgScope?: string[] | null) =>
    onSnapshot(
      scopedQuery('policyPayments', 'organizationId', orgScope),
      (snap) => {
        const map = new Map<string, PolicyPayment>();
        snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as PolicyPayment));
        const list = Array.from(map.values());
        list.sort((a, b) => new Date(b.paymentDate || b.createdAt || 0).getTime() - new Date(a.paymentDate || a.createdAt || 0).getTime());
        cb(list);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'policyPayments')
    ),

  subscribeToNotifications: (cb: (data: AppNotification[]) => void) =>
    onSnapshot(
      collection(db, 'notifications'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, AppNotification>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as AppNotification));
          const list = Array.from(map.values());
          list.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
          cb(list);
        } else {
          cb([]);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'notifications')
    ),

  // Members
  addMember: async (data: Partial<Member>) => {
    try {
      return await addDoc(collection(db, 'members'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'members');
      throw err;
    }
  },
  updateMember: async (data: Member) => {
    const { id, ...rest } = data;
    try {
      return await updateDoc(doc(db, 'members', id), rest);
    } catch (err) {
      // FIX: updateDoc() throws (code 'not-found') if the target document doesn't
      // actually exist server-side — which happens whenever `data.id` came from a LOCAL
      // id that was never confirmed as a real Firestore document (e.g. an earlier import
      // whose write loop was interrupted, or Firestore's offline-cache briefly reporting
      // a not-yet-synced record). Before this fix, that single throw aborted the ENTIRE
      // sequential import loop in App.tsx's handleImportMembers — every record queued
      // after the failing one was silently never written, while the UI still reported a
      // "success" summary (computed from parsing alone, before any write happened). Self-
      // healing to addDoc() here (create the record instead of failing) — combined with
      // Promise.allSettled in handleImportMembers so one failure can no longer take down
      // the rest — closes that data-loss path.
      if ((err as any)?.code === 'not-found') {
        return await addDoc(collection(db, 'members'), rest);
      }
      handleFirestoreError(err, OperationType.UPDATE, `members/${data.id}`);
      throw err;
    }
  },
  deleteMember: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'members', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `members/${id}`);
      throw err;
    }
  },

  // Organizations
  addOrganization: async (data: Partial<Organization>) => {
    try {
      return await addDoc(collection(db, 'organizations'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'organizations');
      throw err;
    }
  },
  updateOrganization: async (data: Organization) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'organizations', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `organizations/${data.id}`);
      throw err;
    }
  },
  deleteOrganization: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'organizations', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `organizations/${id}`);
      throw err;
    }
  },

  // Providers
  addProvider: async (data: Partial<Provider>) => {
    try {
      return await addDoc(collection(db, 'providers'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'providers');
      throw err;
    }
  },
  updateProvider: async (data: Provider) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'providers', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `providers/${data.id}`);
      throw err;
    }
  },
  deleteProvider: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'providers', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `providers/${id}`);
      throw err;
    }
  },

  // Claims
  addClaim: async (data: Partial<Claim>) => {
    try {
      return await addDoc(collection(db, 'claims'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'claims');
      throw err;
    }
  },
  updateClaim: async (data: Claim) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'claims', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `claims/${data.id}`);
      throw err;
    }
  },
  deleteClaim: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'claims', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `claims/${id}`);
      throw err;
    }
  },

  // === ADDED IMPROVEMENT: the `invoices` collection had NO write method at all
  // (only subscribeToInvoices existed) — nothing in the application ever created an
  // invoice/receipt, including when a claim was approved. The Invoices/Receipts screen
  // therefore permanently displayed the initial demo data, never the real approved
  // claims. See WorkflowService.approveClaim, which uses this method.
  addInvoice: async (data: Partial<InvoiceItem>) => {
    try {
      return await addDoc(collection(db, 'invoices'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'invoices');
      throw err;
    }
  },
  updateInvoice: async (data: InvoiceItem) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'invoices', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `invoices/${data.id}`);
      throw err;
    }
  },
  deleteInvoice: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'invoices', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `invoices/${id}`);
      throw err;
    }
  },

  // Enrollments
  addEnrollment: async (data: Partial<Enrollment>) => {
    try {
      return await addDoc(collection(db, 'enrollments'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'enrollments');
      throw err;
    }
  },
  updateEnrollment: async (data: Enrollment) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'enrollments', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `enrollments/${data.id}`);
      throw err;
    }
  },
  deleteEnrollment: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'enrollments', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `enrollments/${id}`);
      throw err;
    }
  },

  // Ceilings
  addCeiling: async (data: Partial<Ceiling>) => {
    try {
      return await addDoc(collection(db, 'ceilings'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'ceilings');
      throw err;
    }
  },
  updateCeiling: async (data: Ceiling) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'ceilings', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `ceilings/${data.id}`);
      throw err;
    }
  },
  deleteCeiling: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'ceilings', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `ceilings/${id}`);
      throw err;
    }
  },

  // Logs & Audit Trail
  addLog: async (data: Partial<AuditLog> | Partial<LoginLog>) => {
    try {
      return await addDoc(collection(db, 'auditLogs'), {
        ...data,
        timestamp: new Date().toISOString(),
        userAgent: (data as any).userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'auditLogs');
      throw err;
    }
  },

  // Accounts
  addAccount: async (data: any) => {
    try {
      return await setDoc(doc(db, 'accounts', data.id), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `accounts/${data.id}`);
      throw err;
    }
  },
  updateAccount: async (data: any) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'accounts', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `accounts/${data.id}`);
      throw err;
    }
  },
  deleteAccount: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'accounts', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `accounts/${id}`);
      throw err;
    }
  },

  // Medical Forms
  // === AMÉLIORATION AJOUTÉE : sécurité/protection des données (revue 2026-09-05, section 2.1)
  // ===
  // Le contenu clinique (`doctorPrescription`, déjà chiffré à ce stade — voir
  // encryptMedicalFormPrescription dans src/utils/sensitiveData.ts, appelé par l'écran avant
  // cet appel) n'est plus écrit dans le document `medicalForms/{id}` lui-même : il est déplacé
  // dans un document séparé `medicalForms/{id}/clinical/content`, avec sa propre règle
  // Firestore (voir firestore.rules) — tout accès qui liste/exporte la collection `medicalForms`
  // (historique, rapports) ne reçoit donc plus jamais automatiquement le contenu clinique.
  addMedicalForm: async (data: Partial<MedicalForm>) => {
    try {
      if (!isNewSecurityNumberFormat(data.securityNumber)) {
        const secNum = normalizeMedicalFormSecurityNumber(data);
        data.securityNumber = secNum;
        data.barcode = secNum;
      }
      const { doctorPrescription, ...parentData } = data;
      // === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.4) —
      // date de rétention indicative, purement informative (voir src/config/dataRetention.ts) :
      // aucune suppression automatique n'en découle, elle sert seulement à signaler plus tard,
      // à un Admin/Supervisor, les dossiers arrivés à échéance pour une revue manuelle.
      parentData.retentionUntil = computeMedicalFormRetentionUntil(parentData.issueDate || new Date().toISOString());
      const parentRef = await addDoc(collection(db, 'medicalForms'), parentData);

      if (
        doctorPrescription &&
        (doctorPrescription.presumedDiagnosis || doctorPrescription.requestedExams || doctorPrescription.treatmentOrder)
      ) {
        try {
          await setDoc(doc(db, 'medicalForms', parentRef.id, MEDICAL_FORM_CLINICAL_SUBCOLLECTION, MEDICAL_FORM_CLINICAL_DOC_ID), {
            ...doctorPrescription,
            updatedAt: new Date().toISOString(),
          });
        } catch (clinicalErr) {
          // Le document parent existe déjà et est fonctionnellement complet (identité, statut,
          // solde...) — ne jamais faire échouer toute l'émission d'un formulaire médical si
          // seule l'écriture du contenu clinique échoue ; le signaler distinctement suffit,
          // cohérent avec le principe "jamais bloquer un flux légitime" déjà appliqué ailleurs.
          handleFirestoreError(clinicalErr, OperationType.CREATE, `medicalForms/${parentRef.id}/clinical/${MEDICAL_FORM_CLINICAL_DOC_ID}`);
        }
      }

      return parentRef;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medicalForms');
      throw err;
    }
  },
  // === AMÉLIORATION AJOUTÉE : sécurité/protection des données (revue 2026-09-05, section 2.1)
  // === `doctorPrescription` n'est plus jamais écrit dans le document parent — le contenu
  // clinique vit désormais dans la sous-collection `clinical` (voir addMedicalForm ci-dessus).
  // Aucun appelant actuel ne modifie le contenu clinique après création (seul le statut change,
  // voir handleToggleStatus dans AgentMedicalFormView.tsx, qui exclut déjà ce champ) ; exclu ici
  // de façon défensive pour qu'un futur appelant ne puisse pas, par mégarde, réécrire le
  // contenu clinique en clair dans le document parent.
  updateMedicalForm: async (data: MedicalForm) => {
    try {
      const { id, doctorPrescription, ...rest } = data;
      return await updateDoc(doc(db, 'medicalForms', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `medicalForms/${data.id}`);
      throw err;
    }
  },
  // === AMÉLIORATION AJOUTÉE : sécurité/protection des données (revue 2026-09-05, section 2.5
  // — CRITIQUE, et section 2.1) ===
  // Avant le correctif 2.5, ces deux fonctions supprimaient physiquement et IRRÉVERSIBLEMENT un
  // ou tous les formulaires médicaux, sans aucune trace de ce qui a été supprimé — pour
  // `deleteAllMedicalForms`, cela signifiait l'effacement complet et silencieux de l'historique
  // médical de toutes les organisations en une seule opération. Correctif : chaque document
  // est désormais archivé (contenu intégral + qui/quand/pourquoi) dans la collection immuable
  // `medicalFormsDeletionArchive` AVANT sa suppression — jamais perdu, jamais visible ailleurs
  // que par un Admin (voir firestore.rules).
  // Depuis le correctif 2.1, le contenu clinique vit dans une sous-collection séparée
  // (`medicalForms/{id}/clinical/content`) — Firestore NE SUPPRIME JAMAIS automatiquement les
  // sous-collections d'un document supprimé (contrairement à une suppression en cascade d'un
  // SGBD relationnel) : sans ce correctif, supprimer un formulaire médical aurait laissé son
  // contenu clinique orphelin indéfiniment dans Firestore, invisible mais jamais réellement
  // effacé. Ces deux fonctions lisent, archivent, et suppriment désormais explicitement AUSSI
  // ce document de sous-collection (s'il existe — un formulaire créé avant ce correctif n'en a
  // pas).
  deleteMedicalForm: async (id: string, reason?: string) => {
    try {
      const ref = doc(db, 'medicalForms', id);
      const clinicalRef = doc(db, 'medicalForms', id, MEDICAL_FORM_CLINICAL_SUBCOLLECTION, MEDICAL_FORM_CLINICAL_DOC_ID);
      const [snap, clinicalSnap] = await Promise.all([getDoc(ref), getDoc(clinicalRef)]);

      if (snap.exists() || clinicalSnap.exists()) {
        await setDoc(doc(db, MEDICAL_FORMS_ARCHIVE_COLLECTION, id), {
          originalId: id,
          data: snap.exists() ? snap.data() : null,
          clinicalData: clinicalSnap.exists() ? clinicalSnap.data() : null,
          deletedBy: auth.currentUser?.uid || 'unknown',
          deletedByEmail: auth.currentUser?.email || null,
          deletedAt: new Date().toISOString(),
          reason: reason || null,
          scope: 'single',
        });
      }

      const batch = writeBatch(db);
      if (snap.exists()) batch.delete(ref);
      if (clinicalSnap.exists()) batch.delete(clinicalRef);
      return await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `medicalForms/${id}`);
      throw err;
    }
  },
  deleteAllMedicalForms: async (reason?: string) => {
    try {
      const snap = await getDocs(collection(db, 'medicalForms'));
      if (snap.empty) return;
      const docs = snap.docs;
      const deletedBy = auth.currentUser?.uid || 'unknown';
      const deletedByEmail = auth.currentUser?.email || null;
      const deletedAt = new Date().toISOString();

      // Une seule requête collectionGroup pour récupérer tous les documents `clinical` de
      // TOUS les formulaires en une fois, plutôt qu'une lecture individuelle par formulaire.
      const clinicalByFormId = new Map<string, Record<string, unknown>>();
      try {
        const clinicalSnap = await getDocs(collectionGroup(db, MEDICAL_FORM_CLINICAL_SUBCOLLECTION));
        clinicalSnap.docs.forEach((cd) => {
          const parentFormId = cd.ref.parent.parent?.id;
          if (parentFormId) clinicalByFormId.set(parentFormId, cd.data());
        });
      } catch (clinicalErr) {
        // Non-fatal : la suppression/l'archivage des documents parents continue sans le
        // contenu clinique plutôt que d'échouer entièrement — signalé pour investigation.
        console.warn('deleteAllMedicalForms: could not read clinical subcollection documents:', clinicalErr);
      }

      for (let i = 0; i < docs.length; i += MEDICAL_FORMS_ARCHIVE_BATCH_SIZE) {
        const chunk = docs.slice(i, i + MEDICAL_FORMS_ARCHIVE_BATCH_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((d) => {
          const clinicalData = clinicalByFormId.get(d.id) || null;
          batch.set(doc(db, MEDICAL_FORMS_ARCHIVE_COLLECTION, d.id), {
            originalId: d.id,
            data: d.data(),
            clinicalData,
            deletedBy,
            deletedByEmail,
            deletedAt,
            reason: reason || null,
            scope: 'bulk',
          });
          batch.delete(d.ref);
          if (clinicalData) {
            batch.delete(doc(db, 'medicalForms', d.id, MEDICAL_FORM_CLINICAL_SUBCOLLECTION, MEDICAL_FORM_CLINICAL_DOC_ID));
          }
        });
        await batch.commit();
      }

      await FirestoreService.addLog({
        userId: deletedBy,
        userName: deletedByEmail || 'Admin',
        userRole: 'Admin',
        action: 'MEDICAL_FORMS_BULK_DELETE',
        category: 'MedicalForms',
        entityType: 'medicalForms',
        details: `Bulk-deleted ${docs.length} medical form(s) (including clinical content), archived to ${MEDICAL_FORMS_ARCHIVE_COLLECTION} beforehand.${reason ? ` Reason: ${reason}` : ''}`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'medicalForms');
      throw err;
    }
  },

  // Notifications
  addNotification: async (data: Partial<AppNotification>) => {
    try {
      const payload = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString(),
        unread: data.unread ?? true,
      };
      return await addDoc(collection(db, 'notifications'), payload);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
      throw err;
    }
  },
  updateNotification: async (data: AppNotification) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'notifications', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${data.id}`);
      throw err;
    }
  },
  markNotificationRead: async (id: string) => {
    try {
      return await updateDoc(doc(db, 'notifications', id), { unread: false });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${id}`);
      throw err;
    }
  },
  markAllNotificationsRead: async (notifications: AppNotification[]) => {
    try {
      const unread = notifications.filter((n) => n.unread);
      await Promise.all(
        unread.map((n) => updateDoc(doc(db, 'notifications', n.id), { unread: false }))
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'notifications');
      throw err;
    }
  },
  deleteNotification: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `notifications/${id}`);
      throw err;
    }
  },

  // === AMÉLIORATION AJOUTÉE : Health Insurance Policy Management & Premium Monitoring ===
  // Le document `healthPolicies/{organizationName}` utilise le NOM de l'organisation comme
  // identifiant de document (au lieu d'un id auto-généré) — c'est ce qui permet à
  // firestore.rules de retrouver la police d'une réclamation/fiche médicale par un simple
  // get() sur `organization` (le champ déjà utilisé partout ailleurs dans l'app pour relier
  // un membre/sinistre à son organisation), sans jointure ni Cloud Function.
  upsertHealthPolicy: async (organizationName: string, data: Partial<HealthPolicy>) => {
    try {
      return await setDoc(
        doc(db, 'healthPolicies', organizationName),
        { ...data, organizationId: organizationName, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `healthPolicies/${organizationName}`);
      throw err;
    }
  },
  deleteHealthPolicy: async (organizationName: string) => {
    try {
      return await deleteDoc(doc(db, 'healthPolicies', organizationName));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `healthPolicies/${organizationName}`);
      throw err;
    }
  },

  addPolicyPayment: async (data: Partial<PolicyPayment>) => {
    try {
      return await addDoc(collection(db, 'policyPayments'), {
        ...data,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'policyPayments');
      throw err;
    }
  },
  updatePolicyPayment: async (data: PolicyPayment) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'policyPayments', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `policyPayments/${data.id}`);
      throw err;
    }
  },
  deletePolicyPayment: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'policyPayments', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `policyPayments/${id}`);
      throw err;
    }
  },

  // === AMÉLIORATION AJOUTÉE : suppression en cascade des données d'une organisation — sur
  // demande explicite ("supprimer toutes les données de X dans Firestore et sur
  // l'application"). Jusqu'ici, `deleteOrganization` (inchangée, toujours utilisée en dernier
  // par l'appelant) ne supprimait que le document `organizations/{id}`, laissant orphelins
  // tous les membres, sinistres, inscriptions, factures, formulaires médicaux et plafonds
  // liés (champ `organization` == nom de l'organisation), ainsi que sa police santé et son
  // historique de paiements (voir upsertHealthPolicy ci-dessus). Cette fonction supprime
  // maintenant TOUTES ces données liées, par lots (writeBatch, sous la limite Firestore de
  // 500 opérations/lot) pour rester robuste même sur un volume important.
  cascadeDeleteOrganizationData: async (organizationName: string) => {
    if (!organizationName) return;
    const BATCH_LIMIT = 450;
    const deleteRefsInBatches = async (refs: DocumentReference[]) => {
      for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const chunk = refs.slice(i, i + BATCH_LIMIT);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    };

    try {
      // Toutes les collections où un document porte un champ `organization` (nom exact).
      const orgScopedCollections = ['members', 'claims', 'enrollments', 'invoices', 'medicalForms', 'ceilings'];
      for (const collectionName of orgScopedCollections) {
        const snap = await getDocs(query(collection(db, collectionName), where('organization', '==', organizationName)));
        await deleteRefsInBatches(snap.docs.map((d) => d.ref));
      }

      // Police santé (id de document = nom de l'organisation, par convention) + son historique
      // de paiements (champ `organizationId` == nom de l'organisation).
      try {
        await deleteDoc(doc(db, 'healthPolicies', organizationName));
      } catch {
        // pas de police configurée pour cette organisation -> rien à supprimer, on continue
      }
      const paymentsSnap = await getDocs(query(collection(db, 'policyPayments'), where('organizationId', '==', organizationName)));
      await deleteRefsInBatches(paymentsSnap.docs.map((d) => d.ref));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `cascade-organization-data/${organizationName}`);
      throw err;
    }
  },
};

