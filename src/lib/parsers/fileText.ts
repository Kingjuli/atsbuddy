// Dynamic-import parsers at call-time to avoid build-time evaluation issues

export type ExtractedText = {
  text: string;
  meta: {
    filename: string;
    mimeType: string;
    numPages?: number;
    wordCount: number;
  };
};

const MAX_BYTES = 8 * 1024 * 1024; // 8MB safety limit

export async function extractTextFromFile(file: File): Promise<ExtractedText> {
  const mimeType = file.type || inferMimeFromName(file.name);
  const filename = file.name || "resume";

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    throw new Error("File too large. Please upload a file under 8MB.");
  }
  const buffer = Buffer.from(arrayBuffer);

  if (mimeType === "application/pdf") {
    const { PdfReader } = await import("pdfreader");
    const reader = new PdfReader();
    const lines: string[] = [];
    const textByPage: string[] = [];
    type PdfReaderItem = { page?: number; text?: string } | null;
    await new Promise<void>((resolve, reject) => {
      reader.parseBuffer(buffer, (err: unknown, item: PdfReaderItem) => {
        if (err) return reject(err);
        if (!item) {
          textByPage.push(lines.join(" "));
          return resolve();
        }
        if (item.page) {
          if (lines.length) textByPage.push(lines.join(" "));
          lines.length = 0;
        } else if (item.text) {
          lines.push(item.text);
        }
      });
    });
    const text = normalizeWhitespace(textByPage.join("\n\n"));
    return {
      text,
      meta: {
        filename,
        mimeType,
        wordCount: countWords(text),
      },
    };
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer });
    const text = normalizeWhitespace(value || "");
    return {
      text,
      meta: {
        filename,
        mimeType,
        wordCount: countWords(text),
      },
    };
  }

  if (
    mimeType === "text/plain" ||
    filename.toLowerCase().endsWith(".txt")
  ) {
    const text = normalizeWhitespace(buffer.toString("utf-8"));
    return {
      text,
      meta: {
        filename,
        mimeType: "text/plain",
        wordCount: countWords(text),
      },
    };
  }

  throw new Error(
    "Unsupported file type. Please upload a PDF, DOCX, or TXT resume."
  );
}

function inferMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(text: string): number {
  if (!text) return 0;
  const tokens = text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.length;
}


