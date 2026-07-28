import type { NextRequest } from "next/server";

/**
 * Limitation de débit en mémoire, par clé (IP le plus souvent).
 *
 * Volontairement local au processus : sans elle, un tiers anonyme peut boucler
 * sur la création de ticket publique et écrire des dizaines de Mo de pièces
 * jointes en base (colonnes BYTEA) tout en déclenchant un email par requête.
 * Une instance unique suffit au déploiement actuel (un seul conteneur) — à
 * remplacer par un compteur partagé (Redis) le jour où l'application est
 * répliquée, sinon la limite est multipliée par le nombre d'instances.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Purge paresseuse : sans elle, la Map croît indéfiniment avec le nombre
// d'adresses vues (fuite mémoire à ciel ouvert sur une route publique).
function sweep(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Secondes avant réinitialisation, pour l'en-tête `Retry-After`. */
  retryAfter: number;
};

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

/**
 * Adresse de l'appelant derrière le proxy de la plateforme. `x-forwarded-for`
 * est déclaratif, donc falsifiable : la limite ne vaut que contre l'abus
 * ordinaire, pas contre un attaquant qui fait tourner l'en-tête. C'est
 * néanmoins la seule information disponible ici, et elle suffit à contenir le
 * cas courant (script naïf, boucle accidentelle).
 */
export function clientKey(request: NextRequest, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "inconnu";
  return `${scope}:${ip}`;
}
