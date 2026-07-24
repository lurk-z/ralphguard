"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { logRequestFailure } from "@/lib/request-reliability";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logRequestFailure("route render", error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-center">
      <div>
        <h1 className="text-lg font-semibold text-foreground">เปิดหน้านี้ไม่สำเร็จ</h1>
        <p className="mt-2 text-sm text-muted-foreground">กรุณาลองโหลดข้อมูลของหน้านี้อีกครั้ง</p>
        <Button type="button" className="mt-4" onClick={reset}>
          ลองอีกครั้ง
        </Button>
      </div>
    </main>
  );
}
