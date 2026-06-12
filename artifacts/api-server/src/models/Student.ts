import { mongoose } from "../lib/mongoose";

const studentFileSchema = new mongoose.Schema(
  {
    fileId: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const studentSchema = new mongoose.Schema(
  {
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    name: { type: String, required: true },
    fathersName: { type: String, required: true },
    dateOfBirth: { type: String, required: true },
    address: { type: String, default: "" },
    aadhaarNumber: { type: String, default: "" },
    mobile: { type: String, required: true },
    email: { type: String, required: true },
    tenthPassYear: { type: String, required: true },
    tenthSchoolName: { type: String, default: "" },
    tenthBoard: { type: String, default: "" },
    twelfthPassYear: { type: String, required: true },
    twelfthSchoolName: { type: String, default: "" },
    twelfthBoard: { type: String, default: "" },
    department: { type: String, default: "" },
    course: { type: String, default: "" },
    subjects: { type: String, default: "" },
    addedByName: { type: String, default: "" },
    addedById: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
    updatedByName: { type: String, default: "" },
    updatedById: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", default: null },
    googleSheetRowIndex: { type: Number, default: null },
    files: {
      photo: { type: studentFileSchema, default: null },
      signature: { type: studentFileSchema, default: null },
      tenthMarksheet: { type: studentFileSchema, default: null },
      twelfthMarksheet: { type: studentFileSchema, default: null },
      graduationMarksheet: { type: studentFileSchema, default: null },
      pgMarksheet: { type: studentFileSchema, default: null },
      incomeCertificate: { type: studentFileSchema, default: null },
      casteCertificate: { type: studentFileSchema, default: null },
      domicileCertificate: { type: studentFileSchema, default: null },
      affidavit: { type: studentFileSchema, default: null },
      aadhaarFront: { type: studentFileSchema, default: null },
      aadhaarBack: { type: studentFileSchema, default: null },
    },
  },
  { timestamps: true }
);

studentSchema.index({ teacherId: 1 });
studentSchema.index({ name: "text", fathersName: "text", mobile: "text" });

export const Student = mongoose.model("Student", studentSchema);
