import { NextResponse } from "next/server"

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://analyzer:8001"

export async function GET() {
  try {
    const res = await fetch(`${ANALYZER_URL}/health/ai`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    })
    const data = await res.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch {
    return NextResponse.json(
      { status: "unavailable" },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    )
  }
}
