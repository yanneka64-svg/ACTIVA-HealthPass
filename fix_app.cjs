const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf-8');

// Replace reloadData and useEffect
const oldReloadData = `  // Load all initial data from FirestoreService
  const reloadData = () => {
    setMembers(FirestoreService.getMembers());
    setOrganizations(FirestoreService.getOrganizations());
    setProviders(FirestoreService.getProviders());
    setClaims(FirestoreService.getClaims());
    setInvoices(FirestoreService.getInvoices());
    setEnrollments(FirestoreService.getEnrollments());
    setCeilings(FirestoreService.getCeilings());
    setLogs(FirestoreService.getLogs());
  };

  useEffect(() => {
    localStorage.setItem('activa_lang', 'en');
    reloadData();
  }, []);`;

const newReloadData = `  useEffect(() => {
    localStorage.setItem('activa_lang', 'en');
    
    // Set up Firestore listeners
    const unsubMembers = FirestoreService.subscribeToMembers(setMembers);
    const unsubOrgs = FirestoreService.subscribeToOrganizations(setOrganizations);
    const unsubProviders = FirestoreService.subscribeToProviders(setProviders);
    const unsubClaims = FirestoreService.subscribeToClaims(setClaims);
    const unsubInvoices = FirestoreService.subscribeToInvoices(setInvoices);
    const unsubEnrollments = FirestoreService.subscribeToEnrollments(setEnrollments);
    const unsubCeilings = FirestoreService.subscribeToCeilings(setCeilings);
    const unsubLogs = FirestoreService.subscribeToLogs(setLogs);

    return () => {
      unsubMembers();
      unsubOrgs();
      unsubProviders();
      unsubClaims();
      unsubInvoices();
      unsubEnrollments();
      unsubCeilings();
      unsubLogs();
    };
  }, []);`;

code = code.replace(oldReloadData, newReloadData);

// Remove all occurrences of `setClaims(FirestoreService.getClaims());` and similar
const patternsToRemove = [
  /setClaims\(FirestoreService\.getClaims\(\)\);/g,
  /setEnrollments\(FirestoreService\.getEnrollments\(\)\);/g,
  /setMembers\(FirestoreService\.getMembers\(\)\);/g,
  /setOrganizations\(FirestoreService\.getOrganizations\(\)\);/g,
  /setProviders\(FirestoreService\.getProviders\(\)\);/g,
  /setCeilings\(FirestoreService\.getCeilings\(\)\);/g,
  /FirestoreService\.resetToDemo\(\);/g,
  /FirestoreService\.resetToBlank\(\);/g,
  /reloadData\(\);/g
];

patternsToRemove.forEach(pattern => {
  code = code.replace(pattern, '');
});

// Also fix imports like `import { FirestoreService } from './services/firestore';`
// and remove `import { StorageService } from './services/storage';` (already renamed but let's check)

fs.writeFileSync('src/App.tsx', code);
