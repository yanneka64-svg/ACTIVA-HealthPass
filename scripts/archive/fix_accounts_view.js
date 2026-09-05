const fs = require('fs');
let content = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf-8');

// The HTML for the password column is here. We can just regex replace the whole td
content = content.replace(
  /<td className="py-3\.5 px-4">\s*<div className="flex items-center gap-2 bg-slate-100\/90.*?<\/td>/s,
  ''
);

// Oh wait, there are multiple rows? It's inside a .map()
content = content.replace(
  /<td className="py-3\.5 px-4">\s*<div className="flex items-center gap-2 bg-slate-100\/90[\s\S]*?<\/td>/g,
  ''
);

fs.writeFileSync('src/views/settings/AccountsView.tsx', content);
