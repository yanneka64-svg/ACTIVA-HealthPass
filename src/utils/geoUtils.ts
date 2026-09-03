// === AMÉLIORATION AJOUTÉE : sécurité (audit) — l'application n'a pas de backend (pas de
// Cloud Function), donc le navigateur ne peut pas connaître sa propre adresse IP publique
// par lui-même : `App.tsx`/`LoginView.tsx` stockaient auparavant la chaîne fixe 'Unknown'
// pour CHAQUE connexion, rendant la page Audit & Access Logs incapable de remplir son rôle
// (repérer une connexion depuis un lieu/appareil inhabituel). On interroge ici un service
// public de géolocalisation IP, en HTTPS, sans clé API, DEPUIS LE NAVIGATEUR de la personne
// qui se connecte — c'est donc bien SON adresse IP publique qui est résolue par le service,
// pas celle du serveur applicatif. Échec réseau, bloqueur de trackers ou quota dépassé ->
// repli silencieux sur 'Unknown' (comportement identique à avant), sans jamais bloquer ni
// ralentir perceptiblement la connexion (délai maximum borné ci-dessous).
export interface ClientLocationInfo {
  ipAddress: string;
  location: string;
}

const GEO_LOOKUP_TIMEOUT_MS = 2500;
const UNKNOWN: ClientLocationInfo = { ipAddress: 'Unknown', location: 'Unknown' };

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Primary + fallback provider, both free/keyless/HTTPS, in case one is blocked, rate-limited,
// or temporarily down. Response shapes differ slightly, normalized below.
async function lookupViaIpwhoIs(): Promise<ClientLocationInfo | null> {
  const res = await fetchWithTimeout('https://ipwho.is/', GEO_LOOKUP_TIMEOUT_MS);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.success === false || !data.ip) return null;
  const location = [data.city, data.country_code || data.country].filter(Boolean).join(', ');
  return { ipAddress: data.ip, location: location || 'Unknown' };
}

async function lookupViaIpapiCo(): Promise<ClientLocationInfo | null> {
  const res = await fetchWithTimeout('https://ipapi.co/json/', GEO_LOOKUP_TIMEOUT_MS);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.error || !data.ip) return null;
  const location = [data.city, data.country_code || data.country_name].filter(Boolean).join(', ');
  return { ipAddress: data.ip, location: location || 'Unknown' };
}

/**
 * Resolves the current visitor's public IP address and an approximate "City, CC" location
 * for security-audit logging (Audit & Access Logs). Always resolves — never throws — falling
 * back to { ipAddress: 'Unknown', location: 'Unknown' } if every lookup fails, so a login can
 * never be blocked or delayed indefinitely by this.
 */
export async function getClientLocationInfo(): Promise<ClientLocationInfo> {
  for (const lookup of [lookupViaIpwhoIs, lookupViaIpapiCo]) {
    try {
      const result = await lookup();
      if (result) return result;
    } catch {
      // try the next provider
    }
  }
  return UNKNOWN;
}

// === AMÉLIORATION AJOUTÉE : le journal affichait la chaîne technique brute de
// `navigator.userAgent` (ex: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
// ..."), tronquée dans le tableau — illisible pour un contrôle de sécurité rapide, alors que
// la colonne s'appelle "Browser / OS". Un petit parseur, sans dépendance, en extrait un
// libellé court ("Chrome on Windows"). La valeur brute complète reste stockée sans
// changement (utile pour une investigation approfondie) — seul un nouveau champ dérivé est
// ajouté pour l'affichage.
export function parseUserAgent(userAgent: string): string {
  if (!userAgent) return 'Unknown';

  let browser = 'Unknown browser';
  if (/Edg\//.test(userAgent)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(userAgent)) browser = 'Opera';
  else if (/Chrome\//.test(userAgent) && !/Chromium/.test(userAgent)) browser = 'Chrome';
  else if (/Firefox\//.test(userAgent)) browser = 'Firefox';
  else if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/Windows/.test(userAgent)) os = 'Windows';
  else if (/Android/.test(userAgent)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(userAgent)) os = 'iOS';
  else if (/Mac OS X/.test(userAgent)) os = 'macOS';
  else if (/Linux/.test(userAgent)) os = 'Linux';

  return `${browser} on ${os}`;
}
