const fs = require('fs');

let accountsCode = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');
accountsCode = accountsCode.replace(/import \{ storage \} from '\.\.\/\.\.\/services\/storage';/, "import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword } from 'firebase/auth';\nimport { auth, db } from '../../lib/firebase';");
accountsCode = accountsCode.replace(/const \[accounts, setAccounts\] = useState<UserAccount\[\]>\(\(\) => storage\.getAccounts\(\)\);/, "const [accounts, setAccounts] = useState<UserAccount[]>([]);\n  React.useEffect(() => {\n    const unsub = FirestoreService.subscribeToAccounts(setAccounts);\n    return () => unsub();\n  }, []);");

// AddAccount uses Firebase now, so we need to fix it.
// It uses `storage.addAccount` which returns `{ account: created, accounts: updated }` but FirestoreService.addAccount returns Promise<void>.
// Let's replace the whole handleCreate method, it's safer.
