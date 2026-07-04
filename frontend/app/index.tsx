import { Redirect } from "expo-router";

// The RouteGuard in _layout.tsx handles redirection based on auth+onboarding.
// This default route sends authed+onboarded users to the tabs.
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
