import { readInboundEmailMetadata } from "@/lib/inbound-email-metadata";

/**
 * En-têtes de l'email qui a ouvert le ticket (expéditeur, destinataire, copie,
 * objet, date). Ne rend rien pour un ticket créé autrement — widget, portail ou
 * à la main depuis le back-office.
 *
 * Sert à deux choses concrètes : savoir à quelle adresse le client a écrit
 * (utile quand plusieurs adresses arrivent dans la même boîte), et retrouver le
 * mail exact dans Gmail quand il faut voir la mise en forme d'origine.
 */
export function EmailOrigin({ metadata }: { metadata: unknown }) {
  const email = readInboundEmailMetadata(metadata);
  if (!email) return null;

  const rows: { label: string; value: string }[] = [];

  if (email.from) {
    let sender = email.from;
    if (email.fromName) {
      sender = `${email.fromName} <${email.from}>`;
    }
    rows.push({ label: "Expéditeur", value: sender });
  }
  if (email.to) rows.push({ label: "Destinataire", value: email.to });
  if (email.cc) rows.push({ label: "Copie", value: email.cc });
  if (email.replyTo) rows.push({ label: "Répondre à", value: email.replyTo });
  if (email.subject) rows.push({ label: "Objet", value: email.subject });
  if (email.date) rows.push({ label: "Reçu le", value: email.date });

  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border bg-muted/30 p-4">
      <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Email d&apos;origine
      </h2>
      <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
        {rows.map((row) => (
          <div key={row.label} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-muted-foreground">{row.label}</dt>
            {/* `break-words` : une liste de destinataires ou un objet très long
                ne doit pas élargir la colonne du fil de discussion. */}
            <dd className="break-words text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
