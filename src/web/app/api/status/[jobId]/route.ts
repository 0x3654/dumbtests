import { NextRequest, NextResponse } from "next/server"

const ANALYZER_URL = process.env.ANALYZER_URL ?? "http://analyzer:8001"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params
  try {
    const res = await fetch(
      `${ANALYZER_URL}/status/${jobId}`,
      { signal: AbortSignal.timeout(10000) }
    )
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch {
    return NextResponse.json({ error: "Сервис недоступен" }, { status: 503 })
  }
}
