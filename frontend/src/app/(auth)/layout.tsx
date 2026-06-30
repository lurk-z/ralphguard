import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "RalphGuard",
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-theme min-h-screen bg-background">
      {children}
    </div>
  )
}
