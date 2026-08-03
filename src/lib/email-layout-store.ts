import { prisma } from "@/lib/prisma";
import { DEFAULT_EMAIL_LAYOUT_HTML } from "@/lib/email-layout";

/**
 * Gabarit d'habillage à utiliser pour un envoi.
 *
 * Séparé des Server Actions (`lib/actions/email-layout.ts`, réservées aux
 * admins) : l'envoi d'un email a lieu dans des contextes qui n'ont pas d'admin
 * connecté — synchronisation Gmail, règles automatiques, accusé de réception
 * déclenché par un formulaire public.
 */
export async function getEmailLayoutHtml() {
  const template = await prisma.emailLayoutTemplate.findFirst();
  if (!template) return DEFAULT_EMAIL_LAYOUT_HTML;
  return template.html;
}
