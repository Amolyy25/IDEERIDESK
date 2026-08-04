import { absolutizeEmailAssetUrls } from "@/lib/email-asset-urls";
import { escapeHtml } from "@/lib/escape-html";

/**
 * Habillage commun à tous les emails sortants : fond de page, carte, en-tête
 * (logo, expéditeur, ligne de contexte) et pied de page.
 *
 * Ce gabarit est modifiable par un admin depuis /settings/email-layout, en HTML
 * et CSS. Chaque email fournit seulement ses propres valeurs — les
 * « emplacements » ci-dessous — et n'a donc rien à savoir de la mise en page.
 *
 * Ce module est volontairement pur (pas de base de données, pas de `server`) :
 * la page de réglages l'exécute dans le navigateur pour afficher l'aperçu en
 * direct, avec exactement le même rendu que l'envoi réel.
 */

export type EmailLayoutSlots = {
  /**
   * Chemin du logo, relatif à la racine — rendu absolu à l'envoi, comme toutes
   * les autres images (voir `email-asset-urls.ts`). Chaîne vide = pas de logo.
   */
  logoUrl: string;
  /** Nom affiché de l'expéditeur, en tête de la carte. */
  senderName: string;
  /** Ligne de contexte sous l'expéditeur, ex. « Ticket #18 · Clôturé ». */
  headline: string;
  /** Corps de l'email, déjà construit en HTML par l'appelant. */
  content: string;
  /** Phrase du pied de page. Vide = pas de pied de page. */
  footer: string;
};

/**
 * Emplacements dont la valeur est du HTML déjà construit, inséré tel quel. Tous
 * les autres sont du texte et sont échappés à l'insertion : un nom de client
 * contenant `<` ne peut pas fabriquer de balise.
 */
const HTML_SLOTS = ["content"];

/** Documentation affichée à l'admin sous l'éditeur, tirée de la même source. */
export const EMAIL_LAYOUT_SLOTS: { name: keyof EmailLayoutSlots; description: string }[] = [
  { name: "logoUrl", description: "URL du logo — vide si aucun logo n'est configuré." },
  { name: "senderName", description: "Nom de l'expéditeur (agent ou « Ideeri Desk »)." },
  { name: "headline", description: "Ligne de contexte, ex. « Ticket #18 · Clôturé »." },
  { name: "content", description: "Corps de l'email, propre à chaque type de message." },
  { name: "footer", description: "Phrase de pied de page. Vide sur certains emails." },
];

/** Police des emails sortants. Exportée pour que les aperçus des réglages
 *  affichent exactement la même. */
export const EMAIL_FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Gabarit livré avec l'application, et point de retour du bouton
 * « Réinitialiser ». Reproduit la mise en page historique des emails.
 */
export const DEFAULT_EMAIL_LAYOUT_HTML = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-top:3px solid #eab308;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="padding:28px 32px 4px;">
            {{#if logoUrl}}<img src="{{logoUrl}}" alt="Ideeri" height="24" style="display:block;margin-bottom:14px;border:0;" />{{/if}}
            <p style="margin:0;font-size:13px;font-weight:600;color:#18181b;">{{senderName}}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#71717a;">{{headline}}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 8px;font-size:14px;line-height:1.6;color:#18181b;">
            {{content}}
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 28px;">
            {{#if footer}}<p style="margin:0;padding-top:16px;border-top:1px solid #e4e4e7;font-size:12px;color:#a1a1aa;">{{footer}}</p>{{/if}}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

const IF_OPEN = /\{\{#if\s+([a-zA-Z]+)\s*\}\}/;
const IF_CLOSE = "{{/if}}";
const IF_ELSE = "{{else}}";
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function slotValue(slots: EmailLayoutSlots, name: string): string | undefined {
  if (!Object.hasOwn(slots, name)) return undefined;
  return slots[name as keyof EmailLayoutSlots];
}

/** Un emplacement est « vrai » quand il porte autre chose que du blanc. */
function isFilled(value: string | undefined) {
  if (value === undefined) return false;
  return value.trim().length > 0;
}

function splitOnElse(block: string) {
  const index = block.indexOf(IF_ELSE);
  if (index === -1) {
    return { whenTrue: block, whenFalse: "" };
  }
  return {
    whenTrue: block.slice(0, index),
    whenFalse: block.slice(index + IF_ELSE.length),
  };
}

/**
 * Résout les `{{#if emplacement}}…{{else}}…{{/if}}`, du premier au dernier.
 *
 * Les conditions ne s'imbriquent pas : le `{{/if}}` retenu est toujours le
 * premier rencontré. Chaque tour de boucle retire une ouverture, la boucle
 * s'arrête donc forcément.
 *
 * À savoir pour qui écrit un gabarit : une condition doit tenir à l'intérieur
 * d'une cellule. Placée entre deux `<tr>`, elle est sortie du tableau par
 * l'analyseur HTML de l'assainissement, avant même d'être résolue.
 */
function resolveConditionals(template: string, slots: EmailLayoutSlots) {
  let result = template;

  while (true) {
    const open = IF_OPEN.exec(result);
    if (!open) return result;

    const blockStart = open.index;
    const innerStart = blockStart + open[0].length;
    const closeIndex = result.indexOf(IF_CLOSE, innerStart);

    // Condition jamais refermée : on retire l'ouverture et on garde le contenu,
    // plutôt que d'avaler la fin du gabarit.
    if (closeIndex === -1) {
      result = result.slice(0, blockStart) + result.slice(innerStart);
      continue;
    }

    const { whenTrue, whenFalse } = splitOnElse(result.slice(innerStart, closeIndex));
    let kept = whenFalse;
    if (isFilled(slotValue(slots, open[1]))) {
      kept = whenTrue;
    }

    result = result.slice(0, blockStart) + kept + result.slice(closeIndex + IF_CLOSE.length);
  }
}

/**
 * Remplace les `{{emplacement}}`. Un nom inconnu est laissé en place : la faute
 * de frappe se voit dans l'aperçu plutôt que de disparaître silencieusement.
 */
function fillPlaceholders(template: string, slots: EmailLayoutSlots) {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = slotValue(slots, name);
    if (value === undefined) return match;
    if (HTML_SLOTS.includes(name)) return value;
    return escapeHtml(value);
  });
}

/**
 * Assemble l'email complet. Le gabarit administrable ne couvre que le contenu
 * du `<body>` : l'enveloppe du document est ajoutée ici parce que
 * l'assainissement (`sanitizeEmailHtml`) supprime de toute façon `<!doctype>`,
 * `<html>` et `<body>` à l'enregistrement.
 *
 * `origin` est l'adresse publique de l'application (`APP_URL`), ajoutée ici aux
 * `src` relatifs — logo, images collées, images des signatures et des modèles.
 * C'est le seul endroit où une origine entre dans un email : tout le contenu
 * enregistré converge vers cette fonction, quelle que soit sa provenance.
 *
 * Sans `origin`, les chemins restent relatifs : c'est ce que veulent les
 * aperçus des réglages, rendus dans le navigateur.
 */
export function renderEmailLayout(
  layoutHtml: string,
  slots: EmailLayoutSlots,
  origin = ""
) {
  const filled = fillPlaceholders(resolveConditionals(layoutHtml, slots), slots);
  const body = absolutizeEmailAssetUrls(filled, origin);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;font-family:${EMAIL_FONT_STACK};">
${body}
  </body>
</html>`;
}
