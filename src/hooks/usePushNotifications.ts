import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export function usePushNotifications() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const registerPush = async () => {
      // Request permission
      const permission = await PushNotifications.requestPermissions();

      if (permission.receive !== 'granted') {
        console.log('Push notification permission denied');
        return;
      }

      // Register with FCM
      await PushNotifications.register();

      // Create Android notification channel
      await PushNotifications.createChannel({
        id: 'cafehub_orders',
        name: 'طلبات CaféHub',
        description: 'إشعارات الطلبات والتحديثات',
        importance: 5, // IMPORTANCE_HIGH
        visibility: 1, // VISIBILITY_PUBLIC
        sound: 'default',
        vibration: true,
        lights: true,
        lightColor: '#FF6B35',
      });

      // Save token to Supabase
      PushNotifications.addListener('registration', async (token) => {
        console.log('FCM Token:', token.value);

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
        );

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('push_tokens')
            .upsert({
              user_id: user.id,
              token: token.value,
              platform: 'android',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'token' });
        }
      });

      // Handle notifications received in foreground
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Notification received:', notification);
      });

      // Handle notification tap
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Notification tapped:', action);
        const data = action.notification.data;
        if (data?.route) {
          window.location.href = data.route;
        }
      });
    };

    registerPush();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, []);
}
