import { Router } from "express";
import { Teacher } from "../models/Teacher";
import { requireAuth } from "../middlewares/auth";

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

export default router;
