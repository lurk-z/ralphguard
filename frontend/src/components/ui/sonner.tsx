"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position="top-center"
      richColors
      closeButton
      visibleToasts={3}
      className="toaster group"
      toastOptions={{
        duration: 4500,
        classNames: {
          toast:
            "group toast font-sans !border-border !bg-popover !text-popover-foreground group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg",
          icon:
            "group-data-[type=success]:!text-emerald-600 group-data-[type=warning]:!text-amber-500 group-data-[type=error]:!text-red-600 group-data-[type=info]:!text-primary",
          title: "group-[.toast]:font-sans group-[.toast]:font-semibold group-[.toast]:!text-foreground",
          description: "group-[.toast]:font-sans group-[.toast]:text-sm group-[.toast]:!text-muted-foreground",
          actionButton:
            "group-[.toast]:border group-[.toast]:border-border group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground hover:!bg-accent",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground",
          closeButton:
            "group-[.toast]:!border-border group-[.toast]:!bg-popover group-[.toast]:!text-muted-foreground hover:group-[.toast]:!bg-muted hover:group-[.toast]:!text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
