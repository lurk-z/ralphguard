import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

/** shadcn "Field": label + control + description/error as one unit. */

function FieldSet({ className, ...props }: React.ComponentProps<"fieldset">) {
  return <fieldset className={cn("flex flex-col gap-6", className)} {...props} />
}

function FieldLegend({ className, ...props }: React.ComponentProps<"legend">) {
  return <legend className={cn("mb-3 text-base font-medium", className)} {...props} />
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field-group" className={cn("flex w-full flex-col gap-7", className)} {...props} />
}

const fieldVariants = cva("group/field flex w-full gap-3 data-[invalid=true]:text-destructive", {
  variants: {
    orientation: {
      vertical: "flex-col [&>*]:w-full",
      horizontal: "flex-row items-center [&>[data-slot=field-label]]:flex-auto",
      responsive: "flex-col [&>*]:w-full @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto",
    },
  },
  defaultVariants: { orientation: "vertical" },
})

function Field({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>) {
  return <div role="group" data-slot="field" data-orientation={orientation} className={cn(fieldVariants({ orientation }), className)} {...props} />
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-1 flex-col gap-1.5 leading-snug", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return (
    <Label
      data-slot="field-label"
      className={cn("flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50", className)}
      {...props}
    />
  )
}

function FieldDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-description" className={cn("text-sm font-normal leading-normal text-muted-foreground", className)} {...props} />
}

function FieldError({
  className,
  children,
  errors,
  ...props
}: React.ComponentProps<"div"> & { errors?: Array<{ message?: string } | undefined> }) {
  const content = children ?? errors?.map((e) => e?.message).filter(Boolean).join(" · ")
  if (!content) return null
  return (
    <div role="alert" data-slot="field-error" className={cn("text-sm font-normal text-destructive", className)} {...props}>
      {content}
    </div>
  )
}

export { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet }
