// Health Connect needs two manifest bits that react-native-health-connect's own
// config plugin does NOT add. Without them, launching the permission flow throws
// natively and the app closes (owner-reported crash on "Captain wants your
// marching data"):
//
//  1. <queries><package android:name="com.google.android.apps.healthdata"/>
//     Android 11+ package visibility. Without it the Health Connect app is
//     invisible to us, so the permission intent can't resolve.
//  2. <activity-alias ... VIEW_PERMISSION_USAGE>  — required from Android 14,
//     where Health Connect is part of the system and demands a rationale target.
const { withAndroidManifest } = require("@expo/config-plugins");

const HEALTH_PACKAGE = "com.google.android.apps.healthdata";

module.exports = function withHealthConnectManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // 1. package visibility
    manifest.queries = manifest.queries || [];
    const hasPkg = manifest.queries.some((q) =>
      (q.package || []).some((p) => p.$?.["android:name"] === HEALTH_PACKAGE),
    );
    if (!hasPkg) {
      manifest.queries.push({ package: [{ $: { "android:name": HEALTH_PACKAGE } }] });
    }

    // 2. rationale target for Android 14+
    const app = manifest.application[0];
    app["activity-alias"] = app["activity-alias"] || [];
    const hasAlias = app["activity-alias"].some(
      (a) => a.$?.["android:name"] === "ViewPermissionUsageActivity",
    );
    if (!hasAlias) {
      app["activity-alias"].push({
        $: {
          "android:name": "ViewPermissionUsageActivity",
          "android:exported": "true",
          "android:targetActivity": ".MainActivity",
          "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
            category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }],
          },
        ],
      });
    }
    return cfg;
  });
};
