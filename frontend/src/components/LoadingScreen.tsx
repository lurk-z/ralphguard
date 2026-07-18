"use client";

// Full-page loading screen shown while a page's client-only data (localStorage
// projects, etc.) hasn't been read yet — avoids a flash of an "empty" state
// before the real data is available. Reusable across any (dashboard) page.
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";

export default function LoadingScreen({
  label = "กำลังโหลด...",
  onFinished,
}: {
  label?: string;
  onFinished?: () => void;
}) {
  const [progress, setProgress] = useState(15);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          const finishTimeout = setTimeout(() => {
            onFinished?.();
          }, 180);
          return 100;
        }
        // Smoothly step up to 100%
        const increment = Math.floor(Math.random() * 20) + 15;
        return Math.min(prev + increment, 100);
      });
    }, 70);

    return () => clearInterval(timer);
  }, [onFinished]);

  return (
    <div className="app-light fixed inset-0 z-50 grid place-items-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <img
          src="/icons/logo.svg"
          alt="RalphGuard"
          className="size-24 animate-logo-breathe"
        />
        <div className="flex flex-col items-center gap-2 w-56">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <Progress value={progress} className="h-1.5 w-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
