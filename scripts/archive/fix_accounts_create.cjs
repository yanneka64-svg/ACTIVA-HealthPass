const fs = require('fs');

let code = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');

const oldCreate = `    const { account: created, accounts: updated } = FirestoreService.addAccount({
      email: emailLower,
      password: pwdToSave, // local mock storage might still need it for displaying the generated one briefly
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || '',
      profile: formData.profile,
      language: formData.language,
      isTemporaryPassword: true
    });`;

const newCreate = `    const createdData = {
      id: uid,
      email: emailLower,
      firstName: parts[0],
      lastName: parts.slice(1).join(' ') || '',
      profile: formData.profile,
      language: formData.language,
      isTemporaryPassword: true,
      lastLogin: null,
      status: 'active'
    };
    await FirestoreService.addAccount(createdData);
    const created = createdData;`;

code = code.replace(oldCreate, newCreate);
code = code.replace(/const updatedList = FirestoreService\.updateAccount\(updatedAcc\);/g, "await FirestoreService.updateAccount(updatedAcc);");

fs.writeFileSync('src/views/settings/AccountsView.tsx', code);
