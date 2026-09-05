const fs = require('fs');

let rules = fs.readFileSync('firestore.rules', 'utf8');

rules = rules.replace(
  /function isUserRole\(role\) {\s*return get\(\/databases\/\$\(database\)\/documents\/accounts\/\$\(request\.auth\.uid\)\)\.data\.profile == role;\s*}/,
  `function isUserRole(role) {\n      let accountRef = /databases/$(database)/documents/accounts/$(request.auth.uid);\n      return exists(accountRef) && get(accountRef).data.profile == role;\n    }`
);

rules = rules.replace(
  /allow create: if isSignedIn\(\) && isValidId\(userId\) && isAdmin\(\);/,
  `allow create: if isSignedIn() && isValidId(userId) && (request.auth.uid == userId || isAdmin());`
);

fs.writeFileSync('firestore.rules', rules);
