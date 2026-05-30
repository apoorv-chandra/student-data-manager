import { Router } from "express";
import { Teacher } from "../models/Teacher";
import { requireAuth } from "../middlewares/auth";
import { addTeacherTab } from "../lib/sheets";

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
    res.status(500).json({ error: e?.message ?? "Failed to create sheet" });
  }
});

export default router;
