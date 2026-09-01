const fs = require('fs');

let code = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');

code = code.replace(/import \{ storage \} from '\.\.\/\.\.\/services\/storage';/, "import { FirestoreService } from '../../services/firestore';\nimport { createUserWithEmailAndPassword, updatePassword } from 'firebase/auth';\nimport { auth, secondaryAuth, db } from '../../lib/firebase';");

const oldAccountsState = `const [accounts, setAccounts] = useState<UserAccount[]>(() => storage.getAccounts());`;
const newAccountsState = `const [accounts, setAccounts] = useState<UserAccount[]>([]);
  React.useEffect(() => {
    const unsub = FirestoreService.subscribeToAccounts(setAccounts);
    return () => unsub();
  }, []);`;
code = code.replace(oldAccountsState, newAccountsState);

// Fix handleCreate
const oldHandleCreate = `    const { account: created, accounts: updated } = storage.addAccount({
      email: data.email,
      password: pwdToSave, // local mock storage might still need it for displaying the generated one briefly
      firstName: data.firstName,
      lastName: data.lastName,
      profile: data.profile,
      language: data.language,
      isTemporaryPassword: true
    });`;

const newHandleCreate = `    // Create user in secondary auth so it doesn't log out current user
    let newUserId = '';
    try {
       const cred = await createUserWithEmailAndPassword(secondaryAuth, data.email, pwdToSave);
       newUserId = cred.user.uid;
    } catch(e) {
       alert('Auth error: ' + e.message);
       return;
    }

    const created = {
      id: newUserId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      profile: data.profile,
      language: data.language,
      isTemporaryPassword: true,
      lastLogin: null,
      status: 'active'
    };
    await FirestoreService.addAccount(created);
    const updated = accounts;`;
code = code.replace(oldHandleCreate, newHandleCreate);

// Fix setAccounts(updated) for create
code = code.replace(/setAccounts\(updated\);/g, "// setAccounts(updated);"); // Firestore listener will handle this

// Fix handleDelete
const oldHandleDelete = `const updated = storage.deleteAccount(id);`;
const newHandleDelete = `await FirestoreService.deleteAccount(id); const updated = accounts;`;
code = code.replace(oldHandleDelete, newHandleDelete);

// Fix handleResetPassword
const oldReset = `const { newPassword, accounts: updated } = storage.resetAccountPassword(acc.id, newPwd);`;
const newReset = `const newPassword = newPwd; await FirestoreService.updateAccount({ id: acc.id, isTemporaryPassword: true }); const updated = accounts;`;
code = code.replace(oldReset, newReset);

// Fix handleUpdate
const oldUpdate = `const updatedList = storage.updateAccount(updatedAcc);`;
const newUpdate = `await FirestoreService.updateAccount(updatedAcc); const updatedList = accounts;`;
code = code.replace(oldUpdate, newUpdate);
code = code.replace(/const current = storage\.getAccounts\(\);/g, "const current = accounts;");
code = code.replace(/storage\.saveAccounts\(updated\);/g, "");

fs.writeFileSync('src/views/settings/AccountsView.tsx', code);
