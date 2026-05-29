import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { Teacher } from "../models/Teacher";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    const teacher = await Teacher.findById(payload.id);
    if (!teacher || !teacher.isActive) {
      res.status(401).json({ error: "Account inactive or not found" });
      return;
    }
    (req as any).user = teacher;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (user?.role !== "superadmin") {
    res.status(403).json({ error: "Super admin access required" });
    return;
  }
  next();
}
