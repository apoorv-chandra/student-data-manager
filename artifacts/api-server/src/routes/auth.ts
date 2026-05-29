import { Router } from "express";
import bcrypt from "bcryptjs";
import { Teacher } from "../models/Teacher";
import { signToken } from "../lib/jwt";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  // Check super admin env credentials
  const superEmail = process.env["SUPER_ADMIN_EMAIL"];
  const superPass = process.env["SUPER_ADMIN_PASSWORD"];
  if (email === superEmail && password === superPass) {
    let admin = await Teacher.findOne({ email: superEmail });
    if (!admin) {
      const hash = await bcrypt.hash(superPass!, 10);
      admin = await Teacher.create({
        name: "Super Admin",
        email: superEmail,
        mobile: "0000000000",
        passwordHash: hash,
        role: "superadmin",
        isActive: true,
        requiresPasswordChange: false,
      });
    }
    const token = signToken({ id: admin._id.toString(), email: admin.email, role: admin.role });
    res.json({
      token,
      teacher: {
        id: admin._id.toString(),
        name: admin.name,
        email: admin.email,
        mobile: admin.mobile,
        role: admin.role,
        isActive: admin.isActive,
        googleSheetUrl: admin.googleSheetUrl ?? null,
      },
      requiresPasswordChange: false,
    });
    return;
  }

  const teacher = await Teacher.findOne({ email: email.toLowerCase() });
  if (!teacher) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  if (!teacher.isActive) {
    res.status(401).json({ error: "Your account has been deactivated. Contact your administrator." });
    return;
  }

  const valid = await bcrypt.compare(password, teacher.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const token = signToken({ id: teacher._id.toString(), email: teacher.email, role: teacher.role });
  res.json({
    token,
    teacher: {
      id: teacher._id.toString(),
      name: teacher.name,
      email: teacher.email,
      mobile: teacher.mobile,
      role: teacher.role,
      isActive: teacher.isActive,
      googleSheetUrl: teacher.googleSheetUrl ?? null,
    },
    requiresPasswordChange: teacher.requiresPasswordChange,
  });
});

router.post("/set-password", requireAuth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const user = (req as any).user;
  const hash = await bcrypt.hash(newPassword, 10);
  await Teacher.findByIdAndUpdate(user._id, { passwordHash: hash, requiresPasswordChange: false });
  res.json({ message: "Password updated successfully" });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = (req as any).user;
  res.json({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    role: user.role,
    isActive: user.isActive,
    googleSheetUrl: user.googleSheetUrl ?? null,
  });
});

export default router;
