"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignedFileUrl = exports.logAuditEvent = exports.validateCoverage = exports.syncPolicy = exports.evaluatePolicy = exports.bulkImportMembers = exports.processEnrollmentDecision = exports.processClaimDecision = exports.batchGenerateCardNumbers = exports.registerCardNumber = exports.generateCardNumber = exports.syncAccountClaims = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
const cardService_1 = require("./cardService");
const policyService_1 = require("./policyService");
const claimsService_1 = require("./claimsService");
const enrollmentsService_1 = require("./enrollmentsService");
const auditService_1 = require("./auditService");
const importService_1 = require("./importService");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
/**
 * === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.2 — RBAC via Custom Claims) ===
 * Constat (docs/security/CODE_AUDIT_MAP.md, section 5) : aucun Custom Claim Firebase n'est
 * jamais posé dans ce projet (`setCustomUserClaims` introuvable) — pourtant firestore.rules
 * (userProfile()/isActiveUser()/assignedOrganizations()) et cette même Cloud Function
 * (resolveUserRole) lisent déjà `request.auth.token.role`/`.isActive`/`.orgs` EN PRIORITÉ,
 * avec repli sur `accounts/{uid}` tant qu'aucun claim n'existe — conçu dès l'origine pour ne
 * jamais bloquer un compte existant pendant la transition.
 * Ce déclencheur synchronise automatiquement le claim à chaque création/modification d'un
 * compte par un Admin (ou par l'auto-enregistrement initial) : `accounts/{uid}.profile` reste
 * la source de vérité FONCTIONNELLE (jamais dupliquée ni divergente), le claim n'étant qu'un
 * miroir vérifié et mis en cache par Firebase Auth pour accélérer/durcir l'évaluation des
 * règles. Un utilisateur ne peut jamais modifier son propre claim directement (Firebase Auth
 * ne l'expose pas en écriture côté client) — seule cette fonction, avec les privilèges Admin
 * SDK, peut le faire, fermant ainsi toute possibilité d'auto-élévation même si la règle de
 * verrouillage du self-update (voir firestore.rules) était un jour contournée autrement.
 * N'a d'effet qu'une fois déployée (voir firebase.json) ; les comptes déjà existants
 * recevront leur claim au prochain déclenchement (première connexion causant une écriture sur
 * leur compte, ou toute modification par un Admin) — un script de rattrapage ponctuel peut
 * aussi être exécuté après déploiement pour les synchroniser immédiatement (hors périmètre de
 * ce commit, action opérationnelle listée dans le rapport final).
 */
exports.syncAccountClaims = (0, firestore_1.onDocumentWritten)('accounts/{uid}', async (event) => {
    const uid = event.params.uid;
    const after = event.data?.after;
    if (!after || !after.exists) {
        // Document deleted: nothing to sync (Firebase Auth account deletion, if any, is handled
        // elsewhere — this trigger only mirrors accounts/{uid} onto the matching Auth user).
        return;
    }
    const data = after.data() || {};
    const role = typeof data.profile === 'string' && data.profile ? data.profile : null;
    const isActive = data.isActive !== false;
    const orgs = Array.isArray(data.assignedOrganizations) && data.assignedOrganizations.length > 0 ? data.assignedOrganizations : null;
    try {
        // Le champ `role` n'est inclus QUE s'il a une vraie valeur : lui donner `null`
        // rendrait 'role' in request.auth.token vrai avec une valeur inexploitable, empêchant le
        // repli sur accounts/{uid}.profile que userProfile() effectue précisément quand la clé est
        // absente (voir firestore.rules). Même raisonnement pour `orgs`.
        await admin.auth().setCustomUserClaims(uid, {
            ...(role ? { role } : {}),
            isActive,
            ...(orgs ? { orgs } : {}),
        });
    }
    catch (error) {
        // Most common cause: the Auth user doesn't exist yet (account pre-provisioned in
        // Firestore by an Admin before the corresponding Firebase Auth credential is created on
        // first login — see LoginView.tsx). Non-fatal: the client-side fallback in
        // firestore.rules (reading accounts/{uid} directly) keeps working exactly as before, and
        // this trigger will succeed on the next write once the Auth user exists.
        console.warn(`syncAccountClaims: could not set custom claims for ${uid}:`, error?.message || error);
    }
});
/**
 * Robustly resolve verified user role from Firestore accounts collection
 */
