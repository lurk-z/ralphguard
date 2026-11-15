import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons, search, toggles: stack under the title on small screens. */
  actions?: ReactNode;
  className?: string;
};

/** Page title + short description, with actions on the right (below on mobile). */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-lg font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">{actions}</div>}
    </div>
  );
}
