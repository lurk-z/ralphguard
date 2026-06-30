'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Particles } from '@/components/ui/particles'

type Step = 1 | 2 | 3 | 4

const STEP_LABELS = ['อีเมล', 'ยืนยัน OTP', 'รหัสใหม่']

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {STEP_LABELS.map((label, i) => {
        const step = (i + 1) as Step
        const done = current > step
        const active = current === step
        return (
          <div key={step} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                  done
                    ? 'bg-brand text-white'
                    : active
                      ? 'bg-brand/20 text-brand ring-2 ring-brand/50'
                      : 'bg-muted text-muted-foreground',
                ].join(' ')}
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  step
                )}
              </div>
              <span
                className={[
                  'font-sans text-[10px] font-medium',
                  active ? 'text-brand' : 'text-muted-foreground',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={[
                  'mb-4 h-px w-8 transition-all duration-300',
                  done ? 'bg-brand' : 'bg-border',
                ].join(' ')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function OtpInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
      if (e.key === 'Backspace' && !value[idx] && idx > 0) {
        refs.current[idx - 1]?.focus()
      }
    },
    [value],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
      const raw = e.target.value.replace(/\D/g, '')
      if (!raw) {
        const next = [...value]
        next[idx] = ''
        onChange(next)
        return
      }
      const char = raw[raw.length - 1]
      const next = [...value]
      next[idx] = char
      onChange(next)
      if (idx < 5) refs.current[idx + 1]?.focus()
    },
    [value, onChange],
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
      if (!digits) return
      const next = Array(6).fill('')
      for (let i = 0; i < digits.length; i++) next[i] = digits[i]
      onChange(next)
      const focusIdx = Math.min(digits.length, 5)
      refs.current[focusIdx]?.focus()
    },
    [onChange],
  )

  return (
    <div className="flex justify-center gap-2">
      {Array(6)
        .fill(null)
        .map((_, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[i] ?? ''}
            onChange={(e) => handleChange(e, i)}
            onKeyDown={(e) => handleKey(e, i)}
            onPaste={handlePaste}
            aria-label={`OTP หลักที่ ${i + 1}`}
            className={[
              'h-11 w-10 rounded-xl border border-border bg-muted text-center font-mono text-base font-bold text-foreground',
              'transition-all duration-150 outline-none',
              'focus:border-brand focus:ring-2 focus:ring-brand/30',
              value[i] ? 'border-brand/60' : '',
            ].join(' ')}
          />
        ))}
    </div>
  )
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>(1)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState<string[]>(Array(6).fill(''))
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)

  const simulateAsync = (cb: () => void, ms = 900) => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      cb()
    }, ms)
  }

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault()
    simulateAsync(() => setStep(2))
  }

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault()
    simulateAsync(() => setStep(3))
  }

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault()
    simulateAsync(() => setStep(4))
  }

  const handleResend = () => {
    setResendCooldown(60)
    const t = setInterval(() => {
      setResendCooldown((v) => {
        if (v <= 1) { clearInterval(t); return 0 }
        return v - 1
      })
    }, 1000)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10">
      <Particles
        quantity={120}
        color="#2DD4BF"
        size={0.4}
        staticity={40}
        ease={60}
        className="absolute inset-0 z-0"
      />

      <div className="relative z-10 w-full max-w-3xl">
        <Card className="overflow-hidden border-border bg-card shadow-[0_8px_48px_rgba(0,0,0,0.30)]">
          <CardContent className="grid p-0 md:grid-cols-2">

            {/* Form side */}
            <div className="p-6 md:p-8">

              {/* Back link — hidden on success */}
              {step < 4 && (
                <Link
                  href="/login"
                  className="mb-5 inline-flex items-center gap-1 font-sans text-xs font-medium text-muted-foreground no-underline transition-colors hover:text-brand"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  กลับสู่หน้าเข้าสู่ระบบ
                </Link>
              )}

              {/* Step 1 — email */}
              {step === 1 && (
                <form onSubmit={handleSendOtp}>
                  <div className="flex flex-col gap-5">
                    <div className="text-center">
                      <h1 className="font-sans text-2xl font-bold text-foreground">ลืมรหัสผ่าน</h1>
                      <p className="mt-1 font-sans text-sm text-muted-foreground">
                        ป้อนอีเมลของคุณ เราจะส่ง OTP เพื่อยืนยันตัวตน
                      </p>
                    </div>

                    <StepIndicator current={1} />

                    <div className="grid gap-1.5">
                      <Label htmlFor="email" className="font-sans text-sm font-medium text-foreground">อีเมล</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="name@example.com"
                          required
                          autoComplete="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="h-11 rounded-xl border-border bg-muted pl-10 font-sans text-sm placeholder:text-muted-foreground/60 focus-visible:ring-brand"
                        />
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="h-11 w-full rounded-xl bg-brand font-sans text-sm font-semibold text-white transition-all hover:bg-brand/90 active:scale-[0.98] disabled:opacity-60"
                    >
                      {loading ? 'กำลังส่ง…' : 'ส่ง OTP'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Step 2 — OTP */}
              {step === 2 && (
                <form onSubmit={handleVerifyOtp}>
                  <div className="flex flex-col gap-5">
                    <div className="text-center">
                      <h1 className="font-sans text-2xl font-bold text-foreground">ยืนยัน OTP</h1>
                      <p className="mt-1 font-sans text-sm text-muted-foreground">
                        กรอกรหัส 6 หลักที่ส่งไปยัง{' '}
                        <span className="font-semibold text-foreground">{email}</span>
                      </p>
                    </div>

                    <StepIndicator current={2} />

                    <OtpInput value={otp} onChange={setOtp} />

                    <Button
                      type="submit"
                      disabled={loading || otp.join('').length < 6}
                      className="h-11 w-full rounded-xl bg-brand font-sans text-sm font-semibold text-white transition-all hover:bg-brand/90 active:scale-[0.98] disabled:opacity-60"
                    >
                      {loading ? 'กำลังตรวจสอบ…' : 'ยืนยัน OTP'}
                    </Button>

                    <p className="text-center font-sans text-xs text-muted-foreground">
                      ไม่ได้รับรหัส?{' '}
                      {resendCooldown > 0 ? (
                        <span className="text-muted-foreground/60">ส่งอีกครั้งใน {resendCooldown}s</span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResend}
                          className="cursor-pointer font-semibold text-brand hover:text-brand/80"
                        >
                          ส่งอีกครั้ง
                        </button>
                      )}
                    </p>
                  </div>
                </form>
              )}

              {/* Step 3 — new password */}
              {step === 3 && (
                <form onSubmit={handleResetPassword}>
                  <div className="flex flex-col gap-4">
                    <div className="text-center">
                      <h1 className="font-sans text-2xl font-bold text-foreground">ตั้งรหัสผ่านใหม่</h1>
                      <p className="mt-1 font-sans text-sm text-muted-foreground">
                        รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร
                      </p>
                    </div>

                    <StepIndicator current={3} />

                    <div className="grid gap-1.5">
                      <Label htmlFor="new-password" className="font-sans text-sm font-medium text-foreground">รหัสผ่านใหม่</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="new-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          className="h-11 rounded-xl border-border bg-muted pl-10 pr-10 font-sans text-sm placeholder:text-muted-foreground/60 focus-visible:ring-brand"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-1.5">
                      <Label htmlFor="confirm-password" className="font-sans text-sm font-medium text-foreground">ยืนยันรหัสผ่าน</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="confirm-password"
                          type={showConfirm ? 'text' : 'password'}
                          placeholder="••••••••"
                          required
                          minLength={8}
                          autoComplete="new-password"
                          className="h-11 rounded-xl border-border bg-muted pl-10 pr-10 font-sans text-sm placeholder:text-muted-foreground/60 focus-visible:ring-brand"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={showConfirm ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        >
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={loading}
                      className="h-11 w-full rounded-xl bg-brand font-sans text-sm font-semibold text-white transition-all hover:bg-brand/90 active:scale-[0.98] disabled:opacity-60"
                    >
                      {loading ? 'กำลังบันทึก…' : 'รีเซ็ตรหัสผ่าน'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Step 4 — success */}
              {step === 4 && (
                <div className="flex flex-col items-center gap-5 py-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/15">
                    <CheckCircle2 className="h-9 w-9 text-brand" />
                  </div>
                  <div>
                    <h1 className="font-sans text-2xl font-bold text-foreground">รีเซ็ตสำเร็จ!</h1>
                    <p className="mt-2 font-sans text-sm text-muted-foreground">
                      รหัสผ่านของคุณถูกเปลี่ยนเรียบร้อยแล้ว<br />
                      กลับไปเข้าสู่ระบบเพื่อใช้งานต่อ
                    </p>
                  </div>
                  <Button
                    asChild
                    className="h-11 w-full rounded-xl bg-brand font-sans text-sm font-semibold text-white transition-all hover:bg-brand/90 active:scale-[0.98]"
                  >
                    <Link href="/login" className="no-underline">เข้าสู่ระบบ</Link>
                  </Button>
                </div>
              )}

            </div>

            {/* Image side */}
            <div className="relative hidden bg-muted md:block">
              <img
                src="/placeholder.svg"
                alt=""
                className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
              />
            </div>

          </CardContent>
        </Card>
      </div>
    </div>
  )
}
