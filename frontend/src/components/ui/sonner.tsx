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
            "group toast font-sans !border-white !bg-white !text-slate-800 group-[.toaster]:rounded-xl group-[.toaster]:shadow-lg",
          icon:
            "group-data-[type=success]:!text-emerald-600 group-data-[type=warning]:!text-amber-500 group-data-[type=error]:!text-rose-600 group-data-[type=info]:!text-sky-600",
          title: "group-[.toast]:font-sans group-[.toast]:font-semibold group-[.toast]:!text-slate-800",
          description: "group-[.toast]:font-sans group-[.toast]:text-xs group-[.toast]:leading-5 group-[.toast]:!text-slate-600",
          actionButton:
            "group-[.toast]:border group-[.toast]:border-border group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground hover:!bg-accent",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground",
          closeButton:
            "group-[.toast]:!border-slate-200 group-[.toast]:!bg-white group-[.toast]:!text-slate-400 hover:group-[.toast]:!bg-slate-100 hover:group-[.toast]:!text-slate-600",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
