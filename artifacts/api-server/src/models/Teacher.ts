import { mongoose } from "../lib/mongoose";

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    mobile: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["teacher", "superadmin"], default: "teacher" },
    isActive: { type: Boolean, default: true },
    requiresPasswordChange: { type: Boolean, default: true },
    googleSheetId: { type: String, default: null },
    googleSheetUrl: { type: String, default: null },
    googleSheetTabName: { type: String, default: null },
  },
  { timestamps: true }
);

export const Teacher = mongoose.model("Teacher", teacherSchema);
