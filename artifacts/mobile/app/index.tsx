import React from "react";
import { View, Image, ActivityIndicator, StyleSheet, Text } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function IndexScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Image
          source={require("../assets/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.name}>Doodhnath Group</Text>
        <ActivityIndicator size="large" color="#2563EB" style={styles.spinner} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)/students" />;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  logo: { width: 140, height: 140, marginBottom: 12 },
  name: { fontSize: 22, fontWeight: "700", color: "#1E293B", marginBottom: 28, letterSpacing: 0.3 },
  spinner: {},
});
