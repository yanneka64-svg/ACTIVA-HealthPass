"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEventServer = logAuditEventServer;
async function logAuditEventServer(db, entry) {
    const auditRef = db.collection('auditLogs').doc();
    const logDoc = {
        ...entry,
        id: auditRef.id,
        timestamp: new Date().toISOString(),
        severity: entry.severity || 'INFO',
    };
    await auditRef.set(logDoc);
    return auditRef.id;
}
//# sourceMappingURL=auditService.js.map