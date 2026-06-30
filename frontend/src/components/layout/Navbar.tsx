'use client'

import { useState, useEffect } from 'react'
import { FlaskConical, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'bg-transparent backdrop-blur-md' : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="#hero" className="flex items-center gap-2.5 group">
          <div className="relative w-9 h-9 flex items-center justify-center">
            <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-brand/70 rounded-tl-[3px] transition-colors group-hover:border-brand" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-brand/70 rounded-tr-[3px] transition-colors group-hover:border-brand" />
            <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-brand/70 rounded-bl-[3px] transition-colors group-hover:border-brand" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-brand/70 rounded-br-[3px] transition-colors group-hover:border-brand" />
            <FlaskConical size={17} className="text-brand" />
          </div>
          <span className="font-display font-semibold text-lg tracking-tight text-foreground">
            RalphGuard
          </span>
        </a>

        {/* Right side — login only */}
        <Button
          asChild
          variant="outline"
          className="rounded-full bg-transparent border-brand/40 text-foreground hover:bg-brand/10 hover:border-brand/70"
        >
          <a href="/login">
            <User className="text-brand" />
            เข้าสู่ระบบ
          </a>
        </Button>
      </div>
    </nav>
  )
}
