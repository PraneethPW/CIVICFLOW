import { createWorker } from "tesseract.js";
import { z } from "zod";
let active = 0;
export function fileType(buffer: Buffer) {
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  throw Object.assign(new Error("Upload a PNG, JPEG, or PDF document."), {
    status: 415,
  });
}
export async function recognize(buffer: Buffer, documentType: unknown) {
  const type = fileType(buffer);
  const label = z
    .string()
    .trim()
    .min(1)
    .max(120)
    .parse(documentType || "Document");
  if (type === "application/pdf")
    return {
      confidence: 0,
      verified: false,
      issues: [
        "PDF saved for officer review. OCR supports PNG and JPEG images.",
      ],
      checks: [{ label: "Officer review required", ok: false }],
      extracted: { documentType: label, readable: false },
    };
  if (active >= 2)
    throw Object.assign(
      new Error("Document scanner is busy. Try again shortly."),
      { status: 429 },
    );
  active++;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let finished = false;
  try {
    const result = await Promise.race([
      (async () => {
        const created = await createWorker("eng");
        if (finished) {
          await created.terminate();
          throw new Error("OCR cancelled");
        }
        worker = created;
        return worker.recognize(buffer);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error("OCR timed out. Try a smaller image."), {
                status: 504,
              }),
            ),
          60000,
        );
      }),
    ]);
    const text = result.data.text.trim();
    const confidence = Math.round(result.data.confidence);
    const readable = confidence >= 60 && text.replace(/\s/g, "").length >= 20;
    return {
      confidence,
      verified: false,
      issues: [
        readable
          ? "Text extracted. An officer must verify authenticity and document type."
          : "Text is unclear. Upload a sharper image or request officer review.",
      ],
      checks: [
        { label: "Readable text", ok: readable },
        { label: "Officer verification", ok: false },
      ],
      extracted: { documentType: label, readable, text: text.slice(0, 6000) },
    };
  } finally {
    finished = true;
    clearTimeout(timer);
    if (worker) await worker.terminate();
    active--;
  }
}
