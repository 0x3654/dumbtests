import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "top or bottom?",
  description: "настоящий анализ. не hash % 13.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
