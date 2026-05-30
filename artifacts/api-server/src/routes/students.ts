import { Router } from "express";
import multer from "multer";
import { Student } from "../models/Student";
import { Teacher } from "../models/Teacher";
import { requireAuth } from "../middlewares/auth";
import { compressFile } from "../lib/compress";
import { uploadToGridFS, deleteFromGridFS } from "../lib/gridfs";
import { addTeacherTab, appendStudentRow, updateStudentRow, deleteStudentRow } from "../lib/sheets";
import { z } from "zod";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const FILE_FIELDS = [
  "photo", "signature", "tenthMarksheet", "twelfthMarksheet",
  "graduationMarksheet", "pgMarksheet", "incomeCertificate",
  "casteCertificate", "domicileCertificate", "affidavit",
  "aadhaarFront", "aadhaarBack",
];

const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "yahoo.in", "yahoo.co.in",
  "zoho.com", "rediffmail.com", "outlook.com", "hotmail.com",
  "live.com", "icloud.com",
];

const currentYear = new Date().getFullYear();

const studentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fathersName: z.string().min(1, "Father's name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required").regex(
    /^\d{2}\/\d{2}\/\d{4}$/,
    "Date must be DD/MM/YYYY"
  ),
  address: z.string().optional().default(""),
  aadhaarNumber: z.string().optional().default("").refine(
    (v) => !v || /^\d{12}$/.test(v),
    { message: "Aadhaar must be exactly 12 digits" }
  ),
  mobile: z.string().regex(/^\d{10}$/, "Mobile must be exactly 10 digits"),
  email: z.string().email("Invalid email format").refine(
    (v) => {
      const domain = v.split("@")[1]?.toLowerCase() ?? "";
      return ALLOWED_EMAIL_DOMAINS.includes(domain);
    },
    { message: `Email domain must be one of: ${ALLOWED_EMAIL_DOMAINS.join(", ")}` }
  ),
  tenthPassYear: z.string().regex(/^\d{4}$/, "Year must be 4 digits").refine(
    (v) => {
      const y = parseInt(v);
      return y >= 1970 && y <= currentYear;
    },
    { message: `10th pass year must be between 1970 and ${currentYear}` }
  ),
  tenthSchoolName: z.string().optional().default(""),
  tenthBoard: z.string().optional().default(""),
  twelfthPassYear: z.string().regex(/^\d{4}$/, "Year must be 4 digits").refine(
    (v) => {
      const y = parseInt(v);
      return y >= 1970 && y <= currentYear;
    },
    { message: `12th pass year must be between 1970 and ${currentYear}` }
  ),
  twelfthSchoolName: z.string().optional().default(""),
  twelfthBoard: z.string().optional().default(""),
  department: z.string().optional().default(""),
  course: z.string().optional().default(""),
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
    Student.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Student.countDocuments(query),
  ]);

  res.json({
    students: students.map((s) => ({ ...s, id: s._id.toString() })),
    total, page, limit,
    totalPages: Math.ceil(total / limit),
  });
});

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

    let teacher = await Teacher.findById(user._id);

    // Auto-create Google Sheet tab on first student if not yet set up
    if (teacher && !teacher.googleSheetId && process.env["GOOGLE_SERVICE_ACCOUNT_JSON"]) {
      try {
        const result = await addTeacherTab(teacher.name);
        teacher = await Teacher.findByIdAndUpdate(
          teacher._id,
          { googleSheetId: result.spreadsheetId, googleSheetUrl: result.url, googleSheetTabName: result.tabName },
          { new: true }
        );
      } catch (e) {
        console.error("Google Sheets tab creation failed:", e);
      }
    }

    if (teacher?.googleSheetId && teacher?.googleSheetTabName) {
      try {
        const baseUrl = getBaseUrl(req);
        const rowIndex = await appendStudentRow(
          { ...student.toObject(), createdAt: student.createdAt },
          teacher.googleSheetId,
          teacher.googleSheetTabName,
          baseUrl
        );
        await Student.findByIdAndUpdate(student._id, { googleSheetRowIndex: rowIndex });
        student.googleSheetRowIndex = rowIndex;
      } catch (e) {
        console.error("Google Sheets append failed:", e);
      }
    }

    res.status(201).json({ ...student.toObject(), id: student._id.toString() });
  }
);

router.get("/:id", async (req, res) => {
  const user = (req as any).user;
  const student = await Student.findOne({ _id: req.params["id"], teacherId: user._id }).lean();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  res.json({ ...student, id: student._id.toString() });
});

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

    const textKeys = [
      "name", "fathersName", "dateOfBirth", "address", "aadhaarNumber",
      "mobile", "email", "tenthPassYear", "tenthSchoolName", "tenthBoard",
      "twelfthPassYear", "twelfthSchoolName", "twelfthBoard",
      "department", "course",
    ];
    const textFields: any = {};
    for (const key of textKeys) {
      if (req.body[key] !== undefined) textFields[key] = req.body[key];
    }

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
          fileId, originalName: file.originalname,
          mimeType: file.mimetype, size: compressed.length,
        };
      }
    }

    const updateData: any = { ...textFields, ...processedFiles };
    const updated = await Student.findByIdAndUpdate(student._id, { $set: updateData }, { new: true }).lean();

    const teacher = await Teacher.findById(user._id);
    if (teacher?.googleSheetId && teacher?.googleSheetTabName && updated?.googleSheetRowIndex) {
      try {
        const baseUrl = getBaseUrl(req);
        await updateStudentRow(
          updated, teacher.googleSheetId, teacher.googleSheetTabName,
          updated.googleSheetRowIndex, baseUrl
        );
      } catch (e) {
        console.error("Google Sheets update failed:", e);
      }
    }

    res.json({ ...updated, id: (updated as any)._id.toString() });
  }
);

router.delete("/:id", async (req, res) => {
  const user = (req as any).user;
  const student = await Student.findOne({ _id: req.params["id"], teacherId: user._id });
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  for (const field of FILE_FIELDS) {
    const f = (student.files as any)[field];
    if (f?.fileId) {
      try { await deleteFromGridFS(f.fileId); } catch {}
    }
  }

  const teacher = await Teacher.findById(user._id);
  if (teacher?.googleSheetId && teacher?.googleSheetTabName && student.googleSheetRowIndex) {
    try {
      await deleteStudentRow(teacher.googleSheetId, teacher.googleSheetTabName, student.googleSheetRowIndex);
    } catch (e) {
      console.error("Google Sheets delete failed:", e);
    }
  }

  await Student.findByIdAndDelete(student._id);
  res.json({ message: "Student deleted successfully" });
});

export default router;
