const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

code = code.replace(
  "if (userRole === 'Agent') {\n      return ['members', 'organizations', 'providers'].includes(item.id);\n    }",
  "if (userRole === 'Agent') {\n      return false;\n    }"
);

code = code.replace(
  "        {/* Section 2: Settings */}\n        <div>\n          <div className=\"px-5 pt-4 pb-2 text-[10px] font-bold tracking-wider text-white/40 uppercase\">\n            {t.nav.settings}\n          </div>\n          <div className=\"space-y-0.5\">{filteredSettingsItems.map(renderNavItem)}</div>\n        </div>",
  "        {/* Section 2: Settings */}\n        {filteredSettingsItems.length > 0 && (\n          <div>\n            <div className=\"px-5 pt-4 pb-2 text-[10px] font-bold tracking-wider text-white/40 uppercase\">\n              {t.nav.settings}\n            </div>\n            <div className=\"space-y-0.5\">{filteredSettingsItems.map(renderNavItem)}</div>\n          </div>\n        )}"
);

fs.writeFileSync('src/components/Sidebar.tsx', code);
