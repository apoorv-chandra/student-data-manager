import { Router } from "express";
import multer from "multer";
import { Student } from "../models/Student";
import { Teacher } from "../models/Teacher";
import { requireAuth } from "../middlewares/auth";
import { compressFile } from "../lib/compress";
import { uploadToGridFS, deleteFromGridFS } from "../lib/gridfs";
import { createSheetForTeacher, appendStudentRow, updateStudentRow, deleteStudentRow } from "../lib/sheets";
import { z } from "zod";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const FILE_FIELDS = [
  "photo", "signature", "tenthMarksheet", "twelfthMarksheet",
  "graduationMarksheet", "pgMarksheet", "incomeCertificate",
  "casteCertificate", "domicileCertificate", "affidavit",
  "aadhaarFront", "aadhaarBack",
];

const studentSchema = z.object({
  name: z.string().min(1),
  fathersName: z.string().min(1),
  dateOfBirth: z.string().min(1),
  tenthPassYear: z.string().min(1),
  twelfthPassYear: z.string().min(1),
  mobile: z.string().regex(/^\d{10}$/, "Mobile must be 10 digits"),
  email: z.string().email("Invalid email format"),
});

function getBaseUrl(req: any): string {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}`;
}

async function processFiles(files: Record<string, Express.Multer.File[]>): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  for (const field of FILE_FIELDS) {
    const fileArr = files[field];
    if (fileArr && fileArr.length > 0) {
      const file = fileArr[0];
      const compressed = await compressFile(file.buffer, file.mimetype);
      const fileId = await uploadToGridFS(compressed, file.originalname, file.mimetype);
      result[field] = {
        fileId,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: compressed.length,
      };
    }
  }
  return result;
}

router.use(requireAuth);

// List students with pagination + search
router.get("/", async (req, res) => {
  const user = (req as any).user;
  const page = Math.max(1, parseInt(req.query["page"] as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query["limit"] as string) || 20));
  const search = (req.query["search"] as string || "").trim();

  const query: any = { teacherId: user._id };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { fathersName: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
    ];
  }

  const [students, total] = await Promise.all([
    Student.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Student.countDocuments(query),
  ]);

  res.json({
    students: students.map((s) => ({ ...s, id: s._id.toString() })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// Create student
router.post(
  "/",
  upload.fields(FILE_FIELDS.map((f) => ({ name: f, maxCount: 1 }))),
  async (req, res) => {
    const user = (req as any).user;
    const parsed = studentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join(", ") });
      return;
    }

    const files = req.files as Record<string, Express.Multer.File[]>;
    const processedFiles = await processFiles(files || {});

    const student = await Student.create({
      teacherId: user._id,
      ...parsed.data,
      files: processedFiles,
    });

    // Google Sheets: create sheet for teacher if first time
    const teacher = await Teacher.findById(user._id);
    if (teacher) {
      let sheetId = teacher.googleSheetId;
      if (!sheetId) {
        try {
          const sheet = await createSheetForTeacher(teacher.name);
          sheetId = sheet.id;
          await Teacher.findByIdAndUpdate(user._id, {
            googleSheetId: sheet.id,
            googleSheetUrl: sheet.url,
          });
          teacher.googleSheetId = sheet.id;
          teacher.googleSheetUrl = sheet.url;
        } catch (e) {
          console.error("Google Sheets create failed:", e);
        }
      }

      if (sheetId) {
        try {
          const baseUrl = getBaseUrl(req);
          const rowIndex = await appendStudentRow(
            { ...student.toObject(), createdAt: student.createdAt },
            sheetId,
            baseUrl
          );
          await Student.findByIdAndUpdate(student._id, { googleSheetRowIndex: rowIndex });
          student.googleSheetRowIndex = rowIndex;
        } catch (e) {
          console.error("Google Sheets append failed:", e);
        }
      }
    }

    res.status(201).json({ ...student.toObject(), id: student._id.toString() });
  }
);

// Get single student
router.get("/:id", async (req, res) => {
  const user = (req as any).user;
  const student = await Student.findOne({ _id: req.params["id"], teacherId: user._id }).lean();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ ...student, id: student._id.toString() });
});

// Update student
router.patch(
  "/:id",
  upload.fields(FILE_FIELDS.map((f) => ({ name: f, maxCount: 1 }))),
  async (req, res) => {
    const user = (req as any).user;
    const student = await Student.findOne({ _id: req.params["id"], teacherId: user._id });
    if (!student) {
      res.status(404).json({ error: "Student not found" });
      return;
    }

    // Validate text fields if provided
    const textFields: any = {};
    const textKeys = ["name", "fathersName", "dateOfBirth", "tenthPassYear", "twelfthPassYear", "mobile", "email"];
    for (const key of textKeys) {
      if (req.body[key] !== undefined) textFields[key] = req.body[key];
    }

    // Process new files, delete old GridFS entries for replaced files
    const files = req.files as Record<string, Express.Multer.File[]>;
    const processedFiles: Record<string, any> = {};
    for (const field of FILE_FIELDS) {
      const fileArr = files?.[field];
      if (fileArr && fileArr.length > 0) {
        const oldFile = (student.files as any)[field];
        if (oldFile?.fileId) {
          try { await deleteFromGridFS(oldFile.fileId); } catch {}
        }
        const file = fileArr[0];
        const compressed = await compressFile(file.buffer, file.mimetype);
        const fileId = await uploadToGridFS(compressed, file.originalname, file.mimetype);
        processedFiles[`files.${field}`] = {
          fileId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: compressed.length,
        };
      }
    }

    const updateData: any = { ...textFields, ...processedFiles };
    const updated = await Student.findByIdAndUpdate(student._id, { $set: updateData }, { new: true }).lean();

    // Update Google Sheet row
    const teacher = await Teacher.findById(user._id);
    if (teacher?.googleSheetId && updated?.googleSheetRowIndex) {
      try {
        const baseUrl = getBaseUrl(req);
        await updateStudentRow(updated, teacher.googleSheetId, updated.googleSheetRowIndex, baseUrl);
      } catch (e) {
        console.error("Google Sheets update failed:", e);
      }
    }

    res.json({ ...updated, id: (updated as any)._id.toString() });
  }
);

// Delete student
router.delete("/:id", async (req, res) => {
  const user = (req as any).user;
  const student = await Student.findOne({ _id: req.params["id"], teacherId: user._id });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  // Delete all GridFS files
  for (const field of FILE_FIELDS) {
    const f = (student.files as any)[field];
    if (f?.fileId) {
      try { await deleteFromGridFS(f.fileId); } catch {}
    }
  }

  // Delete Google Sheet row
  const teacher = await Teacher.findById(user._id);
  if (teacher?.googleSheetId && student.googleSheetRowIndex) {
    try {
      await deleteStudentRow(teacher.googleSheetId, student.googleSheetRowIndex);
    } catch (e) {
      console.error("Google Sheets delete failed:", e);
    }
  }

  await Student.findByIdAndDelete(student._id);
  res.json({ message: "Student deleted successfully" });
});

export default router;
