import { ImageResponse } from "next/og"
import { NextRequest } from "next/server"
import { readFile } from "fs/promises"
import path from "path"

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://analyzer:8001"
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ""

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params

  const [userRes, verdictRes] = await Promise.allSettled([
    fetch(`${ANALYZER_URL}/user/${encodeURIComponent(username)}`, { signal: AbortSignal.timeout(5000) }),
    fetch(`${ANALYZER_URL}/analyze?username=${encodeURIComponent(username)}`, { signal: AbortSignal.timeout(5000) }),
  ])

  const user = userRes.status === "fulfilled" && userRes.value.ok ? await userRes.value.json() : null
  const verdictData = verdictRes.status === "fulfilled" && verdictRes.value.ok ? await verdictRes.value.json() : null
  const verdict: string | null = verdictData?.verdict ?? null

  const name = user?.name ?? `@${username}`
  const bio: string = user?.bio ?? ""
  const avatar: string = user?.avatar ?? ""

  const [roleLine = "", ...rest] = (verdict ?? "").split("\n")
  const role = roleLine.replace(/^@\S+\s*[—–-]\s*/, "")
  const description = rest.join(" ").trim()

  const fontsDir = path.join(process.cwd(), "public", "fonts")
  const [interFont, caveatFont] = await Promise.all([
    readFile(path.join(fontsDir, "inter.ttf")).catch(() => null),
    readFile(path.join(fontsDir, "caveat.ttf")).catch(() => null),
  ])

  const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "/topbottom"
  const siteUrl = (SITE_URL || req.nextUrl.origin) + BASE_PATH

  // Scale factor: html2canvas card is 600px wide, OG is 1200px → scale ×2
  return new ImageResponse(
    (
      <div
        style={{
          background: "#1a1a1a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px",
          fontFamily: "Inter, sans-serif",
        }}
      >
        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: "32px", lineHeight: 0.95 }}>
          <span style={{ fontFamily: "Caveat", fontSize: "64px", fontWeight: 700, color: "#555" }}>
            {"топ или"}
          </span>
          <span style={{ fontFamily: "Caveat", fontSize: "64px", fontWeight: 700, color: "#ff6b35" }}>
            {"боттом?"}
          </span>
        </div>

        {/* Avatar + name + handle */}
        <div style={{ display: "flex", alignItems: "center", gap: "28px", marginBottom: "32px" }}>
          {avatar && (
            <img
              src={avatar}
              width={104}
              height={104}
              style={{ borderRadius: "52px", objectFit: "cover" }}
            />
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ color: "#f0f0f0", fontSize: "34px", fontWeight: 600 }}>{name}</span>
            <span style={{ color: "#555", fontSize: "26px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {"@" + username}
            </span>
          </div>
        </div>

        {/* Bio */}
        {bio && (
          <div style={{
            color: "#aaa",
            fontSize: "26px",
            lineHeight: 1.5,
            marginBottom: "40px",
            borderLeft: "4px solid #2a2a2a",
            paddingLeft: "24px",
            display: "flex",
          }}>
            {bio.length > 120 ? bio.slice(0, 120) + "…" : bio}
          </div>
        )}

        {/* Divider */}
        <div style={{ borderTop: "1px solid #2a2a2a", marginBottom: "32px", display: "flex" }} />

        {/* Verdict label */}
        <div style={{
          fontSize: "22px",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "#555",
          marginBottom: "16px",
          display: "flex",
        }}>
          вердикт
        </div>

        {/* Role */}
        {role ? (
          <div style={{ color: "#ff6b35", fontSize: "36px", fontWeight: 700, marginBottom: "16px", display: "flex" }}>
            {role}
          </div>
        ) : (
          <div style={{ color: "#555", fontSize: "30px", display: "flex" }}>анализируется...</div>
        )}

        {/* Description */}
        {description && (
          <div style={{ color: "#f0f0f0", fontSize: "28px", lineHeight: 1.6, display: "flex" }}>
            {description.length > 160 ? description.slice(0, 160) + "…" : description}
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "auto",
          borderTop: "1px solid #2a2a2a",
          paddingTop: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: "22px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#555" }}>
            top or bottom?
          </span>
          <span style={{ fontSize: "22px", color: "#555" }}>{siteUrl}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        ...(interFont ? [{ name: "Inter", data: interFont.buffer as ArrayBuffer, weight: 400 as const }] : []),
        ...(caveatFont ? [{ name: "Caveat", data: caveatFont.buffer as ArrayBuffer, weight: 700 as const }] : []),
      ],
    }
  )
}
