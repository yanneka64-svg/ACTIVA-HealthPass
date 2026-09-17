// === AMÉLIORATION AJOUTÉE : composant UI générique — voir FRONTEND_CRITICAL_ANALYSIS.md §3
// ("Aucun composant UI générique réutilisable... `src/components/` ne contient que des
// modales/widgets spécifiques"). Ce fichier est le premier composant de
// `src/components/ui/` : une liste filtrable générique (recherche + rendu d'item personnalisé
// via `renderItem`), extraite du motif "recherche + liste" déjà réimplémenté indépendamment
// dans `AgentIdentificationView.tsx` et `AgentClaimsView.tsx` (constaté pendant la Phase 2 du
// module ACTIVA Health Claims) et utilisé ici par `ClaimCaseWizard.tsx`.
//
// Décision délibérée : ce composant N'EST PAS rétro-appliqué à `AgentIdentificationView.tsx`
// ni `AgentClaimsView.tsx` dans cette passe. Ces deux écrans sont en production, utilisés
// quotidiennement, et leurs types de données diffèrent significativement (`InsuredBeneficiary`
// avec principal/dépendants/biométrie pour l'un, `Member` simple pour l'autre) — les forcer
// dans la même forme aujourd'hui risquerait de changer un comportement déjà éprouvé sans gain
// immédiat. Ce composant reste disponible pour une adoption progressive de ces écrans plus
// tard, une fois chacun testé individuellement (voir §11 du rapport, "structurant, à
// planifier").
import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

export interface SearchableListProps<T> {
  items: T[];
  /** Returns the searchable text for one item (concatenation of the fields to match against). */
  getSearchableText: (item: T) => string;
  /** Unique key for React reconciliation and for detecting the selected item. */
  getKey: (item: T) => string;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  onSelect: (item: T) => void;
  selectedKey?: string | null;
  placeholder?: string;
  emptyMessage?: string;
  /** Maximum items shown at once (default 8) — mirrors the previous inline behavior in
   * ClaimCaseWizard, kept as a prop so callers can tune it instead of it being implicit. */
  maxResults?: number;
  className?: string;
}

export function SearchableList<T>({
  items,
  getSearchableText,
  getKey,
  renderItem,
  onSelect,
  selectedKey,
  placeholder,
  emptyMessage,
  maxResults = 8,
  className,
}: SearchableListProps<T>) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, maxResults);
    return items.filter((item) => getSearchableText(item).toLowerCase().includes(q)).slice(0, maxResults);
  }, [items, query, maxResults, getSearchableText]);

  return (
    <div className={className}>
      <div className="relative mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A347B]/30"
        />
      </div>

      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {filtered.length === 0 && emptyMessage && (
          <p className="text-xs text-slate-400 text-center py-6">{emptyMessage}</p>
        )}
        {filtered.map((item) => {
          const key = getKey(item);
          return (
            <button key={key} type="button" onClick={() => onSelect(item)} className="w-full text-left">
              {renderItem(item, key === selectedKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
