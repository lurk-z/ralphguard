"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans group-[.toaster]:border-border group-[.toaster]:bg-white group-[.toaster]:text-foreground group-[.toaster]:shadow-lg",
          title: "group-[.toast]:font-sans group-[.toast]:text-foreground",
          description: "group-[.toast]:font-sans group-[.toast]:text-foreground",
          actionButton:
            "group-[.toast]:border group-[.toast]:border-border group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground hover:!bg-accent",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:font-sans group-[.toast]:text-foreground",
          closeButton:
            "group-[.toast]:border-0 group-[.toast]:bg-transparent group-[.toast]:text-foreground/60 hover:group-[.toast]:bg-muted hover:group-[.toast]:text-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
