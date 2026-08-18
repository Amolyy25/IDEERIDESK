import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: {
      // `src/lib/prisma.ts` construit un adaptateur au chargement du module. Le
      // pool pg est paresseux, aucune connexion n'est ouverte tant qu'aucune
      // requête ne part — cette valeur bidon suffit donc à importer les modules
      // qui en dépendent, et garantit surtout qu'un test ne pourra jamais
      // atteindre une vraie base.
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/test",
    },
  },
});
