"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureUserAccount = exports.lookupAccountAuthEmail = exports.resolveLoginIdentifier = exports.getSignedFileUrl = exports.logAuditEvent = exports.validateCoverage = exports.syncPolicy = exports.evaluatePolicy = exports.bulkImportMembers = exports.processEnrollmentDecision = exports.processClaimDecision = exports.batchGenerateCardNumbers = exports.registerCardNumber = exports.generateCardNumber = exports.syncAccountClaims = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const crypto = require("crypto");
const firestore_2 = require("firebase-functions/v2/firestore");
const cardService_1 = require("./cardService");
const policyService_1 = require("./policyService");
const claimsService_1 = require("./claimsService");
const enrollmentsService_1 = require("./enrollmentsService");
const auditService_1 = require("./auditService");
const importService_1 = require("./importService");
const validation_1 = require("./validation");
if (!admin.apps.length) {
    admin.initializeApp();
}
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || 'ai-studio-activahealthpass-a71d742a-47a5-4343-b20f-a025fe51929b';
function initFirestore() {
    try {
        return (0, firestore_1.getFirestore)(FIRESTORE_DATABASE_ID);
    }
    catch {
        return (0, firestore_1.getFirestore)();
    }
}
const db = initFirestore();
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
exports.syncAccountClaims = (0, firestore_2.onDocumentWritten)('accounts/{uid}', async (event) => {
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
    (0, validation_1.validatePayload)(data, {
        organization: { type: 'string', required: true, maxLength: 200 },
        memberId: { type: 'string', maxLength: 200 },
        insuredName: { type: 'string', maxLength: 200 },
        assignedByName: { type: 'string', maxLength: 200 },
        method: { type: 'string', enum: ['AUTO_ENROLLMENT', 'ADMIN_CREATION', 'EXCEL_IMPORT', 'MANUAL', 'MIGRATION'] },
    });
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
    (0, validation_1.validatePayload)(data, {
        cardNumber: { type: 'string', required: true, maxLength: 20 },
        organization: { type: 'string', maxLength: 200 },
        memberId: { type: 'string', maxLength: 200 },
        insuredName: { type: 'string', maxLength: 200 },
        assignedByName: { type: 'string', maxLength: 200 },
        method: { type: 'string', enum: ['AUTO_ENROLLMENT', 'ADMIN_CREATION', 'EXCEL_IMPORT', 'MANUAL', 'MIGRATION'] },
    });
    const cardNumber = data.cardNumber;
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
    (0, validation_1.validatePayload)(data, {
        count: { type: 'number', min: 1, max: 500 },
        ctxList: { type: 'array', maxItems: 500 },
    });
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
    (0, validation_1.validatePayload)(data, {
        claimId: { type: 'string', required: true, maxLength: 200 },
        decision: { type: 'string', required: true, enum: ['approved', 'rejected', 'returned'] },
        approverName: { type: 'string', maxLength: 200 },
        approverRole: { type: 'string', enum: ['Admin', 'Supervisor', 'Superviseur'] },
        rejectionReason: { type: 'string', maxLength: 2000 },
        approvedAmountUSD: { type: 'number', min: 0, max: 10_000_000 },
        approvedAmountLRD: { type: 'number', min: 0, max: 2_000_000_000 },
    });
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
    (0, validation_1.validatePayload)(data, {
        enrollmentId: { type: 'string', required: true, maxLength: 200 },
        decision: { type: 'string', required: true, enum: ['approved', 'rejected'] },
        approverName: { type: 'string', maxLength: 200 },
        approverRole: { type: 'string', enum: ['Admin', 'Supervisor', 'Superviseur'] },
        rejectionReason: { type: 'string', maxLength: 2000 },
    });
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
    (0, validation_1.validatePayload)(data, {
        rows: { type: 'array', required: true, maxItems: 5000 },
    });
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
 * === AMÉLIORATION AJOUTÉE : sécurité (Phase 2.2) — recevait auparavant l'objet `policy`
 * ENTIER fourni par le client et l'évaluait tel quel (`evaluatePolicyServer(data.policy)`),
 * exactement la même faille que celle corrigée dans server.ts (voir CODE_AUDIT_MAP.md section
 * 3.2) : un client pouvait fabriquer n'importe quelle date/montant pour obtenir le statut de
 * son choix. Lit désormais la police RÉELLE en base par nom d'organisation, comme
 * validateCoverage (validateHealthcareAccessServer) le fait déjà correctement. Aucun appelant
 * existant (voir CODE_AUDIT_MAP.md section 3.1) — aucune régression possible.
 */
exports.evaluatePolicy = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    (0, validation_1.validatePayload)(data, {
        organizationName: { type: 'string', required: true, maxLength: 200 },
    });
    const organizationName = data.organizationName;
    const policySnap = await db.doc(`healthPolicies/${organizationName}`).get();
    if (!policySnap.exists) {
        return { success: true, result: { status: 'Active', coverageBlocked: false } };
    }
    const result = (0, policyService_1.evaluatePolicyServer)(policySnap.data());
    return { success: true, result };
});
/**
 * Cloud Function: Sync Policy Status
 */
