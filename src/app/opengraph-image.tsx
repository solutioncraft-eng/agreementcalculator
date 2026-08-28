import { ImageResponse } from "next/og";
import { PRODUCT_NAME } from "@/lib/seo";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/trial";

export const alt = `${PRODUCT_NAME} — price managed services agreements and prove the margin`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ORANGE = "#F26B21";
const NAVY = "#12253A";

/** Share card for the marketing pages, in the house palette. */
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: NAVY,
          padding: 72,
          color: "#FFFFFF",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ display: "flex", flexWrap: "wrap", width: 64, height: 64 }}>
            <div style={{ width: 28, height: 28, background: ORANGE, borderRadius: 6, margin: 2 }} />
            <div style={{ width: 28, height: 28, background: "#FFFFFF", borderRadius: 6, margin: 2 }} />
            <div style={{ width: 28, height: 28, background: ORANGE, borderRadius: 6, margin: 2 }} />
            <div style={{ width: 28, height: 28, background: ORANGE, borderRadius: 6, margin: 2 }} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.5 }}>{PRODUCT_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 40, color: ORANGE, letterSpacing: 2, textTransform: "uppercase" }}>
            Agreement pricing for MSPs
          </div>
          <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5 }}>
            Price every agreement the same way, and prove the margin
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 30, color: "#C9D3DD" }}>
          ${PRICE_PER_MONTH}/month per company · unlimited users · {TRIAL_DAYS}-day free trial
        </div>
      </div>
    ),
    size,
  );
}
