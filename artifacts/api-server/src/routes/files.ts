import { Router } from "express";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const archiver = _require("archiver") as typeof import("archiver");
import { Student } from "../models/Student";
import { requireAuth } from "../middlewares/auth";
import { streamFromGridFS, getGridFSFileInfo } from "../lib/gridfs";

const router = Router();

const FILE_FIELDS = [
  "photo", "signature", "tenthMarksheet", "twelfthMarksheet",
  "graduationMarksheet", "pgMarksheet", "incomeCertificate",
  "casteCertificate", "domicileCertificate", "affidavit",
  "aadhaarFront", "aadhaarBack",
];

// Stream a single file
router.get("/files/:fileId", requireAuth, async (req, res) => {
  const { fileId } = req.params;
  try {
    const info = await getGridFSFileInfo(fileId);
    if (!info) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", info.metadata?.contentType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${info.filename}"`);
    const stream = streamFromGridFS(fileId);
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Download all student files as ZIP
router.get("/students/:id/zip", requireAuth, async (req, res) => {
  const user = (req as any).user;
  const student = await Student.findOne({ _id: req.params["id"], teacherId: user._id }).lean();
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const archive = archiver("zip", { zlib: { level: 6 } });
  const studentName = student.name.replace(/[^a-zA-Z0-9_\- ]/g, "_");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${studentName}_documents.zip"`);
  archive.pipe(res);

  for (const field of FILE_FIELDS) {
    const f = (student.files as any)[field];
    if (f?.fileId) {
      try {
        const stream = streamFromGridFS(f.fileId);
        archive.append(stream, { name: `${field}_${f.originalName}` });
      } catch {}
    }
  }

  await archive.finalize();
});

export default router;
