"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, ScrollText, Ticket, Trash2, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDateTime } from "@/lib/format-date";
import { anonymizeDataSubject, deleteDataSubject } from "@/lib/actions/privacy";
import {
  SUBJECT_KIND_LABELS,
  subjectExportHref,
  type SubjectSummary,
} from "@/lib/privacy-subject";

/**
 * Une personne trouvée, et les trois réponses possibles à sa demande.
 *
 * Le parti pris de cet écran : chaque geste annonce d'abord ce qu'il LAISSE, pas
 * seulement ce qu'il retire. C'est ce qui manque d'habitude à ce genre
 * d'interface — on y lit « cette action est irréversible », ce qui n'aide
 * personne à choisir entre anonymiser et supprimer. Ici les deux boîtes de
 * confirmation énumèrent ce qui subsistera dans l'application, y compris quand
 * c'est gênant : le sujet d'un ticket ou le corps d'un message continuent de
 * nommer la personne, et aucun automatisme ne peut le rattraper sans abîmer le
 * dossier support.
 */

function KindBadge({ subject }: { subject: SubjectSummary }) {
  return (
    <Badge variant="ghost" className="bg-muted text-muted-foreground">
      {SUBJECT_KIND_LABELS[subject.kind]}
      {subject.roleLabel === "Administrateur" && " · administrateur"}
    </Badge>
  );
}

/** Les deux volumes qui décident du geste : combien de dossiers, combien de traces. */
function Volumes({ subject }: { subject: SubjectSummary }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Ticket className="size-3.5" aria-hidden />
        {subject.ticketCount} ticket{subject.ticketCount > 1 ? "s" : ""}
        {subject.kind === "AGENT" ? " assigné(s)" : ""}
      </span>
      <span className="flex items-center gap-1.5">
        <ScrollText className="size-3.5" aria-hidden />
        {subject.journalEntryCount} entrée{subject.journalEntryCount > 1 ? "s" : ""} au journal
      </span>
      <span>Fiche créée le {formatDateTime(subject.createdAt)}</span>
    </div>
  );
}

export function SubjectResults({ subjects }: { subjects: SubjectSummary[] }) {
  const router = useRouter();
  /** Identifiant de la personne en cours de traitement : neutralise ses boutons. */
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function run(
    subject: SubjectSummary,
    action: typeof anonymizeDataSubject | typeof deleteDataSubject,
    done: (result: { pseudonym: string; ticketCount: number }) => string,
  ) {
    setPendingId(subject.id);
    try {
      const result = await action({ kind: subject.kind, id: subject.id });
      toast.success(done(result));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Geste impossible");
    } finally {
      setPendingId(null);
    }
  }

  if (subjects.length === 0) return null;

  return (
    <ul className="space-y-3">
      {subjects.map((subject) => {
        const anonymizedAt = subject.anonymizedAt;
        const anonymized = anonymizedAt !== null;
        const busy = pendingId === subject.id;

        return (
          <li key={`${subject.kind}-${subject.id}`}>
            <Card>
              <CardContent className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{subject.name}</span>
                    <KindBadge subject={subject} />
                    {anonymizedAt && (
                      <Badge
                        variant="ghost"
                        className="bg-violet-500/10 text-violet-700 dark:text-violet-300"
                      >
                        Identité effacée le {formatDateTime(anonymizedAt)}
                      </Badge>
                    )}
                    {subject.isActive === false && !anonymized && (
                      <Badge variant="ghost" className="bg-muted text-muted-foreground">
                        Compte désactivé
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{subject.email}</p>
                  {(subject.phone || subject.company) && (
                    <p className="text-xs text-muted-foreground">
                      {[subject.company, subject.phone].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <Volumes subject={subject} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Une seule action pour l'export : un lien, que le navigateur
                      télécharge lui-même. Rien à confirmer — un export ne détruit
                      rien, et le geste est de toute façon journalisé. */}
                  <Button asChild variant="outline" size="sm" className="h-9">
                    <a href={subjectExportHref(subject.kind, subject.id)} download>
                      <Download className="size-4" />
                      Exporter le dossier
                    </a>
                  </Button>

                  {!anonymized && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="h-9" disabled={busy}>
                          <UserX className="size-4" />
                          Anonymiser
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Effacer l&apos;identité de {subject.name} ?
                          </AlertDialogTitle>
                          <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                              <p>
                                Son nom, son email
                                {subject.kind === "CLIENT"
                                  ? ", son téléphone et sa société"
                                  : " et sa photo"}{" "}
                                sont remplacés par un pseudonyme, ici et dans les{" "}
                                {subject.journalEntryCount} entrée(s) du journal d&apos;audit qui la
                                concernent. Irréversible.
                              </p>
                              <p className="font-medium text-foreground">Ce qui reste :</p>
                              <ul className="list-disc space-y-1 pl-5">
                                <li>
                                  ses {subject.ticketCount} ticket(s) et tout leur fil de
                                  conversation, sous le pseudonyme ;
                                </li>
                                <li>
                                  le sujet, la description et les messages de ces tickets, qui
                                  peuvent la nommer en toutes lettres — ces textes ne sont pas
                                  réécrits, les réécrire abîmerait le dossier support sans garantir
                                  l&apos;effacement ;
                                </li>
                                <li>
                                  le journal d&apos;audit lui-même : quelle action, quand, sur quel
                                  ticket. Seul le « qui » disparaît.
                                </li>
                              </ul>
                              {subject.kind === "AGENT" && (
                                <p>
                                  Le compte est aussi désactivé : son accès est coupé
                                  immédiatement.
                                </p>
                              )}
                            </div>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              run(
                                subject,
                                anonymizeDataSubject,
                                (result) => `Identité effacée : ${result.pseudonym}`,
                              )
                            }
                          >
                            Anonymiser
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-destructive" disabled={busy}>
                        <Trash2 className="size-4" />
                        Supprimer la fiche
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer la fiche de {subject.name} ?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-2 text-sm">
                            <p>
                              La fiche est effacée définitivement. Le journal d&apos;audit est
                              d&apos;abord pseudonymisé, puis conservé.
                            </p>
                            {subject.ticketCount > 0 && (
                              <p className="font-medium text-foreground">
                                Attention : ses {subject.ticketCount} ticket(s) ne sont PAS
                                supprimés. Ils restent dans l&apos;application sans{" "}
                                {subject.kind === "CLIENT" ? "demandeur" : "assigné"}, et leur
                                sujet, leur description et leurs messages continuent de la nommer.
                                La suppression de la fiche est donc un effacement partiel —
                                l&apos;anonymisation, elle, couvre aussi le journal et laisse un
                                dossier cohérent.
                              </p>
                            )}
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            run(subject, deleteDataSubject, (result) =>
                              result.ticketCount > 0
                                ? `Fiche supprimée. ${result.ticketCount} ticket(s) conservé(s).`
                                : "Fiche supprimée.",
                            )
                          }
                        >
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
