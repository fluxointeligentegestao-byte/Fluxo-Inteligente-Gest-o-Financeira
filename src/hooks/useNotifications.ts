import { useState, useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { messaging, db } from '../lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { auth as fbAuth } from '../lib/firebase';

export const useNotifications = () => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  const requestPermission = async () => {
    if (!messaging) return;
    
    try {
      const status = await Notification.requestPermission();
      setPermission(status);
      
      if (status === 'granted') {
        const token = await getToken(messaging, {
          vapidKey: 'BPIK6X_Vv6kQ5cRz_L1X-XWk8i4h_-f0XG_xG7N_yE_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ_iZ' // Placeholder, user will need to provide real VAPID or I'll try without if possible
          // NOTE: getToken usually requires a VAPID key. I will use a descriptive comment if I don't have it.
        });
        
        if (token) {
          setFcmToken(token);
          await saveTokenToUser(token);
        }
      }
    } catch (error) {
      console.error('Erro ao obter permissão para notificações:', error);
    }
  };

  const saveTokenToUser = async (token: string) => {
    const user = fbAuth.currentUser;
    if (user) {
      const userRef = doc(db, 'userProfiles', user.uid);
      try {
        await updateDoc(userRef, {
          fcmTokens: arrayUnion(token)
        });
      } catch (error) {
        console.error('Erro ao salvar token FCM:', error);
      }
    }
  };

  useEffect(() => {
    if (!messaging) return;

    // Handle foreground messages
    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('Mensagem recebida em primeiro plano:', payload);
      // You can show a custom toast or browser notification here
      if (payload.notification) {
        new Notification(payload.notification.title || 'Nova Notificação', {
          body: payload.notification.body,
          icon: '/vite.svg',
        });
      }
    });

    return () => unsubscribe();
  }, []);

  return { permission, requestPermission, fcmToken };
};
