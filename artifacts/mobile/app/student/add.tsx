import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
  Modal, FlatList,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import { INDIAN_BOARDS } from "@/constants/boards";
import { enqueueStudent, getQueue, isNetworkError } from "@/lib/offlineQueue";

const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "yahoo.in", "yahoo.co.in",
  "zoho.com", "rediffmail.com", "outlook.com", "hotmail.com", "live.com",
];

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
  aadhaarFront: "Aadhaar Card (Front)",
  aadhaarBack: "Aadhaar Card (Back)",
};

const MANDATORY_DOCS = ["photo", "signature", "tenthMarksheet", "twelfthMarksheet", "incomeCertificate", "aadhaarFront", "aadhaarBack"];
const OPTIONAL_DOCS = ["graduationMarksheet", "pgMarksheet", "casteCertificate", "domicileCertificate", "affidavit"];
const IMAGE_FIELDS = new Set(["photo", "signature", "aadhaarFront", "aadhaarBack"]);

interface PickedFile { uri: string; name: string; type: string; }
interface FormState {
  name: string; fathersName: string; dateOfBirth: string;
  address: string; aadhaarNumber: string; mobile: string; email: string;
  tenthPassYear: string; tenthSchoolName: string; tenthBoard: string;
  twelfthPassYear: string; twelfthSchoolName: string; twelfthBoard: string;
}

function formatDateDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function validateForm(form: FormState, files: Record<string, PickedFile>): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs.name = "Full name is required";
  if (!form.fathersName.trim()) errs.fathersName = "Father's name is required";

  if (!form.dateOfBirth) {
    errs.dateOfBirth = "Date of birth is required";
  } else {
    const d = parseDMY(form.dateOfBirth);
    if (!d) errs.dateOfBirth = "Format must be DD/MM/YYYY";
    else if (d > new Date()) errs.dateOfBirth = "Future date not allowed";
    else if (d.getFullYear() < 1900) errs.dateOfBirth = "Invalid year";
  }

  if (form.aadhaarNumber && !/^\d{12}$/.test(form.aadhaarNumber)) {
    errs.aadhaarNumber = "Aadhaar must be exactly 12 digits";
  }
  if (!/^\d{10}$/.test(form.mobile)) errs.mobile = "Mobile must be exactly 10 digits";

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(form.email)) {
    errs.email = "Invalid email format";
  } else {
    const domain = form.email.split("@")[1]?.toLowerCase() ?? "";
    if (!ALLOWED_EMAIL_DOMAINS.includes(domain)) {
      errs.email = `Allowed: Gmail, Yahoo, Zoho, Rediffmail, Outlook`;
    }
  }

  const currentYear = new Date().getFullYear();
  if (!/^\d{4}$/.test(form.tenthPassYear) || +form.tenthPassYear < 1970 || +form.tenthPassYear > currentYear) {
    errs.tenthPassYear = `Year must be between 1970 and ${currentYear}`;
  }
  if (!form.tenthSchoolName.trim()) errs.tenthSchoolName = "School name is required";
  if (!form.tenthBoard) errs.tenthBoard = "Board selection is required";
  if (!/^\d{4}$/.test(form.twelfthPassYear) || +form.twelfthPassYear < 1970 || +form.twelfthPassYear > currentYear) {
    errs.twelfthPassYear = `Year must be between 1970 and ${currentYear}`;
  }
  if (!form.twelfthSchoolName.trim()) errs.twelfthSchoolName = "School name is required";
  if (!form.twelfthBoard) errs.twelfthBoard = "Board selection is required";

  for (const field of MANDATORY_DOCS) {
    if (!files[field]) errs[`doc_${field}`] = `${FILE_LABELS[field]} is required`;
  }

  return errs;
}

// ─── Board Picker Modal ───────────────────────────────────────────────
function BoardPickerModal({
  visible, onClose, onSelect, currentValue, colors,
}: {
  visible: boolean; onClose: () => void; onSelect: (v: string) => void;
  currentValue: string; colors: any;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[bpStyles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[bpStyles.title, { color: colors.foreground }]}>Select Board</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <FlatList
          data={INDIAN_BOARDS}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[bpStyles.row, { borderBottomColor: colors.border }]}
              onPress={() => { onSelect(item); onClose(); }}
              activeOpacity={0.7}
            >
              <Text style={[bpStyles.rowText, { color: colors.foreground }]}>{item}</Text>
              {currentValue === item && <Feather name="check" size={18} color={colors.primary} />}
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const bpStyles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 17, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  rowText: { fontSize: 15, flex: 1 },
});

