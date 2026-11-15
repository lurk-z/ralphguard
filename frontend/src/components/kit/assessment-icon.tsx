import type { ReactNode, SVGProps } from "react";

export type AssessmentEndpoint = "skin" | "eye" | "sens" | "acute" | "skin_dryness";

const SYMBOLS: Record<AssessmentEndpoint, ReactNode> = {
  // Hand with irritation marks.
  skin: (
    <>
      <path d="M8 13V6.5a1.25 1.25 0 0 1 2.5 0V11 4.5a1.25 1.25 0 0 1 2.5 0V11 6a1.25 1.25 0 0 1 2.5 0v6-3a1.25 1.25 0 0 1 2.5 0v7a5 5 0 0 1-5 5h-1a5 5 0 0 1-4-2l-3.2-4.3a1.3 1.3 0 0 1 1.9-1.7L8 14" />
      <path d="m11.5 14 1 1.5-1 1.5M3 7l1.5 1M4.5 3.5l1 1.5M1.5 11H4" />
    </>
  ),
  // Irritated eye with three short rays.
  eye: (
    <>
      <path d="M2 13s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 13 2 13Z" />
      <circle cx="12" cy="13" r="3" />
      <path d="M12 2v2M5 4l1.5 1.5M19 4l-1.5 1.5" />
    </>
  ),
  // Skin patch with a cluster of rash spots.
  sens: (
    <>
      <path d="M4 5h8M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2" />
      <path d="m18 2 .9 3.1L22 6l-3.1.9L18 10l-.9-3.1L14 6l3.1-.9L18 2Z" />
      <g fill="currentColor" stroke="none">
        <circle cx="7.5" cy="10" r="1" />
        <circle cx="12" cy="12" r="1" />
        <circle cx="7" cy="16" r="1" />
        <circle cx="12.5" cy="18" r="1" />
        <circle cx="16.5" cy="14.5" r="1" />
      </g>
    </>
  ),
  // Human body with a sudden-effect lightning bolt.
  acute: (
    <>
      <circle cx="12" cy="5" r="3" />
      <path d="M7 21H4v-6a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v6h-3" />
      <path d="m13 12-4 5h3l-1 5 5-6h-3l1-4Z" />
    </>
  ),
  // Dry skin surface split by a branching crack.
  skin_dryness: (
    <>
      <path d="M3 6c1.5-2 3-2 4.5 0S10.5 8 12 6s3-2 4.5 0S19.5 8 21 6v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" />
      <path d="m13 8-3 5 3 2-2 6M10 13H6M13 15l4-3" />
    </>
  ),
};

export function isAssessmentEndpoint(value: string): value is AssessmentEndpoint {
  return Object.prototype.hasOwnProperty.call(SYMBOLS, value);
}

export type AssessmentIconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  endpoint: AssessmentEndpoint;
  /** Omit next to a visible label; provide for a standalone, accessible icon. */
  label?: string;
};

/** Category symbols use shape, independently of the score's risk colour. */
export function AssessmentIcon({ endpoint, label, ...props }: AssessmentIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...props}
    >
      {SYMBOLS[endpoint]}
    </svg>
  );
}
