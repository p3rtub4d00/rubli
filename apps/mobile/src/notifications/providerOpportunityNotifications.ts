import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

export interface ProviderOpportunityPayload {
  demandId: string;
  title: string;
  category: string;
  distanceKm?: number;
  budget?: number;
  isUrgent?: boolean;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerProviderNotifications() {
  if (!Constants.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('service-opportunities', {
      name: 'Oportunidades de serviço',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 150, 250],
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;

  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function showLocalProviderOpportunity(payload: ProviderOpportunityPayload) {
  const distance = payload.distanceKm == null ? '' : ` · ${payload.distanceKm.toFixed(1).replace('.', ',')} km`;
  const urgent = payload.isUrgent ? '⚡ ' : '';
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${urgent}Nova oportunidade perto de você`,
      body: `${payload.title} · ${payload.category}${distance}`,
      data: { type: 'provider_opportunity', demandId: payload.demandId },
    },
    trigger: null,
  });
}
