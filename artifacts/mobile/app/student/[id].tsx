import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertCircle, Pencil, Download, FileText, File, Trash2,
  User, Calendar, Phone, Mail, Award,
} from "lucide-react-native";
import { useGetStudent, useDeleteStudent } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";

const FILE_LABELS: Record<string, string> = {
  photo: "Photo",
  signature: "Signature",
  tenthMarksheet: "10th Marksheet",
  twelfthMarksheet: "12th Marksheet",
  graduationMarksheet: "Graduation Marksheet",
  pgMarksheet: "PG Marksheet",
  incomeCertificate: "Income Certificate",
  casteCertificate: "Caste Certificate",
  domicileCertificate: "Domicile Certificate",
  affidavit: "Affidavit",
  aadhaarFront: "Aadhaar Front",
  aadhaarBack: "Aadhaar Back",
};

const FILE_FIELDS = Object.keys(FILE_LABELS);

export default function StudentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: student, isLoading, isError } = useGetStudent(id ?? "");
  const deleteMutation = useDeleteStudent();

  const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

  function getFileUrl(fileId: string) {
    return `${baseUrl}/api/files/${fileId}`;
  }

  async function getZipUrl() {
    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const token = await AsyncStorage.getItem("@auth_token");
    return `${baseUrl}/api/students/${id}/zip${token ? `?token=${token}` : ""}`;
  }

  async function openFile(fileId: string) {
    Linking.openURL(getFileUrl(fileId));
  }

  async function downloadZip() {
    const url = await getZipUrl();
    Linking.openURL(url);
  }

  function handleDelete() {
    Alert.alert(
      "Delete Student",
      `Are you sure you want to delete ${student?.name}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: id ?? "" });
              qc.invalidateQueries({ queryKey: ["students"] });
              router.back();
            } catch {
              Alert.alert("Error", "Failed to delete student. Try again.");
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isError || !student) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <AlertCircle size={40} color={colors.destructive} />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Student not found</Text>
        <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
          <Text style={styles.retryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const files = student.files as Record<string, { fileId: string; originalName: string; mimeType: string; size: number } | null | undefined> ?? {};
  const fileCount = FILE_FIELDS.filter((f) => files[f]?.fileId).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      {/* Header banner */}
      <View style={[styles.banner, { backgroundColor: colors.primary }]}>
        <View style={[styles.avatarLarge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          <Text style={styles.avatarLargeText}>
            {student.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
          </Text>
        </View>
        <Text style={styles.bannerName}>{student.name}</Text>
        <Text style={styles.bannerSub}>{student.email}</Text>
        <View style={styles.bannerActions}>
          <TouchableOpacity
            style={[styles.bannerBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
            onPress={() => router.push(`/student/edit/${id}`)}
          >
            <Pencil size={16} color="#fff" />
            <Text style={styles.bannerBtnText}>Edit</Text>
          </TouchableOpacity>
          {fileCount > 0 && (
            <TouchableOpacity
              style={[styles.bannerBtn, { backgroundColor: "rgba(255,255,255,0.2)" }]}
              onPress={downloadZip}
            >
              <Download size={16} color="#fff" />
              <Text style={styles.bannerBtnText}>Download All</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.content}>
        {/* Personal info */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>PERSONAL INFO</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InfoRow icon={User} label="Father's Name" value={student.fathersName} colors={colors} />
            <Divider colors={colors} />
            <InfoRow icon={Calendar} label="Date of Birth" value={student.dateOfBirth} colors={colors} />
            <Divider colors={colors} />
            <InfoRow icon={Phone} label="Mobile" value={student.mobile} colors={colors} />
            <Divider colors={colors} />
            <InfoRow icon={Mail} label="Email" value={student.email} colors={colors} />
          </View>
        </View>

        {/* Academic info */}
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACADEMIC INFO</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InfoRow icon={Award} label="10th Pass Year" value={student.tenthPassYear} colors={colors} />
            <Divider colors={colors} />
            <InfoRow icon={Award} label="12th Pass Year" value={student.twelfthPassYear} colors={colors} />
          </View>
        </View>

        {/* Documents */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>DOCUMENTS</Text>
            <View style={[styles.docCountBadge, { backgroundColor: colors.accent }]}>
              <Text style={[styles.docCountText, { color: colors.primary }]}>{fileCount}/12</Text>
            </View>
          </View>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {FILE_FIELDS.map((field, idx) => {
              const file = files[field];
              const isLast = idx === FILE_FIELDS.length - 1;
              return (
                <View key={field}>
                  <TouchableOpacity
                    style={styles.docRow}
                    onPress={() => file?.fileId && openFile(file.fileId)}
                    disabled={!file?.fileId}
                    activeOpacity={file?.fileId ? 0.7 : 1}
                  >
                    <View style={[styles.docIcon, { backgroundColor: file?.fileId ? colors.accent : colors.muted }]}>
                      {file?.fileId ? (
                        <FileText size={16} color={colors.primary} />
                      ) : (
                        <File size={16} color={colors.mutedForeground} />
                      )}
                    </View>
                    <View style={styles.docInfo}>
                      <Text style={[styles.docLabel, { color: colors.foreground }]}>{FILE_LABELS[field]}</Text>
                      {file?.fileId ? (
                        <Text style={[styles.docSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {file.originalName} · {(file.size / 1024).toFixed(0)} KB
                        </Text>
                      ) : (
                        <Text style={[styles.docSub, { color: colors.mutedForeground }]}>Not uploaded</Text>
                      )}
                    </View>
                    {file?.fileId && <Download size={16} color={colors.primary} />}
                  </TouchableOpacity>
                  {!isLast && <Divider colors={colors} />}
                </View>
              );
            })}
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity
          style={[styles.deleteBtn, { backgroundColor: "#FEE2E2", borderColor: "#FECACA" }]}
          onPress={handleDelete}
        >
          <Trash2 size={16} color={colors.destructive} />
          <Text style={[styles.deleteBtnText, { color: colors.destructive }]}>Delete Student</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon: Icon, label, value, colors }: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.infoRow}>
      <Icon size={15} color={colors.mutedForeground} />
      <View style={styles.infoText}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

function Divider({ colors }: { colors: any }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  errorTitle: { fontSize: 18, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  retryBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  banner: { padding: 32, paddingTop: 24, alignItems: "center", gap: 6 },
  avatarLarge: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarLargeText: { fontSize: 28, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#fff" },
  bannerName: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold", color: "#fff" },
  bannerSub: { fontSize: 13, color: "rgba(255,255,255,0.75)", fontFamily: "Inter_400Regular" },
  bannerActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  bannerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  bannerBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_500Medium", fontWeight: "500" },
  content: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", letterSpacing: 0.8 },
  docCountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  docCountText: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divider: { height: 1, marginHorizontal: 16 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, paddingHorizontal: 16 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  infoValue: { fontSize: 15, fontFamily: "Inter_500Medium", fontWeight: "500" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, paddingHorizontal: 16 },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 14, fontFamily: "Inter_500Medium", fontWeight: "500" },
  docSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 12, borderWidth: 1 },
  deleteBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});
