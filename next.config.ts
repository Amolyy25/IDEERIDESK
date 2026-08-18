import type { NextConfig } from "next";
import path from "node:path";

// En-têtes appliqués partout. `frame-ancestors` est traité à part : la page
// /widget DOIT rester encadrable (c'est sa raison d'être), tout le reste ne doit
// pas l'être, sinon l'espace agent est exposé au clickjacking sur des actions
// destructrices.
const BASE_SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Aucune de ces API n'est utilisée : les refuser évite qu'un contenu injecté
  // les sollicite.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    // Sources externes autorisées par l'optimiseur d'images. Chemin restreint :
    // une entrée d'hôte seul laisserait proxyfier n'importe quelle URL du CDN.
    remotePatterns: [
      { protocol: "https", hostname: "cdn.artphotolimited.com", pathname: "/images/**" },
    ],
  },
  async headers() {
    return [
      {
        // Le widget est embarqué en iframe chez les clients : on ne peut pas
        // interdire l'encadrement ici. À restreindre en listant les origines
        // autorisées (`frame-ancestors https://app.exemple.fr`) le jour où
        // elles sont connues et stables.
        source: "/widget",
        headers: BASE_SECURITY_HEADERS,
      },
      {
        // Tout le reste : espace agent, portail public, pages de partage.
        source: "/((?!widget$).*)",
        headers: [
          ...BASE_SECURITY_HEADERS,
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // Doublon volontaire de `frame-ancestors` pour les navigateurs qui ne
          // l'appliquent pas encore.
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
