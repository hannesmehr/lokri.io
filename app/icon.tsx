import { ImageResponse } from "next/og";

/**
 * Dynamic favicon — rendered once via Edge ImageResponse, then cached by
 * Next for the lifetime of the deployment. Ships as 32×32 PNG.
 */
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
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
          fontSize: 22,
          fontWeight: 800,
          fontFamily: "system-ui, -apple-system, sans-serif",
          borderRadius: 6,
        }}
      >
        l
      </div>
    ),
    { ...size },
  );
}