exports.syncPolicy = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    (0, validation_1.validatePayload)(data, {
        organizationId: { type: 'string', required: true, maxLength: 200 },
    });
    const orgId = data.organizationId;
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
    (0, validation_1.validatePayload)(data, {
        organization: { type: 'string', maxLength: 200 },
    });
    const orgName = data.organization;
    const result = await (0, claimsService_1.validateHealthcareAccessServer)(db, orgName);
    return result;
});
/**
 * Cloud Function: Log Audit Event
 */
exports.logAuditEvent = functions.https.onCall(async (data, context) => {
    (0, validation_1.validatePayload)(data, {
        userId: { type: 'string', maxLength: 200 },
        userName: { type: 'string', maxLength: 200 },
        userRole: { type: 'string', maxLength: 100 },
        action: { type: 'string', maxLength: 100 },
        category: { type: 'string', maxLength: 100 },
        entityId: { type: 'string', maxLength: 200 },
        entityType: { type: 'string', maxLength: 100 },
        details: { type: 'string', maxLength: 5000 },
        ip: { type: 'string', maxLength: 100 },
        userAgent: { type: 'string', maxLength: 500 },
        severity: { type: 'string', enum: ['INFO', 'WARNING', 'ERROR', 'CRITICAL'] },
    });
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
    (0, validation_1.validatePayload)(data, {
        path: { type: 'string', required: true, maxLength: 1000 },
        expiresInMinutes: { type: 'number', min: 1, max: 60 },
    });
    const filePath = data.path;
    if (filePath.includes('..')) {
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
function verifyPasswordServer(password, passwordHash, passwordSalt) {
    if (!passwordHash || !passwordSalt)
        return false;
    try {
        const saltBuffer = Buffer.from(passwordSalt, 'hex');
        const derived = crypto.pbkdf2Sync(password, saltBuffer, 150_000, 32, 'sha256').toString('hex');
        return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(passwordHash, 'hex'));
    }
    catch {
        return false;
    }
}
function hashPasswordServer(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 150_000, 32, 'sha256').toString('hex');
    return { passwordHash: derived, passwordSalt: salt };
}
async function checkAndApplyRateLimit(firestore, identifier, clientIp) {
    const now = Date.now();
    const LOCKOUT_DURATION_MS = 60_000;
    const WINDOW_MS = 60_000;
    const MAX_ATTEMPTS = 5;
    const key = `rate_${identifier.replace(/[^a-z0-9_.]/g, '_')}`;
    const rateRef = firestore.collection('login_rate_limits').doc(key);
    try {
        const docSnap = await rateRef.get();
        if (docSnap.exists) {
            const data = docSnap.data() || {};
            const lockedUntil = typeof data.lockedUntil === 'number' ? data.lockedUntil : 0;
            if (now < lockedUntil) {
                const retryAfterSec = Math.ceil((lockedUntil - now) / 1000);
                return { allowed: false, retryAfterSec };
            }
            let attempts = typeof data.attempts === 'number' ? data.attempts : 0;
            const windowStart = typeof data.windowStart === 'number' ? data.windowStart : now;
            if (now - windowStart > WINDOW_MS) {
                await rateRef.set({
                    attempts: 1,
                    windowStart: now,
                    lockedUntil: 0,
                    lastIp: clientIp,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
                return { allowed: true };
            }
            else {
                attempts += 1;
                if (attempts >= MAX_ATTEMPTS) {
                    const newLockedUntil = now + LOCKOUT_DURATION_MS;
                    await rateRef.set({
                        attempts,
                        windowStart,
                        lockedUntil: newLockedUntil,
                        lastIp: clientIp,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    return { allowed: false, retryAfterSec: Math.ceil(LOCKOUT_DURATION_MS / 1000) };
                }
                else {
                    await rateRef.update({
                        attempts,
                        lastIp: clientIp,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                    return { allowed: true };
                }
            }
        }
        else {
            await rateRef.set({
                attempts: 1,
                windowStart: now,
                lockedUntil: 0,
                lastIp: clientIp,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            return { allowed: true };
        }
    }
    catch (err) {
        console.warn('Rate limiting non-fatal error:', err);
        return { allowed: true };
    }
}
/**
 * === AMÉLIORATION AJOUTÉE : sécurité — Cloud Function Callable `resolveLoginIdentifier` ===
 * Remplace définitivement tout appel client `getDocs(collection(db, 'accounts'))`.
 * Fonctionne avec le SDK Admin Firebase (ignore firestore.rules, n'exige aucune lecture publique) :
 * - Résout l'identifiant (username, email d'entreprise ou authEmail) vers l'adresse Firebase Auth correspondante
 * - Applique un rate limiting serveur réel dans Firestore (collection `login_rate_limits`, max 5 essais / 60s)
 * - Ne renvoie JAMAIS passwordHash, passwordSalt, password, tempPassword, ni aucun champ sensible
 * - Si le mot de passe est fourni pour un compte legacy ou non encore provisionné dans Firebase Auth,
 *   la vérification du hash PBKDF2 s'effectue côté serveur et renvoie uniquement un booléen de verdict.
 * - Si le compte possède encore un mot de passe en clair legacy, il est automatiquement migré en PBKDF2
 *   côté serveur lors de la validation sans jamais exposer le mot de passe en clair au navigateur.
 */
async function handleResolveLogin(data, context) {
    const rawIdentifier = (data?.identifier || '').trim();
    const identifier = rawIdentifier.toLowerCase();
    const password = typeof data?.password === 'string' ? data.password : '';
    if (!identifier) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing identifier');
    }
    const sanitizedId = identifier.replace(/[^a-z0-9_.]/g, '');
    const clientIp = context.rawRequest?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
        context.rawRequest?.ip ||
        'unknown';
    // 1. Rate limiting serveur
    const rateLimit = await checkAndApplyRateLimit(db, sanitizedId, clientIp);
    if (!rateLimit.allowed) {
        return {
            found: false,
            isActive: false,
            authEmail: null,
            candidateEmails: [],
            rateLimited: true,
            retryAfterSec: rateLimit.retryAfterSec || 60,
            error: `Too many login attempts. Please wait ${rateLimit.retryAfterSec || 60} seconds.`,
        };
    }
    // 2. Recherche du compte via Admin SDK
    const snap = await db.collection('accounts').get();
    let matchedDoc = null;
    let matchedData = null;
    for (const docSnap of snap.docs) {
        const acc = docSnap.data();
        const docEmail = (acc.email || '').toLowerCase().trim();
        const docUsername = (acc.username || '').toLowerCase().trim();
        const docAuthEmail = (acc.authEmail || '').toLowerCase().trim();
        if (docEmail === identifier ||
            docUsername === identifier ||
            docUsername === sanitizedId ||
            docAuthEmail === identifier ||
            (docEmail && identifier.includes('@') && docEmail === identifier) ||
            (docEmail.split('@')[0] && docEmail.split('@')[0] === identifier) ||
            (docAuthEmail.split('@')[0] && docAuthEmail.split('@')[0] === identifier)) {
            matchedDoc = docSnap;
            matchedData = acc;
            break;
        }
    }
    if (!matchedData) {
        const fallbackEmails = Array.from(new Set([
            identifier.includes('@') ? identifier : `${sanitizedId}@activa.local`,
            `${sanitizedId}@activa-assurance.com`,
            `${sanitizedId}@group-activa.com`,
        ]));
        return {
            found: false,
            isActive: false,
            authEmail: null,
            candidateEmails: fallbackEmails,
            username: sanitizedId,
            legacyVerification: { checked: false, valid: false },
        };
    }
    const isActive = matchedData.isActive !== false;
    const docUsername = (matchedData.username || sanitizedId).toLowerCase();
    const candidateEmails = Array.from(new Set([
        matchedData.authEmail,
        matchedData.email,
        `${docUsername}@activa.local`,
        `${docUsername}@activa-assurance.com`,
        `${docUsername}@group-activa.com`,
    ].filter(Boolean)));
    const primaryAuthEmail = matchedData.authEmail || matchedData.email || candidateEmails[0] || `${docUsername}@activa.local`;
    // 3. Vérification des identifiants legacy côté serveur
    let legacyVerification = { checked: false, valid: false };
    if (password && matchedDoc) {
        legacyVerification.checked = true;
        // Hash PBKDF2 présent
        if (matchedData.passwordHash && matchedData.passwordSalt) {
            legacyVerification.valid = verifyPasswordServer(password, matchedData.passwordHash, matchedData.passwordSalt);
        }
        // Compte legacy avec mot de passe clair non encore migré
        else if (matchedData.password || matchedData.tempPassword) {
            const matchesPlain = (matchedData.password && matchedData.password === password) ||
                (matchedData.tempPassword && matchedData.tempPassword === password);
            if (matchesPlain) {
                legacyVerification.valid = true;
                // Auto-migration immédiate vers hash PBKDF2 sur le serveur
                try {
                    const { passwordHash, passwordSalt } = hashPasswordServer(password);
                    await matchedDoc.ref.update({
                        passwordHash,
                        passwordSalt,
                        password: admin.firestore.FieldValue.delete(),
                        tempPassword: admin.firestore.FieldValue.delete(),
                        migratedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                catch (migrateErr) {
                    console.warn('Auto-migration non-fatal error:', migrateErr);
                }
            }
            else {
                legacyVerification.valid = false;
            }
        }
    }
    // Réinitialise le compteur de rate limit si la vérification a réussi
    if (legacyVerification.valid) {
        try {
            await db.collection('login_rate_limits').doc(`rate_${sanitizedId}`).delete();
        }
        catch {
            // Ignore deletion error
        }
    }
    // Retour STRICTEMENT épuré : aucun hash, aucun sel, aucun mot de passe
    return {
        found: true,
        isActive,
        authEmail: primaryAuthEmail,
        candidateEmails,
        username: docUsername,
        legacyVerification,
    };
}
exports.resolveLoginIdentifier = functions.https.onCall(async (data, context) => {
    return handleResolveLogin(data, context);
});
/**
 * === AMÉLIORATION AJOUTÉE : alias rétro-compatible pour lookupAccountAuthEmail ===
 */
exports.lookupAccountAuthEmail = functions.https.onCall(async (data, context) => {
    return handleResolveLogin(data, context);
});
/**
 * === AMÉLIORATION AJOUTÉE : liaison sécurisée de compte utilisateur post-connexion ===
 * Si un utilisateur authentifié n'a pas encore de document accounts/{uid} (ex. compte pré-créé
 * avec un identifiant de démonstration ou créé par email d'entreprise), cette fonction callable
 * associe son compte de manière sécurisée côté serveur sans exiger une lecture publique de `accounts`.
 */
exports.ensureUserAccount = functions.https.onCall(async (data, context) => {
    const auth = context.auth;
    if (!auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = auth.uid;
    const authEmail = (auth.token.email || '').toLowerCase().trim();
    const explicitId = (data?.identifier || '').toLowerCase().trim();
    // 1. Vérifie si accounts/{uid} existe déjà
    const userDocSnap = await db.collection('accounts').doc(uid).get();
    if (userDocSnap.exists) {
        return { success: true, linked: false, profile: userDocSnap.data()?.profile };
    }
    // 2. Recherche un compte correspondant par authEmail, email ou username
    const snap = await db.collection('accounts').get();
    let matchedData = null;
    for (const doc of snap.docs) {
        if (doc.id === uid)
            continue;
        const d = doc.data();
        const dEmail = (d.email || '').toLowerCase().trim();
        const dAuthEmail = (d.authEmail || '').toLowerCase().trim();
        const dUsername = (d.username || '').toLowerCase().trim();
        if ((authEmail && (dEmail === authEmail || dAuthEmail === authEmail)) ||
            (authEmail.includes('@') && dUsername && (authEmail.startsWith(dUsername + '@') ||
                authEmail.split('@')[0].split('_')[0] === dUsername)) ||
            (explicitId && (dEmail === explicitId || dAuthEmail === explicitId || dUsername === explicitId))) {
            matchedData = d;
            break;
        }
    }
    if (matchedData) {
        // Nettoie tout mot de passe en clair legacy
        const { password, tempPassword, passwordHash, passwordSalt, ...safeAccount } = matchedData;
        const accountToSave = {
            ...safeAccount,
            id: uid,
            uid,
            authEmail: authEmail || matchedData.authEmail || matchedData.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('accounts').doc(uid).set(accountToSave, { merge: true });
        return { success: true, linked: true, profile: accountToSave.profile };
    }
    // 3. Repli : vérifie si un document users/{uid} existe
    const fallbackUserSnap = await db.collection('users').doc(uid).get();
    if (fallbackUserSnap.exists) {
        const uData = fallbackUserSnap.data() || {};
        const accountToSave = {
            ...uData,
            id: uid,
            uid,
            authEmail,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        await db.collection('accounts').doc(uid).set(accountToSave, { merge: true });
        return { success: true, linked: true, profile: accountToSave.profile };
    }
    return { success: false, linked: false };
});
//# sourceMappingURL=index.js.map