import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
  Modal, FlatList,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { X, Check, Calendar, ChevronDown, Save, CheckCircle, Image as ImageIcon, FileText, Upload } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useGetStudent } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useQueryClient } from "@tanstack/react-query";
import { INDIAN_BOARDS } from "@/constants/boards";

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
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function parseDMY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

function validateForm(form: FormState): Record<string, string> {
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
      errs.email = "Allowed: Gmail, Yahoo, Zoho, Rediffmail, Outlook";
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

  return errs;
}

function BoardPickerModal({ visible, onClose, onSelect, currentValue, colors }: {
  visible: boolean; onClose: () => void; onSelect: (v: string) => void;
  currentValue: string; colors: any;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[bpStyles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[bpStyles.title, { color: colors.foreground }]}>Select Board</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={22} color={colors.foreground} />
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
              {currentValue === item && <Check size={18} color={colors.primary} />}
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

export default function EditStudentScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: student, isLoading } = useGetStudent(id ?? "");

  const [form, setFormState] = useState<FormState>({
    name: "", fathersName: "", dateOfBirth: "", address: "",
    aadhaarNumber: "", mobile: "", email: "",
    tenthPassYear: "", tenthSchoolName: "", tenthBoard: "",
    twelfthPassYear: "", twelfthSchoolName: "", twelfthBoard: "",
  });
  const [newFiles, setNewFiles] = useState<Record<string, PickedFile>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerValue, setDatePickerValue] = useState(new Date(2000, 0, 1));
  const [boardPickerFor, setBoardPickerFor] = useState<"tenth" | "twelfth" | null>(null);

  useEffect(() => {
    if (student) {
      const s = student as any;
      setFormState({
        name: s.name ?? "",
        fathersName: s.fathersName ?? "",
        dateOfBirth: s.dateOfBirth ?? "",
        address: s.address ?? "",
        aadhaarNumber: s.aadhaarNumber ?? "",
        mobile: s.mobile ?? "",
        email: s.email ?? "",
        tenthPassYear: s.tenthPassYear ?? "",
        tenthSchoolName: s.tenthSchoolName ?? "",
        tenthBoard: s.tenthBoard ?? "",
        twelfthPassYear: s.twelfthPassYear ?? "",
        twelfthSchoolName: s.twelfthSchoolName ?? "",
        twelfthBoard: s.twelfthBoard ?? "",
      });
      if (s.dateOfBirth) {
        const d = parseDMY(s.dateOfBirth);
        if (d) setDatePickerValue(d);
      }
    }
  }, [student]);

  function setField(key: keyof FormState, value: string) {
    setFormState((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: "" }));
  }

  function onDateChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== "ios") {
      setShowDatePicker(false);
      if (event.type !== "set") return;
    }
    if (selected) {
      setDatePickerValue(selected);
      setField("dateOfBirth", formatDateDMY(selected));
    }
  }

  async function pickImageForField(field: string) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], quality: 0.85, allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split(".").pop() ?? "jpg";
      setNewFiles((f) => ({ ...f, [field]: { uri: asset.uri, name: `${field}.${ext}`, type: asset.mimeType ?? `image/${ext}` } }));
    }
  }

  async function pickPdfForField(field: string) {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setNewFiles((f) => ({ ...f, [field]: { uri: asset.uri, name: asset.name ?? field, type: asset.mimeType ?? "application/pdf" } }));
      }
    } catch {
      Alert.alert("PDF Picker Unavailable", "Please use 'Pick Image' instead.");
    }
  }

  async function pickFile(field: string) {
    if (IMAGE_FIELDS.has(field)) {
      await pickImageForField(field);
    } else {
      if (Platform.OS === "web") {
        Alert.alert("Web Mode", "Use the mobile app for document uploads.");
        return;
      }
      Alert.alert(
        FILE_LABELS[field] ?? "Upload Document",
        "How would you like to upload?",
        [
          { text: "Pick Image from Gallery", onPress: () => pickImageForField(field) },
          { text: "Pick PDF File", onPress: () => pickPdfForField(field) },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  }

  async function handleSubmit() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      Alert.alert("Validation Error", "Please fix the highlighted fields.");
      return;
    }
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
      Alert.alert("Error", err?.message ?? "Update failed. Check your connection.");
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

  const existingFiles = (student as any)?.files as Record<string, any> ?? {};
  const today = new Date();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16, paddingTop: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Personal Details */}
      <SectionTitle label="Personal Details" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FormField label="Full Name *" value={form.name} onChangeText={(v) => setField("name", v)} error={errors.name} placeholder="Full name" colors={colors} />
        <Div colors={colors} />
        <FormField label="Father's Name *" value={form.fathersName} onChangeText={(v) => setField("fathersName", v)} error={errors.fathersName} placeholder="Father's name" colors={colors} />
        <Div colors={colors} />
        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Date of Birth *</Text>
          <TouchableOpacity
            style={[styles.dateBtn, { borderColor: errors.dateOfBirth ? colors.destructive : colors.border, backgroundColor: colors.background }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Calendar size={16} color={colors.mutedForeground} />
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
        <FormField label="Address" value={form.address} onChangeText={(v) => setField("address", v)} error={errors.address} placeholder="Full address" colors={colors} multiline />
        <Div colors={colors} />
        <FormField
          label="Aadhaar Number (12 digits)"
          value={form.aadhaarNumber}
          onChangeText={(v) => setField("aadhaarNumber", v.replace(/\D/g, "").slice(0, 12))}
          error={errors.aadhaarNumber}
          placeholder="12-digit Aadhaar number"
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

      <View style={{ height: 24 }} />

      {/* Academic Details */}
      <SectionTitle label="Academic Details" colors={colors} />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FormField
          label="10th Pass Year *"
          value={form.tenthPassYear}
          onChangeText={(v) => setField("tenthPassYear", v.replace(/\D/g, "").slice(0, 4))}
          error={errors.tenthPassYear}
          placeholder="e.g. 2018"
          colors={colors}
          keyboardType="number-pad"
        />
        <Div colors={colors} />
        <FormField label="10th School Name *" value={form.tenthSchoolName} onChangeText={(v) => setField("tenthSchoolName", v)} error={errors.tenthSchoolName} placeholder="Enter school name" colors={colors} />
        <Div colors={colors} />
        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>10th Board *</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: errors.tenthBoard ? colors.destructive : colors.border, backgroundColor: colors.background }]}
            onPress={() => setBoardPickerFor("tenth")}
          >
            <Text style={[styles.pickerBtnText, { color: form.tenthBoard ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {form.tenthBoard || "Select board"}
            </Text>
            <ChevronDown size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {errors.tenthBoard ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.tenthBoard}</Text> : null}
        </View>
        <Div colors={colors} />
        <FormField
          label="12th Pass Year *"
          value={form.twelfthPassYear}
          onChangeText={(v) => setField("twelfthPassYear", v.replace(/\D/g, "").slice(0, 4))}
          error={errors.twelfthPassYear}
          placeholder="e.g. 2020"
          colors={colors}
          keyboardType="number-pad"
        />
        <Div colors={colors} />
        <FormField label="12th School Name *" value={form.twelfthSchoolName} onChangeText={(v) => setField("twelfthSchoolName", v)} error={errors.twelfthSchoolName} placeholder="Enter school name" colors={colors} />
        <Div colors={colors} />
        <View style={styles.formField}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>12th Board *</Text>
          <TouchableOpacity
            style={[styles.pickerBtn, { borderColor: errors.twelfthBoard ? colors.destructive : colors.border, backgroundColor: colors.background }]}
            onPress={() => setBoardPickerFor("twelfth")}
          >
            <Text style={[styles.pickerBtnText, { color: form.twelfthBoard ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
              {form.twelfthBoard || "Select board"}
            </Text>
            <ChevronDown size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
          {errors.twelfthBoard ? <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors.twelfthBoard}</Text> : null}
        </View>
      </View>

      <View style={{ height: 24 }} />

      {/* Mandatory Documents */}
      <SectionTitle label="Mandatory Documents" colors={colors} />
      <DocSection
        fields={MANDATORY_DOCS}
        newFiles={newFiles}
        existingFiles={existingFiles}
        errors={errors}
        colors={colors}
        onPick={pickFile}
        onRemoveNew={(field) => setNewFiles((f) => { const c = { ...f }; delete c[field]; return c; })}
        mandatory
      />

      <View style={{ height: 24 }} />

      {/* Optional Documents */}
      <SectionTitle label="Optional Documents" colors={colors} />
      <DocSection
        fields={OPTIONAL_DOCS}
        newFiles={newFiles}
        existingFiles={existingFiles}
        errors={errors}
        colors={colors}
        onPick={pickFile}
        onRemoveNew={(field) => setNewFiles((f) => { const c = { ...f }; delete c[field]; return c; })}
        mandatory={false}
      />

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
            <Save size={18} color="#fff" />
            <Text style={styles.submitBtnText}>Save Changes</Text>
          </>
        )}
      </TouchableOpacity>

      <BoardPickerModal
        visible={boardPickerFor !== null}
        onClose={() => setBoardPickerFor(null)}
        onSelect={(v) => {
          if (boardPickerFor === "tenth") setField("tenthBoard", v);
          else if (boardPickerFor === "twelfth") setField("twelfthBoard", v);
        }}
        currentValue={boardPickerFor === "tenth" ? form.tenthBoard : form.twelfthBoard}
        colors={colors}
      />
    </ScrollView>
  );
}

