import { Router } from "express";
import { Teacher } from "../models/Teacher";
import { requireAuth } from "../middlewares/auth";
import { addTeacherTab } from "../lib/sheets";
import { logger } from "../lib/logger";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const user = (req as any).user;
  const teacher = await Teacher.findById(user._id).lean();
  res.json({
    googleSheetUrl: teacher?.googleSheetUrl ?? null,
    googleSheetId: teacher?.googleSheetId ?? null,
  });
});

// Manually trigger Google Sheet creation for this teacher
router.post("/create-sheet", async (req, res) => {
  const user = (req as any).user;
  const teacher = await Teacher.findById(user._id);
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  if (teacher.googleSheetId) {
    res.json({ googleSheetUrl: teacher.googleSheetUrl, googleSheetId: teacher.googleSheetId });
    return;
  }
  try {
    const result = await addTeacherTab(teacher.name);
    await Teacher.findByIdAndUpdate(teacher._id, {
      googleSheetId: result.spreadsheetId,
      googleSheetUrl: result.url,
      googleSheetTabName: result.tabName,
    });
    res.json({ googleSheetUrl: result.url, googleSheetId: result.spreadsheetId });
  } catch (e: any) {
    const detail = e?.response?.data ?? e?.errors ?? e?.message ?? "Failed to create sheet";
    logger.error({ err: e, detail }, "Google Sheets create-sheet failed");
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
    res.status(500).json({ error: msg });
  }
});

// Diagnostic endpoint — checks credentials without creating anything
router.get("/check-google-auth", async (_req, res) => {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
  if (!raw) {
    res.status(500).json({ ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON env var is NOT set" });
    return;
  }
  try {
    const trimmed = raw.trim();
    let jsonStr: string;
    let encoding: string;
    if (trimmed.startsWith("{")) {
      jsonStr = trimmed;
      encoding = "raw-json";
    } else {
      jsonStr = Buffer.from(trimmed, "base64").toString("utf-8");
      encoding = "base64";
    }
    const creds = JSON.parse(jsonStr);
    const privateKey: string = creds.private_key ?? "";
    const fixedKey = privateKey.replace(/\\n/g, "\n");
    const hasBeginMarker = fixedKey.includes("-----BEGIN PRIVATE KEY-----");
    const hasEndMarker = fixedKey.includes("-----END PRIVATE KEY-----");
    const realNewlines = (fixedKey.match(/\n/g) ?? []).length;

    res.json({
      ok: true,
      encoding,
      type: creds.type ?? "missing",
      project_id: creds.project_id ?? "missing",
      client_email: creds.client_email ?? "missing",
      private_key_id: creds.private_key_id ?? "missing",
      private_key_has_begin: hasBeginMarker,
      private_key_has_end: hasEndMarker,
      private_key_real_newlines: realNewlines,
      private_key_length: fixedKey.length,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default router;
