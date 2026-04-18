export class EmbeddingKeyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "EmbeddingKeyError";
    this.code = code;
    this.status = status;
  }
}

export function maskEmbeddingKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 6) return "********";
  return `${trimmed.slice(0, 3)}${"*".repeat(Math.max(trimmed.length - 6, 8))}${trimmed.slice(-3)}`;
}

export function assertEmbeddingKeyFormat(apiKey: string): void {
  if (!/^sk-[A-Za-z0-9._-]{10,}$/.test(apiKey.trim())) {
    throw new EmbeddingKeyError(
      "embeddingKey.invalidFormat",
      "Der Embedding-Key hat ein ungültiges Format.",
      400,
    );
  }
}
