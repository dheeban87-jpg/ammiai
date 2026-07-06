// MUST be first: starts capturing deep-link URLs before any screen mounts.
import "@/src/url-buffer";

import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { useFonts } from "expo-font";
import { Baloo2_600SemiBold, Baloo2_800ExtraBold } from "@expo-google-fonts/baloo-2";
import { NotoSansTamil_700Bold } from "@expo-google-fonts/noto-sans-tamil";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth-context";
import { LanguageProvider } from "@/src/i18n";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function RouteGuard() {
  const { status, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const first = segments[0] as string | undefined;
    const inAuth = first === "sign-in";
    const inOnboarding = first === "onboarding";
    const inAuthCallback = first === "auth-callback";

    // Never bounce out of the OAuth callback screen — it needs to complete
    // the session_id → token exchange before RouteGuard should act.
    if (inAuthCallback) return;

    if (status === "unauth" && !inAuth) {
      router.replace("/sign-in");
      return;
    }
    if (status === "authed") {
      const onboarded = !!profile?.onboarding_complete;
      if (!onboarded && !inOnboarding) {
        router.replace("/onboarding");
        return;
      }
      if (onboarded && (inAuth || inOnboarding)) {
        router.replace("/(tabs)");
        return;
      }
    }
  }, [status, profile?.onboarding_complete, segments, router]);

  return null;
}

function RootStack() {
  return (
    <>
      <RouteGuard />
      <StatusBar style="light" backgroundColor={colors.bananaLeafDark} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.riceWhite } }} />
    </>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [appFontsLoaded, appFontsError] = useFonts({
    "NotoSansTamil-Regular": require("../assets/fonts/NotoSansTamil-Regular.ttf"),
    "Baloo2-Regular": require("../assets/fonts/Baloo2-Regular.ttf"),
    Baloo2_600SemiBold,
    Baloo2_800ExtraBold,
    NotoSansTamil_700Bold,
  });

  const ready = (iconsLoaded || iconsError) && (appFontsLoaded || appFontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.riceWhite }}>
        <AuthProvider>
          <LanguageProvider>
            <RootStack />
          </LanguageProvider>
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}
