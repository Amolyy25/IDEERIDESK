import { Fragment } from "react";
import { X } from "lucide-react";
import type { KnownError } from "@/lib/error-catalog";

const MAILLONS = [
  { id: "browser", label: "Navigateur" },
  { id: "app", label: "Ideeri Desk" },
  { id: "database", label: "Base" },
] as const;

// Ce que l'agent veut savoir d'abord : si la panne vient de son poste ou
// d'ailleurs. Rien n'est affiché quand elle n'est pas technique (droits
// manquants) — un schéma intact sous un message d'erreur ne dirait rien.
export function DiagnosticChain({ failsAt }: { failsAt: KnownError["failsAt"] }) {
  if (!failsAt) return null;

  const rompu = MAILLONS.find((m) => m.id === failsAt)!;
  // Seule une panne de base coupe un lien ; les deux autres sont des maillons
  // atteints, joignables mais fautifs.
  const lienCoupe = failsAt === "database";

  return (
    <div
      role="img"
      aria-label={`Chaîne de diagnostic : ${rompu.label} est en cause.`}
      className="rounded-lg bg-muted/40 px-6 py-5"
    >
      <div className="mx-auto flex max-w-sm items-start">
        {MAILLONS.map((maillon, index) => (
          <Fragment key={maillon.id}>
            {index > 0 ? (
              <Lien coupe={lienCoupe && maillon.id === failsAt} />
            ) : null}
            <Maillon label={maillon.label} enCause={maillon.id === failsAt} />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Maillon({ label, enCause }: { label: string; enCause: boolean }) {
  return (
    <div className="flex w-24 shrink-0 flex-col items-center gap-2.5 text-center">
      <span
        aria-hidden
        className={
          enCause
            ? "diagnostic-break h-2.5 w-2.5 rounded-full bg-destructive ring-4 ring-destructive/15"
            : "h-2.5 w-2.5 rounded-full bg-border"
        }
      />
      <span
        className={
          enCause
            ? "font-mono text-[10px] leading-tight tracking-[0.1em] text-foreground uppercase"
            : "font-mono text-[10px] leading-tight tracking-[0.1em] text-muted-foreground uppercase"
        }
      >
        {label}
      </span>
    </div>
  );
}

// Le trait s'aligne sur le centre du point (2,5 rem / 2 moins l'épaisseur).
function Lien({ coupe }: { coupe: boolean }) {
  if (!coupe) {
    return <span aria-hidden className="mt-[5px] h-px min-w-6 flex-1 bg-border" />;
  }

  return (
    <span aria-hidden className="relative mt-[5px] flex min-w-6 flex-1 items-center">
      <span className="h-px w-full border-t border-dashed border-destructive/40" />
      <X className="diagnostic-break absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 text-destructive" />
    </span>
  );
}
