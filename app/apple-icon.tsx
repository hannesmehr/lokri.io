import { ImageResponse } from "next/og";

/**
 * Apple Touch Icon — 180×180 for home-screen bookmarks on iOS.
 */
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6366f1, #d946ef)",
          color: "white",
          fontSize: 120,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        l
      </div>
    ),
    { ...size },
  );
}
