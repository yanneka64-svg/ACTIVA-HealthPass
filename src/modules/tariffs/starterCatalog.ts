// === AMÉLIORATION AJOUTÉE : HealthPass 2.0, Phase 1 — Tariff Engine ===
// Catalogue de départ suggéré pour un nouveau prestataire : un Admin peut le charger en un clic
// dans ProviderTariffsModal, puis ajuster ou retirer chaque ligne — jamais écrit automatiquement
// en base. Tarifs en USD (devise de base de l'application, voir src/services/currency.tsx).
export interface TariffCatalogEntry {
  category: string;
  serviceName: string;
  code: string;
  tariffUsd: number;
  coverageRate: number;
}

export const TARIFF_STARTER_CATALOG: TariffCatalogEntry[] = [
  { category: 'Consultations', serviceName: 'General consultation', code: 'CG-01', tariffUsd: 61.54, coverageRate: 80 },
  { category: 'Consultations', serviceName: 'Specialist consultation', code: 'CS-02', tariffUsd: 112.82, coverageRate: 75 },
  { category: 'Consultations', serviceName: 'Emergency room visit', code: 'ER-03', tariffUsd: 153.85, coverageRate: 70 },
  { category: 'Laboratory', serviceName: 'Standard blood panel', code: 'LB-14', tariffUsd: 135.9, coverageRate: 80 },
  { category: 'Laboratory', serviceName: 'Urinalysis', code: 'LB-15', tariffUsd: 46.15, coverageRate: 80 },
  { category: 'Laboratory', serviceName: 'Malaria rapid test', code: 'LB-21', tariffUsd: 33.33, coverageRate: 90 },
  { category: 'Imaging', serviceName: 'Standard X-ray', code: 'IM-06', tariffUsd: 179.49, coverageRate: 70 },
  { category: 'Imaging', serviceName: 'Abdominal ultrasound', code: 'IM-09', tariffUsd: 246.15, coverageRate: 70 },
  { category: 'Hospitalization', serviceName: 'Hospitalization / day', code: 'HJ-02', tariffUsd: 435.9, coverageRate: 70 },
  { category: 'Hospitalization', serviceName: 'Minor surgery', code: 'HJ-11', tariffUsd: 1076.92, coverageRate: 65 },
  { category: 'Pharmacy', serviceName: 'Generic prescription (per item)', code: 'PH-04', tariffUsd: 16.41, coverageRate: 80 },
  { category: 'Pharmacy', serviceName: 'Branded prescription (per item)', code: 'PH-05', tariffUsd: 50.26, coverageRate: 60 },
  { category: 'Dental & Optical', serviceName: 'Dental cleaning', code: 'DO-08', tariffUsd: 76.92, coverageRate: 60 },
  { category: 'Dental & Optical', serviceName: 'Corrective lenses', code: 'DO-12', tariffUsd: 143.59, coverageRate: 50 },
];
