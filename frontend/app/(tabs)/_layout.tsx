import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Platform, StyleSheet } from "react-native";

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
  return (
    <CharmerProvider>
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.bananaLeaf,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        tabBarIcon: ({ focused, color, size }) => {
          const set = TAB_ICON[route.name];
          if (!set) return null;
          const name = focused ? set.active : set.inactive;
          return <Ionicons name={name} size={size ?? 22} color={color} />;
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
    height: Platform.OS === "ios" ? 84 : 64,
    paddingTop: 6,
    paddingBottom: Platform.OS === "ios" ? 22 : 8,
  },
  tabItem: {
    paddingVertical: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
});
