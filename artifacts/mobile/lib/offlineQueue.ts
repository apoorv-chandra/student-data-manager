import AsyncStorage from "@react-native-async-storage/async-storage";

const QUEUE_KEY = "@offline_student_queue";

export interface QueuedStudent {
  id: string;
  timestamp: number;
  formData: Record<string, string>;
  files: Array<{ field: string; uri: string; name: string; type: string }>;
}

export async function enqueueStudent(
  formData: Record<string, string>,
  files: Array<{ field: string; uri: string; name: string; type: string }>
): Promise<string> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const item: QueuedStudent = { id, timestamp: Date.now(), formData, files };
  const existing = await getQueue();
  existing.push(item);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(existing));
  return id;
}

export async function getQueue(): Promise<QueuedStudent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function removeFromQueue(id: string): Promise<void> {
  const existing = await getQueue();
  const filtered = existing.filter((item) => item.id !== id);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as any)?.message?.toLowerCase() ?? "";
  return (
    msg.includes("network request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("network error") ||
    msg.includes("timeout") ||
    msg.includes("no internet")
  );
}
