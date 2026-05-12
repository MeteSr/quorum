import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { registerPushToken } from "@/services/members";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  true,
  }),
});

export function usePushNotifications(isAuthenticated: boolean) {
  const tokenRegistered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || tokenRegistered.current) return;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;

      if (existing !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") return;

      // Android requires a notification channel.
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name:       "Quorum",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      const tokenData = await Notifications.getExpoPushTokenAsync();
      await registerPushToken(tokenData.data);
      tokenRegistered.current = true;
    })();
  }, [isAuthenticated]);
}
