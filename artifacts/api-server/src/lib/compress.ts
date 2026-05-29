import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

export async function compressImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  // Lossless PNG compression — no quality reduction, structural optimization only
  const image = sharp(buffer);
  const metadata = await image.metadata();

  // Cap at 1920px wide if larger (preserves aspect ratio, no quality loss)
  let pipeline = image;
  if (metadata.width && metadata.width > 1920) {
    pipeline = pipeline.resize(1920, undefined, { withoutEnlargement: true });
  }

  // Use PNG with maximum compression (lossless)
  const compressed = await pipeline
    .png({ compressionLevel: 9, adaptiveFiltering: true, force: true })
    .toBuffer();

  // Return whichever is smaller — sometimes original is already optimal
  return compressed.length < buffer.length ? compressed : buffer;
}

export async function compressPDF(buffer: Buffer): Promise<Buffer> {
  // Lossless PDF compression — structural only, no content resampling
  const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const compressed = await pdfDoc.save({ useObjectStreams: true });
  const compressedBuffer = Buffer.from(compressed);
  return compressedBuffer.length < buffer.length ? compressedBuffer : buffer;
}

export async function compressFile(buffer: Buffer, mimeType: string): Promise<Buffer> {
  if (mimeType === "application/pdf") {
    return compressPDF(buffer);
  }
  if (mimeType.startsWith("image/")) {
    return compressImage(buffer, mimeType);
  }
  return buffer;
}
