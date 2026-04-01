import { NextRequest, NextResponse } from "next/server"

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://analyzer:8001"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params
  try {
    const res = await fetch(`${ANALYZER_URL}/user/${encodeURIComponent(username)}`, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 })
  }
}
