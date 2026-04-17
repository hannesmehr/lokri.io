import { ImageResponse } from "next/og";

/**
 * Default OG image for the entire app. Served at /opengraph-image by Next.
 * Uses the edge-safe ImageResponse API so we don't ship a static PNG and
 * can iterate on the copy without touching an asset pipeline.
 */
export const runtime = "edge";
export const alt = "lokri.io — DSGVO-konformer MCP-Gateway für Power-User";
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
          justifyContent: "space-between",
          padding: "72px",
          background:
            "radial-gradient(ellipse at 15% 10%, rgba(99,102,241,0.28), transparent 55%)," +
            "radial-gradient(ellipse at 95% 25%, rgba(217,70,239,0.30), transparent 55%)," +
            "radial-gradient(ellipse at 55% 110%, rgba(245,158,11,0.22), transparent 55%)," +
            "#0a0a0a",
          color: "white",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 12,
              background: "linear-gradient(135deg, #6366f1, #d946ef)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
              fontWeight: 800,
            }}
          >
            l
          </div>
          <div style={{ fontSize: 32, fontWeight: 600 }}>lokri.io</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              fontSize: 84,
              lineHeight: 1.02,
              fontWeight: 400,
              fontStyle: "italic",
              fontFamily: "Georgia, 'Times New Roman', serif",
              letterSpacing: "-0.02em",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Ein Gedächtnis.</span>
            <span
              style={{
                background: "linear-gradient(90deg, #818cf8, #e879f9)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Alle deine KI-Clients.
            </span>
          </div>
          <div
            style={{
              fontSize: 26,
              color: "rgba(255,255,255,0.75)",
              maxWidth: 900,
            }}
          >
            Der DSGVO-konforme MCP-Gateway für Claude Desktop, ChatGPT und
            Cursor. EU-hosted, privat, dir gehörend.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 20,
            color: "rgba(255,255,255,0.55)",
          }}
        >
          <div>MCP · OAuth 2.1 · pgvector · EU-hosted</div>
          <div>lokri.io</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
