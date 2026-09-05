const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf-8');

const oldEffect = `  useEffect(() => {
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

const newEffect = `  useEffect(() => {
    localStorage.setItem('activa_lang', 'en');
    
    if (isAuthenticated) {
      // Set up Firestore listeners
      const unsubMembers = FirestoreService.subscribeToMembers(setMembers);
      const unsubOrgs = FirestoreService.subscribeToOrganizations(setOrganizations);
      const unsubProviders = FirestoreService.subscribeToProviders(setProviders);
      const unsubClaims = FirestoreService.subscribeToClaims(setClaims);
      const unsubInvoices = FirestoreService.subscribeToInvoices(setInvoices);
      const unsubEnrollments = FirestoreService.subscribeToEnrollments(setEnrollments);
      const unsubCeilings = FirestoreService.subscribeToCeilings(setCeilings);
      
      let unsubLogs: (() => void) | undefined;
      if (userRole === 'Admin') {
        unsubLogs = FirestoreService.subscribeToLogs(setLogs);
      }

      return () => {
        unsubMembers();
        unsubOrgs();
        unsubProviders();
        unsubClaims();
        unsubInvoices();
        unsubEnrollments();
        unsubCeilings();
        if (unsubLogs) unsubLogs();
      };
    }
  }, [isAuthenticated, userRole]);`;

appCode = appCode.replace(oldEffect, newEffect);
fs.writeFileSync('src/App.tsx', appCode);
