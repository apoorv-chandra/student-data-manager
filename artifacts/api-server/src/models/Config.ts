import { mongoose } from "../lib/mongoose";

const configSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, required: true },
    value: { type: String, required: true },
  },
  { timestamps: true }
);

export const Config = mongoose.model("Config", configSchema);
