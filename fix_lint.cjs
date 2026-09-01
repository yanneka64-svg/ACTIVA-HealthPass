const fs = require('fs');

// 1. Fix App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf-8');
if (!appCode.includes('import { onSnapshot } from')) {
    appCode = appCode.replace("import { doc, getDoc, onAuthStateChanged, signOut } from 'firebase/auth';", "import { onAuthStateChanged, signOut } from 'firebase/auth';\nimport { doc, getDoc, onSnapshot } from 'firebase/firestore';");
}
appCode = appCode.replace("import { onAuthStateChanged, signOut } from 'firebase/auth';", "import { onAuthStateChanged, signOut } from 'firebase/auth';\nimport { doc, getDoc, onSnapshot } from 'firebase/firestore';");

// Remove importMembers, importOrganizations, importProviders calls
appCode = appCode.replace(/FirestoreService\.importMembers\(imported\);/g, "imported.forEach(i => FirestoreService.addMember(i));");
appCode = appCode.replace(/FirestoreService\.importOrganizations\(imported\);/g, "imported.forEach(i => FirestoreService.addOrganization(i));");
appCode = appCode.replace(/FirestoreService\.importProviders\(imported\);/g, "imported.forEach(i => FirestoreService.addProvider(i));");

fs.writeFileSync('src/App.tsx', appCode);

// 2. Fix AccountsView.tsx
let accCode = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');
// Deduplicate imports
accCode = accCode.replace("import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';\nimport { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword } from 'firebase/auth';\nimport { auth, db } from '../../lib/firebase';", "import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';");
accCode = accCode.replace("import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';", "");
accCode = "import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';\n" + accCode.replace(/import \{ storage \} from '\.\.\/\.\.\/services\/storage';/g, "");

accCode = accCode.replace(/storage\.getLoginLogs\(\)/g, "[]");
accCode = accCode.replace(/const logs = \[\];/g, "const logs: any[] = [];");

fs.writeFileSync('src/views/settings/AccountsView.tsx', accCode);

// 3. Fix MembersView.tsx
let memCode = fs.readFileSync('src/views/settings/MembersView.tsx', 'utf-8');
memCode = memCode.replace(/mClaims/g, "memberClaims");
fs.writeFileSync('src/views/settings/MembersView.tsx', memCode);
