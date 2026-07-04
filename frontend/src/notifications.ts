// AmmiAI notifications scheduling.
// Notifications DO NOT fire on Expo Go Android (SDK 53+) or web. They will
// only fire on a real dev/prod build. Use the "Test now" buttons in Settings
// to trigger immediate notifications in preview.

import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export type NotifPrefs = {
  pantry_alert_enabled: boolean;
  pantry_alert_time: string;
  meal_reminders_enabled: boolean;
  breakfast_time: string;
  lunch_time: string;
  dinner_time: string;
  cook_check_enabled: boolean;
  cook_check_time: string;
  weekly_report_enabled: boolean;
  weekly_report_dow: number; // 0=Mon .. 6=Sun
  weekly_report_time: string;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestPermissionsIfNeeded(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return !!req.granted;
}

function parseHM(s: string): { hour: number; minute: number } {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return { hour: h || 0, minute: m || 0 };
}

export async function cancelAllAmmiai(): Promise<void> {
  if (Platform.OS === "web") return;
  await Notifications.cancelAllScheduledNotificationsAsync();
}

export async function scheduleAll(prefs: NotifPrefs): Promise<number> {
  if (Platform.OS === "web") return 0;
  await cancelAllAmmiai();
  let scheduled = 0;

  const daily = async (hm: string, title: string, body: string, tag: string) => {
    const { hour, minute } = parseHM(hm);
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { tag } },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    scheduled++;
  };

  if (prefs.pantry_alert_enabled) {
    await daily(
      prefs.pantry_alert_time,
      "Pantry needs attention 🌿",
      "Some ingredients are close to expiry — open AmmiAI for rescue dishes.",
      "pantry_alert",
    );
  }
  if (prefs.meal_reminders_enabled) {
    await daily(prefs.breakfast_time, "Breakfast time ☀️", "Time to cook today's breakfast.", "meal_bf");
    await daily(prefs.lunch_time, "Lunch time 🍛", "Time to cook today's lunch.", "meal_lunch");
    await daily(prefs.dinner_time, "Dinner time 🌙", "Time to cook today's dinner.", "meal_dinner");
  }
  if (prefs.cook_check_enabled) {
    await daily(
      prefs.cook_check_time,
      "Did you cook tonight's plan? 🍽",
      "Mark dishes as cooked so we can update your pantry and streak.",
      "cook_check",
    );
  }
  if (prefs.weekly_report_enabled) {
    const { hour, minute } = parseHM(prefs.weekly_report_time);
    // Weekday mapping — expo/native use 1=Sun..7=Sat. Our dow is 0=Mon..6=Sun.
    const weekday = ((prefs.weekly_report_dow + 1) % 7) + 1;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Your weekly AmmiAI report 📊",
        body: "See how you did on waste, balance and streak this week.",
        data: { tag: "weekly_report" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
      },
    });
    scheduled++;
  }
  return scheduled;
}

export async function fireTest(kind: "pantry" | "meal" | "cook" | "weekly"): Promise<void> {
  if (Platform.OS === "web") {
    // Best-effort browser notification for preview visibility.
    try {
      if ("Notification" in window) {
        if (Notification.permission !== "granted") {
          await Notification.requestPermission();
        }
        if (Notification.permission === "granted") {
          const map: Record<string, [string, string]> = {
            pantry: ["Pantry needs attention 🌿", "2 items need attention — 3 dish ideas for your keerai."],
            meal: ["Lunch time 🍛", "Time to cook today's lunch."],
            cook: ["Did you cook tonight's plan? 🍽", "Mark dishes as cooked to update pantry & streak."],
            weekly: ["Your weekly AmmiAI report 📊", "See waste, balance, streak."],
          };
          new Notification(map[kind][0], { body: map[kind][1] });
        }
      }
    } catch {
      /* noop */
    }
    return;
  }
  const map = {
    pantry: ["Pantry needs attention 🌿", "2 items need attention — 3 dish ideas for your keerai."],
    meal: ["Lunch time 🍛", "Time to cook today's lunch."],
    cook: ["Did you cook tonight's plan? 🍽", "Mark dishes as cooked to update pantry & streak."],
    weekly: ["Your weekly AmmiAI report 📊", "See waste, balance, streak."],
  } as const;
  await Notifications.scheduleNotificationAsync({
    content: { title: map[kind][0], body: map[kind][1], data: { tag: `test_${kind}` } },
    trigger: null, // fire immediately
  });
}