function DocSection({ fields, newFiles, existingFiles, errors, colors, onPick, onRemoveNew, mandatory }: {
  fields: string[]; newFiles: Record<string, PickedFile>; existingFiles: Record<string, any>;
  errors: Record<string, string>; colors: any; onPick: (f: string) => void;
  onRemoveNew: (f: string) => void; mandatory: boolean;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {fields.map((field, idx) => {
        const existing = existingFiles[field];
        const newFile = newFiles[field];
        const hasFile = !!newFile || !!existing?.fileId;
        const hasError = !!errors[`doc_${field}`];
        const isLast = idx === fields.length - 1;
        return (
          <View key={field}>
            <TouchableOpacity style={styles.docRow} onPress={() => onPick(field)} activeOpacity={0.7}>
              <View style={[styles.docIcon, { backgroundColor: hasFile ? "#D1FAE5" : hasError ? "#FEE2E2" : colors.muted }]}>
                {hasFile ? (
                  <CheckCircle size={16} color="#065F46" />
                ) : IMAGE_FIELDS.has(field) ? (
                  <ImageIcon size={16} color={hasError ? colors.destructive : colors.mutedForeground} />
                ) : (
                  <FileText size={16} color={hasError ? colors.destructive : colors.mutedForeground} />
                )}
              </View>
              <View style={styles.docInfo}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[styles.docLabel, { color: colors.foreground }]}>{FILE_LABELS[field]}</Text>
                  {mandatory && !hasFile && (
                    <View style={[styles.badge, { backgroundColor: hasError ? "#FEE2E2" : "#FEF3C7" }]}>
                      <Text style={[styles.badgeText, { color: hasError ? "#991B1B" : "#92400E" }]}>Required</Text>
                    </View>
                  )}
                  {!mandatory && (
                    <View style={[styles.badge, { backgroundColor: "#F0FDF4" }]}>
                      <Text style={[styles.badgeText, { color: "#166534" }]}>Optional</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.docSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {newFile ? `New: ${newFile.name}` : existing?.fileId ? existing.originalName : "Not uploaded"}
                </Text>
              </View>
              {newFile ? (
                <TouchableOpacity
                  style={[styles.removeBtn, { backgroundColor: "#FEE2E2" }]}
                  onPress={() => onRemoveNew(field)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={14} color={colors.destructive} />
                </TouchableOpacity>
              ) : (
                <Upload size={16} color={colors.mutedForeground} />
              )}
            </TouchableOpacity>
            {!isLast && <Div colors={colors} />}
          </View>
        );
      })}
    </View>
  );
}

function SectionTitle({ label, colors }: { label: string; colors: any }) {
  return <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>;
}
function Div({ colors }: { colors: any }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}
function FormField({ label, value, onChangeText, error, placeholder, colors, keyboardType, multiline, autoCapitalize }: {
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
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.8, marginBottom: 8, paddingLeft: 4 },
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
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: "600" },
  removeBtn: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 54, borderRadius: 14 },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
