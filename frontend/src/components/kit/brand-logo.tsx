import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export type BrandLogoProps = {
  /** Where the logo links to. Pass `null` to render it without a link. */
  href?: string | null;
  /** Icon only (the name stays available to screen readers). */
  compact?: boolean;
  /** Small line under the name. */
  tagline?: string;
  className?: string;
  onClick?: () => void;
};

/** RalphGuard logo: icon + "RalphGuard" wordmark + tagline. */
export function BrandLogo({
  href = "/projects",
  compact = false,
  tagline = "AI Chemical Risk Screening",
  className,
  onClick,
}: BrandLogoProps) {
  const content = (
    <>
      <Image
        unoptimized
        src="/icons/logo-192.webp"
        alt=""
        width={34}
        height={34}
        className="size-[34px] shrink-0 rounded-lg object-contain"
      />
      <span className={compact ? "sr-only" : "min-w-0"}>
        <span className="block truncate font-display text-base font-bold leading-tight text-foreground">
          Ralph<span className="text-primary-strong">Guard</span>
        </span>
        {tagline && (
          <span className="block truncate text-[9px] uppercase leading-tight tracking-[0.11em] text-muted-foreground">
            {tagline}
          </span>
        )}
      </span>
    </>
  );

  const classes = cn("flex min-w-0 items-center gap-2.5 rounded-lg", className);

  if (href === null) return <div className={classes}>{content}</div>;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        classes,
        "outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
    >
      {content}
    </Link>
  );
}
