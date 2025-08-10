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

export async function extractTextFromFile(file: File): Promise<ExtractedText> {
  const mimeType = file.type || inferMimeFromName(file.name);
  const filename = file.name || "resume";

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (mimeType === "application/pdf") {
    // Prefer pdf-parse for accuracy; fallback to pdfreader if unavailable
    try {
      const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text: string; numpages?: number }>;
      const out = await pdfParse(buffer);
      const text = normalizeWhitespace(out.text || "");
      return {
        text,
        meta: {
          filename,
          mimeType,
          numPages: typeof (out as { numpages?: unknown }).numpages === "number" ? (out as { numpages?: number }).numpages : undefined,
          wordCount: countWords(text),
        },
      };
    } catch (err) {
      console.error("extractTextFromFile.pdf primary parse error", err);
      const { PdfReader } = await import("pdfreader");
      const reader = new PdfReader();
      const lines: string[] = [];
      const textByPage: string[] = [];
      type PdfReaderItem = { page?: number; text?: string } | null;
       await new Promise<void>((resolve, reject) => {
        reader.parseBuffer(buffer, (err: unknown, item: PdfReaderItem) => {
          if (err) {
            console.error("extractTextFromFile.pdf fallback parse error", err);
            return reject(err);
          }
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

  // Return empty text if unsupported. Caller (route) should validate type and size.
  return {
    text: "",
    meta: {
      filename,
      mimeType,
      wordCount: 0,
    },
  };
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


