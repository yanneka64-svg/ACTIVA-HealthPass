const fs = require('fs');

let code = fs.readFileSync('src/views/ClaimsView.tsx', 'utf-8');

const oldExports = `          {/* Export CSV */}
          <button
            onClick={() => exportClaimsToCSV(filteredClaims, lang)}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">CSV</span>
          </button>

          {/* Export Excel */}
          <button
            onClick={() => exportClaimsToExcel(filteredClaims, lang)}
            className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
            title="Export Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#00A859]" />
            <span className="hidden sm:inline">Excel</span>
          </button>`;

const newExports = `          {/* Export Options */}
          {currentSection !== 'claims_validation' && (
            currentSection === 'validated_history' ? (
              <div className="relative group">
                <button className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs">
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Export</span>
                </button>
                <div className="absolute right-0 mt-2 w-32 bg-white rounded-xl shadow-xl border border-slate-200 py-1 hidden group-hover:block z-10">
                  <button
                    onClick={() => exportClaimsToCSV(filteredClaims, lang)}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Export CSV
                  </button>
                  <button
                    onClick={() => exportClaimsToExcel(filteredClaims, lang)}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    Export Excel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => exportClaimsToCSV(filteredClaims, lang)}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                  title="Export CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">CSV</span>
                </button>
                <button
                  onClick={() => exportClaimsToExcel(filteredClaims, lang)}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-[#00A859] border border-emerald-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                  title="Export Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-[#00A859]" />
                  <span className="hidden sm:inline">Excel</span>
                </button>
              </>
            )
          )}`;

code = code.replace(oldExports, newExports);

fs.writeFileSync('src/views/ClaimsView.tsx', code);
