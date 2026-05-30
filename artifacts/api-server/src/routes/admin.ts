import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Teacher } from "../models/Teacher";
import { Student } from "../models/Student";
import { Config } from "../models/Config";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth";
import { addTeacherTab, getMasterSheetUrl } from "../lib/sheets";
import { logger } from "../lib/logger";
import { google } from "googleapis";

const router = Router();
router.use(requireAuth, requireSuperAdmin);

// Get master sheet info + service account email
router.get("/master-sheet", async (_req, res) => {
  const masterSheetUrl = await getMasterSheetUrl().catch(() => null);
  let serviceAccountEmail: string | null = null;
  try {
    const b64 = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
    if (b64) {
      const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
      serviceAccountEmail = creds.client_email ?? null;
    }
  } catch {}
  res.json({ masterSheetUrl, serviceAccountEmail });
});

// Manually set master sheet by pasting a Google Sheets URL or ID
router.post("/master-sheet", async (req, res) => {
  const { spreadsheetUrl } = req.body;
  if (!spreadsheetUrl) {
    res.status(400).json({ error: "spreadsheetUrl is required" });
    return;
  }
  // Extract spreadsheet ID from URL or use as-is
  const match = String(spreadsheetUrl).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const spreadsheetId = match ? match[1] : String(spreadsheetUrl).trim();
  if (!spreadsheetId) {
    res.status(400).json({ error: "Could not extract spreadsheet ID from URL" });
    return;
  }

  // Verify service account has access by reading the sheet
  try {
    const b64 = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"];
    if (!b64) throw new Error("Service account not configured");
    const creds = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.get({ spreadsheetId });
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message ?? e?.message ?? "Cannot access sheet";
    res.status(400).json({
      error: `Cannot access spreadsheet: ${msg}. Make sure you have shared the sheet with the service account email (Editor access).`,
    });
    return;
  }

  await Config.findOneAndUpdate(
    { key: "masterSheetId" },
    { value: spreadsheetId },
    { upsert: true }
  );
  logger.info({ spreadsheetId }, "Master sheet ID manually set");
  res.json({
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  });
});

router.get("/", async (_req, res) => {
  const teachers = await Teacher.find({ role: "teacher" }).lean();
  const teacherIds = teachers.map((t) => t._id);
  const counts = await Student.aggregate([
    { $match: { teacherId: { $in: teacherIds } } },
    { $group: { _id: "$teacherId", count: { $sum: 1 } } },
  ]);
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c._id.toString()] = c.count;

  const masterSheetUrl = await getMasterSheetUrl().catch(() => null);

  res.json({
    teachers: teachers.map((t) => ({
      id: t._id.toString(),
      name: t.name,
      email: t.email,
      mobile: t.mobile,
      role: t.role,
      isActive: t.isActive,
      googleSheetUrl: t.googleSheetUrl ?? null,
      studentCount: countMap[t._id.toString()] ?? 0,
      createdAt: t.createdAt,
      initialPassword: (t as any).initialPassword ?? null,
      customPassword: (t as any).customPassword ?? null,
      requiresPasswordChange: t.requiresPasswordChange ?? true,
    })),
    total: teachers.length,
    masterSheetUrl,
  });
});

router.post("/", async (req, res) => {
  const { name, email, mobile } = req.body;
  if (!name || !email || !mobile) {
    res.status(400).json({ error: "Name, email, and mobile are required" });
    return;
  }
  if (!/^\d{10}$/.test(mobile)) {
    res.status(400).json({ error: "Mobile must be 10 digits" });
    return;
  }

  const existing = await Teacher.findOne({ email: email.toLowerCase() });
  if (existing) {
    res.status(409).json({ error: "A teacher with this email already exists" });
    return;
  }

  const tempPassword = crypto.randomBytes(4).toString("hex").toUpperCase();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const teacher = await Teacher.create({
    name,
    email: email.toLowerCase(),
    mobile,
    passwordHash,
    role: "teacher",
    isActive: true,
    requiresPasswordChange: true,
    initialPassword: tempPassword,
  });

  let sheetUrl: string | null = null;
  try {
    const result = await addTeacherTab(name);
    await Teacher.findByIdAndUpdate(teacher._id, {
      googleSheetId: result.spreadsheetId,
      googleSheetUrl: result.url,
      googleSheetTabName: result.tabName,
    });
    sheetUrl = result.url;
    logger.info({ teacherId: teacher._id, tabName: result.tabName }, "Teacher sheet tab created");
  } catch (e) {
    logger.error({ err: e }, "Failed to create Google Sheet tab for teacher");
  }

  res.status(201).json({
    teacher: {
      id: teacher._id.toString(),
      name: teacher.name,
      email: teacher.email,
      mobile: teacher.mobile,
      role: teacher.role,
      isActive: teacher.isActive,
      googleSheetUrl: sheetUrl,
      studentCount: 0,
      createdAt: teacher.createdAt,
      initialPassword: tempPassword,
      customPassword: null,
      requiresPasswordChange: true,
    },
    tempPassword,
  });
});

// Manually create Google Sheet tab for a teacher
router.post("/:id/create-sheet", async (req, res) => {
  const teacher = await Teacher.findOne({ _id: req.params["id"], role: "teacher" });
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  if (teacher.googleSheetId) {
    res.json({
      googleSheetUrl: teacher.googleSheetUrl,
      googleSheetId: teacher.googleSheetId,
      alreadyExists: true,
    });
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
    logger.error({ err: e }, "Failed to create teacher sheet from admin");
    res.status(500).json({ error: e?.message ?? "Failed to create sheet" });
  }
});

router.delete("/:id", async (req, res) => {
  const teacher = await Teacher.findOne({ _id: req.params["id"], role: "teacher" });
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  const studentCount = await Student.countDocuments({ teacherId: teacher._id });
  if (studentCount > 0) {
    res.status(409).json({
      error: `Cannot delete: teacher has ${studentCount} student record${studentCount > 1 ? "s" : ""}. Delete all their students first.`,
      studentCount,
    });
    return;
  }

  await Teacher.findByIdAndDelete(teacher._id);
  res.json({ message: "Teacher deleted successfully" });
});

router.patch("/:id/status", async (req, res) => {
  const { isActive } = req.body;
  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive boolean required" });
    return;
  }
  const teacher = await Teacher.findByIdAndUpdate(
    req.params["id"],
    { isActive },
    { new: true }
  ).lean();
  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  const studentCount = await Student.countDocuments({ teacherId: teacher._id });
  res.json({
    id: teacher._id.toString(),
    name: teacher.name,
    email: teacher.email,
    mobile: teacher.mobile,
    role: teacher.role,
    isActive: teacher.isActive,
    googleSheetUrl: teacher.googleSheetUrl ?? null,
    studentCount,
    createdAt: teacher.createdAt,
  });
});

export default router;
