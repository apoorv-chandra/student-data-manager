import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Search, Plus, Paperclip, ChevronRight, ChevronLeft, WifiOff, Users, RefreshCw } from "lucide-react-native";
import { useListStudents } from "@workspace/api-client-react";
import type { Student } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

const PAGE_SIZE = 20;

export default function StudentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  function handleSearch(text: string) {
    setSearch(text);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 400);
  }

  const { data, isLoading, isError, refetch } = useListStudents(
    { page, limit: PAGE_SIZE, search: debouncedSearch || undefined },
    { query: { queryKey: ["students", page, debouncedSearch] } }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const students = data?.students ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  function renderStudent({ item }: { item: Student }) {
    const initials = item.name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();

    const fileCount = Object.values(item.files ?? {}).filter(Boolean).length;

    return (
      <TouchableOpacity
        style={[styles.studentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(`/student/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View style={styles.studentInfo}>
          <Text style={[styles.studentName, { color: colors.foreground }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.addedByName ? (
            <Text style={[styles.studentSub, { color: "#16a34a" }]} numberOfLines={1}>
              Added by: {item.addedByName}
            </Text>
          ) : null}
          <Text style={[styles.studentSub, { color: colors.mutedForeground }]} numberOfLines={1}>
            Father: {item.fathersName}
          </Text>
          <Text style={[styles.studentSub, { color: colors.mutedForeground }]}>
            {item.mobile}
          </Text>
        </View>
        <View style={styles.studentRight}>
          <View style={[styles.fileBadge, { backgroundColor: fileCount > 0 ? colors.accent : colors.muted }]}>
            <Paperclip size={11} color={fileCount > 0 ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.fileBadgeText, { color: fileCount > 0 ? colors.primary : colors.mutedForeground }]}>
              {fileCount}/12
            </Text>
          </View>
          <ChevronRight size={18} color={colors.mutedForeground} style={{ marginTop: 8 }} />
        </View>
      </TouchableOpacity>
    );
  }

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Students</Text>
            {total > 0 && (
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{total} total</Text>
            )}
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: colors.muted }]}
              onPress={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={18} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/student/add")}
              testID="add-student-btn"
            >
              <Plus size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Search size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            value={search}
            onChangeText={handleSearch}
            placeholder="Search name, father, mobile..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {isLoading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <WifiOff size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Connection Error</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Check your internet and try again</Text>
          <TouchableOpacity style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(s) => s.id}
          renderItem={renderStudent}
          contentContainerStyle={[
            styles.list,
            students.length === 0 && styles.listEmpty,
            { paddingBottom: Math.max(insets.bottom, 20) + 80 },
          ]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          scrollEnabled={!!students.length}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Users size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                {debouncedSearch ? "No results found" : "No students yet"}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {debouncedSearch ? "Try a different search" : "Tap + to add your first student"}
              </Text>
            </View>
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.muted, opacity: page <= 1 ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={18} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={[styles.pageText, { color: colors.mutedForeground }]}>
                  Page {page} of {totalPages}
                </Text>
                <TouchableOpacity
                  style={[styles.pageBtn, { backgroundColor: colors.muted, opacity: page >= totalPages ? 0.4 : 1 }]}
                  onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight size={18} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerTitle: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, height: 42, gap: 8 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  list: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  listEmpty: { flex: 1 },
  studentCard: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 12, borderWidth: 1, gap: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  avatar: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  studentInfo: { flex: 1, gap: 2 },
  studentName: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  studentSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  studentRight: { alignItems: "flex-end" },
  fileBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  fileBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium", fontWeight: "500" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: "600", fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 40 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", fontWeight: "600" },
  pagination: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, padding: 20 },
  pageBtn: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pageText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
