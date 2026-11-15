"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: { box: "size-8", pad: "p-0.5", icon: "size-3.5" },
  md: { box: "size-10", pad: "p-1", icon: "size-4" },
  lg: { box: "size-14", pad: "p-1.5", icon: "size-5" },
} as const;

export type SubstanceThumbnailProps = {
  /** Substance name (tooltip). */
  name: string;
  /** Structure image URL, e.g. from `substanceDepictionUrl(smiles)`. Empty → flask icon. */
  imageUrl?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
};

/**
 * Chemical structure thumbnail with a flask-icon fallback when there is no
 * image or it fails to load. One component for the six copies in the app.
 */
export function SubstanceThumbnail({ name, imageUrl, size = "md", className }: SubstanceThumbnailProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  const s = SIZE[size];

  return (
    <span
      aria-hidden="true"
      title={name}
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-card", s.box, className)}
    >
      {imageUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className={cn("size-full object-contain", s.pad)}
        />
      ) : (
        <FlaskConical className={cn("text-muted-foreground", s.icon)} />
      )}
    </span>
  );
}
