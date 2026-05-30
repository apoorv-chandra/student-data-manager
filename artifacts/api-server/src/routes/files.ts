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

// Stream a single file — no auth required (fileId is a 96-bit unguessable ObjectId)
router.get("/files/:fileId", async (req, res) => {
  const { fileId } = req.params;
  try {
    const info = await getGridFSFileInfo(fileId);
    if (!info) {
      res.status(404).json({ error: "File not found" });
      return;
    }
    res.setHeader("Content-Type", info.metadata?.contentType ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${info.filename}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const stream = streamFromGridFS(fileId);
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "File not found" });
  }
});

// Download all student files as ZIP
// Accepts auth via Authorization header OR ?token= query param (for browser Linking.openURL)
router.get("/students/:id/zip", async (req, res) => {
  // Extract token from query param or Authorization header
  let token: string | undefined;
  const authHeader = req.headers["authorization"] as string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (req.query["token"]) {
    token = req.query["token"] as string;
  }

  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Verify the token
  let userId: string;
  try {
    const jwt = await import("jsonwebtoken");
    const secret = process.env["JWT_SECRET"] ?? "secret";
    const payload = jwt.default.verify(token, secret) as any;
    userId = payload.id ?? payload._id ?? payload.sub;
    if (!userId) throw new Error("No user id");
  } catch {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const student = await Student.findOne({ _id: req.params["id"], teacherId: userId }).lean();
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
