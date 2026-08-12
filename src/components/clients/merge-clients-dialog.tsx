"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { findTicketsFromMergedAddresses, mergeClientRecords } from "@/lib/actions/clients";
import type { ReclaimableSearch } from "@/lib/client-merge";
import {
  MAX_CLIENTS_PER_MERGE,
  MERGEABLE_FIELDS,
  MERGEABLE_FIELD_LABELS,
  normalizeFieldValue,
  type ClientMergeSelection,
  type MergeableField,
} from "@/lib/client-merge-fields";
import { formatDateTime } from "@/lib/format-date";
import { plural } from "@/lib/utils";
import type { ClientWithTicketCount } from "@/components/clients/clients-table";

/**
 * Réunir plusieurs fiches contacts en une seule.
 *
 * DEUX DÉCISIONS, dans cet ordre, et elles sont de nature différente :
 *
 * 1. **Quelle fiche reste le contact actif.** C'est SON adresse que le contact
 *    gardera : l'adresse ne se déplace pas d'une fiche à l'autre (elle est unique
 *    en base, et la fiche absorbée survit — voir `MERGEABLE_FIELDS`). Choisir
 *    l'adresse à conserver, c'est donc exactement choisir cette fiche, et la
 *    fenêtre pose la question sous cette forme plutôt que sous celle d'un champ à
 *    arbitrer, qui laisserait croire à un déplacement.
 *
 * 2. **Quelles coordonnées garder.** Un ARBITRAGE, pas un formulaire : chaque
 *    champ ne propose que les valeurs réellement portées par les fiches en jeu.
 *    C'est ce qui rend la fenêtre lisible — l'agent ne compose pas une identité,
 *    il choisit laquelle des versions existantes est la bonne — et c'est aussi ce
 *    que le serveur vérifie (`refuseInventedValues`) : sans cette règle, la fusion
 *    serait le seul chemin d'écriture libre sur les coordonnées d'un contact.
 *
 * Seuls les champs qui DIFFÈRENT d'une fiche à l'autre demandent un choix. Un
 * téléphone identique partout n'a pas à être arbitré ; l'afficher en liste de
 * boutons radio ferait chercher la différence au milieu de ce qui n'en est pas
 * une. Il apparaît quand même, dans le récapitulatif du bas.
 *
 * Aucun état n'est remis à zéro à la fermeture : la page monte la fenêtre avec
 * une `key` dérivée des fiches retenues, donc un nouveau rapprochement est un
 * nouveau composant, aux valeurs par défaut recalculées. C'est plus sûr qu'une
 * réinitialisation à la main, qui oublie toujours un champ.
 */
