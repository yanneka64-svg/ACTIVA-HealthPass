const fs = require('fs');

// 1. Fix App.tsx onSnapshot import
let appCode = fs.readFileSync('src/App.tsx', 'utf-8');
if (!appCode.includes('import { doc, getDoc, onSnapshot }')) {
    if (appCode.includes("import { doc, getDoc } from 'firebase/firestore';")) {
        appCode = appCode.replace("import { doc, getDoc } from 'firebase/firestore';", "import { doc, getDoc, onSnapshot } from 'firebase/firestore';");
    } else {
        appCode = "import { doc, getDoc, onSnapshot } from 'firebase/firestore';\n" + appCode;
    }
}
fs.writeFileSync('src/App.tsx', appCode);

// 2. Fix AccountsView.tsx duplicate imports and remaining storage usages
let accCode = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');
accCode = accCode.replace(/import \{ createUserWithEmailAndPassword, updatePassword \} from 'firebase\/auth';\nimport \{ auth, secondaryAuth, db \} from '\.\.\/\.\.\/lib\/firebase';\nimport \{ secondaryAuth, db \} from '\.\.\/\.\.\/lib\/firebase';\nimport \{ createUserWithEmailAndPassword \} from 'firebase\/auth';/g, "import { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';");

accCode = accCode.replace(/import \{ FirestoreService \} from '\.\.\/\.\.\/services\/firestore';\nimport \{ createUserWithEmailAndPassword, updatePassword \} from 'firebase\/auth';\nimport \{ auth, secondaryAuth, db \} from '\.\.\/\.\.\/lib\/firebase';\nimport \{ secondaryAuth, db \} from '\.\.\/\.\.\/lib\/firebase';\nimport \{ createUserWithEmailAndPassword \} from 'firebase\/auth';/g, "import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';");

// Clean all duplicate imports
const accLines = accCode.split('\n');
const seenImports = new Set();
const cleanLines = [];
accLines.forEach(line => {
    if (line.startsWith('import ')) {
        if (!seenImports.has(line)) {
            seenImports.add(line);
            cleanLines.push(line);
        }
    } else {
        cleanLines.push(line);
    }
});
accCode = cleanLines.join('\n');

accCode = accCode.replace(/storage\./g, "FirestoreService.");
fs.writeFileSync('src/views/settings/AccountsView.tsx', accCode);
