import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useGetStudent } from "@workspace/api-client-react";
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
const IMAGE_FIELDS = new Set(["photo", "signature", "aadhaarFront", "aadhaarBack"]);

interface PickedFile { uri: string; name: string; type: string; }
interface FormData {
  name: string; fathersName: string; dateOfBirth: string;
  tenthPassYear: string; twelfthPassYear: string; mobile: string; email: string;
}

export default function EditStudentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: student, isLoading } = useGetStudent(id ?? "");

  const [form, setForm] = useState<FormData>({
    name: "", fathersName: "", dateOfBirth: "",
    tenthPassYear: "", twelfthPassYear: "", mobile: "", email: "",
  });
  const [newFiles, setNewFiles] = useState<Record<string, PickedFile>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name ?? "",
        fathersName: student.fathersName ?? "",
        dateOfBirth: student.dateOfBirth ?? "",
        tenthPassYear: student.tenthPassYear ?? "",
        twelfthPassYear: student.twelfthPassYear ?? "",
        mobile: student.mobile ?? "",
        email: student.email ?? "",
      });
    }
  }, [student]);

  function setField(key: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  async function pickFile(field: string) {
    if (IMAGE_FIELDS.has(field)) {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], quality: 0.85, allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const ext = asset.uri.split(".").pop() ?? "jpg";
        setNewFiles((f) => ({ ...f, [field]: { uri: asset.uri, name: `${field}.${ext}`, type: asset.mimeType ?? `image/${ext}` } }));
      }
    } else {
      if (Platform.OS === "web") {
        Alert.alert("Web Mode", "Document picking not supported in web preview.");
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setNewFiles((f) => ({ ...f, [field]: { uri: asset.uri, name: asset.name ?? field, type: asset.mimeType ?? "application/pdf" } }));
      }
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (!form.fathersName.trim()) errs.fathersName = "Required";
    if (!form.dateOfBirth.trim()) errs.dateOfBirth = "Required";
    if (!form.tenthPassYear.trim()) errs.tenthPassYear = "Required";
    if (!form.twelfthPassYear.trim()) errs.twelfthPassYear = "Required";
    if (!/^\d{10}$/.test(form.mobile)) errs.mobile = "Must be 10 digits";
    if (!form.email.includes("@")) errs.email = "Invalid email";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const storedToken = await AsyncStorage.getItem("@auth_token");

      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      Object.entries(newFiles).forEach(([field, file]) => {
        fd.append(field, { uri: file.uri, name: file.name, type: file.type } as any);
      });

      const res = await fetch(`${baseUrl}/api/students/${id}`, {
        method: "PATCH",
        headers: { Authorization: storedToken ? `Bearer ${storedToken}` : "" },
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Update failed" }));
        Alert.alert("Error", err.error ?? "Update failed");
        return;
      }

      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["student", id] });
      Alert.alert("Success", "Student updated", [{ text: "OK", onPress: () => router.back() }]);
    } catch (err: any) {
      Alert.alert("Error", err?.message ?? "Update failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const existingFiles = student?.files as Record<string, any> ?? {};

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16, paddingTop: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <SectionTitle label="Personal Details" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FormField label="Full Name" value={form.name} onChangeText={(v) => setField("name", v)} error={errors.name} placeholder="Full name" colors={colors} />
        <Div colors={colors} />
        <FormField label="Father's Name" value={form.fathersName} onChangeText={(v) => setField("fathersName", v)} error={errors.fathersName} placeholder="Father's name" colors={colors} />
        <Div colors={colors} />
        <FormField label="Date of Birth" value={form.dateOfBirth} onChangeText={(v) => setField("dateOfBirth", v)} error={errors.dateOfBirth} placeholder="DD/MM/YYYY" colors={colors} />
        <Div colors={colors} />
        <FormField label="Mobile" value={form.mobile} onChangeText={(v) => setField("mobile", v)} error={errors.mobile} placeholder="10-digit number" colors={colors} keyboardType="phone-pad" />
        <Div colors={colors} />
        <FormField label="Email" value={form.email} onChangeText={(v) => setField("email", v)} error={errors.email} placeholder="email@example.com" colors={colors} keyboardType="email-address" />
      </View>

      <View style={{ height: 24 }} />

      <SectionTitle label="Academic Details" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FormField label="10th Pass Year" value={form.tenthPassYear} onChangeText={(v) => setField("tenthPassYear", v)} error={errors.tenthPassYear} placeholder="e.g. 2018" colors={colors} keyboardType="number-pad" />
        <Div colors={colors} />
        <FormField label="12th Pass Year" value={form.twelfthPassYear} onChangeText={(v) => setField("twelfthPassYear", v)} error={errors.twelfthPassYear} placeholder="e.g. 2020" colors={colors} keyboardType="number-pad" />
      </View>

      <View style={{ height: 24 }} />

      <SectionTitle label="Documents" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {FILE_FIELDS.map((field, idx) => {
          const existing = existingFiles[field];
          const newFile = newFiles[field];
          const hasFile = !!newFile || !!existing?.fileId;
          const isLast = idx === FILE_FIELDS.length - 1;
          return (
            <View key={field}>
              <TouchableOpacity style={styles.docRow} onPress={() => pickFile(field)} activeOpacity={0.7}>
                <View style={[styles.docIcon, { backgroundColor: hasFile ? colors.accent : colors.muted }]}>
                  <Feather name={hasFile ? "check-circle" : "file"} size={16} color={hasFile ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={styles.docInfo}>
                  <Text style={[styles.docLabel, { color: colors.foreground }]}>{FILE_LABELS[field]}</Text>
                  <Text style={[styles.docSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {newFile ? `New: ${newFile.name}` : existing?.fileId ? existing.originalName : "Not uploaded"}
                  </Text>
                </View>
                {newFile ? (
                  <TouchableOpacity
                    style={[styles.removeBtn, { backgroundColor: "#FEE2E2" }]}
                    onPress={() => setNewFiles((f) => { const c = { ...f }; delete c[field]; return c; })}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Feather name="x" size={14} color={colors.destructive} />
                  </TouchableOpacity>
                ) : (
                  <Feather name="upload" size={16} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>
              {!isLast && <Div colors={colors} />}
            </View>
          );
        })}
      </View>

      <View style={{ height: 24 }} />

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.7 : 1 }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Feather name="save" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Save Changes</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>;
}
function Div({ colors }: { colors: any }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}
function FormField({ label, value, onChangeText, error, placeholder, colors, keyboardType }: { label: string; value: string; onChangeText: (v: string) => void; error?: string; placeholder: string; colors: any; keyboardType?: any }) {
  return (
    <View style={styles.formField}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { color: colors.foreground }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize="words"
        autoCorrect={false}
      />
      {error ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", fontWeight: "600", letterSpacing: 0.8, marginBottom: 8, paddingLeft: 4 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divider: { height: 1 },
  formField: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_500Medium", fontWeight: "500" },
  fieldInput: { fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 4 },
  fieldError: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, paddingHorizontal: 16 },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 14, fontFamily: "Inter_500Medium", fontWeight: "500" },
  docSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  removeBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 14 },
  submitBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
});