export function MergeClientsDialog({
  open,
  onOpenChange,
  initialIds,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fiches retenues à l'ouverture : un groupe détecté, ou la ligne cliquée. */
  initialIds: string[];
  /** Tout le répertoire, déjà chargé par la page : sert à ajouter une fiche à la main. */
  clients: ClientWithTicketCount[];
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);

  const [ids, setIds] = useState<string[]>(initialIds);
  const [showPicker, setShowPicker] = useState(initialIds.length < 2);
  const [search, setSearch] = useState("");
  const [isMerging, setIsMerging] = useState(false);

  /** Les fiches en jeu, la plus ancienne d'abord. */
  const selected = useMemo(
    () =>
      ids
        .map((id) => byId.get(id))
        .filter((client): client is ClientWithTicketCount => client !== undefined)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    [ids, byId],
  );

  /**
   * Fiche qui reste le contact actif. Par défaut la plus ancienne — elle porte
   * l'antériorité du contact, et c'est l'adresse sous laquelle il est connu depuis
   * le plus longtemps. Modifiable, parce qu'un contact peut avoir changé
   * d'adresse pour de bon.
   */
  const [survivorChoice, setSurvivorChoice] = useState<string | null>(null);
  const survivor =
    selected.find((client) => client.id === survivorChoice) ?? selected[0] ?? undefined;
  const absorbed = selected.filter((client) => client.id !== survivor?.id);

  /** Valeurs distinctes proposées pour un champ, dans l'ordre des fiches. */
  const optionsFor = (field: MergeableField): (string | null)[] => {
    const seen = new Set<string>();
    const options: (string | null)[] = [];
    for (const client of selected) {
      const value = client[field];
      const key = normalizeFieldValue(value);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push(value);
    }
    return options;
  };

  /**
   * Ce que la fiche portera, avant que l'agent touche à quoi que ce soit.
   *
   * Par défaut la valeur du contact conservé : le choix qui ne change rien est le
   * seul défaut honnête. Une exception, et elle couvre le cas le plus fréquent —
   * la fiche la plus ancienne vient souvent de la synchro Gmail, sans nom ni
   * téléphone : quand son champ est vide (ou porte une adresse en guise de nom,
   * voir `nameIdentity`), la première valeur réellement renseignée est reprise.
   * Sans ça, fusionner effacerait le peu qu'on savait du contact.
   */
  const defaultKeep = useMemo((): ClientMergeSelection => {
    const firstMeaningful = (field: MergeableField, isMeaningful: (v: string) => boolean) => {
      const own = survivor?.[field];
      if (own && isMeaningful(own)) return own;
      for (const client of selected) {
        const value = client[field];
        if (value && isMeaningful(value)) return value;
      }
      return own ?? null;
    };

    return {
      name: firstMeaningful("name", (value) => !value.includes("@")) ?? survivor?.name ?? "",
      phone: firstMeaningful("phone", () => true),
      company: firstMeaningful("company", () => true),
    };
  }, [selected, survivor]);

  const [chosen, setChosen] = useState<Partial<ClientMergeSelection>>({});

  /** Choix de l'agent quand il en a fait un, défaut calculé sinon. */
  const keep: ClientMergeSelection = {
    name: chosen.name !== undefined && chosen.name !== "" ? chosen.name : defaultKeep.name,
    phone: chosen.phone !== undefined ? chosen.phone : defaultKeep.phone,
    company: chosen.company !== undefined ? chosen.company : defaultKeep.company,
  };

  const totalTickets = selected.reduce((sum, client) => sum + client._count.tickets, 0);

  /**
   * Tickets dont l'adresse de réponse change : ceux des fiches absorbées, qui
   * rejoignent le contact actif. L'adresse de celui-ci ne bouge pas, ses propres
   * tickets ne sont donc pas concernés — c'est le bénéfice direct d'avoir fait du
   * choix de l'adresse le choix de la fiche.
   */
  const reroutedTickets = absorbed.reduce((sum, client) => sum + client._count.tickets, 0);

  /** Le plafond est celui du serveur : la fenêtre cesse de proposer l'ajout avant qu'il refuse. */
  const isFull = selected.length >= MAX_CLIENTS_PER_MERGE;

  /** Toutes les adresses en jeu : c'est l'ensemble sur lequel porte la recherche de tickets. */
  const knownEmails = useMemo(() => [...new Set(selected.map((c) => c.email))], [selected]);

  /** Tickets trouvés par la recherche, `null` tant qu'elle n'a pas été lancée. */
  const [reclaim, setReclaim] = useState<ReclaimableSearch | null>(null);
  const [isSearchingTickets, setIsSearchingTickets] = useState(false);
  const [claimIds, setClaimIds] = useState<string[]>([]);

  /**
   * Fiches proposées à l'ajout : jamais une fiche déjà retenue, une identité
   * effacée, ou une fiche déjà rattachée à un autre contact — celle-là n'est plus
   * un contact, et le serveur refuserait de la fusionner une seconde fois.
   */
  const pickable = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return clients
      .filter(
        (client) =>
          !ids.includes(client.id) && client.anonymizedAt === null && client.mergedInto === null,
      )
      .filter((client) =>
        [client.name, client.email, client.company ?? ""].some((field) =>
          field.toLowerCase().includes(term),
        ),
      )
      .slice(0, 6);
  }, [clients, ids, search]);

  /**
   * Tout ce que le lot de fiches détermine repart de zéro dès qu'il change.
   *
   * Les valeurs retenues, parce qu'un choix portant sur une fiche retirée n'a plus
   * de valeur d'origine et se ferait refuser par le serveur. Les tickets trouvés,
   * parce qu'ils ont été cherchés sur un autre ensemble d'adresses : les garder
   * cochés déplacerait des dossiers que la recherche ne rapporterait plus.
   */
  function resetDerivedState() {
    setChosen({});
    setReclaim(null);
    setClaimIds([]);
  }

  function remove(id: string) {
    setIds((previous) => previous.filter((candidate) => candidate !== id));
    if (survivorChoice === id) setSurvivorChoice(null);
    resetDerivedState();
  }

  function add(id: string) {
    setIds((previous) => [...previous, id]);
    resetDerivedState();
    setSearch("");
  }

  async function searchTickets() {
    setIsSearchingTickets(true);
    try {
      const result = await findTicketsFromMergedAddresses({
        emails: knownEmails,
        mergedClientIds: selected.map((client) => client.id),
      });
      setReclaim(result);
      // Rien de coché d'office : reprendre un ticket le retire à un autre
      // contact, ce n'est pas un défaut qu'on accepte en cliquant « Fusionner ».
      setClaimIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recherche impossible");
    } finally {
      setIsSearchingTickets(false);
    }
  }

  function toggleClaim(id: string) {
    setClaimIds((previous) =>
      previous.includes(id) ? previous.filter((candidate) => candidate !== id) : [...previous, id],
    );
  }

  async function handleMerge() {
    if (!survivor || absorbed.length === 0) return;
    setIsMerging(true);
    try {
      const outcome = await mergeClientRecords({
        survivorId: survivor.id,
        absorbedIds: absorbed.map((client) => client.id),
        keep,
        claimTicketIds: claimIds,
      });
      const movedTotal = outcome.movedTicketCount + outcome.claimedTicketCount;
      toast.success(
        [
          `${outcome.absorbedCount + 1} fiches réunies sous un seul contact`,
          movedTotal > 0
            ? `${movedTotal} ticket${plural(movedTotal)} déplacé${plural(movedTotal)}`
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Fusion impossible");
    } finally {
      setIsMerging(false);
    }
  }

  const arbitratedFields = MERGEABLE_FIELDS.filter((field) => optionsFor(field).length > 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Fusionner des fiches contacts</DialogTitle>
          <DialogDescription>
            Les tickets des fiches absorbées rejoignent le contact actif. Les fiches, elles, sont
            conservées : la fusion se défait depuis le répertoire.
          </DialogDescription>
        </DialogHeader>

        {/* --- Quelle fiche reste le contact actif ------------------------- */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">
                {selected.length} fiche{plural(selected.length)} à réunir
              </h3>
              {selected.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  Cochez la fiche qui reste le contact actif : c&apos;est son adresse que le contact
                  garde, et à laquelle partiront les réponses.
                </p>
              )}
            </div>
            {!showPicker && !isFull && (
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowPicker(true)}>
                <Plus className="size-4" />
                Ajouter une fiche
              </Button>
            )}
          </div>

          <ul className="divide-y rounded-lg border">
            {selected.map((client) => {
              const isSurvivor = client.id === survivor?.id;
              return (
                <li key={client.id} className="flex items-start gap-3 p-3">
                  <input
                    type="radio"
                    name="survivor"
                    id={`survivor-${client.id}`}
                    className="mt-1 shrink-0"
                    checked={isSurvivor}
                    onChange={() => setSurvivorChoice(client.id)}
                  />
                  <label htmlFor={`survivor-${client.id}`} className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">{client.name}</span>
                      {isSurvivor ? (
                        <Badge variant="secondary">Contact actif</Badge>
                      ) : (
                        <Badge variant="outline">Absorbée</Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {client.email}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {[
                        client.company,
                        client.phone,
                        `${client._count.tickets} ticket${plural(client._count.tickets)}`,
                        `créée le ${formatDateTime(client.createdAt)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </label>
                  {/* Rien à retirer quand il ne reste que le minimum : le bouton
                      n'apparaît qu'à partir de trois fiches. */}
                  {selected.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      title="Retirer de la fusion"
                      onClick={() => remove(client.id)}
                    >
                      <X className="size-4" />
                      <span className="sr-only">Retirer {client.name} de la fusion</span>
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>

          {isFull && (
            <p className="text-xs text-muted-foreground">
              {MAX_CLIENTS_PER_MERGE} fiches, c&apos;est le maximum d&apos;un seul geste : au-delà,
              personne ne relit vraiment ce qu&apos;il déplace. Fusionnez celles-ci, puis
              recommencez.
            </p>
          )}

          {showPicker && !isFull && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Chercher une autre fiche : nom, email ou société…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-9 pl-8"
                  autoFocus
                />
              </div>
              {search.trim() !== "" &&
                (pickable.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucune autre fiche disponible ne correspond à « {search} ».
                  </p>
                ) : (
                  <ul className="divide-y">
                    {pickable.map((client) => (
                      <li key={client.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm">{client.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{client.email}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0"
                          onClick={() => add(client.id)}
                        >
                          Ajouter
                        </Button>
                      </li>
                    ))}
                  </ul>
                ))}
            </div>
          )}
        </section>

        {/* --- L'arbitrage des coordonnées -------------------------------- */}
        {selected.length > 1 && (
          <section className="space-y-3">
            {arbitratedFields.length > 0 && (
              <div>
                <h3 className="text-sm font-medium">Coordonnées à conserver</h3>
                <p className="text-xs text-muted-foreground">
                  Seuls les champs qui diffèrent d&apos;une fiche à l&apos;autre demandent un choix.
                </p>
              </div>
            )}

            {arbitratedFields.map((field) => (
              <fieldset key={field} className="space-y-1.5">
                <legend className="text-xs font-medium text-muted-foreground">
                  {MERGEABLE_FIELD_LABELS[field]}
                </legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {optionsFor(field).map((value) => {
                    const isChosen = normalizeFieldValue(value) === normalizeFieldValue(keep[field]);
                    return (
                      <label
                        key={normalizeFieldValue(value) || "vide"}
                        className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm has-[:checked]:border-foreground/40 has-[:checked]:bg-muted"
                      >
                        <input
                          type="radio"
                          name={`keep-${field}`}
                          className="shrink-0"
                          checked={isChosen}
                          onChange={() =>
                            setChosen((previous) => ({ ...previous, [field]: value }))
                          }
                        />
                        <span className={value ? "truncate" : "truncate text-muted-foreground"}>
                          {value || "Laisser vide"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            {/* --- Ce qu'on obtient ---------------------------------------- */}
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">Contact après fusion</p>
              <p className="mt-1 text-sm font-medium">{keep.name}</p>
              <p className="text-xs text-muted-foreground">{survivor?.email}</p>
              <p className="text-xs text-muted-foreground">
                {[keep.company, keep.phone, `${totalTickets} ticket${plural(totalTickets)}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Les {absorbed.length === 1 ? "adresses de la fiche absorbée" : "autres adresses"}{" "}
                restent connues : un email venu de {absorbed.length === 1 ? "elle" : "l'une d'elles"}{" "}
                se rattachera à ce contact au lieu de recréer un doublon.
              </p>
            </div>

            {/* --- Reprise des tickets venus de ces adresses ---------------- */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Tickets venus de ces adresses</p>
                  <p className="text-xs text-muted-foreground">
                    Les tickets des fiches ci-dessus suivent la fusion d&apos;office. Cette
                    recherche cherche les autres : ceux qu&apos;un rapprochement passé a laissés sur
                    un contact différent.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0"
                  onClick={searchTickets}
                  disabled={isSearchingTickets}
                >
                  <Search className="size-4" />
                  {isSearchingTickets ? "Recherche…" : reclaim ? "Relancer" : "Chercher"}
                </Button>
              </div>

              {reclaim !== null &&
                (reclaim.tickets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aucun autre ticket ne vient de ces adresses. Tout ce qui concerne cette personne
                    est déjà sur les fiches ci-dessus.
                  </p>
                ) : (
                  <>
                    <ul className="divide-y">
                      {reclaim.tickets.map((ticket) => (
                        <li key={ticket.id} className="flex items-start gap-2 py-2">
                          <input
                            type="checkbox"
                            id={`claim-${ticket.id}`}
                            className="mt-0.5 shrink-0"
                            checked={claimIds.includes(ticket.id)}
                            disabled={!ticket.claimable}
                            onChange={() => toggleClaim(ticket.id)}
                          />
                          <label htmlFor={`claim-${ticket.id}`} className="min-w-0 text-xs">
                            <span className="font-medium">#{ticket.number}</span>{" "}
                            <span className="text-foreground">{ticket.subject}</span>
                            <span className="block text-muted-foreground">
                              venu de {ticket.originEmail}
                              {ticket.currentClient
                                ? ` · aujourd'hui sur « ${ticket.currentClient.name} »`
                                : ""}
                            </span>
                            {!ticket.claimable && (
                              // Le seul cas : un ticket sans contact. Le code n'en
                              // produit qu'à la suppression d'une fiche au titre du
                              // droit à l'effacement — le rattacher défairait cet
                              // effacement, la case est donc inactive et la raison
                              // écrite.
                              <span className="block text-muted-foreground">
                                Sans contact rattaché : probablement une fiche effacée à la demande
                                de la personne. Non reprenable.
                              </span>
                            )}
                          </label>
                        </li>
                      ))}
                    </ul>
                    {reclaim.truncated && (
                      <p className="text-xs text-muted-foreground">
                        Liste bornée : d&apos;autres tickets viennent de ces adresses. Fusionnez,
                        puis relancez la recherche.
                      </p>
                    )}
                    {claimIds.length > 0 && (
                      <p className="text-xs">
                        {claimIds.length} ticket{plural(claimIds.length)} sera
                        {claimIds.length > 1 ? "ont" : ""} retiré{plural(claimIds.length)} à son
                        contact actuel pour rejoindre ce contact.
                      </p>
                    )}
                  </>
                ))}
            </div>

            {reroutedTickets > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <span>
                  {reroutedTickets} ticket{plural(reroutedTickets)}{" "}
                  {reroutedTickets > 1 ? "recevront" : "recevra"} désormais les réponses à
                  l&apos;adresse du contact actif, et non plus à celle d&apos;origine. Une note
                  interne le signalera sur chacun ; les en-têtes de l&apos;email reçu, eux, gardent
                  l&apos;adresse d&apos;origine.
                </span>
              </p>
            )}
          </section>
        )}

        {selected.length < 2 && (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Ajoutez au moins une seconde fiche pour fusionner.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isMerging}>
            Annuler
          </Button>
          <Button onClick={handleMerge} disabled={isMerging || selected.length < 2}>
            {isMerging
              ? "Fusion…"
              : `Réunir ${selected.length} fiche${plural(selected.length)} sous un contact`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
