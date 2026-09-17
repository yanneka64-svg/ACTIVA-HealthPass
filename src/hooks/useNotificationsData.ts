// === AMÉLIORATION AJOUTÉE : hook de données par domaine — voir useLogsData.ts pour le
// contexte général. `notifications` n'est écrit que par cette souscription (jamais par
// `handleResetDemoData` — vérifié), candidat sûr à encapsuler intégralement.
import { useEffect, useState } from 'react';
import { AppNotification } from '../types';
import { FirestoreService } from '../services/firestore';

export function useNotificationsData(enabled: boolean): AppNotification[] {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = FirestoreService.subscribeToNotifications(setNotifications);
    return unsubscribe;
  }, [enabled]);

  return notifications;
}
