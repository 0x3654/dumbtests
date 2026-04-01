"use client"

import { useState, useEffect, useCallback, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"

const STEPS = [
  "Читаю твиты...",
  "Изучаю картинки...",
  "Думаю...",
  "Делаю выводы....",
]

const SUGGESTED = [
  "0x3654", "minilubov", "maxjazzz", "tomnaya_satana",
  "fieva9", "leni_kotik", "twitshama", "luxurybitches",
  "nysaaash", "homa_sapiens_", "dcversus", "Irochka_x",
  "vse_potom1", "iraclorny", "aloemusic", "__xanushka",
]

type UserInfo = { name: string; screen_name: string; bio: string; followers: number; avatar: string }

type State =
  | { phase: "idle"; user?: UserInfo }
  | { phase: "confirming"; user: UserInfo }
  | { phase: "queue"; position: number; user?: UserInfo }
  | { phase: "processing"; step: number; user?: UserInfo }
  | { phase: "done"; verdict: string; username: string; user: UserInfo }
  | { phase: "error"; message: string; user?: UserInfo }

export default function AnalyzerPage() {
  return (
    <Suspense>
      <AnalyzerInner />
    </Suspense>
  )
}

function AnalyzerInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [username, setUsername] = useState(searchParams.get("u") ?? "")
  const [state, setState] = useState<State>({ phase: "idle" })
  const [apiStatus, setApiStatus] = useState<"ok" | "no_funds" | "no_key" | "unavailable" | "unknown">("unknown")
  const [copiedVerdict, setCopiedVerdict] = useState(false)
  const [sharingImage, setSharingImage] = useState(false)
  const [profileChecked, setProfileChecked] = useState(false)
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingActive = useRef(false)

  function startStepAnimation() {
    if (stepTimer.current) return
    let step = 0
    setState({ phase: "processing", step })
    stepTimer.current = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1)
      setState({ phase: "processing", step })
    }, 2500)
  }

  function stopStepAnimation() {
    if (stepTimer.current) {
      clearInterval(stepTimer.current)
      stepTimer.current = null
    }
  }

  const runAnalysis = useCallback(async (name: string, prefetchedUser?: any) => {
    pollingActive.current = true
    setState({ phase: "queue", position: 1 })
    router.replace(`/analyzer?u=${encodeURIComponent(name)}`, { scroll: false })

    // Подгрузить профиль если не передан
    let userInfo = prefetchedUser
    if (!userInfo) {
      try {
        const r = await fetch(`/api/user/${encodeURIComponent(name)}`)
        const d = await r.json()
        if (d.found) userInfo = d
      } catch {}
    }
    if (userInfo) {
      setState(prev => ({ ...prev, user: userInfo } as any))
    }

    try {
      const res = await fetch(`/api/analyze?username=${encodeURIComponent(name)}`)
      const data = await res.json()

      if (!res.ok) {
        setState({ phase: "error", message: data.error ?? "Ошибка" })
        return
      }

      if (data.done) {
        setState((prev) => ({
          phase: "done",
          verdict: data.verdict,
          username: name,
          user: (prev as any).user || userInfo || { name: "", screen_name: name, bio: "", followers: 0, avatar: "" },
        }))
        return
      }

      const jobId: string = data.job_id
      setState({ phase: "queue", position: data.position })

      while (pollingActive.current) {
        await new Promise((r) => setTimeout(r, 2000))
        if (!pollingActive.current) break

        const statusRes = await fetch(`/api/status/${jobId}`)
        const status = await statusRes.json()

        if (status.status === "done") {
          stopStepAnimation()
          setState((prev) => ({
            phase: "done",
            verdict: status.verdict,
            username: name,
            user: (prev as any).user || userInfo || { name: "", screen_name: name, bio: "", followers: 0, avatar: "" },
          }))
          return
        }
        if (status.status === "error") {
          stopStepAnimation()
          setState({ phase: "error", message: status.error })
          return
        }
        if (status.status === "processing") {
          startStepAnimation()
        } else if (status.status === "pending") {
          stopStepAnimation()
          setState({ phase: "queue", position: status.position })
        }
      }
    } catch {
      stopStepAnimation()
      setState({ phase: "error", message: "Сервис недоступен. Попробуй позже." })
    }
  }, [router])

  useEffect(() => {
    fetch("/api/health").then(r => r.json()).then(d => setApiStatus(d.status)).catch(() => setApiStatus("unavailable"))
  }, [])

  useEffect(() => {
    const u = searchParams.get("u")
    if (u) {
      setUsername(u)
      runAnalysis(u.replace(/^@/, "").toLowerCase().trim())
    }
    return () => {
      pollingActive.current = false
      stopStepAnimation()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const name = username.trim().replace(/^@/, "").toLowerCase()
    if (!name) return
    if (!/^[a-z0-9_]{1,15}$/.test(name)) {
      setState({ phase: "error", message: "Некорректный юзернейм. Только буквы, цифры и _, максимум 15 символов." })
      return
    }

    if (!profileChecked) {
      // Первый клик - проверяем профиль
      setState({ phase: "confirming", user: { name: "", screen_name: name, bio: "", followers: 0, avatar: "" } })
      try {
        const res = await fetch(`/api/user/${encodeURIComponent(name)}`)
        const data = await res.json()
        if (!data.found) {
          setState({ phase: "error", message: "Аккаунт не найден или закрытый." })
          return
        }
        setState({ phase: "confirming", user: data })
        setProfileChecked(true)
      } catch {
        setState({ phase: "error", message: "Сервис недоступен. Попробуй позже." })
      }
    } else {
      // Второй клик - запускаем анализ, передаём уже загруженный профиль
      runAnalysis(name, state.phase === "confirming" ? (state as any).user : undefined)
    }
  }

  function reset() {
    pollingActive.current = false
    stopStepAnimation()
    setState({ phase: "idle" })
    setUsername("")
    router.replace("/analyzer", { scroll: false })
  }

  function handleSuggestion(name: string) {
    pollingActive.current = false
    stopStepAnimation()
    setUsername(name)
    setProfileChecked(false)
    setState({ phase: "idle" })
    runAnalysis(name.toLowerCase())
  }

  async function copyVerdict(text: string) {
    await navigator.clipboard.writeText(text)
    setCopiedVerdict(true)
    setTimeout(() => setCopiedVerdict(false), 2000)
  }

  async function fetchOgBlob(username: string): Promise<Blob | null> {
    try {
      const res = await fetch(`/api/og/${encodeURIComponent(username)}`)
      if (!res.ok) return null
      return await res.blob()
    } catch {
      return null
    }
  }

  async function saveImage() {
    if (state.phase !== "done") return
    setSharingImage(true)
    try {
      const blob = await fetchOgBlob(state.user.screen_name)
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `topbottom-${state.user.screen_name}.png`
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setSharingImage(false)
    }
  }

  async function shareUrl(verdict: string) {
    if (state.phase !== "done") return
    setSharingImage(true)
    try {
      const blob = await fetchOgBlob(state.user.screen_name)
      if (blob) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `topbottom-${state.user.screen_name}.png`
        a.click()
        URL.revokeObjectURL(url)
        setTimeout(() => {
          const text = encodeURIComponent(`${verdict}\n\n${window.location.origin}/analyzer/${state.user.screen_name}`)
          window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank")
        }, 300)
      }
    } finally {
      setSharingImage(false)
    }
  }

  const showForm = state.phase === "idle" || state.phase === "done" || state.phase === "error" || state.phase === "confirming" || state.phase === "queue" || state.phase === "processing"

  return (
    <main className="page">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Caveat:wght@700&display=swap" rel="stylesheet" />

      <div className="wrap">

        <header className="header">
          <a href="https://0x3654.com/toporbottom" className="mono dim" style={{ textDecoration: "none" }}>настоящий анализ</a>
          <a href="https://0x3654.com/toporbottom" className="mono dim" style={{ textDecoration: "none" }}>2026</a>
        </header>

        {apiStatus !== "ok" && apiStatus !== "unknown" && (
          <div className="api-status">
            {apiStatus === "no_funds" && "сервис временно не работает — закончился баланс апи"}
            {apiStatus === "no_key" && "сервис не настроен — нет апи ключа"}
            {apiStatus === "unavailable" && "сервис недоступен"}
          </div>
        )}

        <h1 className="headline">
          топ или<br /><em>боттом?</em>
        </h1>

        <p className="deck">
          Введи ник — получишь неопровержимый ответ. Анализирует последние 20 твитов, смотрит картинки, использует ИИ. Не рандом. Всё честно.
        </p>

        <div className="suggested">
          {SUGGESTED.map((name) => (
            <button
              key={name}
              className="suggested-btn"
              onClick={() => handleSuggestion(name)}
              disabled={state.phase === "queue" || state.phase === "processing"}
            >
              @{name}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="form">
            <div className="input-row">
              <span className="at">@</span>
              <input
                className="field"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setProfileChecked(false)
                }}
                placeholder="username"
                autoComplete="off"
                spellCheck={false}
                disabled={state.phase === "queue" || state.phase === "processing"}
              />
              <button
                className="submit"
                type={state.phase === "done" ? "button" : "submit"}
                onClick={state.phase === "done" ? reset : undefined}
                disabled={state.phase === "done" ? false : (!username.trim() || state.phase === "queue" || state.phase === "processing")}
              >
                {state.phase === "queue" || state.phase === "processing" ? "..." : state.phase === "done" ? "сбросить" : profileChecked ? "анализ" : "проверить"}
              </button>
            </div>
          </form>
        )}

        {state.phase === "confirming" && (
          <div className="confirming">
            <div className="user-preview">
              {state.user.avatar && <img src={state.user.avatar} alt="" className="user-avatar" />}
              <div className="user-info">
                <div className="user-name">{state.user.name} <span className="mono">@{state.user.screen_name}</span></div>
                {state.user.bio && <div className="user-bio">{state.user.bio}</div>}
                <div className="mono user-followers">{state.user.followers.toLocaleString("ru")} подписчиков</div>
              </div>
            </div>
          </div>
        )}

        {(state.phase === "queue" || state.phase === "processing") && (
          <div className="loading">
            <span className="mono dim loading-text">
              {state.phase === "queue"
                ? (state.position === 1 ? "очередь..." : `в очереди: ${state.position}`)
                : STEPS[state.step]}
            </span>
            <Dots />
          </div>
        )}

        {state.phase === "done" && (
          <div className="result">
            <div className="user-preview" style={{ marginBottom: "1.25rem" }}>
              <a href={`https://x.com/${state.user.screen_name}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0 }}>
                {state.user.avatar && <img src={state.user.avatar} alt="" className="user-avatar" />}
              </a>
              <div className="user-info">
                <div className="user-name">
                  <a href={`https://x.com/${state.user.screen_name}`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                    {state.user.name} <span className="mono">@{state.user.screen_name}</span>
                  </a>
                </div>
                {state.user.bio && <div className="user-bio">{state.user.bio}</div>}
              </div>
            </div>
            <p className="headline" style={{ fontSize: "clamp(2.5rem, 12vw, 4.5rem)", marginBottom: "1rem" }}>топ или<br /><em>боттом?</em></p>
            <p className="mono dim result-label">вердикт</p>
            <p className="verdict">{state.verdict}</p>
            <div className="actions">
              <button className="btn btn-icon" onClick={saveImage} disabled={sharingImage} title="сохранить картинку">
                {sharingImage ? "…" : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                )}
              </button>
              <button className="btn btn-accent" onClick={() => shareUrl(state.verdict)} disabled={sharingImage}>
                {sharingImage ? "делаю картинку..." : "поделиться →"}
              </button>
            </div>
          </div>
        )}

        {state.phase === "error" && (
          <div className="error-box">
            <p className="error-msg">{state.message}</p>
            <button className="btn" onClick={reset}>попробовать снова</button>
          </div>
        )}

        <div className="follow">
          <p className="mono" style={{color: "#f0f0f0"}}>
            подпишись {" "}
            <a href="https://x.com/0x3654" target="_blank" rel="noopener noreferrer" className="link-accent" style={{textTransform: "none"}}>
              @0x3654
            </a>
          </p>
          <a href="https://x.com/0x3654" target="_blank" rel="noopener noreferrer" className="mono link-dim">
            обратная связь →
          </a>
        </div>

        <footer className="footer">
          <span className="mono dim">© 2026</span>
          <a href="https://github.com/0x3654/" target="_blank" rel="noopener noreferrer" className="mono dim" style={{ textDecoration: "none" }}>opensource</a>
          <span className="mono dim">не связан с x/twitter</span>
        </footer>
      </div>


      <style>{`
        .page {
          background: #1a1a1a;
          color: #f0f0f0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem 1.25rem;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .wrap {
          width: 100%;
          max-width: 520px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #2a2a2a;
          padding-bottom: 0.6rem;
          margin-bottom: 1.5rem;
        }
        .mono {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .dim { color: #555; }
        .confirming {
          padding: 1.25rem 0;
          border-top: 1px solid #2a2a2a;
          animation: fadeIn 0.2s ease both;
        }
        .user-preview {
          margin-bottom: 1.25rem;
          display: flex;
          gap: 1rem;
        }
        .user-avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
        }
        .user-info {
          flex: 1;
        }
        .user-name {
          font-size: 1rem;
          font-weight: 600;
          color: #f0f0f0;
          margin-bottom: 0.35rem;
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
        }
        .user-bio {
          font-size: 0.85rem;
          color: #aaa;
          line-height: 1.5;
          margin-bottom: 0.35rem;
        }
        .user-followers {
          margin-top: 0.25rem;
          color: #f0f0f0;
        }
        .api-status {
          font-size: 0.7rem;
          color: #ff6b35;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          margin-bottom: 1rem;
        }
        .headline {
          font-family: 'Caveat', cursive;
          font-size: clamp(4rem, 18vw, 7.5rem);
          font-weight: 700;
          line-height: 0.95;
          color: #fff;
          margin-bottom: 2rem;
        }
        .headline em {
          font-style: normal;
          color: #ff6b35;
        }
        .deck {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.75rem;
          color: #f0f0f0;
          line-height: 1.5;
          margin-bottom: 0.75rem;
        }
        .suggested {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-bottom: 1.25rem;
        }
        .suggested-btn {
          background: transparent;
          border: 1px solid #333;
          color: #666;
          font-family: 'DM Mono', monospace;
          font-size: 0.65rem;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .suggested-btn:hover:not(:disabled) { border-color: #ff6b35; color: #ff6b35; }
        .suggested-btn:disabled { opacity: 0.3; cursor: default; }
        .form { margin-bottom: 0; }
        .input-row {
          display: flex;
          width: 100%;
        }
        .at {
          background: #ff6b35;
          color: #fff;
          font-family: 'DM Mono', monospace;
          font-size: 1rem;
          padding: 0 0.75rem;
          display: flex;
          align-items: center;
        }
        .field {
          flex: 1;
          background: #111;
          border: none;
          border-top: 1px solid #2a2a2a;
          border-bottom: 1px solid #2a2a2a;
          outline: none;
          color: #fff;
          font-family: 'DM Mono', monospace;
          font-size: 1rem;
          padding: 0.9rem 1rem;
        }
        .field::placeholder { color: #444; }
        .submit {
          background: #ff6b35;
          color: #fff;
          border: none;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 0 1.25rem;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .submit:disabled { opacity: 0.25; cursor: default; }
        .submit:not(:disabled):hover { background: #e85d2a; }
        .loading {
          padding: 2rem 0;
          text-align: center;
        }
        .loading-text {
          display: block;
          margin-bottom: 1rem;
        }
        .result {
          padding: 1.5rem 0;
          border-top: 1px solid #2a2a2a;
          animation: fadeIn 0.3s ease both;
        }
        .result-label {
          margin-bottom: 0.75rem;
        }
        .verdict {
          font-size: 1.05rem;
          line-height: 1.7;
          color: #f0f0f0;
          margin-bottom: 1.5rem;
          white-space: pre-line;
        }
        .actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .btn {
          background: #ff6b35;
          color: #fff;
          border: none;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          padding: 0.65rem 1rem;
          cursor: pointer;
          transition: background 0.15s;
        }
        .btn:hover { background: #e85d2a; }
        .btn-icon {
          background: #ff6b35;
          color: #fff;
          border: none;
          padding: 0.65rem 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .btn-icon:hover { background: #e85d2a; }
        .btn-accent {
          background: transparent;
          color: #f0f0f0;
          border: 1px solid #333;
        }
        .btn-accent:hover { border-color: #555; background: transparent; color: #fff; }
        .error-box {
          padding: 1.5rem 0;
          border-top: 1px solid #3a1a1a;
          text-align: center;
        }
        .error-msg {
          font-size: 0.9rem;
          color: #777;
          margin-bottom: 1rem;
          line-height: 1.6;
        }
        .follow {
          margin-top: 3rem;
          border-top: 1px solid #2a2a2a;
          padding-top: 1rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .link-accent { color: #ff6b35; text-decoration: none; }
        .link-accent:hover { text-decoration: underline; }
        .link-dim { color: #f0f0f0; text-decoration: none; }
        .link-dim:hover { color: #fff; }
        .footer {
          margin-top: 0.75rem;
          display: flex;
          justify-content: space-between;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </main>
  )
}

function Dots() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#555", display: "inline-block", animation: `pulse 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  )
}
