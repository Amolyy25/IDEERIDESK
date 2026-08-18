"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/errors/error-screen";
import "./globals.css";

// Le layout racine lui-même a échoué : rien de ce qu'il pose n'existe, d'où le
// `<html>`, le `<body>` et l'import des styles écrits ici. Ne s'affiche qu'en
// production — en développement Next garde son overlay.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  );
}
