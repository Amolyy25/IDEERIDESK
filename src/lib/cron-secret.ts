import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Contrôle des routes déclenchées par un ordonnanceur externe
 * (`/api/gmail/sync`, `/api/cron/automations`).
 *
 * Le secret est lu dans un en-tête et jamais dans l'URL : une URL complète est
 * journalisée par les proxys, les logs d'accès de la plateforme et
 * l'historique de l'ordonnanceur — le secret y apparaîtrait en clair, et il
 * suffit à muter des tickets et à envoyer des emails aux clients.
 *
 * Comparaison à temps constant : la comparaison naïve de deux chaînes s'arrête
 * au premier octet différent, ce qui laisse deviner le secret octet par octet.
 */
export function hasValidCronSecret(request: NextRequest, headerName: string, expected: string | undefined) {
  if (!expected) return false;
  const provided = request.headers.get(headerName);
  if (!provided) return false;

  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
