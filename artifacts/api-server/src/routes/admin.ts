import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Teacher } from "../models/Teacher";
import { Student } from "../models/Student";
import { requireAuth } from "../middlewares/auth";
import { requireSuperAdmin } from "../middlewares/auth";

const router = Router();
router.use(requireAuth, requireSuperAdmin);

// List all teachers with student counts
router.get("/", async (_req, res) => {
  const teachers = await Teacher.find({ role: "teacher" }).lean();
  const teacherIds = teachers.map((t) => t._id);
  const counts = await Student.aggregate([
    { $match: { teacherId: { $in: teacherIds } } },
    { $group: { _id: "$teacherId", count: { $sum: 1 } } },
  ]);
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c._id.toString()] = c.count;

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
    })),
    total: teachers.length,
  });
});

// Create a teacher
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
  });

  res.status(201).json({
    teacher: {
      id: teacher._id.toString(),
      name: teacher.name,
      email: teacher.email,
      mobile: teacher.mobile,
      role: teacher.role,
      isActive: teacher.isActive,
      googleSheetUrl: null,
      studentCount: 0,
      createdAt: teacher.createdAt,
    },
    tempPassword,
  });
});

// Toggle teacher active/inactive
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
