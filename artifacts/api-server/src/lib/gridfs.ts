import { mongoose } from "./mongoose";
import { Readable } from "stream";
import type { GridFSBucket } from "mongodb";

let bucket: GridFSBucket | null = null;

export function getGridFSBucket(): GridFSBucket {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, {
      bucketName: "uploads",
    });
  }
  return bucket;
}

export async function uploadToGridFS(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  const b = getGridFSBucket();
  return new Promise((resolve, reject) => {
    const uploadStream = b.openUploadStream(filename, { contentType });
    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
    uploadStream.on("finish", () => resolve(uploadStream.id.toString()));
    uploadStream.on("error", reject);
  });
}

export async function downloadFromGridFS(fileId: string): Promise<Buffer> {
  const b = getGridFSBucket();
  const { ObjectId } = mongoose.mongo;
  const downloadStream = b.openDownloadStream(new ObjectId(fileId));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    downloadStream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
    downloadStream.on("error", reject);
  });
}

export async function deleteFromGridFS(fileId: string): Promise<void> {
  const b = getGridFSBucket();
  const { ObjectId } = mongoose.mongo;
  await b.delete(new ObjectId(fileId));
}

export function streamFromGridFS(fileId: string) {
  const b = getGridFSBucket();
  const { ObjectId } = mongoose.mongo;
  return b.openDownloadStream(new ObjectId(fileId));
}

export async function getGridFSFileInfo(fileId: string) {
  const b = getGridFSBucket();
  const { ObjectId } = mongoose.mongo;
  const files = await b.find({ _id: new ObjectId(fileId) }).toArray();
  return files[0] ?? null;
}
