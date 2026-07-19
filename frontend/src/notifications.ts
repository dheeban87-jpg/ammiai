// AmmiAI notifications scheduling.
//
// expo-notifications' push-token auto-registration is a module-load SIDE EFFECT
// that THROWS in Expo Go (SDK 53+ removed push from Expo Go). Expo Router
// eagerly requires every route file at startup, so a top-level
// `import "expo-notifications"` anywhere crashes the whole app in Expo Go.
//
// Fix: never import it at module top — load it lazily via require(), and skip
// it entirely in Expo Go and on web. Notifications work normally in dev/prod
// builds; in Expo Go every function below is a safe no-op (use a real build,
// or the "Test now" buttons, to see notifications).

import { Platform } from "react-native";
import Constants from "expo-constants";

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
  dinner_nudge_enabled: boolean;
  dinner_nudge_time: string;
};

/** Copy for the R4 dinner nudge, fetched from the backend on app open. */
export type DinnerNudge = { title: string; body: string };

const isExpoGo = Constants.executionEnvironment === "storeClient";
const notifDisabled = Platform.OS === "web" || isExpoGo;

type NotifModule = typeof import("expo-notifications");
let _mod: NotifModule | null = null;
let _handlerSet = false;

/** Lazily load expo-notifications; returns null where it can't run (Expo Go/web). */
function getNotif(): NotifModule | null {
  if (notifDisabled) return null;
  if (!_mod) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _mod = require("expo-notifications") as NotifModule;
    if (!_handlerSet) {
      _mod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      _handlerSet = true;
    }
  }
  return _mod;
}

/** True when local notifications can actually be scheduled on this runtime. */
export function notificationsSupported(): boolean {
  return !notifDisabled;
}

export async function requestPermissionsIfNeeded(): Promise<boolean> {
  const N = getNotif();
  if (!N) return false;
  const settings = await N.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await N.requestPermissionsAsync();
  return !!req.granted;
}

function parseHM(s: string): { hour: number; minute: number } {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return { hour: h || 0, minute: m || 0 };
}

export async function cancelAllAmmiai(): Promise<void> {
  const N = getNotif();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
}

export async function scheduleAll(prefs: NotifPrefs, nudge?: DinnerNudge | null): Promise<number> {
  const N = getNotif();
  if (!N) return 0;
  await cancelAllAmmiai();
  let scheduled = 0;

  const daily = async (hm: string, title: string, body: string, tag: string) => {
    const { hour, minute } = parseHM(hm);
    await N.scheduleNotificationAsync({
      content: { title, body, data: { tag } },
      trigger: {
        type: N.SchedulableTriggerInputTypes.DAILY,
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
  // R4: the dinner nudge. Its body is real state (tonight's dish, expiring
  // greens) fetched on app open — a local notification's text is frozen when
  // it's scheduled, so this is only as fresh as the last time the app ran.
  // Without that copy we say nothing rather than send a hollow ping.
  if (prefs.dinner_nudge_enabled && nudge?.body) {
    await daily(prefs.dinner_nudge_time, nudge.title, nudge.body, "dinner_nudge");
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
    await N.scheduleNotificationAsync({
      content: {
        title: "Your weekly AmmiAI report 📊",
        body: "See how you did on waste, balance and streak this week.",
        data: { tag: "weekly_report" },
      },
      trigger: {
        type: N.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
      },
    });
    scheduled++;
  }
  return scheduled;
}

/** R4: called on app open. Pulls the user's notification prefs and tonight's
 *  nudge copy, then reschedules everything so the 5:30pm ping reflects today's
 *  plan and pantry. Silent no-op without permission or on an unsupported
 *  runtime — this must never block or break app start. */
export async function refreshDinnerNudge(
  apiGet: <T>(path: string) => Promise<T>,
): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const N = getNotif();
  if (!N) return false;
  // Don't PROMPT here — app open is the wrong moment to ask. We only schedule
  // if the user already granted permission (Settings does the asking).
  const perm = await N.getPermissionsAsync();
  if (!perm.granted) return false;
  try {
    const [prefs, nudge] = await Promise.all([
      apiGet<NotifPrefs>("/api/settings/notifications"),
      apiGet<DinnerNudge>("/api/nudge/dinner"),
    ]);
    await scheduleAll(prefs, nudge);
    return true;
  } catch {
    return false; // offline / cold backend — keep yesterday's schedule
  }
}

export async function fireTest(kind: "pantry" | "meal" | "cook" | "weekly" | "dinner_nudge"): Promise<void> {
  const copy = {
    pantry: ["Pantry needs attention 🌿", "2 items need attention — 3 dish ideas for your keerai."],
    meal: ["Lunch time 🍛", "Time to cook today's lunch."],
    cook: ["Did you cook tonight's plan? 🍽", "Mark dishes as cooked to update pantry & streak."],
    weekly: ["Your weekly AmmiAI report 📊", "See waste, balance, streak."],
    dinner_nudge: ["Tonight, soldier 🌙", "Keerai kootu + rice — your spinach expires tomorrow."],
  } as const;

  if (Platform.OS === "web") {
    // Best-effort browser notification for preview visibility.
    try {
      if ("Notification" in window) {
        if (Notification.permission !== "granted") {
          await Notification.requestPermission();
        }
        if (Notification.permission === "granted") {
          new Notification(copy[kind][0], { body: copy[kind][1] });
        }
      }
    } catch {
      /* noop */
    }
    return;
  }

  const N = getNotif();
  if (!N) return; // Expo Go — no-op
  await N.scheduleNotificationAsync({
    content: { title: copy[kind][0], body: copy[kind][1], data: { tag: `test_${kind}` } },
    trigger: null, // fire immediately
  });
}