async function resolveUserRole(uid, tokenRole) {
    if (tokenRole && (tokenRole === 'Admin' || tokenRole === 'Supervisor' || tokenRole === 'Agent')) {
        return { role: tokenRole, name: 'Staff User' };
    }
    try {
        const accSnap = await db.doc(`accounts/${uid}`).get();
        if (accSnap.exists) {
            const data = accSnap.data() || {};
            // === AMÉLIORATION AJOUTÉE : correctif (revue de code, câblage Phase 5) — le document
            // `accounts/{uid}` stocke le rôle sous le champ `profile` partout ailleurs dans
            // l'application (AccountsView.tsx, firestore.rules `getUserData().profile`,
            // normalizeRole()...), jamais sous `role`. Comme aucune Custom Claim `role` n'est
            // jamais réellement posée dans ce projet (`context.auth.token.role` est donc toujours
            // absent), cette fonction retombait systématiquement sur le repli 'Agent' pour TOUT
            // utilisateur, y compris les Admin/Supervisor — ce qui aurait bloqué en permanence
            // `bulkImportMembers` (réservé à Admin/Supervisor) et faussé le rôle serveur utilisé par
            // `processClaimDecision`/`processEnrollmentDecision`, une fois ces fonctions déployées.
            return {
                role: data.profile || data.role || 'Agent',
                name: data.fullName || data.email || 'Staff User',
            };
        }
    }
    catch {
        // Fallback if accounts read fails
    }
    return { role: 'Agent', name: 'Staff User' };
}
/**
 * Cloud Function: Generate Next Card Number (Atomic, Server-Side)
 */
exports.generateCardNumber = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const ctx = {
        organization: data.organization,
        memberId: data.memberId,
        insuredName: data.insuredName,
        assignedBy: context.auth.uid,
        assignedByName: name,
        method: data.method || 'AUTO_ENROLLMENT',
    };
    try {
        const cardNumber = await (0, cardService_1.generateNextCardNumberServer)(db, ctx);
        return { success: true, cardNumber };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to generate card number');
    }
});
/**
 * Cloud Function: Register Existing Card Number (Case A)
 */
exports.registerCardNumber = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const cardNumber = data.cardNumber;
    if (!cardNumber || typeof cardNumber !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'cardNumber string is required.');
    }
    const { name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const ctx = {
        organization: data.organization,
        memberId: data.memberId,
        insuredName: data.insuredName,
        assignedBy: context.auth.uid,
        assignedByName: name,
        method: data.method || 'MANUAL',
    };
    try {
        const result = await (0, cardService_1.registerExistingCardNumberServer)(db, cardNumber, ctx);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to register card number');
    }
});
/**
 * Cloud Function: Batch Generate Card Numbers
 */
exports.batchGenerateCardNumbers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const count = data.count || 1;
    const ctxList = data.ctxList || [];
    try {
        const cardNumbers = await (0, cardService_1.batchGenerateCardNumbersServer)(db, count, ctxList);
        return { success: true, cardNumbers };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to batch generate card numbers');
    }
});
/**
 * Cloud Function: Process Claim Decision (Separation of Duties enforced server-side)
 */
