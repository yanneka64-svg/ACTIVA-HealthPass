const fs = require('fs');
let content = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');

// Remove table header "Mot de Passe Actuel"
content = content.replace(/<th className="py-3 px-4">Mot de Passe Actuel<\/th>/g, '');

// Remove table cell for password
content = content.replace(/\{.*?Mot de Passe Actuel.*?\}/s, '');

// Remove the column content
content = content.replace(/<td className="py-3\.5 px-4 font-mono text-slate-500">[\s\S]*?<\/td>/g, '');

// Replace any hardcoded French phrases in the UI
content = content.replace(/'Créé le '/g, "'Created '");
content = content.replace(/'Admin'/g, "'Admin'");
content = content.replace(/'Superviseur'/g, "'Supervisor'");
content = content.replace(/'Agent'/g, "'Agent'");

fs.writeFileSync('src/views/settings/AccountsView.tsx', content);
