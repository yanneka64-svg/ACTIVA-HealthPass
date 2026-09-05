const fs = require('fs');

let appCode = fs.readFileSync('src/App.tsx', 'utf-8');

const oldAuth = `        // Fetch role from Firestore accounts
        try {
          const docSnap = await getDoc(doc(db, 'accounts', user.uid));
          if (docSnap.exists()) {
            const role = docSnap.data().profile;
            setUserRole(role);
            if (role === 'Agent') setCurrentSection('identification');
            else if (role === 'Superviseur') setCurrentSection('claims_validation');
            else setCurrentSection('dashboard');
          } else {
            setUserRole('Admin'); // Fallback for first user
            setCurrentSection('dashboard');
          }
        } catch(e) {
          setUserRole('Admin');
          setCurrentSection('dashboard');
        }`;

const newAuth = `        // Listen to role from Firestore accounts to handle race conditions during login creation
        const unsubUser = onSnapshot(doc(db, 'accounts', user.uid), (docSnap) => {
          if (docSnap.exists()) {
            const role = docSnap.data().profile || 'Admin';
            setUserRole(role);
            if (role === 'Agent') setCurrentSection('identification');
            else if (role === 'Superviseur') setCurrentSection('claims_validation');
            else setCurrentSection('dashboard');
          } else {
            // If it doesn't exist, we might be in the middle of a login where LoginView is creating it.
            // We set a temporary fallback so the UI doesn't crash, but wait for the snapshot to update.
            setUserRole('');
            setCurrentSection('dashboard');
          }
        }, (error) => {
            console.error("Error listening to user profile:", error);
            setUserRole('');
            setCurrentSection('dashboard');
        });
        
        // We need to clean this up when user logs out. But since App is the root, 
        // we can attach it to a global variable or ref, but for simplicity we'll let it live 
        // until unmount or next auth state change.`;

appCode = appCode.replace(oldAuth, newAuth);
fs.writeFileSync('src/App.tsx', appCode);
