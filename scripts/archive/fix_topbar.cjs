const fs = require('fs');
let code = fs.readFileSync('src/components/Topbar.tsx', 'utf-8');

code = code.replace(
  'interface TopbarProps {\n',
  'interface TopbarProps {\n  currentUser?: any;\n  userRole?: string;\n'
);

code = code.replace(
  'export const Topbar: React.FC<TopbarProps> = ({',
  'export const Topbar: React.FC<TopbarProps> = ({\n  currentUser,\n  userRole,'
);

code = code.replace(
  '<div className="text-xs font-bold text-slate-800 leading-tight">\n                Primary Admin\n              </div>\n              <div className="text-[10px] text-slate-400">Super Admin</div>',
  '<div className="text-xs font-bold text-slate-800 leading-tight">\n                {currentUser?.email?.split("@")[0] || "Primary Admin"}\n              </div>\n              <div className="text-[10px] text-slate-400">{userRole || "Super Admin"}</div>'
);

code = code.replace(
  '<p className="text-xs font-bold text-slate-900">\n                  System Administrator\n                </p>\n                <p className="text-[11px] text-slate-500 truncate">admin@activa-assurance.com</p>',
  '<p className="text-xs font-bold text-slate-900">\n                  {userRole || "System Administrator"}\n                </p>\n                <p className="text-[11px] text-slate-500 truncate">{currentUser?.email || "admin@activa-assurance.com"}</p>'
);

code = code.replace(
  '<span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-[#0d3f8f] text-[10px] font-extrabold">\n                  Admin Master\n                </span>',
  '<span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-[#0d3f8f] text-[10px] font-extrabold">\n                  {userRole || "Admin Master"}\n                </span>'
);

fs.writeFileSync('src/components/Topbar.tsx', code);
