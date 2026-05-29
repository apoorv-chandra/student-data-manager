import mongoose from "mongoose";
import { logger } from "./logger";

let isConnected = false;

export async function connectDB(): Promise<void> {
  if (isConnected) return;

  const uri = process.env["MONGODB_URI"];
  if (!uri) throw new Error("MONGODB_URI environment variable is required");

  await mongoose.connect(uri, { dbName: "studentdb" });
  isConnected = true;
  logger.info("Connected to MongoDB");
}

export { mongoose };
