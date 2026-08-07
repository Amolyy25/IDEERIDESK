import { requirePageAccess } from "@/lib/require-page-access";
import { searchDataSubjects } from "@/lib/actions/privacy";
import { SubjectSearch } from "@/components/privacy/subject-search";
import { SubjectResults } from "@/components/privacy/subject-results";

/**
 * Données personnelles : répondre à la demande d'une personne concernée.
 *
 * Trois droits, trois gestes, sur le même écran parce qu'ils répondent à la même
 * lettre : le droit d'accès (export du dossier complet, art. 15), et le droit à
 * l'effacement (art. 17) sous ses deux formes réelles — anonymiser, ce qui garde
 * le dossier support exploitable sans plus nommer personne, ou supprimer la fiche.
 *
 * Écran distinct du journal d'audit, malgré la parenté : on vient ici pour AGIR
 * sur une personne nommée, pas pour lire ce qui s'est passé. Et les deux
 * effacements ne se défont pas.
 *
 * Ce qu'aucun de ces gestes ne fait, et que l'écran répète : réécrire le texte
 * libre des tickets. Un sujet, une description, un message peuvent nommer la
 * personne ; les corriger automatiquement abîmerait le dossier sans garantir
 * l'effacement. L'export sert justement à voir ce qui reste.
 */

type SearchParams = Promise<{ q?: string }>;

export default async function PrivacyPage({ searchParams }: { searchParams: SearchParams }) {
  // La donnée est protégée par « privacy.manage » dans l'action et dans la route
  // d'export — pas par cette garde, qui ne protège que l'affichage.
  const [, params] = await Promise.all([requirePageAccess("privacy.manage"), searchParams]);

  const term = params.q?.trim() ?? "";
  const subjects = term.length >= 2 ? await searchDataSubjects(term) : [];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="space-y-0.5">
        <h1 className="text-lg font-semibold tracking-tight">Données personnelles</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Exporter en une action tout ce que l&apos;application détient sur une personne, effacer
          son identité, ou supprimer sa fiche. Le journal d&apos;audit, lui, est toujours conservé :
          les gestes de l&apos;équipe restent vérifiables, mais la personne n&apos;y est plus
          nommée.
        </p>
      </div>

      <div className="max-w-3xl">
        <SubjectSearch />
      </div>

      {term.length < 2 ? (
        <p className="max-w-3xl rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Cherchez la personne par son email — c&apos;est ce que porte une demande, et c&apos;est le
          seul identifiant qui ne se confond pas. Clients et membres de l&apos;équipe sont cherchés
          ensemble : les deux sont des personnes concernées, et l&apos;application garde du second
          le relevé le plus détaillé.
        </p>
      ) : subjects.length === 0 ? (
        <p className="max-w-3xl rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Personne ne correspond à « {term} ». Une fiche déjà anonymisée ne se retrouve plus par
          son ancien nom : c&apos;est le résultat attendu d&apos;un effacement.
        </p>
      ) : (
        <div className="max-w-5xl">
          <SubjectResults subjects={subjects} />
        </div>
      )}
    </div>
  );
}
