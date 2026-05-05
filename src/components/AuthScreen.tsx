import { ArrowsClockwise, ChartLineUp, CheckCircle, ShieldCheck, Star, Tag, Wallet } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { signInWithGoogle } from '@/lib/supabase'
import { readPendingInviteToken } from '@/lib/pending-invite'

const GoogleMark = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
    <path
      d="M21.8 12.23c0-.72-.06-1.25-.2-1.8H12v3.48h5.64c-.1.86-.62 2.16-1.76 3.03l-.02.12 2.84 2.2.2.02c1.82-1.68 2.9-4.14 2.9-7.05Z"
      fill="#4285F4"
    />
    <path
      d="M12 22c2.76 0 5.08-.9 6.78-2.45l-3.22-2.5c-.86.6-2.02 1.02-3.56 1.02-2.7 0-4.98-1.78-5.8-4.24l-.11.01-2.95 2.28-.04.1A10.24 10.24 0 0 0 12 22Z"
      fill="#34A853"
    />
    <path
      d="M6.2 13.83A6.16 6.16 0 0 1 5.86 12c0-.64.11-1.25.3-1.83l-.01-.12-2.99-2.31-.1.05A10.16 10.16 0 0 0 2 12c0 1.64.39 3.19 1.08 4.59l3.12-2.76Z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.93c1.94 0 3.26.84 4 1.54l2.92-2.84C17.08 2.91 14.76 2 12 2a10.24 10.24 0 0 0-8.92 5.2l3.1 2.38C7 7.7 9.29 5.93 12 5.93Z"
      fill="#EA4335"
    />
  </svg>
)

