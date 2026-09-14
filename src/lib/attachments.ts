import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Attachment, AttachmentKind } from "../types";

const MAX_FILE_BYTES = 24 * 1024 * 1024;
const MAX_TEXT_LENGTH = 140_000;
const MAX_IMAGE_EDGE = 2560;
const MAX_PASSTHROUGH_IMAGE_BYTES = 8 * 1024 * 1024;

const id = () => crypto.randomUUID();

function kindFor(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return "pdf";
  if (
    file.type.includes("wordprocessingml") ||
    file.name.toLowerCase().endsWith(".docx")
  ) return "document";
  return "text";
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Не удалось прочитать ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file: File): Promise<{ dataUrl: string; mime: string; size: number }> {
  const supported = new Set(["image/jpeg", "image/png", "image/webp"]);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name}: формат изображения не поддерживается. Используй PNG, JPEG или WebP.`);
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const needsNormalization = !supported.has(file.type) || file.size > MAX_PASSTHROUGH_IMAGE_BYTES || scale < 1;
  if (!needsNormalization) {
    bitmap.close();
    return { dataUrl: await toDataUrl(file), mime: file.type, size: file.size };
  }

  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error(`${file.name}: не удалось подготовить изображение`);
  }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`${file.name}: не удалось сжать изображение`)), "image/jpeg", 0.9);
  });
  return { dataUrl: await toDataUrl(new File([blob], file.name, { type: blob.type })), mime: blob.type, size: blob.size };
}

async function readPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
  const document = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  const limit = Math.min(document.numPages, 160);
  for (let index = 1; index <= limit; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(`[Страница ${index}]\n${text}`);
    if (pages.join("\n\n").length >= MAX_TEXT_LENGTH) break;
  }
  return pages.join("\n\n").slice(0, MAX_TEXT_LENGTH);
}

async function readDocx(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.replace(/\n{3,}/g, "\n\n").slice(0, MAX_TEXT_LENGTH);
}

export async function prepareAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${file.name}: максимум 24 МБ`);
  }
  const kind = kindFor(file);
  const base = { id: id(), name: file.name, mime: file.type || "application/octet-stream", size: file.size, kind };

  if (kind === "image") {
    return { ...base, ...(await prepareImage(file)) };
  }

  const buffer = await file.arrayBuffer();
  let text: string;
  if (kind === "pdf") text = await readPdf(buffer);
  else if (kind === "document") text = await readDocx(buffer);
  else text = new TextDecoder().decode(buffer).slice(0, MAX_TEXT_LENGTH);

  if (!text.trim()) throw new Error(`В ${file.name} не найден текст`);
  return { ...base, text };
}

export function attachmentPrompt(attachments: Attachment[]): string {
  return attachments
    .filter((attachment) => attachment.text)
    .map((attachment) => `\n\n<attachment name="${attachment.name}">\n${attachment.text}\n</attachment>`)
    .join("");
}

export function imagePayloads(attachments: Attachment[]): string[] {
  return attachments
    .filter((attachment) => attachment.kind === "image" && attachment.dataUrl)
    .map((attachment) => attachment.dataUrl!.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i)?.[1] ?? "")
    .filter(Boolean);
}