// ─── Main Screen ─────────────────────────────────────────────────────
export default function AddStudentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setFormState] = useState<FormState>({
    name: "", fathersName: "", dateOfBirth: "", address: "",
    aadhaarNumber: "", mobile: "", email: "",
    tenthPassYear: "", tenthSchoolName: "", tenthBoard: "",
    twelfthPassYear: "", twelfthSchoolName: "", twelfthBoard: "",
  });
  const [files, setFiles] = useState<Record<string, PickedFile>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(new Date(2000, 0, 1));
  const [boardPickerFor, setBoardPickerFor] = useState<"tenth" | "twelfth" | null>(null);

  useEffect(() => {
    getQueue().then((q) => setPendingCount(q.length));
  }, []);

  function setField(key: keyof FormState, value: string) {
    setFormState((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function onDateChange(_event: DateTimePickerEvent, selected?: Date) {
    setShowDatePicker(Platform.OS === "ios");
    if (selected) {
      setDatePickerValue(selected);
      setField("dateOfBirth", formatDateDMY(selected));
    }
  }

  async function pickFile(field: string) {
    if (IMAGE_FIELDS.has(field)) {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"], quality: 0.85, allowsEditing: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const ext = asset.uri.split(".").pop() ?? "jpg";
        setFiles((f) => ({ ...f, [field]: { uri: asset.uri, name: `${field}.${ext}`, type: asset.mimeType ?? `image/${ext}` } }));
        setErrors((e) => ({ ...e, [`doc_${field}`]: "" }));
      }
    } else {
      if (Platform.OS === "web") {
        Alert.alert("Web Mode", "Use the mobile app for document uploads.");
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/*"] });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setFiles((f) => ({ ...f, [field]: { uri: asset.uri, name: asset.name ?? field, type: asset.mimeType ?? "application/pdf" } }));
        setErrors((e) => ({ ...e, [`doc_${field}`]: "" }));
      }
    }
  }

  function removeFile(field: string) {
    setFiles((f) => { const c = { ...f }; delete c[field]; return c; });
  }

  async function handleSubmit() {
    const errs = validateForm(form, files);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      Alert.alert("Validation Error", "Please fix the highlighted fields before submitting.");
      return;
    }
    setIsSubmitting(true);

    try {
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
      const storedToken = await AsyncStorage.getItem("@auth_token");

      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      Object.entries(files).forEach(([field, file]) => {
        fd.append(field, { uri: file.uri, name: file.name, type: file.type } as any);
      });

      const res = await fetch(`${baseUrl}/api/students`, {
        method: "POST",
        headers: { Authorization: storedToken ? `Bearer ${storedToken}` : "" },
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to create student" }));
        Alert.alert("Error", err.error ?? "Failed to create student");
        return;
      }

      qc.invalidateQueries({ queryKey: ["students"] });
      Alert.alert("Success", "Student added successfully", [{ text: "OK", onPress: () => router.back() }]);
    } catch (err: any) {
      if (isNetworkError(err)) {
        const fileList = Object.entries(files).map(([field, f]) => ({ field, uri: f.uri, name: f.name, type: f.type }));
        await enqueueStudent(form as any, fileList);
        setPendingCount((c) => c + 1);
        Alert.alert(
          "Saved Offline",
          "No internet connection. Student data saved locally and will be submitted automatically when connection is restored.",
          [{ text: "OK", onPress: () => router.back() }]
        );
      } else {
        Alert.alert("Error", err?.message ?? "Failed to create student.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const today = new Date();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16, paddingTop: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {pendingCount > 0 && (
        <View style={[styles.offlineBanner, { backgroundColor: "#FEF9C3" }]}>
          <Feather name="clock" size={14} color="#A16207" />
          <Text style={[styles.offlineText, { color: "#A16207" }]}>
            {pendingCount} student{pendingCount > 1 ? "s" : ""} queued offline — will sync when connected
          </Text>
        </View>
      )}

      {/* Personal Details */}
      <SectionTitle label="Personal Details" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FormField label="Full Name *" value={form.name} onChangeText={(v) => setField("name", v)} error={errors.name} placeholder="Enter full name" colors={colors} />
        <Div colors={colors} />
        <FormField label="Father's Name *" value={form.fathersName} onChangeText={(v) => setField("fathersName", v)} error={errors.fathersName} placeholder="Enter father's name" colors={colors} />
        <Div colors={colors} />
        {/* Date of Birth */}
        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date of Birth *</Text>
          <TouchableOpacity
            style={[styles.dateBtn, { borderColor: errors.dateOfBirth ? colors.destructive : colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Feather name="calendar" size={16} color={colors.mutedForeground} />
            <Text style={[styles.dateBtnText, { color: form.dateOfBirth ? colors.foreground : colors.mutedForeground }]}>
              {form.dateOfBirth || "Select date of birth"}
            </Text>
          </TouchableOpacity>
          {errors.dateOfBirth ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.dateOfBirth}</Text> : null}
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={datePickerValue}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={today}
            minimumDate={new Date(1900, 0, 1)}
            onChange={onDateChange}
          />
        )}
        <Div colors={colors} />
        <FormField label="Address" value={form.address} onChangeText={(v) => setField("address", v)} error={errors.address} placeholder="Enter full address" colors={colors} multiline />
        <Div colors={colors} />
        <FormField
          label="Aadhaar Number (12 digits)"
          value={form.aadhaarNumber}
          onChangeText={(v) => setField("aadhaarNumber", v.replace(/\D/g, "").slice(0, 12))}
          error={errors.aadhaarNumber}
          placeholder="Enter 12-digit Aadhaar number"
          colors={colors}
          keyboardType="number-pad"
        />
        <Div colors={colors} />
        <FormField
          label="Mobile Number *"
          value={form.mobile}
          onChangeText={(v) => setField("mobile", v.replace(/\D/g, "").slice(0, 10))}
          error={errors.mobile}
          placeholder="10-digit mobile number"
          colors={colors}
          keyboardType="phone-pad"
        />
        <Div colors={colors} />
        <FormField
          label="Email *"
          value={form.email}
          onChangeText={(v) => setField("email", v.trim())}
          error={errors.email}
          placeholder="Gmail, Yahoo, Outlook, etc."
          colors={colors}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.gap} />

      {/* Academic Details */}
      <SectionTitle label="Academic Details" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FormField
          label="10th Pass Year *"
          value={form.tenthPassYear}
          onChangeText={(v) => setField("tenthPassYear", v.replace(/\D/g, "").slice(0, 4))}
          error={errors.tenthPassYear}
          placeholder={`e.g. ${new Date().getFullYear() - 8}`}
          colors={colors}
          keyboardType="number-pad"
        />
        <Div colors={colors} />
        <FormField label="10th School Name *" value={form.tenthSchoolName} onChangeText={(v) => setField("tenthSchoolName", v)} error={errors.tenthSchoolName} placeholder="Enter school name" colors={colors} />
        <Div colors={colors} />
        {/* 10th Board Picker */}
        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>10th Board *</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: errors.tenthBoard ? colors.destructive : colors.border, backgroundColor: colors.background }]}
            onPress={() => setBoardPickerFor("tenth")}
          >
            <Text style={[styles.pickerBtnText, { color: form.tenthBoard ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {form.tenthBoard || "Select board"}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {errors.tenthBoard ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.tenthBoard}</Text> : null}
        </View>
        <Div colors={colors} />
        <FormField
          label="12th Pass Year *"
          value={form.twelfthPassYear}
          onChangeText={(v) => setField("twelfthPassYear", v.replace(/\D/g, "").slice(0, 4))}
          error={errors.twelfthPassYear}
          placeholder={`e.g. ${new Date().getFullYear() - 6}`}
          colors={colors}
          keyboardType="number-pad"
        />
        <Div colors={colors} />
        <FormField label="12th School Name *" value={form.twelfthSchoolName} onChangeText={(v) => setField("twelfthSchoolName", v)} error={errors.twelfthSchoolName} placeholder="Enter school name" colors={colors} />
        <Div colors={colors} />
        {/* 12th Board Picker */}
        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>12th Board *</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: errors.twelfthBoard ? colors.destructive : colors.border, backgroundColor: colors.background }]}
            onPress={() => setBoardPickerFor("twelfth")}
          >
            <Text style={[styles.pickerBtnText, { color: form.twelfthBoard ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {form.twelfthBoard || "Select board"}
            </Text>
            <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {errors.twelfthBoard ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.twelfthBoard}</Text> : null}
        </View>
      </View>

      <View style={styles.gap} />

      {/* Mandatory Documents */}
      <SectionTitle label="Mandatory Documents" colors={colors} />
      <DocSection
        fields={MANDATORY_DOCS}
        files={files}
        errors={errors}
        colors={colors}
        onPick={pickFile}
        onRemove={removeFile}
        mandatory
      />

      <View style={styles.gap} />

      {/* Optional Documents */}
      <SectionTitle label="Optional Documents" colors={colors} />
      <DocSection
        fields={OPTIONAL_DOCS}
        files={files}
        errors={errors}
        colors={colors}
        onPick={pickFile}
        onRemove={removeFile}
        mandatory={false}
      />

      <View style={styles.gap} />

      <TouchableOpacity
        style={[styles.submitBtn, { backgroundColor: colors.primary, opacity: isSubmitting ? 0.7 : 1 }]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Feather name="user-plus" size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Add Student</Text>
          </>
        )}
      </TouchableOpacity>

      <BoardPickerModal
        visible={boardPickerFor !== null}
        onClose={() => setBoardPickerFor(null)}
        onSelect={(v) => {
          if (boardPickerFor === "tenth") {
            setField("tenthBoard", v);
          } else if (boardPickerFor === "twelfth") {
            setField("twelfthBoard", v);
          }
        }}
        currentValue={boardPickerFor === "tenth" ? form.tenthBoard : form.twelfthBoard}
        colors={colors}
      />
    </ScrollView>
  );
}