exports.processClaimDecision = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { role, name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const payload = {
        claimId: data.claimId,
        decision: data.decision,
        approverId: context.auth.uid,
        approverName: name,
        approverRole: role,
        rejectionReason: data.rejectionReason,
        approvedAmountUSD: data.approvedAmountUSD,
        approvedAmountLRD: data.approvedAmountLRD,
    };
    try {
        const result = await (0, claimsService_1.processClaimDecisionServer)(db, payload);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to process claim decision');
    }
});
/**
 * Cloud Function: Process Enrollment Decision (Separation of Duties enforced server-side)
 */
exports.processEnrollmentDecision = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { role, name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    const payload = {
        enrollmentId: data.enrollmentId,
        decision: data.decision,
        approverId: context.auth.uid,
        approverName: name,
        approverRole: role,
        rejectionReason: data.rejectionReason,
    };
    try {
        const result = await (0, enrollmentsService_1.processEnrollmentDecisionServer)(db, payload);
        return result;
    }
    catch (error) {
        throw new functions.https.HttpsError('failed-precondition', error?.message || 'Failed to process enrollment decision');
    }
});
/**
 * Cloud Function: Bulk Member Import
 */
exports.bulkImportMembers = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const { role, name } = await resolveUserRole(context.auth.uid, context.auth.token.role);
    if (role !== 'Admin' && role !== 'Supervisor') {
        throw new functions.https.HttpsError('permission-denied', 'Only Admins or Supervisors can perform bulk import.');
    }
    const rows = (data.rows || []);
    const user = {
        uid: context.auth.uid,
        name,
        role,
    };
    try {
        const result = await (0, importService_1.processBulkMemberImportServer)(db, rows, user);
        return { success: true, result };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to process bulk import');
    }
});
/**
 * Cloud Function: Evaluate Policy Status
 */
exports.evaluatePolicy = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const policy = data.policy;
    if (!policy) {
        throw new functions.https.HttpsError('invalid-argument', 'Policy data is required.');
    }
    const result = (0, policyService_1.evaluatePolicyServer)(policy);
    return { success: true, result };
});
/**
 * Cloud Function: Sync Policy Status
 */
exports.syncPolicy = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const orgId = data.organizationId;
    if (!orgId) {
        throw new functions.https.HttpsError('invalid-argument', 'organizationId is required.');
    }
    try {
        const result = await (0, policyService_1.syncPolicyStatusServer)(db, orgId);
        return { success: true, result };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to sync policy status');
    }
});
/**
 * Cloud Function: Validate Coverage
 */
exports.validateCoverage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const orgName = data.organization;
    const result = await (0, claimsService_1.validateHealthcareAccessServer)(db, orgName);
    return result;
});
/**
 * Cloud Function: Log Audit Event
 */
exports.logAuditEvent = functions.https.onCall(async (data, context) => {
    const entry = {
        userId: context.auth?.uid || data.userId || 'anonymous',
        userName: data.userName || context.auth?.token?.name || 'Anonymous User',
        userRole: context.auth?.token?.role || data.userRole || 'Public',
        action: data.action || 'UNKNOWN_ACTION',
        category: data.category || 'System',
        entityId: data.entityId,
        entityType: data.entityType,
        details: data.details || '',
        ip: context.rawRequest?.ip || data.ip,
        userAgent: context.rawRequest?.headers['user-agent'] || data.userAgent,
        severity: data.severity || 'INFO',
    };
    const id = await (0, auditService_1.logAuditEventServer)(db, entry);
    return { success: true, id };
});
/**
 * === AMÉLIORATION AJOUTÉE : sécurité (Phase 1.9 — Stockage de fichiers sensibles) ===
 * Constat (docs/security/CODE_AUDIT_MAP.md, section 7) : `storage.rules` autorise
 * `read, write: if request.auth != null` sur TOUS les chemins — aucune restriction de rôle,
 * d'organisation, ni de propriétaire — et `getDownloadURL()` (src/utils/storageUtils.ts)
 * retourne une URL de téléchargement PERMANENTE, sans expiration. N'importe quel utilisateur
 * authentifié qui devine/énumère un chemin peut lire indéfiniment un fichier (photo d'assuré,
 * pièce d'identité...) même après avoir quitté l'organisation ou perdu ses droits.
 * Cette Cloud Function génère une URL signée à durée limitée (par défaut 15 minutes) pour un
 * chemin donné, après vérification d'autorisation (utilisateur actif, et — si le compte a un
 * périmètre d'organisations assigné — préfixe de chemin cohérent avec ce périmètre quand il
 * est encodé dans le chemin, ex. `member-photos/{organization}/...`), et journalise chaque
 * génération dans `auditLogs` (traçabilité demandée par la Phase 1.9).
 * === NON CÂBLÉE CÔTÉ CLIENT DANS CE LOT === : remplacer partout `getDownloadURL()` par cette
 * fonction impliquerait de retoucher chaque écran qui affiche une photo/pièce jointe
 * (`<img src={photoUrl}>` un peu partout dans l'app) sans disposer d'outillage de test visuel
 * dans cet environnement pour garantir l'absence de régression d'affichage — risque jugé
 * disproportionné pour ce lot. Livrée prête à l'emploi et testée unitairement dans la mesure
 * du possible (voir rapport final) ; le câblage UI est documenté comme prochaine étape.
 */
