import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/src/theme";
import { CharmerProvider } from "@/src/components/capt-charmer";

type IconName = keyof typeof Ionicons.glyphMap;

const TAB_ICON: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: "home", inactive: "home-outline" },
  pantry: { active: "cube", inactive: "cube-outline" },
  plan: { active: "restaurant", inactive: "restaurant-outline" },
  calendar: { active: "calendar", inactive: "calendar-outline" },
  grocery: { active: "cart", inactive: "cart-outline" },
};

export default function TabsLayout() {
  // Respect the device's own gesture-nav / button-nav bar so our tab bar
  // never sits underneath it (fixes hard-to-tap tabs on gesture-nav phones).
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, Platform.OS === "ios" ? 20 : 10);

  return (
    <CharmerProvider>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.bananaLeaf,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: [styles.tabBar, { height: 58 + bottomPad, paddingBottom: bottomPad }],
          tabBarLabelStyle: styles.tabLabel,
          tabBarItemStyle: styles.tabItem,
          tabBarIcon: ({ focused, color }) => {
            const set = TAB_ICON[route.name];
            if (!set) return null;
            const name = focused ? set.active : set.inactive;
            return <Ionicons name={name} size={26} color={color} />;
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Home" }} />
        <Tabs.Screen name="pantry" options={{ title: "Pantry" }} />
        <Tabs.Screen name="plan" options={{ title: "Plan" }} />
        <Tabs.Screen name="calendar" options={{ title: "Calendar" }} />
        <Tabs.Screen name="grocery" options={{ title: "Grocery" }} />
      </Tabs>
    </CharmerProvider>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  tabItem: {
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 12.5,
    fontWeight: "700",
    marginTop: 3,
  },
});
