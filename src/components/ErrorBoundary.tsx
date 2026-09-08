import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// === AMÉLIORATION AJOUTÉE : sécurité/robustesse (retour utilisateur — l'application se
// retrouvait entièrement blanche à certains moments). Cause identifiée : aucun composant
// ErrorBoundary React n'existait nulle part dans l'application — une erreur non interceptée
// levée pendant le rendu de N'IMPORTE QUEL composant (React démonte alors l'intégralité de
// l'arbre par défaut) laissait la page complètement vide, sans aucun message, sans moyen de
// s'en sortir autrement qu'en rechargeant manuellement. Ce composant intercepte désormais ces
// erreurs au niveau racine (voir main.tsx) et affiche un écran de récupération au lieu d'un
// écran vide. N'intercepte pas les rejets de promesse non gérés (comportement React normal),
// voir le correctif séparé sur FirestoreService.addLog pour cette classe d'erreurs.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  // === AMÉLIORATION AJOUTÉE : ce projet n'a aucune déclaration de type pour `react` installée
  // (ni node_modules/react/*.d.ts, ni @types/react) — React.Component ne résout donc `state`/
  // `props` pour aucune sous-classe. `declare props` + un champ `state` typé explicitement
  // contournent ce problème sans rien changer côté exécution (React initialise `this.props`
  // lui-même via le constructeur implicite hérité). ===
  declare props: Readonly<ErrorBoundaryProps>;
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F8FAFC] p-6">
          <div className="max-w-sm w-full bg-white rounded-2xl border border-[#E8EDF2] shadow-lg p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center mx-auto text-amber-600">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h1 className="mt-5 text-lg font-black text-[#0D2B63]">Something went wrong</h1>
            <p className="mt-2 text-sm text-[#5B7091] leading-relaxed">
              An unexpected error occurred. Reloading the page usually fixes this.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 w-full py-2.5 px-4 rounded-xl bg-[#0A347B] hover:bg-[#072659] text-white text-sm font-bold shadow-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload the page</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
