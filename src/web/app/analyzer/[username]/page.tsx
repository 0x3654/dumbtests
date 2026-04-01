import type { Metadata } from "next"
import ClientRedirect from "./redirect"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ""

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params
  const ogImage = `${SITE_URL}/api/og/${encodeURIComponent(username)}`

  return {
    title: `@${username} — топ или боттом?`,
    description: `Узнай кто такой @${username} — топ или боттом? Анализ твитов с помощью ИИ.`,
    openGraph: {
      title: `@${username} — топ или боттом?`,
      description: `Узнай кто такой @${username} — топ или боттом?`,
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: `@${username} — топ или боттом?`,
      description: `Узнай кто такой @${username} — топ или боттом?`,
      images: [ogImage],
    },
  }
}

export default async function UsernamePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return <ClientRedirect username={username} />
}
