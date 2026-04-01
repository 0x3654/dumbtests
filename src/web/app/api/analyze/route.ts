import { NextRequest, NextResponse } from "next/server"

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://analyzer:8001"

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username")
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 })
  }

  try {
    const res = await fetch(
      `${ANALYZER_URL}/analyze?username=${encodeURIComponent(username)}`,
      { signal: AbortSignal.timeout(20000) }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 })
  }
}
