"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/errors/error-screen";

// À la racine et NON dans `(app)` : un `error.tsx` ne rattrape pas le `layout.tsx`
// de son propre segment. Or c'est `(app)/layout.tsx` qui tombe quand la base ne
// répond pas — le déplacer dans `(app)` laisserait ce cas sans écran.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return <ErrorScreen error={error} reset={reset} />;
}