export default function AuthScreen() {
  const [loading, setLoading] = useState(false)
  const [pendingInviteToken] = useState(() => readPendingInviteToken())
  const isInviteFlow = Boolean(pendingInviteToken)
  const invitePreview = pendingInviteToken
    ? `${pendingInviteToken.slice(0, 6)}...${pendingInviteToken.slice(-4)}`
    : ''

  const panelTitle = isInviteFlow ? 'Join Expensio' : 'Welcome back'
  const panelSubtitle = isInviteFlow
    ? 'Continue with Google to accept your invite.'
    : 'Sign in to track expenses and save smarter.'

  const handleLogin = async () => {
    setLoading(true)
    try {
      await signInWithGoogle(pendingInviteToken)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to continue with Google login'
      toast.error(message)
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-500 px-4 py-10 text-slate-900 sm:py-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-slate-400/35 blur-3xl motion-safe:animate-[wander_32s_ease-in-out_infinite]" />
        <div
          className="absolute right-6 top-24 h-64 w-64 rounded-full bg-sky-200/25 blur-3xl motion-safe:animate-[wander_36s_ease-in-out_infinite]"
          style={{ animationDelay: '1.2s' }}
        />
        <div
          className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-slate-300/30 blur-3xl motion-safe:animate-[wander_40s_ease-in-out_infinite]"
          style={{ animationDelay: '2.1s' }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 text-white/20 motion-safe:animate-[spin-slow_120s_linear_infinite]"
          aria-hidden="true"
        >
          <svg viewBox="0 0 640 640" className="h-full w-full" fill="none">
            <circle
              cx="320"
              cy="320"
              r="240"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="8 18"
              className="motion-safe:animate-[wave-dash_80s_linear_infinite]"
            />
            <circle cx="320" cy="320" r="180" stroke="currentColor" strokeWidth="1" opacity="0.6" />
            <path
              d="M140 380C220 240 420 240 500 140"
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="6 14"
              className="motion-safe:animate-[wave-dash_70s_linear_infinite]"
            />
            <path
              d="M120 280C240 360 400 360 520 300"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
            <circle cx="220" cy="220" r="3" fill="currentColor" />
            <circle cx="420" cy="260" r="2" fill="currentColor" />
            <circle cx="300" cy="460" r="2" fill="currentColor" />
          </svg>
        </div>
        <div
          className="absolute left-16 bottom-10 h-40 w-40 rounded-full bg-white/10 blur-2xl motion-safe:animate-[float_22s_ease-in-out_infinite]"
          style={{ animationDelay: '0.4s' }}
        />
        <div className="absolute inset-0 opacity-[0.12] mix-blend-soft-light motion-safe:animate-[grain-shift_14s_linear_infinite]">
          <svg viewBox="0 0 400 400" className="h-full w-full" fill="none" preserveAspectRatio="none">
            <filter id="noise-tex">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch" />
            </filter>
            <rect width="400" height="400" filter="url(#noise-tex)" opacity="0.35" />
          </svg>
        </div>
      </div>
      <div className="relative z-10 mx-auto w-full max-w-5xl">
        <Card className="w-full overflow-hidden rounded-[28px] border border-slate-200 bg-white py-0 shadow-[0_30px_80px_rgba(15,23,42,0.2)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-500">
          <div className="grid min-h-[600px] w-full items-stretch lg:grid-cols-[1.05fr_0.95fr]">
            {/* Left Panel */}
            <div className="relative flex h-full flex-col justify-center gap-7 bg-gradient-to-b from-white via-white to-slate-50/70 p-12 lg:border-r lg:border-slate-200/70">
              <div className="-mt-3 flex w-full items-center justify-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-50 ring-2 ring-orange-200/80">
                  <img src="/expensio.svg" alt="Expensio" className="h-7 w-7" />
                </div>
                <span className="text-3xl font-bold tracking-tight text-[#fe7515]">Expensio</span>
              </div>

              <div className="space-y-1">
                <h2 className="text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">
                  {panelTitle}
                </h2>
                <p className="text-base text-slate-600">{panelSubtitle}</p>
              </div>

              <form className="space-y-3" onSubmit={(event) => event.preventDefault()}>
                {isInviteFlow && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" weight="fill" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-emerald-700">Invite detected</p>
                        <p className="mt-1 font-mono text-xs text-emerald-600">{invitePreview}</p>
                      </div>
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  className="h-14 w-full rounded-lg border-2 border-slate-300 bg-gradient-to-b from-white to-slate-50 text-slate-900 transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01] active:scale-[0.99] active:translate-y-0 focus-visible:ring-4 focus-visible:ring-blue-500/20"
                  onClick={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ArrowsClockwise className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleMark />
                  )}
                  <span className="text-base font-bold">
                    {loading ? 'Redirecting...' : 'Continue with Google'}
                  </span>
                </Button>

                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500/80 mt-2">
                  <span className="inline-flex items-center gap-2 rounded-full bg-slate-100/80 px-4 py-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" weight="duotone" />
                    Secure Google OAuth
                  </span>
                </div>

                <p className="text-xs text-slate-500/90">
                  No password. No email. Just Google.
                </p>
              </form>
            </div>

            {/* Right Panel */}
            <div className="relative grid h-full content-center justify-items-center gap-6 overflow-hidden bg-gradient-to-br from-sky-100 via-sky-200 to-blue-200 px-8 py-12 text-slate-700">
              <div
                className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.7),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.55),transparent_50%)] opacity-80 motion-safe:animate-[drift_26s_linear_infinite]"
                aria-hidden="true"
              />
              <div
                className="absolute left-8 top-12 h-16 w-16 rounded-full bg-white/40 blur-2xl motion-safe:animate-[float_14s_ease-in-out_infinite]"
                aria-hidden="true"
              />
              <div
                className="absolute right-14 bottom-20 h-12 w-12 rounded-full bg-white/35 blur-xl motion-safe:animate-[float_11s_ease-in-out_infinite]"
                style={{ animationDelay: '1.6s' }}
                aria-hidden="true"
              />
              <div className="absolute -right-8 top-8 h-32 w-32 rounded-full bg-white/60 blur-2xl motion-safe:animate-[pulse-soft_8s_ease-in-out_infinite]" />

              <div className="relative z-10 text-center">
                <h3 className="text-2xl font-semibold text-slate-800">
                  Track expenses. <span className="text-blue-600">Save smarter.</span>
                </h3>
                <p className="mt-2 max-w-xs text-base text-slate-600">
                  Keep every spend organized with clean, instant insights.
                </p>
              </div>

              <div className="relative z-10 w-full max-w-xs rounded-2xl bg-white/80 p-4 shadow-xl ring-1 ring-white/70 backdrop-blur transition duration-200 motion-safe:animate-[float_14s_ease-in-out_infinite] hover:-translate-y-1.5 hover:scale-[1.01] hover:shadow-2xl">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>This month</span>
                  <span>May 2026</span>
                </div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">₹2,486.30</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-600">
                  <div className="rounded-lg bg-slate-100/80 px-2 py-1">Food ₹540</div>
                  <div className="rounded-lg bg-slate-100/80 px-2 py-1">Travel ₹320</div>
                  <div className="rounded-lg bg-slate-100/80 px-2 py-1">Bills ₹680</div>
                </div>
              </div>

              <div className="relative z-10 w-full max-w-xs space-y-2">
                <div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-white/60 transition duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-white/85 hover:shadow-md">
                  <Wallet className="h-4 w-4 text-blue-600" weight="duotone" />
                  <span className="font-medium">Track daily expenses</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-white/60 transition duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-white/85 hover:shadow-md">
                  <ChartLineUp className="h-4 w-4 text-indigo-600" weight="duotone" />
                  <span className="font-medium">Smart analytics</span>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm text-slate-700 shadow-sm ring-1 ring-white/60 transition duration-200 hover:-translate-y-0.5 hover:scale-[1.02] hover:bg-white/85 hover:shadow-md">
                  <Tag className="h-4 w-4 text-emerald-600" weight="duotone" />
                  <span className="font-medium">Auto categorization</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

