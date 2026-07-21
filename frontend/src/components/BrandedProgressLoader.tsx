"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type BrandedProgressLoaderProps = {
  label?: string;
  fullScreen?: boolean;
  className?: string;
};

export default function BrandedProgressLoader({
  label = "กำลังโหลดข้อมูลล่าสุด",
  fullScreen = true,
  className,
}: BrandedProgressLoaderProps) {
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        if (current < 48) return Math.min(92, current + 8);
        if (current < 76) return Math.min(92, current + 5);
        return Math.min(92, current + 2);
      });
    }, 180);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "app-light grid place-items-center bg-background/95 p-6 backdrop-blur-sm",
        fullScreen ? "fixed inset-0 z-[100]" : "min-h-80 w-full",
        className,
      )}
    >
      <div className="w-full max-w-sm text-center">
        <Image
          src="/icons/logo.png"
          alt="RalphGuard"
          width={96}
          height={96}
          priority
          className="mx-auto size-24 object-contain"
        />
        <Progress
          value={progress}
          aria-label="ความคืบหน้าการโหลดโปรเจกต์"
          className="mx-auto mt-6 h-1.5 w-56"
        />
        <p className="mt-3 text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
