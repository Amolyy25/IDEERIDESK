import { ARTICLE_POLICY, EMAIL_POLICY } from "@/lib/sanitize-html-policy";

/**
 * Aide affichée sous un champ d'édition riche : ce qui est conservé à
 * l'enregistrement et ce qui est retiré.
 *
 * Le contenu est nettoyé côté serveur (voir `sanitize-html.ts`) : sans cette
 * indication, un auteur qui colle du HTML mis en forme voit une partie de son
 * travail disparaître à l'enregistrement sans comprendre pourquoi. Les listes
 * viennent du même module que la règle appliquée, elles ne peuvent donc pas
 * mentir.
 */
export function HtmlPolicyHint({ profile }: { profile: "article" | "email" }) {
  const policy = profile === "email" ? EMAIL_POLICY : ARTICLE_POLICY;

  return (
    <div className="space-y-1.5 text-xs text-muted-foreground">
      <p>{policy.summary}</p>

      <details className="group">
        <summary className="cursor-pointer select-none underline decoration-dotted underline-offset-2 hover:text-foreground">
          Balises et attributs HTML autorisés
        </summary>

        <div className="mt-2 space-y-2.5 border-l-2 border-border pl-3">
          <div>
            <p className="font-medium text-foreground">Balises</p>
            <p className="mt-0.5 font-mono leading-relaxed break-words">
              {policy.tags.map((tag) => `<${tag}>`).join(" ")}
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">Attributs</p>
            <p className="mt-0.5 font-mono leading-relaxed break-words">
              {policy.attributes.join(" ")}
            </p>
          </div>

          <div>
            <p className="font-medium text-foreground">Retiré à l&apos;enregistrement</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              {policy.removed.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p>
            Liens acceptés : <span className="font-mono">https:</span>{" "}
            <span className="font-mono">http:</span> <span className="font-mono">mailto:</span>{" "}
            <span className="font-mono">tel:</span> et les chemins internes commençant par{" "}
            <span className="font-mono">/</span>.
          </p>
        </div>
      </details>
    </div>
  );
}
