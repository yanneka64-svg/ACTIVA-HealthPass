const fs = require('fs');
let content = fs.readFileSync('src/views/ClaimsView.tsx', 'utf-8');

// 1. Add userRole to interface
content = content.replace(
  /interface ClaimsViewProps \{/,
  `interface ClaimsViewProps {\n  userRole?: string;`
);

content = content.replace(
  /export const ClaimsView: React\.FC<ClaimsViewProps> = \(\{/,
  `export const ClaimsView: React.FC<ClaimsViewProps> = ({ userRole = 'Admin',`
);

// 2. Hide approve/reject buttons for agents.
const buttonsToReplace = `<div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClaimForAttachment(claim);
                            setAttachmentModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0d3f8f] border border-blue-200 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                          title={
                            lang === 'fr'
                              ? 'Consulter le dossier médical & valider'
                              : 'View medical file & validate'
                          }
                        >
                          <Scan className="w-3.5 h-3.5 text-[#0d3f8f]" />
                          <span>{lang === 'fr' ? 'Vérifier' : 'Verify'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onApprove(claim.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{t.approve}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openRejectModal(claim)}
                          className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5 text-rose-600" />
                          <span>{t.reject}</span>
                        </button>
                      </div>`;

const newButtons = `<div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClaimForAttachment(claim);
                            setAttachmentModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#0d3f8f] border border-blue-200 text-xs font-bold transition flex items-center gap-1 shadow-2xs"
                        >
                          <Scan className="w-3.5 h-3.5 text-[#0d3f8f]" />
                          <span>{lang === 'fr' ? 'Vérifier' : 'Verify'}</span>
                        </button>
                        {userRole !== 'Agent' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onApprove(claim.id)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{t.approve}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openRejectModal(claim)}
                              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1"
                            >
                              <X className="w-3.5 h-3.5 text-rose-600" />
                              <span>{t.reject}</span>
                            </button>
                          </>
                        )}
                      </div>`;
                      
content = content.replace(buttonsToReplace, newButtons);

// 3. New Claim Form State updates
const oldState = `const [newClaimForm, setNewClaimForm] = useState<Partial<Claim>>({
    memberCardNo: '',
    memberName: '',
    organization: '',
    provider: '',
    amount: '',
    careType: 'Consultation & Soins Spécialisés',
    serviceDate: new Date().toISOString().split('T')[0],
  });`;

const newState = `const [newClaimForm, setNewClaimForm] = useState<Partial<Claim>>({
    memberCardNo: '',
    memberName: '',
    organization: '',
    provider: '',
    amount: 0,
    careType: 'Consultation & Soins Spécialisés',
    serviceDate: new Date().toISOString().split('T')[0],
    currency: 'USD',
    doctorName: '',
    medicalActs: [{ name: '', amount: 0 }]
  });
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);`;
content = content.replace(oldState, newState);

fs.writeFileSync('src/views/ClaimsView.tsx', content);
