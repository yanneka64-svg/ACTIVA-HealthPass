const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf-8');

const imports = `import { auth, db } from './lib/firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
`;
content = imports + content;

content = content.replace(
  `const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('activa_auth_session') === 'true';
  });`,
  `const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>(''); // 'Admin', 'Superviseur', 'Agent'

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        setCurrentUser(user);
        // Fetch role from Firestore accounts
        const docSnap = await getDoc(doc(db, 'accounts', user.uid));
        if (docSnap.exists()) {
          setUserRole(docSnap.data().profile);
        } else {
          setUserRole('Admin'); // Fallback for first user
        }
      } else {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setUserRole('');
      }
    });
    return () => unsubscribe();
  }, []);`
);

content = content.replace(
  /const handleLoginSuccess = \(\) => \{[\s\S]*?\}\;/g,
  `const handleLoginSuccess = (user: any) => {
    // onAuthStateChanged will handle the state update
    StorageService.addLog({
      userEmail: user?.email || 'admin@activa-assurance.com',
      ipAddress: 'Unknown',
      status: 'success',
      userAgent: navigator.userAgent,
      location: 'Unknown',
    });
  };`
);

content = content.replace(
  /const handleLogout = \(\) => \{[\s\S]*?\}\;/g,
  `const handleLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('activa_auth_session');
    setCurrentSection('dashboard');
  };`
);

fs.writeFileSync('src/App.tsx', content);
