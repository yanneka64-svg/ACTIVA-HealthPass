const fs = require('fs');

let rules = fs.readFileSync('firestore.rules', 'utf8');

// Replace allow read: if isSignedIn() && isValidId(xxx)...
// We can just replace all "allow read: if isSignedIn() && isValidId([a-zA-Z]+);" with "allow read: if isSignedIn();"

rules = rules.replace(/allow read: if isSignedIn\(\) && isValidId\([a-zA-Z]+\);/g, "allow read: if isSignedIn();");

// For accounts:
// allow read: if isSignedIn() && isValidId(userId) && (request.auth.uid == userId || isAdmin());
// We can change list vs get. But we can also just remove isValidId from read.
rules = rules.replace(/allow read: if isSignedIn\(\) && isValidId\([a-zA-Z]+\) && \(request\.auth\.uid == userId \|\| isAdmin\(\)\);/, "allow read: if isSignedIn() && (request.auth.uid == userId || isAdmin());");

// For loginLogs and auditLogs
rules = rules.replace(/allow read: if isSignedIn\(\) && isValidId\([a-zA-Z]+\) && isAdmin\(\);/g, "allow read: if isSignedIn() && isAdmin();");

fs.writeFileSync('firestore.rules', rules);
