/**
 * Plain-text extraction across file formats. Returns `null` when the mime
 * type isn't supported (caller then just stores the file without chunks).
 *
 * Supported:
 *   - text/* + application/json + a few text-ish application types
 *   - application/pdf (via pdf-parse)
 *   - .docx (via mammoth)
 *
 * Extractors are loaded lazily — pdf-parse in particular drags in a big
 * bundle, and we don't want to pay that cost on every boot if no PDF ever
 * lands in the process.
 */

type Extractor = (bytes: Uint8Array) => Promise<string>;

const EXTRACTORS: Array<{ test: (mime: string) => boolean; run: Extractor }> = [
  {
    test: (m) => m.startsWith("text/") || m === "application/json" || m === "application/xml" || m === "application/yaml" || m === "application/toml" || m === "application/x-ndjson",
    run: async (bytes) => Buffer.from(bytes).toString("utf-8"),
  },
  {
    test: (m) => m === "application/pdf",
    run: async (bytes) => {
      // pdf-parse v2 exposes a class-based API. Construct with a Uint8Array,
      // call getText(), destroy to release pdf.js workers.
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({
        data: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
      });
      try {
        const result = await parser.getText();
        return result.text ?? "";
      } finally {
        await parser.destroy().catch(() => {
          /* noop */
        });
      }
    },
  },
  {
    test: (m) =>
      m ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    run: async (bytes) => {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return result.value ?? "";
    },
  },
];

/**
 * Returns the extracted text, or `null` if the mime type isn't supported.
 * Throws on extraction failures — callers should catch + log; the import
 * path treats this as non-fatal (file is stored without chunks).
 */
export async function extractText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  const m = mimeType.toLowerCase().split(";")[0].trim();
  const extractor = EXTRACTORS.find((e) => e.test(m));
  if (!extractor) return null;
  const text = await extractor.run(bytes);
  // Normalise: collapse runs of whitespace, strip control chars. Keeps the
  // index clean regardless of how the source was formatted.
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

/** Compatibility shim for old call sites — true if extraction is available. */
export function isExtractable(mimeType: string): boolean {
  const m = mimeType.toLowerCase().split(";")[0].trim();
  return EXTRACTORS.some((e) => e.test(m));
}
