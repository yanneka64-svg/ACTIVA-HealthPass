// === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 3.1 — chiffrement
// applicatif des champs de santé les plus sensibles) ===
// Chiffre/déchiffre le contenu clinique d'un formulaire médical (diagnostic présumé, examens
// demandés, traitement prescrit) via les Cloud Functions `encryptSensitiveFields`/
// `decryptSensitiveFields` (voir functions/src/encryptionService.ts) — la clé de chiffrement ne
// transite JAMAIS par le navigateur. `securityNumber`/`barcode` ne sont PAS concernés : ce sont
// des codes-barres internes au document (format AMID-YY-DD-XXXX, voir medicalFormUtils.ts),
// jamais un identifiant national de la personne — les chiffrer casserait la recherche et la
// validation de format sans aucun bénéfice de confidentialité réel.
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { functions, db } from '../lib/firebase';
import { MedicalForm } from '../types';
import { recordServerFallback } from './fallbackTelemetry';

// Doit rester identique à ENCRYPTED_FIELD_PREFIX dans functions/src/encryptionService.ts.
const ENCRYPTED_FIELD_PREFIX = 'encv1:';

// Doit rester identique aux constantes de même nom dans src/services/firestore.ts.
const MEDICAL_FORM_CLINICAL_SUBCOLLECTION = 'clinical';
const MEDICAL_FORM_CLINICAL_DOC_ID = 'content';

/**
 * === AMÉLIORATION AJOUTÉE : protection des données (revue 2026-09-05, section 2.1) ===
 * Depuis ce correctif, le contenu clinique d'un NOUVEAU formulaire médical n'est plus intégré
 * au document `medicalForms/{id}` — il vit dans `medicalForms/{id}/clinical/content` (voir
 * FirestoreService.addMedicalForm). Un `form` lu depuis la collection `medicalForms` (historique,
 * abonnement temps réel) n'a donc plus `doctorPrescription` renseigné pour ces formulaires — il
 * faut une lecture EXPLICITE et séparée pour l'obtenir. Cette fonction ne fait cette lecture
 * QUE si `doctorPrescription` est absent (documents créés avant ce correctif : rien à
 * récupérer, ils l'ont déjà intégré — zéro lecture Firestore supplémentaire pour l'historique
 * existant).
 */
async function hydratePrescriptionFromSubcollection<T extends Partial<MedicalForm>>(form: T): Promise<T> {
  if (form.doctorPrescription || !form.id) return form;
  try {
    const snap = await getDoc(doc(db, 'medicalForms', form.id, MEDICAL_FORM_CLINICAL_SUBCOLLECTION, MEDICAL_FORM_CLINICAL_DOC_ID));
    if (snap.exists()) {
      return { ...form, doctorPrescription: snap.data() as MedicalForm['doctorPrescription'] };
    }
  } catch (err) {
    console.warn('hydratePrescriptionFromSubcollection notice:', err);
  }
  return form;
}

type PrescriptionFieldMap = Record<'presumedDiagnosis' | 'requestedExams' | 'treatmentOrder', string | undefined>;

function isEncryptedValue(value?: string): boolean {
  return typeof value === 'string' && value.startsWith(ENCRYPTED_FIELD_PREFIX);
}

async function callFieldsFunction(
  name: 'encryptSensitiveFields' | 'decryptSensitiveFields',
  fields: Record<string, string>
): Promise<Record<string, string>> {
  const fn = httpsCallable<{ fields: Record<string, string> }, { success: boolean; fields: Record<string, string> }>(
    functions,
    name
  );
  const res = await fn({ fields });
  return res.data.fields;
}

/**
 * Encrypts the clinical prescription fields of a medical form before it is written to
 * Firestore. Fail-open on any error (Cloud Function unavailable, network...): returns the form
 * UNCHANGED (plaintext) rather than blocking the issuance of a medical form — consistent with
 * every other server-fallback pattern already established in this codebase (see
 * fallbackTelemetry.ts) — but records a dedicated, more visible telemetry event, since a silent
 * plaintext write defeats the purpose of this correctif if it happens repeatedly unnoticed.
 */
export async function encryptMedicalFormPrescription<T extends Partial<MedicalForm>>(form: T): Promise<T> {
  const prescription = form.doctorPrescription;
  if (!prescription) return form;
  const toEncrypt: Record<string, string> = {};
  if (prescription.presumedDiagnosis) toEncrypt.presumedDiagnosis = prescription.presumedDiagnosis;
  if (prescription.requestedExams) toEncrypt.requestedExams = prescription.requestedExams;
  if (prescription.treatmentOrder) toEncrypt.treatmentOrder = prescription.treatmentOrder;
  if (Object.keys(toEncrypt).length === 0) return form;

  try {
    const encrypted = await callFieldsFunction('encryptSensitiveFields', toEncrypt);
    return {
      ...form,
      doctorPrescription: {
        ...prescription,
        ...(encrypted as Partial<PrescriptionFieldMap>),
      },
    };
  } catch (err) {
    console.warn('encryptMedicalFormPrescription: falling back to plaintext write:', err);
    recordServerFallback('encryptSensitiveFields', 'Medical form written without field-level encryption.');
    return form;
  }
}

/**
 * Decrypts a medical form's clinical prescription fields for on-screen display/PDF generation.
 * Legacy forms written before this correctif (no encryption prefix) are detected client-side
 * and returned untouched WITHOUT ever calling the Cloud Function — zero added latency for the
 * existing history. On decryption failure, replaces the affected fields with a clear
 * placeholder rather than showing raw ciphertext.
 */
export async function decryptMedicalFormPrescription<T extends Partial<MedicalForm>>(rawForm: T): Promise<T> {
  const form = await hydratePrescriptionFromSubcollection(rawForm);
  const prescription = form.doctorPrescription;
  if (!prescription) return form;

  const toDecrypt: Record<string, string> = {};
  if (isEncryptedValue(prescription.presumedDiagnosis)) toDecrypt.presumedDiagnosis = prescription.presumedDiagnosis!;
  if (isEncryptedValue(prescription.requestedExams)) toDecrypt.requestedExams = prescription.requestedExams!;
  if (isEncryptedValue(prescription.treatmentOrder)) toDecrypt.treatmentOrder = prescription.treatmentOrder!;
  if (Object.keys(toDecrypt).length === 0) return form;

  try {
    const decrypted = await callFieldsFunction('decryptSensitiveFields', toDecrypt);
    return {
      ...form,
      doctorPrescription: {
        ...prescription,
        ...(decrypted as Partial<PrescriptionFieldMap>),
      },
    };
  } catch (err) {
    console.warn('decryptMedicalFormPrescription: unable to decrypt:', err);
    recordServerFallback('decryptSensitiveFields', 'Medical form clinical fields could not be decrypted for display.');
    const placeholder = '[Unable to decrypt — please retry]';
    return {
      ...form,
      doctorPrescription: {
        ...prescription,
        ...(toDecrypt.presumedDiagnosis ? { presumedDiagnosis: placeholder } : {}),
        ...(toDecrypt.requestedExams ? { requestedExams: placeholder } : {}),
        ...(toDecrypt.treatmentOrder ? { treatmentOrder: placeholder } : {}),
      },
    };
  }
}
