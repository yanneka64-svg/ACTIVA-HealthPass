import { collection, addDoc, updateDoc, deleteDoc, doc, setDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Member, Organization, Provider, Claim, InvoiceItem, Enrollment, Ceiling, LoginLog, MedicalForm, AppNotification } from '../types';
import { getFullDemoData, seedInitialDemoDataIfEmpty } from './seedData';

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

export const FirestoreService = {
  // Listeners with explicit error callbacks and demo fallback
  subscribeToMembers: (cb: (data: Member[]) => void) =>
    onSnapshot(
      collection(db, 'members'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, Member>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Member));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.membersList || []) as Member[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'members');
        const demo = getFullDemoData();
        cb((demo.membersList || []) as Member[]);
      }
    ),

  subscribeToOrganizations: (cb: (data: Organization[]) => void) =>
    onSnapshot(
      collection(db, 'organizations'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, Organization>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Organization));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.orgs || []) as Organization[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'organizations');
        const demo = getFullDemoData();
        cb((demo.orgs || []) as Organization[]);
      }
    ),

  subscribeToProviders: (cb: (data: Provider[]) => void) =>
    onSnapshot(
      collection(db, 'providers'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, Provider>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Provider));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.providers || []) as Provider[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'providers');
        const demo = getFullDemoData();
        cb((demo.providers || []) as Provider[]);
      }
    ),

  subscribeToClaims: (cb: (data: Claim[]) => void) =>
    onSnapshot(
      collection(db, 'claims'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, Claim>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Claim));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.sampleClaims || []) as Claim[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'claims');
        const demo = getFullDemoData();
        cb((demo.sampleClaims || []) as Claim[]);
      }
    ),

  subscribeToInvoices: (cb: (data: InvoiceItem[]) => void) =>
    onSnapshot(
      collection(db, 'invoices'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, InvoiceItem>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as InvoiceItem));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.sampleInvoices || []) as InvoiceItem[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'invoices');
        const demo = getFullDemoData();
        cb((demo.sampleInvoices || []) as InvoiceItem[]);
      }
    ),

  subscribeToEnrollments: (cb: (data: Enrollment[]) => void) =>
    onSnapshot(
      collection(db, 'enrollments'),
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
        if (!snap.empty) {
          const map = new Map<string, Ceiling>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as Ceiling));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.sampleCeilings || []) as Ceiling[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'ceilings');
        const demo = getFullDemoData();
        cb((demo.sampleCeilings || []) as Ceiling[]);
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
        if (!snap.empty) {
          const map = new Map<string, any>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id }));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb(demo.defaultAccounts);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'accounts');
        const demo = getFullDemoData();
        cb(demo.defaultAccounts);
      }
    ),

  subscribeToMedicalForms: (cb: (data: MedicalForm[]) => void) =>
    onSnapshot(
      collection(db, 'medicalForms'),
      (snap) => {
        if (!snap.empty) {
          const map = new Map<string, MedicalForm>();
          snap.docs.forEach((d) => map.set(d.id, { ...d.data(), id: d.id } as MedicalForm));
          cb(Array.from(map.values()));
        } else {
          const demo = getFullDemoData();
          cb((demo.forms || []) as MedicalForm[]);
          seedInitialDemoDataIfEmpty();
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'medicalForms');
        const demo = getFullDemoData();
        cb((demo.forms || []) as MedicalForm[]);
      }
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

  // Invoices
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

  // Logs
  addLog: async (data: Partial<LoginLog>) => {
    try {
      return await addDoc(collection(db, 'auditLogs'), {
        ...data,
        timestamp: new Date().toISOString(),
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
  addMedicalForm: async (data: Partial<MedicalForm>) => {
    try {
      return await addDoc(collection(db, 'medicalForms'), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'medicalForms');
      throw err;
    }
  },
  updateMedicalForm: async (data: MedicalForm) => {
    try {
      const { id, ...rest } = data;
      return await updateDoc(doc(db, 'medicalForms', id), rest);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `medicalForms/${data.id}`);
      throw err;
    }
  },
  deleteMedicalForm: async (id: string) => {
    try {
      return await deleteDoc(doc(db, 'medicalForms', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `medicalForms/${id}`);
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
};

