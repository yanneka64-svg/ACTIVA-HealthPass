const fs = require('fs');
let code = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');

const oldCreate = `    const { account: created, accounts: updated } = FirestoreService.addAccount({
      id: uid,
      email: formData.email,
      fullName: formData.fullName,
      position: formData.position,
      username: username,
      isTemporaryPassword: true,
      phone: formData.phone,
      phoneCountryCode: formData.phoneCountryCode,
      profile: formData.profile,
      permissions: getPermissionsForProfile(formData.profile),
      password: pwdToSave, // local mock storage might still need it for displaying the generated one briefly
    });`;

const newCreate = `    const created = {
      id: uid,
      email: formData.email,
      fullName: formData.fullName,
      position: formData.position,
      username: username,
      isTemporaryPassword: true,
      phone: formData.phone,
      phoneCountryCode: formData.phoneCountryCode,
      profile: formData.profile,
      permissions: getPermissionsForProfile(formData.profile),
      password: pwdToSave,
    };
    await FirestoreService.addAccount(created);`;

code = code.replace(oldCreate, newCreate);

fs.writeFileSync('src/views/settings/AccountsView.tsx', code);