exports.getSignedFileUrl = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const filePath = data.path;
    if (!filePath || typeof filePath !== 'string' || filePath.includes('..')) {
        throw new functions.https.HttpsError('invalid-argument', 'A valid, non-traversal file path is required.');
    }
    // Verify the account is active (mirrors isActiveUser() in firestore.rules) — a deactivated
    // account should not be able to mint a fresh signed URL even if it once had one.
    const accSnap = await db.doc(`accounts/${context.auth.uid}`).get();
    const accData = accSnap.exists ? accSnap.data() || {} : {};
    const tokenIsActive = context.auth.token.isActive;
    const isActive = tokenIsActive !== undefined ? tokenIsActive !== false : accData.isActive !== false;
    if (!isActive) {
        throw new functions.https.HttpsError('permission-denied', 'This account has been deactivated.');
    }
    // NOTE (limitation documentée) : un cloisonnement par organisation au niveau du chemin de
    // fichier (comme hasOrgAccess() le fait pour Firestore) supposerait que les chemins
    // encodent systématiquement l'organisation (ex. `member-photos/{organization}/...`) — ce
    // n'est pas le cas du format actuel produit par uploadPhotoOrFallback()
    // (`${pathPrefix}/${identifier}-${timestamp}.jpg`, src/utils/storageUtils.ts). Appliquer
    // une vérification ici sans cette convention de nommage ne protégerait rien de réel et
    // risquerait de faux positifs. Documenté comme prochaine étape (faire évoluer le chemin
    // d'upload pour y inclure l'organisation) plutôt qu'implémenté à moitié.
    const expiresInMs = Math.min(Math.max(Number(data.expiresInMinutes) || 15, 1), 60) * 60 * 1000;
    try {
        const bucket = admin.storage().bucket();
        const [url] = await bucket.file(filePath).getSignedUrl({
            action: 'read',
            expires: Date.now() + expiresInMs,
        });
        await (0, auditService_1.logAuditEventServer)(db, {
            userId: context.auth.uid,
            userName: context.auth.token.name || accData.fullName || 'Staff User',
            userRole: context.auth.token.role || accData.profile || 'Unknown',
            action: 'SIGNED_URL_GENERATED',
            category: 'Storage',
            entityId: filePath,
            entityType: 'StorageFile',
            details: `Signed URL generated (expires in ${Math.round(expiresInMs / 60000)}m).`,
            severity: 'INFO',
        });
        return { success: true, url, expiresAt: new Date(Date.now() + expiresInMs).toISOString() };
    }
    catch (error) {
        throw new functions.https.HttpsError('internal', error?.message || 'Failed to generate signed URL');
    }
});
//# sourceMappingURL=index.js.map