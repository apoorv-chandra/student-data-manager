import { Tabs, useRouter } from "expo-router";
import { Users, Settings } from "lucide-react-native";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [user]);

  const bottomInset = insets.bottom ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 49 + bottomInset : 56 + bottomInset,
          paddingBottom: Platform.OS === "ios" ? bottomInset : bottomInset + 6,
          paddingTop: 6,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ href: null, tabBarButton: () => null }}
      />
      <Tabs.Screen
        name="students"
        options={{
          title: "Students",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
