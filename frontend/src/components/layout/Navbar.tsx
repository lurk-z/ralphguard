'use client'

import { useState, useEffect } from 'react'
import { FlaskConical, ArrowRight } from 'lucide-react'
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
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6">
        {/* Logo */}
        <a href="#hero" className="flex items-center gap-2.5 group">
          <div className="relative flex size-8 items-center justify-center sm:size-9">
            <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-brand/70 rounded-tl-[3px] transition-colors group-hover:border-brand" />
            <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-brand/70 rounded-tr-[3px] transition-colors group-hover:border-brand" />
            <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-brand/70 rounded-bl-[3px] transition-colors group-hover:border-brand" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-brand/70 rounded-br-[3px] transition-colors group-hover:border-brand" />
            <FlaskConical size={17} className="text-brand" />
          </div>
          <span className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
            RalphGuard
          </span>
        </a>

        {/* Right side — enter the app (login removed) */}
        <Button
          asChild
          variant="outline"
          className="h-9 rounded-full border-brand/40 bg-transparent px-3 text-xs text-foreground hover:border-brand/70 hover:bg-brand/10 sm:h-10 sm:px-4 sm:text-sm"
        >
          <a href="/projects">
            เข้าใช้งาน
            <ArrowRight className="text-brand" />
          </a>
        </Button>
      </div>
    </nav>
  )
}
