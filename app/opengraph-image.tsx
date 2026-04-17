import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "lokri.io — Coming soon";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "72px",
          background:
            "radial-gradient(ellipse at 20% 20%, rgba(99,102,241,0.30), transparent 55%)," +
            "radial-gradient(ellipse at 80% 80%, rgba(217,70,239,0.28), transparent 55%)," +
            "#0a0a0a",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 36,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "linear-gradient(135deg, #6366f1, #d946ef)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 26,
              fontWeight: 800,
            }}
          >
            l
          </div>
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)" }}>
            Coming soon
          </div>
        </div>
        <div
          style={{
            fontSize: 140,
            fontFamily: "Georgia, 'Times New Roman', serif",
            letterSpacing: "-0.03em",
            display: "flex",
          }}
        >
          lokri.
          <span
            style={{
              background: "linear-gradient(90deg, #818cf8, #e879f9)",
              backgroundClip: "text",
              color: "transparent",
              fontStyle: "italic",
            }}
          >
            io
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