// ─── DocSection ──────────────────────────────────────────────────────
function DocSection({ fields, files, errors, colors, onPick, onRemove, mandatory }: {
  fields: string[]; files: Record<string, PickedFile>; errors: Record<string, string>;
  colors: any; onPick: (f: string) => void; onRemove: (f: string) => void; mandatory: boolean;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {fields.map((field, idx) => {
        const picked = files[field];
        const hasError = !!errors[`doc_${field}`];
        const isLast = idx === fields.length - 1;
        return (
          <View key={field}>
            <TouchableOpacity style={styles.docRow} onPress={() => onPick(field)} activeOpacity={0.7}>
              <View style={[styles.docIcon, { backgroundColor: picked ? "#D1FAE5" : hasError ? "#FEE2E2" : colors.muted }]}>
                <Feather
                  name={picked ? "check-circle" : (IMAGE_FIELDS.has(field) ? "image" : "file-text")}
                  size={16}
                  color={picked ? "#065F46" : hasError ? colors.destructive : colors.mutedForeground}
                />
              </View>
              <View style={styles.docInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.docLabel, { color: colors.foreground }]}>{FILE_LABELS[field]}</Text>
                  {mandatory && !picked && (
                    <View style={[styles.requiredBadge, { backgroundColor: hasError ? "#FEE2E2" : "#FEF3C7" }]}>
                      <Text style={[styles.requiredText, { color: hasError ? "#991B1B" : "#92400E" }]}>Required</Text>
                    </View>
                  )}
                  {!mandatory && (
                    <View style={[styles.requiredBadge, { backgroundColor: "#F0FDF4" }]}>
                      <Text style={[styles.requiredText, { color: "#166534" }]}>Optional</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.docSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {picked ? picked.name : (IMAGE_FIELDS.has(field) ? "Tap to pick image" : "Tap to pick PDF or image")}
                </Text>
                {hasError ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors[`doc_${field}`]}</Text> : null}
              </View>
              {picked ? (
                <TouchableOpacity
                  style={[styles.removeBtn, { backgroundColor: "#FEE2E2" }]}
                  onPress={() => onRemove(field)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={14} color={colors.destructive} />
                </TouchableOpacity>
              ) : (
                <Feather name="plus" size={16} color={colors.mutedForeground} />
              )}
            </TouchableOpacity>
            {!isLast && <Div colors={colors} />}
          </View>
        );
      })}
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────
function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>;
}
function Div({ colors }: { colors: any }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}
function FormField({
  label, value, onChangeText, error, placeholder, colors, keyboardType, multiline, autoCapitalize,
}: {
  label: string; value: string; onChangeText: (v: string) => void; error?: string;
  placeholder: string; colors: any; keyboardType?: any; multiline?: boolean; autoCapitalize?: any;
}) {
  return (
    <View style={styles.formField}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, { color: colors.foreground, borderColor: error ? colors.destructive : "transparent" }, multiline && { height: 72, textAlignVertical: "top" }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType ?? "default"}
        autoCapitalize={autoCapitalize ?? (keyboardType === "email-address" ? "none" : "words")}
        autoCorrect={false}
        multiline={multiline}
      />
      {error ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, marginBottom: 16 },
  offlineText: { fontSize: 13, fontWeight: "500", flex: 1 },
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginBottom: 8, paddingLeft: 4 },
  gap: { height: 24 },
  card: { borderRadius: 14, borderWidth: 1, overflow: "hidden", shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  divider: { height: 1 },
  formField: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: "500" },
  fieldInput: { fontSize: 15, paddingVertical: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 2 },
  fieldError: { fontSize: 11 },
  dateBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  dateBtnText: { fontSize: 15 },
  pickerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  pickerBtnText: { fontSize: 15, flex: 1 },
  docRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, paddingHorizontal: 16 },
  docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  docInfo: { flex: 1 },
  docLabel: { fontSize: 14, fontWeight: "500" },
  docSub: { fontSize: 11, marginTop: 2 },
  requiredBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  requiredText: { fontSize: 10, fontWeight: "600" },
  removeBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 14 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
