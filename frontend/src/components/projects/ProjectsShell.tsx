"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { FolderKanban } from "lucide-react";

const SIDEBAR_STORAGE_KEY = "ralphguard:projects-sidebar-width:v2";
const DEFAULT_SIDEBAR_WIDTH = 308;
const MIN_SIDEBAR_WIDTH = 72;
const MAX_SIDEBAR_WIDTH = 360;
const COMPACT_SIDEBAR_WIDTH = 112;

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function snapSidebarWidth(width: number) {
  const clampedWidth = clampSidebarWidth(width);
  return clampedWidth <= COMPACT_SIDEBAR_WIDTH
    ? MIN_SIDEBAR_WIDTH
    : clampedWidth;
}

function Brand({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/projects"
      aria-label="กลับหน้าโปรเจกต์"
      onClick={onNavigate}
      className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Image
        src="/icons/logo.png"
        alt=""
        width={34}
        height={34}
        priority
        className="size-[34px] min-h-[34px] min-w-[34px] shrink-0 rounded-lg object-contain"
      />
      <div className={compact ? "sr-only" : "min-w-0 overflow-hidden"}>
        <p className="truncate whitespace-nowrap font-display text-base font-bold leading-tight text-foreground">
          Ralph<span className="text-primary">Guard</span>
        </p>
        <p className="truncate whitespace-nowrap text-[9px] uppercase leading-tight tracking-[0.11em] text-muted-foreground">
          AI Chemical Risk Screening
        </p>
      </div>
    </Link>
  );
}

export default function ProjectsShell({
  header,
  children,
  onBrandClick,
  mobileTitle,
}: {
  header: ReactNode;
  children: ReactNode;
  onBrandClick?: () => void;
  mobileTitle?: ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const compact = sidebarWidth <= COMPACT_SIDEBAR_WIDTH;

  useLayoutEffect(() => {
    const storedWidth = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      setSidebarWidth(snapSidebarWidth(storedWidth));
    }
  }, []);

  useEffect(() => {
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      setSidebarWidth(
        clampSidebarWidth(dragState.startWidth + event.clientX - dragState.startX),
      );
    };

    const stopResizing = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSidebarWidth((currentWidth) => {
        const finalWidth = snapSidebarWidth(currentWidth);
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(finalWidth));
        return finalWidth;
      });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  const startResizing = (event: PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: sidebarWidth,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    event.preventDefault();
  };

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextWidth = sidebarWidth;
    if (event.key === "ArrowLeft") nextWidth -= 16;
    else if (event.key === "ArrowRight") {
      nextWidth =
        sidebarWidth === MIN_SIDEBAR_WIDTH
          ? COMPACT_SIDEBAR_WIDTH + 16
          : sidebarWidth + 16;
    }
    else if (event.key === "Home") nextWidth = MIN_SIDEBAR_WIDTH;
    else if (event.key === "End") nextWidth = MAX_SIDEBAR_WIDTH;
    else return;

    event.preventDefault();
    const finalWidth = snapSidebarWidth(nextWidth);
    setSidebarWidth(finalWidth);
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(finalWidth));
  };

  return (
    <div className="app-light flex min-h-dvh bg-background">
      <aside
        className="sticky top-0 hidden h-dvh shrink-0 self-start flex-col overflow-hidden border-r bg-card xl:flex"
        style={{ width: sidebarWidth }}
      >
        <div
          className={`flex h-[72px] items-center border-b ${
            compact ? "justify-center px-3" : "px-5"
          }`}
        >
          <Brand compact={compact} onNavigate={onBrandClick} />
        </div>

        <nav aria-label="เมนูโปรเจกต์" className="flex-1 p-3">
          <Link
            href="/projects"
            aria-current="page"
            title={compact ? "โปรเจกต์ทั้งหมด" : undefined}
            className={`flex h-11 items-center rounded-xl bg-accent text-sm font-normal text-accent-foreground ${
              compact ? "justify-center px-0" : "gap-3 px-3"
            }`}
          >
            <FolderKanban className="size-4 min-h-4 min-w-4 shrink-0 text-primary" />
            <span className={compact ? "sr-only" : "min-w-0 truncate whitespace-nowrap"}>
              โปรเจกต์ทั้งหมด
            </span>
          </Link>
        </nav>

        <div
          role="separator"
          aria-label="ปรับความกว้างแถบด้านข้าง"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={Math.round(sidebarWidth)}
          tabIndex={0}
          className="group absolute -right-1 top-0 z-50 h-full w-2 cursor-col-resize touch-none outline-none"
          onPointerDown={startResizing}
          onKeyDown={resizeWithKeyboard}
        >
          <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur sm:flex sm:items-center">
          <div className="flex h-14 items-center gap-3 border-b bg-card px-4 sm:h-auto sm:min-w-[12rem] sm:shrink-0 sm:border-b-0 sm:pr-2 xl:hidden">
            <Brand compact onNavigate={onBrandClick} />
            {mobileTitle && (
              <>
                <span aria-hidden="true" className="h-5 w-px bg-border" />
                <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
                  {mobileTitle}
                </div>
              </>
            )}
          </div>

          <header className="min-w-0 flex-1">
            {header}
          </header>
        </div>

        <main>{children}</main>
      </div>
    </div>
  );
}
