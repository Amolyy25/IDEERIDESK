"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckIcon, InfoIcon, Loader2Icon, TriangleAlertIcon, XIcon } from "lucide-react"

// Exposée en variable CSS : la jauge de temps de app/toast.css s'anime sur cette
// même durée, elle ne doit pas pouvoir diverger du minuteur de Sonner.
const DURATION_MS = 5000

// theme="light" en dur : pas de sélecteur de thème dans l'app, et "system"
// basculait Sonner en palette sombre sur un OS en dark (les toasts ont leur
// propre fond sombre, mais Sonner repeignait descriptions et boutons).
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      closeButton
      gap={12}
      offset={20}
      duration={DURATION_MS}
      visibleToasts={4}
      icons={{
        success: <CheckIcon className="size-[18px]" strokeWidth={2.5} />,
        error: <XIcon className="size-[18px]" strokeWidth={2.5} />,
        warning: <TriangleAlertIcon className="size-[18px]" strokeWidth={2.25} />,
        info: <InfoIcon className="size-[18px]" strokeWidth={2.25} />,
        loading: <Loader2Icon className="size-[18px] animate-spin" />,
      }}
      style={
        {
          "--width": "384px",
          "--toast-duration": `${DURATION_MS}ms`,
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
