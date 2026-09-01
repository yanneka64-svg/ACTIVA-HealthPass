const fs = require('fs');
let content = fs.readFileSync('src/views/settings/MembersView_broken.tsx', 'utf-8');

// I replaced \` with \` but in regex that might have broken.
// 'Alerte Fréquence : Cet assuré a visité l\\'hôpital plus de 3 fois en 7 jours ou plus de 4 fois ce mois-ci.'
content = content.replace(/l\\'hôpital/g, "l'hôpital");

// The replacement of {memberModalOpen && ( might have resulted in double '{memberModalOpen && (' which could be fine but the syntax might be broken if there were unescaped quotes.

fs.writeFileSync('src/views/settings/MembersView.tsx', content);
