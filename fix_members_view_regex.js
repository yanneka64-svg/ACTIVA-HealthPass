const fs = require('fs');

// We have the broken file.
let content = fs.readFileSync('src/views/settings/MembersView_broken.tsx', 'utf-8');

// The replacement was:
// /\{memberModalOpen && \(/
// We can just revert the whole thing by finding the first part and the second part.
// The file before the modal starts at `      </div>\n\n      {/* Members Table */}`
// The end of the file is the normal file.

// Actually, let's just restore the file from the last successful state... which we don't have.
// Let's just fix it manually using split and join.

const parts = content.split('<td className="py-2.5 px-4 text-slate-900 font-bold">{c.currency === \'LRD\' ? \'L');

if (parts.length === 2) {
  const secondPart = parts[1];
  
  // Find where the rest of the modal starts in the original code.
  // The original string had {memberModalOpen && (
  // We want to just find the FIRST `{memberModalOpen && (` in the secondPart and take everything from there.
  
  const idx = secondPart.indexOf('{memberModalOpen && (');
  if (idx !== -1) {
    const cleanSecondPart = secondPart.substring(idx);
    const newContent = parts[0] + '{memberModalOpen && (' + cleanSecondPart;
    // But wait, the viewModalJSX is now lost!
    // That's fine, we will re-apply it properly.
    fs.writeFileSync('src/views/settings/MembersView.tsx', newContent);
    console.log("Restored base file");
  } else {
    console.log("Could not find memberModalOpen");
  }
} else {
  console.log("Parts length: " + parts.length);
}
