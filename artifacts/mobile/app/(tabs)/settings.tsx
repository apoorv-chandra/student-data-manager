import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Linking,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Phone, Grid2X2, ExternalLink, LogOut, ChevronRight, RefreshCw } from "lucide-react-native";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useGetSettings } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [creatingSheet, setCreatingSheet] = useState(false);

  const { data: settings } = useGetSettings();

  async function handleCreateSheet() {
    setCreatingSheet(true);
    try {
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const token = await AsyncStorage.getItem("@auth_token");
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const res = await fetch(`${baseUrl}/api/settings/create-sheet`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      qc.invalidateQueries({ queryKey: ["settings"] });
      Alert.alert("Sheet Created!", "Your Google Sheet has been created and linked.");
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not create sheet. Please try again.");
    } finally {
      setCreatingSheet(false);
    }
  }

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: logout },
    ]);
  }

  function openSheet() {
    if (settings?.googleSheetUrl) {
      Linking.openURL(settings.googleSheetUrl);
    }
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
    >
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Settings</Text>
      </View>

      <View style={styles.content}>
        {/* Profile section */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PROFILE</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.profileRow}>
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={[styles.avatarText, { color: colors.primary }]}>
                  {(user?.name ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: colors.foreground }]}>{user?.name}</Text>
                <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{user?.email}</Text>
                <View style={[styles.roleBadge, { backgroundColor: user?.role === "superadmin" ? colors.accent : colors.muted }]}>
                  <Text style={[styles.roleText, { color: user?.role === "superadmin" ? colors.primary : colors.mutedForeground }]}>
                    {user?.role === "superadmin" ? "Super Admin" : "Teacher"}
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.infoRow}>
              <Phone size={14} color={colors.mutedForeground} />
              <Text style={[styles.infoText, { color: colors.mutedForeground }]}>{user?.mobile}</Text>
            </View>
          </View>
        </View>

        {/* Google Sheets */}
        {settings?.googleSheetUrl ? (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GOOGLE SHEETS</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sheetRow}>
                <View style={[styles.sheetIcon, { backgroundColor: "#E7F3E8" }]}>
                  <Grid2X2 size={18} color="#1E7E34" />
                </View>
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetLabel, { color: colors.foreground }]}>Data Sheet</Text>
                  <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>Auto-synced with student records</Text>
                </View>
                <TouchableOpacity
                  style={[styles.openBtn, { backgroundColor: colors.accent }]}
                  onPress={openSheet}
                >
                  <ExternalLink size={14} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GOOGLE SHEETS</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.sheetRow}>
                <View style={[styles.sheetIcon, { backgroundColor: colors.muted }]}>
                  <Grid2X2 size={18} color={colors.mutedForeground} />
                </View>
                <View style={styles.sheetInfo}>
                  <Text style={[styles.sheetLabel, { color: colors.foreground }]}>Sheet Not Created</Text>
                  <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
                    Tap to create your Google Sheet now
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.openBtn, { backgroundColor: creatingSheet ? colors.muted : colors.accent }]}
                  onPress={handleCreateSheet}
                  disabled={creatingSheet}
                >
                  {creatingSheet
                    ? <ActivityIndicator size="small" color={colors.primary} />
                    : <RefreshCw size={14} color={colors.primary} />
                  }
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Account actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
              <LogOut size={18} color={colors.destructive} />
              <Text style={[styles.menuItemText, { color: colors.destructive }]}>Sign Out</Text>
              <ChevronRight size={16} color={colors.destructive} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  content: { padding: 16, gap: 24 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", letterSpacing: 0.8, paddingLeft: 4 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  profileRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  avatar: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  profileInfo: { flex: 1, gap: 4 },
  profileName: { fontSize: 17, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  roleBadge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginTop: 4 },
  roleText: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  divider: { height: 1, marginHorizontal: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 14, paddingHorizontal: 16 },
  infoText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  sheetIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sheetInfo: { flex: 1, gap: 2 },
  sheetLabel: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  sheetSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  openBtn: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  menuItemText: { fontSize: 15, fontFamily: "Inter_500Medium", fontWeight: "500" },
});
