import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

/**
 * Marque du pluriel : `plural(2)` vaut « s », `plural(1)` vaut « ».
 *
 * Existe pour une raison de lisibilité : une phrase qui s'accorde sur trois mots
 * (« 2 client(s) de ticket(s) fusionné(s) ») devenait une file de ternaires où
 * la phrase elle-même disparaissait.
 */
export function plural(count: number, suffix = "s") {
  if (count > 1) return suffix
  return ""
}

/** Texte replié sur une ligne et coupé à `maxLength` : extraits de notes, d'emails, de cloche. */
export function excerpt(content: string, maxLength: number) {
  const flat = content.replace(/\s+/g, " ").trim()
  if (flat.length <= maxLength) return flat
  return `${flat.slice(0, maxLength - 1)}…`
}
