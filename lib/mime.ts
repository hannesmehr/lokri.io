/**
 * Tiny extension → MIME-type map. Good enough to kick off the chunked-embed
 * path for textual content; for a full map drop in a library later.
 */

const MAP: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  json: "application/json",
  jsonl: "application/x-ndjson",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  log: "text/plain",
  yml: "application/yaml",
  yaml: "application/yaml",
  toml: "application/toml",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  heic: "image/heic",
  avif: "image/avif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  zip: "application/zip",
};

export function mimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (!ext) return "application/octet-stream";
  return MAP[ext] ?? "application/octet-stream";
}

export function isTextualMime(mime: string): boolean {
  return mime.startsWith("text/") || mime === "application/json";
}
