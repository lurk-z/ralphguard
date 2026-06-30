'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Particles } from '@/components/ui/particles'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)

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
            <form className="p-6 md:p-8" onSubmit={(e) => e.preventDefault()}>
              <div className="flex flex-col gap-5">

                {/* Heading */}
                <div className="text-center">
                  <h1 className="font-sans text-2xl font-bold text-foreground">เข้าสู่ระบบ</h1>
                  <p className="mt-1 font-sans text-sm text-muted-foreground">เข้าสู่ระบบเพื่อใช้งาน RalphGuard</p>
                </div>

                {/* Email */}
                <div className="grid gap-1.5">
                  <Label htmlFor="email" className="font-sans text-sm font-medium text-foreground">อีเมล</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      required
                      className="h-11 rounded-xl border-border bg-muted pl-10 font-sans text-sm placeholder:text-muted-foreground/60 focus-visible:ring-brand"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="grid gap-1.5">
                  <div className="flex items-center">
                    <Label htmlFor="password" className="font-sans text-sm font-medium text-foreground">รหัสผ่าน</Label>
                    <Link
                      href="/forgot-password"
                      className="ml-auto font-sans text-xs font-medium text-brand no-underline transition-colors hover:text-brand/80"
                    >
                      ลืมรหัสผ่าน?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••"
                      required
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

                {/* Submit */}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl bg-brand font-sans text-sm font-semibold text-white transition-transform hover:bg-brand/90 active:scale-[0.98]"
                >
                  เข้าสู่ระบบ
                </Button>

                {/* Divider */}
                <div className="relative text-center after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
                  <span className="relative z-10 bg-card px-2 font-sans text-xs text-muted-foreground">
                    หรือเข้าสู่ระบบด้วย
                  </span>
                </div>

                {/* Google */}
                <Button
                  variant="outline"
                  type="button"
                  className="h-11 w-full rounded-xl border-border bg-card font-sans text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <GoogleIcon />
                  เข้าสู่ระบบด้วย Google
                </Button>

                {/* Link to register */}
                <p className="text-center font-sans text-sm text-muted-foreground">
                  ยังไม่มีบัญชี?{' '}
                  <Link href="/register" className="font-semibold text-brand no-underline transition-colors hover:text-brand/80">
                    สร้างบัญชี
                  </Link>
                </p>

              </div>
            </form>

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
