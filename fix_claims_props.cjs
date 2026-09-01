const fs = require('fs');

// 1. Update ClaimsView interface
let code = fs.readFileSync('src/views/ClaimsView.tsx', 'utf-8');
code = code.replace(
  'interface ClaimsViewProps {\n  userRole?: string;',
  'interface ClaimsViewProps {\n  currentSection?: string;\n  userRole?: string;'
);
code = code.replace(
  'export const ClaimsView: React.FC<ClaimsViewProps> = ({\n  userRole = \'Admin\',',
  'export const ClaimsView: React.FC<ClaimsViewProps> = ({\n  currentSection,\n  userRole = \'Admin\','
);
fs.writeFileSync('src/views/ClaimsView.tsx', code);

// 2. Pass currentSection from App.tsx
let appCode = fs.readFileSync('src/App.tsx', 'utf-8');
appCode = appCode.replace(/<ClaimsView userRole=\{userRole\}/g, '<ClaimsView currentSection={currentSection} userRole={userRole}');
fs.writeFileSync('src/App.tsx', appCode);
