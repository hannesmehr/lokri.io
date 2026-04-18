export type OperationalSeverity = "warning" | "error";

export function reportOperationalIssue(
  code: string,
  severity: OperationalSeverity,
  context: Record<string, unknown>,
): void {
  const payload = {
    code,
    severity,
    timestamp: new Date().toISOString(),
    ...context,
  };
  const line = `[ops-alert] ${JSON.stringify(payload)}`;
  if (severity === "error") {
    console.error(line);
    return;
  }
  console.warn(line);
}
