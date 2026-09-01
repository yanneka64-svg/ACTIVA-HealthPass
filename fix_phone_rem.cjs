const fs = require('fs');
let code = fs.readFileSync('src/views/settings/AccountsView.tsx', 'utf8');

const phoneHtml1 = `<div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.phoneCountryCode}
                    onChange={(e) => setFormData({ ...formData, phoneCountryCode: e.target.value })}
                    className="w-28 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="+231">🇱🇷 +231 (Liberia)</option>
                    <option value="+237">🇨🇲 +237 (Cameroun)</option>
                    <option value="+225">🇨🇮 +225 (CI)</option>
                    <option value="+221">🇸🇳 +221 (Sénégal)</option>
                    <option value="+33">🇫🇷 +33 (France)</option>
                  </select>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0d3f8f]"
                  />
                </div>
              </div>`;

const phoneHtml2 = `{/* Phone with Prefix */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.phoneCountryCode}
                    onChange={(e) => setFormData({ ...formData, phoneCountryCode: e.target.value })}
                    className="w-28 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                  >
                    <option value="+231">🇱🇷 +231 (Liberia)</option>
                    <option value="+237">🇨🇲 +237 (Cameroun)</option>
                    <option value="+225">🇨🇮 +225 (CI)</option>
                    <option value="+221">🇸🇳 +221 (Sénégal)</option>
                    <option value="+33">🇫🇷 +33 (France)</option>
                  </select>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="ex: 888 222 333"
                    className="flex-1 pl-3 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0d3f8f] focus:bg-white"
                  />
                </div>
              </div>`;

code = code.replace(phoneHtml1, '');
code = code.replace(phoneHtml2, '');

fs.writeFileSync('src/views/settings/AccountsView.tsx', code);
console.log('Removed phone inputs');
