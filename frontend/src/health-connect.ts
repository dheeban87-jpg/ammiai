// S4 — Health Connect (read-only steps + active calories). Wrapped so the app
// NEVER crashes when the native module is unavailable (Expo Go, Android < 9
// without the Health Connect app, or a build without the config plugin): every
// entry point fails soft and the app falls back to manual activity entry.
//
// Read-only, minimum scope: Steps, ActiveCaloriesBurned, ExerciseSession.
// Only daily aggregates leave the device (see backend /api/activity/health-sync).

let _mod: any = null;
let _tried = false;
function hc(): any | null {
  if (_tried) return _mod;
  _tried = true;
  try {
    // Lazy require: a missing native module throws here, not at import time.
    _mod = require("react-native-health-connect");
  } catch {
    _mod = null;
  }
  return _mod;
}

const READ_PERMS = [
  { accessType: "read", recordType: "Steps" },
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
  { accessType: "read", recordType: "ExerciseSession" },
] as const;

export type HealthToday = { steps: number; active_kcal: number };

/** Is Health Connect installed + usable on this device? Never throws. */
export async function healthConnectAvailable(): Promise<boolean> {
  const m = hc();
  if (!m) return false;
  try {
    const status = await m.getSdkStatus();
    return status === m.SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/** Initialize + request the read permissions. Returns true only if granted. */
export async function requestHealthPermissions(): Promise<boolean> {
  const m = hc();
  if (!m) return false;
  try {
    const ok = await m.initialize();
    if (!ok) return false;
    const granted = await m.requestPermission(READ_PERMS as any);
    return Array.isArray(granted) && granted.length > 0;
  } catch {
    return false;
  }
}

/** True if we already hold at least the steps read permission. */
export async function hasHealthPermissions(): Promise<boolean> {
  const m = hc();
  if (!m) return false;
  try {
    await m.initialize();
    const granted = await m.getGrantedPermissions();
    return (
      Array.isArray(granted) &&
      granted.some((p: any) => p.recordType === "Steps" && p.accessType === "read")
    );
  } catch {
    return false;
  }
}

/** Read today's step count + active kcal (device-local midnight → now). Returns
 *  null if unavailable/denied so callers can fall back to manual. */
export async function readTodayActivity(): Promise<HealthToday | null> {
  const m = hc();
  if (!m) return null;
  try {
    await m.initialize();
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const range = {
      operator: "between",
      startTime: start.toISOString(),
      endTime: now.toISOString(),
    };
    let steps = 0;
    let active_kcal = 0;
    try {
      const s = await m.aggregateRecord({ recordType: "Steps", timeRangeFilter: range });
      steps = Math.round(Number(s?.COUNT_TOTAL ?? 0));
    } catch {
      /* steps unavailable — leave 0 */
    }
    try {
      const c = await m.aggregateRecord({
        recordType: "ActiveCaloriesBurned",
        timeRangeFilter: range,
      });
      active_kcal = Math.round(Number(c?.ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0));
    } catch {
      /* active kcal unavailable — leave 0 */
    }
    return { steps, active_kcal };
  } catch {
    return null;
  }
}
