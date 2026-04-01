"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function ClientRedirect({ username }: { username: string }) {
  const router = useRouter()
  useEffect(() => {
    router.replace(`/analyzer?u=${encodeURIComponent(username)}`)
  }, [username, router])
  return null
}
