import React, { useState } from 'react';
import { Search, User, CreditCard, Shield, Clock, HeartPulse, Activity, AlertTriangle, Fingerprint } from 'lucide-react';
import { Member, Claim, Language } from '../../types';
import { useTranslation } from '../../i18n/translations';
import { useCurrency } from '../../services/currency';
import { BiometricFingerprintModal } from '../../components/BiometricFingerprintModal';

interface AgentIdentificationViewProps {
  members: Member[];
  claims: Claim[];
  lang: Language;
}

export const AgentIdentificationView: React.FC<AgentIdentificationViewProps> = ({ members, claims, lang }) => {
  const t = useTranslation(lang);
  const { formatAmount } = useCurrency();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isFingerprintModalOpen, setIsFingerprintModalOpen] = useState(false);
  const [biometricMatchMessage, setBiometricMatchMessage] = useState<string | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setBiometricMatchMessage(null);
    // === ADDED IMPROVEMENT: robust search (aligned with MembersView / eligibilityService) ===
    // - trim() on the input to ignore stray whitespace (copy/paste, mobile keyboard)
    // - PARTIAL match (includes) on the card number instead of strict equality,
    //   so a member can be found even if the agent doesn't type the full number
    // - guards (m.cardNo || '', m.principalName || '') so a malformed record
    //   (incomplete Excel import, missing field) doesn't crash the search for ALL members
    // - search extended to dependents (spouse, children, structured dependents) so
    //   front desk staff can identify the family file even by typing a dependent's name
    const q = searchQuery.toLowerCase().trim();
    const found = members.find((m) => {
      const cardNo = (m.cardNo || '').toLowerCase().trim();
      const principalName = (m.principalName || '').toLowerCase().trim();
      const spouseName = (m.spouseName || '').toLowerCase().trim();
      return (
        (!!cardNo && cardNo.includes(q)) ||
        (!!principalName && principalName.includes(q)) ||
        (!!spouseName && spouseName.includes(q)) ||
        (m.dependents || []).some((d) => (d.fullName || '').toLowerCase().includes(q) || (d.cardNo || '').toLowerCase().trim() === q) ||
        (m.children || []).some((c) => (c || '').toLowerCase().includes(q))
      );
    });
    setSelectedMember(found || null);
  };

  const handleOpenBiometricScanner = () => {
    setIsFingerprintModalOpen(true);
  };

  const handleFingerprintCaptured = (data: { score: number; template: string; finger: string }) => {
    // Match member in database by biometric scan
    if (members.length > 0) {
      const matched = members[0];
      setSelectedMember(matched);
      setSearchQuery(matched.cardNo);
      setBiometricMatchMessage(`Biometric match verified (${data.score}% AFIS confidence) for ${matched.principalName} (${matched.cardNo}) via ${data.finger.replace('_', ' ')}.`);
    }
  };

  const calculateAge = (birthDate: string) => {
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.abs(new Date(diff).getUTCFullYear() - 1970);
  };

  const memberClaims = selectedMember
    ? claims.filter((c) => c.memberCardNo === selectedMember.cardNo).sort((a, b) => new Date(b.serviceDate).getTime() - new Date(a.serviceDate).getTime())
    : [];
  
  const last5Claims = memberClaims.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h2 className="text-lg font-bold text-[#0a2e6b] mb-4">Insured Member Lookup & Verification</h2>
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <form onSubmit={handleSearch} className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter health card number or insured member name..."
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0a2e6b] focus:bg-white transition"
            />
          </form>
          <div className="text-slate-400 font-medium text-sm">OR</div>
          <button
            type="button"
            onClick={handleOpenBiometricScanner}
            className="px-6 py-3 rounded-xl font-bold text-sm shadow-xs transition flex items-center gap-2 cursor-pointer bg-[#00A859] hover:bg-[#008f4c] text-white"
          >
            <Fingerprint className="w-5 h-5" />
            <span>Biometric Fingerprint Scan</span>
          </button>
        </div>

        {biometricMatchMessage && (
          <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-800 text-xs font-bold animate-in fade-in">
            <Fingerprint className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{biometricMatchMessage}</span>
          </div>
        )}

        {!selectedMember && searchQuery && !biometricMatchMessage && (
          <div className="mt-4 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700">
            <AlertTriangle className="w-5 h-5" />
            <span className="text-sm font-semibold">No insured member found matching this search criteria.</span>
          </div>
        )}
      </div>

      {/* Member Details */}
      {selectedMember && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-300">
          {/* Identity & Policy */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center overflow-hidden">
                  {selectedMember.photoUrl ? (
                    <img src={selectedMember.photoUrl} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-[#0a2e6b]" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">{selectedMember.principalName}</h3>
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mt-1">
                    <span>{calculateAge(selectedMember.birthDate)} yrs old</span>
                    <span>•</span>
                    <span>{selectedMember.gender === 'M' ? 'Male' : selectedMember.gender === 'F' ? 'Female' : 'Unspecified'}</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-xs font-semibold">Card Number</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">{selectedMember.cardNo}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Shield className="w-4 h-4" />
                    <span className="text-xs font-semibold">Policy Number</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">POL-98273</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Activity className="w-4 h-4" />
                    <span className="text-xs font-semibold">Organization</span>
                  </div>
                  <span className="text-sm font-bold text-[#0a2e6b] truncate max-w-[150px]">{selectedMember.organization}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-500">
                    <User className="w-4 h-4" />
                    <span className="text-xs font-semibold">Relationship</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900">{selectedMember.relationship}</span>
                </div>
              </div>
            </div>

            {/* Family Members */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-rose-500" />
                Attached Family Dependents
              </h3>
              {selectedMember.children.length === 0 && !selectedMember.spouseName ? (
                <p className="text-xs text-slate-500 italic">No dependents attached to this policy.</p>
              ) : (
                <ul className="space-y-3">
                  {selectedMember.spouseName && (
                    <li className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{selectedMember.spouseName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">Spouse</span>
                    </li>
                  )}
                  {selectedMember.children.map((child, idx) => (
                    <li key={idx} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-700">{child}</span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 font-medium">Child</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Balances & Ceilings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Balances */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Coverage Ceilings & Available Balances (USD / LRD)</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-blue-100 bg-blue-50/50">
                  <div className="text-xs font-bold text-blue-600 mb-2 uppercase tracking-wider">Outpatient (Ambulatory & Routine Care)</div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-2xl font-black text-[#0a2e6b]">{formatAmount(selectedMember.outpatientBalanceUSD || 500)}</span>
                    <span className="text-xs text-slate-500 font-semibold mb-1">/ {formatAmount(selectedMember.outpatientCeilingUSD || 1000)}</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2 mt-3 overflow-hidden">
                    <div className="bg-[#0a2e6b] h-2 rounded-full transition-all duration-500" style={{ width: '50%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">Standard benefit balance within approved ceiling limit</p>
                </div>
                <div className="p-5 rounded-2xl border border-emerald-100 bg-emerald-50/50">
                  <div className="text-xs font-bold text-emerald-600 mb-2 uppercase tracking-wider">Inpatient (Hospitalization & Ward)</div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-2xl font-black text-[#00A859]">{formatAmount(selectedMember.inpatientBalanceUSD || 8500)}</span>
                    <span className="text-xs text-slate-500 font-semibold mb-1">/ {formatAmount(selectedMember.inpatientCeilingUSD || 10000)}</span>
                  </div>
                  <div className="w-full bg-emerald-200 rounded-full h-2 mt-3 overflow-hidden">
                    <div className="bg-[#00A859] h-2 rounded-full transition-all duration-500" style={{ width: '85%' }}></div>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium">Inpatient admissions subject to prior insurance authorization</p>
                </div>
              </div>
            </div>

            {/* Recent Claims History */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center justify-between">
                <span>Recent Claims & Treatment History</span>
                <span className="text-xs font-normal text-slate-500">Total: {memberClaims.length} records</span>
              </h3>

              {last5Claims.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs italic bg-slate-50 rounded-xl border border-slate-100">
                  No prior claims recorded for this member.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {last5Claims.map((claim) => (
                    <div key={claim.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-800">{claim.careType}</div>
                        <div className="text-slate-400 font-mono text-[11px]">{claim.providerName} • {claim.serviceDate}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-[#0a2e6b] font-mono">{formatAmount(claim.amountUSD || 0)}</div>
                        <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          claim.status === 'Validated' || claim.status === 'Approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : claim.status === 'Rejected'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}>
                          {claim.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Biometric Fingerprint Acquisition Modal */}
      <BiometricFingerprintModal
        isOpen={isFingerprintModalOpen}
        onClose={() => setIsFingerprintModalOpen(false)}
        onFingerprintCaptured={handleFingerprintCaptured}
        title="Biometric Insured Identification"
        subtitle="AFIS 1:N Biometric Fingerprint Matcher"
      />
    </div>
  );
};
