"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  updateSlaCalendar,
  updateSlaTargets,
  updateSlaWarningMinutes,
  updateStatusPausesSla,
  type SlaSettings,
} from "@/lib/actions/sla";
import { formatSlaTarget } from "@/lib/sla";
import { cn } from "@/lib/utils";

/**
 * Paramètres > SLA, en trois blocs qui correspondent aux trois questions qu'on
 * se pose en écrivant un engagement de délai : combien de temps, décompté
 * comment, et suspendu quand.
 *
 * Les délais se saisissent en heures et non en minutes : « 2 » se lit et se
 * vérifie, « 120 » se recompte. La minute reste l'unité de stockage — elle
 * laisse la porte ouverte à des engagements courts sans migration.
 */

const WEEKDAYS: { iso: number; label: string }[] = [
  { iso: 1, label: "Lun" },
  { iso: 2, label: "Mar" },
  { iso: 3, label: "Mer" },
  { iso: 4, label: "Jeu" },
  { iso: 5, label: "Ven" },
  { iso: 6, label: "Sam" },
  { iso: 7, label: "Dim" },
];

export function SlaSettingsForm({ settings }: { settings: SlaSettings }) {
  return (
    <div className="space-y-6">
      <CalendarCard calendar={settings.calendar} />
      <TargetsCard priorities={settings.priorities} />
      <WarningCard minutes={settings.warningMinutes} />
      <PauseCard statuses={settings.statuses} />
    </div>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="space-y-1 border-b px-5 py-4">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="max-w-prose text-sm text-muted-foreground">{hint}</p>
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function CalendarCard({ calendar }: { calendar: SlaSettings["calendar"] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState(calendar.mode);
  const [days, setDays] = useState<number[]>(calendar.days);
  const [start, setStart] = useState(pad(calendar.startMinute));
  const [end, setEnd] = useState(pad(calendar.endMinute));

  function save() {
    startTransition(async () => {
      try {
        await updateSlaCalendar({ mode, days, start, end });
        toast.success("Calendrier enregistré");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
      }
    });
  }

  return (
    <Card
      title="Décompte du délai"
      hint={
        <>
          En 24 h/24, un ticket urgent (2 h) déposé vendredi 18 h est dû à 20 h. En heures
          d&apos;ouverture, il est dû au lendemain ouvré. Les horaires se lisent dans le fuseau
          horaire de l&apos;espace de travail ({calendar.timeZone}).
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="sla-business" className="text-sm font-normal">
            Ne décompter que les heures d&apos;ouverture du support
          </Label>
          <Switch
            id="sla-business"
            checked={mode === "business"}
            onCheckedChange={(checked) => setMode(checked ? "business" : "calendar")}
          />
        </div>

        {/* Les horaires restent visibles en mode 24 h/24, en retrait : ils sont
            déjà enregistrés, et les masquer donnerait l'impression qu'il faut
            tout ressaisir en cochant la case. */}
        <div className={cn("space-y-4", mode === "calendar" && "opacity-50")}>
          <div className="flex flex-wrap items-center gap-1.5">
            {WEEKDAYS.map((day) => {
              const active = days.includes(day.iso);
              return (
                <button
                  key={day.iso}
                  type="button"
                  aria-pressed={active}
                  disabled={mode === "calendar"}
                  onClick={() =>
                    setDays((current) =>
                      current.includes(day.iso)
                        ? current.filter((iso) => iso !== day.iso)
                        : [...current, day.iso],
                    )
                  }
                  className={cn(
                    "h-8 rounded-md border px-3 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary/10 font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sla-start" className="text-xs text-muted-foreground">
                Ouverture
              </Label>
              <Input
                id="sla-start"
                type="time"
                value={start}
                disabled={mode === "calendar"}
                onChange={(event) => setStart(event.target.value)}
                className="h-9 w-32"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sla-end" className="text-xs text-muted-foreground">
                Fermeture
              </Label>
              <Input
                id="sla-end"
                type="time"
                value={end}
                disabled={mode === "calendar"}
                onChange={(event) => setEnd(event.target.value)}
                className="h-9 w-32"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={isPending}>
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function TargetsCard({ priorities }: { priorities: SlaSettings["priorities"] }) {
  return (
    <Card
      title="Délais par priorité"
      hint={
        <>
          Deux délais distincts : le temps qu&apos;on se donne pour adresser un premier message au
          client, et celui qu&apos;on se donne pour clore son dossier. Laissez vide pour ne prendre
          aucun engagement — les tickets de cette priorité n&apos;auront pas d&apos;échéance.
        </>
      }
    >
      {priorities.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune priorité configurée. Créez-en d&apos;abord dans Paramètres&nbsp;&gt;&nbsp;Priorités.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="pb-2 text-left font-medium">Priorité</th>
              <th className="pb-2 text-left font-medium">Première réponse</th>
              <th className="pb-2 text-left font-medium">Résolution</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {priorities.map((priority) => (
              <TargetRow key={priority.id} priority={priority} />
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function TargetRow({ priority }: { priority: SlaSettings["priorities"][number] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [firstResponse, setFirstResponse] = useState(toHours(priority.firstResponseMinutes));
  const [resolution, setResolution] = useState(toHours(priority.resolutionMinutes));

  const isDirty =
    firstResponse !== toHours(priority.firstResponseMinutes) ||
    resolution !== toHours(priority.resolutionMinutes);

  function save() {
    startTransition(async () => {
      try {
        await updateSlaTargets(priority.id, {
          firstResponseMinutes: toMinutes(firstResponse),
          resolutionMinutes: toMinutes(resolution),
        });
        toast.success(`Délais de « ${priority.name} » enregistrés`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
      }
    });
  }

  return (
    <tr className="border-t">
      <td className="py-2 pr-4">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span
            aria-hidden
            style={{ backgroundColor: priority.color }}
            className="h-1.5 w-1.5 shrink-0 rounded-full"
          />
          {priority.name}
        </span>
      </td>
      <td className="py-2 pr-4">
        <HoursInput
          ariaLabel={`Délai de première réponse pour « ${priority.name} »`}
          value={firstResponse}
          minutes={priority.firstResponseMinutes}
          onChange={setFirstResponse}
        />
      </td>
      <td className="py-2 pr-4">
        <HoursInput
          ariaLabel={`Délai de résolution pour « ${priority.name} »`}
          value={resolution}
          minutes={priority.resolutionMinutes}
          onChange={setResolution}
        />
      </td>
      <td className="py-2 text-right">
        {isDirty && (
          <Button size="sm" variant="secondary" onClick={save} disabled={isPending}>
            {isPending ? "…" : "Enregistrer"}
          </Button>
        )}
      </td>
    </tr>
  );
}

/**
 * Saisie en heures, avec le rappel de ce que ça donne une fois converti
 * (« 48 h » → « 2 j ») : c'est cette forme-là que l'agent verra dans la file.
 */
function HoursInput({
  ariaLabel,
  value,
  minutes,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  minutes: number | null;
  onChange: (value: string) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <Input
        aria-label={ariaLabel}
        type="number"
        min={0}
        step="0.5"
        inputMode="decimal"
        placeholder="—"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-24"
      />
      <span className="w-16 text-xs whitespace-nowrap text-muted-foreground">
        {minutes ? formatSlaTarget(minutes) : "aucun"}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------

function WarningCard({ minutes }: { minutes: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState(String(minutes));

  const isDirty = value.trim() !== String(minutes);

  function save() {
    startTransition(async () => {
      try {
        await updateSlaWarningMinutes(Number(value.replace(",", ".")) || 0);
        toast.success("Préavis enregistré");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
      }
    });
  }

  return (
    <Card
      title="Alerte par email avant échéance"
      hint={
        <>
          Un email part peu avant l&apos;expiration d&apos;un délai, à l&apos;agent qui tient le
          dossier — ou, si personne ne l&apos;a pris, aux membres des groupes couvrant son produit.
          Un seul envoi par échéance. Mettez 0 pour couper l&apos;alerte pour toute
          l&apos;équipe.
        </>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sla-warning" className="text-xs text-muted-foreground">
            Prévenir (minutes avant l&apos;échéance)
          </Label>
          <Input
            id="sla-warning"
            type="number"
            min={0}
            step={5}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-9 w-28"
          />
        </div>
        {isDirty && (
          <Button size="sm" onClick={save} disabled={isPending}>
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        )}
      </div>

      {/* Sans ordonnanceur branché sur cette route, aucun email d'alerte ne
          partira jamais — et rien dans l'écran ne le laisserait deviner. */}
      <p className="mt-4 text-xs text-muted-foreground">
        Nécessite un appel planifié de <code className="font-mono">POST /api/cron/sla</code>{" "}
        (en-tête <code className="font-mono">x-cron-secret</code>), toutes les 5 minutes environ. La
        cadence borne la précision de l&apos;alerte.
      </p>
    </Card>
  );
}

function PauseCard({ statuses }: { statuses: SlaSettings["statuses"] }) {
  // Les statuts de clôture n'ont pas à figurer ici : sur un ticket clos les deux
  // horloges sont déjà arrêtées, une case à cocher n'y changerait rien.
  const openStatuses = statuses.filter((status) => !status.isClosed);

  return (
    <Card
      title="Statuts qui suspendent l'horloge"
      hint={
        <>
          Par défaut l&apos;horloge ne s&apos;arrête jamais, et l&apos;échéance affichée est la vraie
          échéance. Cochez un statut d&apos;attente (« En attente du client », typiquement) pour que
          le temps passé dedans ne soit pas décompté : les échéances repartent d&apos;autant à la
          sortie. Le changement s&apos;applique aussi aux tickets qui portent déjà ce statut.
        </>
      }
    >
      <div className="space-y-3">
        {openStatuses.map((status) => (
          <PauseRow key={status.id} status={status} />
        ))}
      </div>
    </Card>
  );
}

function PauseRow({ status }: { status: SlaSettings["statuses"][number] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState(status.pausesSla);

  function toggle(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      try {
        await updateStatusPausesSla(status.id, next);
        router.refresh();
      } catch (error) {
        setChecked(!next);
        toast.error(error instanceof Error ? error.message : "Une erreur est survenue");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`pause-${status.id}`}
        checked={checked}
        disabled={isPending}
        onCheckedChange={(value) => toggle(value === true)}
      />
      <Label htmlFor={`pause-${status.id}`} className="flex items-center gap-2 text-sm font-normal">
        <span
          aria-hidden
          style={{ backgroundColor: status.color }}
          className="h-1.5 w-1.5 shrink-0 rounded-full"
        />
        {status.name}
      </Label>
    </div>
  );
}

// ---------------------------------------------------------------------------

function pad(minute: number) {
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

/** Minutes stockées → heures affichées. Chaîne vide = aucun engagement. */
function toHours(minutes: number | null): string {
  if (minutes === null) return "";
  return String(Math.round((minutes / 60) * 100) / 100);
}

/** Heures saisies → minutes stockées. Vide, zéro ou illisible = aucun engagement. */
function toMinutes(hours: string): number | null {
  const value = Number(hours.replace(",", "."));
  if (!hours.trim() || !Number.isFinite(value) || value <= 0) return null;
  return Math.max(Math.round(value * 60), 1);
}
