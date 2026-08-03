"use client";

import { useDeferredValue, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMAIL_PREVIEW_SAMPLES } from "@/lib/email-layout-preview";

/**
 * Aperçu du gabarit en cours d'édition, sur un exemple d'email au choix.
 *
 * Le choix de l'exemple passe par une liste déroulante et non par des onglets :
 * les cinq libellés ne tiennent pas sur une ligne dans une colonne d'aperçu, et
 * une rangée d'onglets qui se replie recouvre l'aperçu.
 *
 * Rendu dans une `iframe` en bac à sable : le HTML affiché n'est pas encore
 * assaini (l'assainissement a lieu à l'enregistrement), donc rien de ce qui s'y
 * trouve ne doit pouvoir s'exécuter dans l'application. `sandbox=""` retire
 * toutes les permissions, script compris.
 *
 * L'iframe isole aussi les styles : un `<style>` du gabarit ne peut pas
 * déborder sur la page de réglages.
 */
export function EmailLayoutPreview({ layoutHtml }: { layoutHtml: string }) {
  const [sampleId, setSampleId] = useState(EMAIL_PREVIEW_SAMPLES[0].id);

  // Le rendu suit la frappe avec un tour de retard quand la saisie est rapide :
  // reconstruire le document à chaque touche saccade l'éditeur.
  const deferredHtml = useDeferredValue(layoutHtml);

  const sample =
    EMAIL_PREVIEW_SAMPLES.find((item) => item.id === sampleId) ?? EMAIL_PREVIEW_SAMPLES[0];

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-sm font-medium">Aperçu</p>
        <Select value={sampleId} onValueChange={setSampleId}>
          <SelectTrigger size="sm" className="min-w-[13rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {EMAIL_PREVIEW_SAMPLES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <iframe
        title={`Aperçu — ${sample.label}`}
        sandbox=""
        srcDoc={sample.render(deferredHtml)}
        className="block h-[620px] w-full bg-white"
      />
    </div>
  );
}
