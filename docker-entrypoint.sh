#!/bin/sh
set -e

# Applique les migrations Prisma si la base de données est configurée
if [ -n "$DATABASE_URL" ] || [ -n "$DIRECT_URL" ]; then
  echo "🚀 Exécution des migrations Prisma..."
  ./node_modules/.bin/prisma migrate deploy 2>/dev/null || npx --yes prisma migrate deploy || echo "⚠️ Attention: Impossible d'exécuter les migrations ou base non accessible. Démarrage de l'application..."
fi

exec "$@"
