import { escapeHtml } from "@/lib/escape-html";

/**
 * Signature des réponses envoyées au client : variables disponibles et
 * remplissage.
 *
 * Le contenu d'une signature est rédigé une fois pour plusieurs agents — il ne
 * peut donc pas porter un nom en dur. Il porte à la place des variables
 * `{{prenom}}`, `{{nom}}`… remplies à l'envoi avec l'identité de l'agent qui
 * répond, exactement comme les emplacements du gabarit d'email
 * (`email-layout.ts`), dont ce module reprend volontairement la convention.
 *
 * Module sans base de données ni `server` : la page de réglages l'exécute dans
 * le navigateur pour l'aperçu, avec le même rendu qu'à l'envoi réel.
 */

export type SignatureVariables = {
  /** Prénom de l'agent : premier mot de son nom de profil. */
  prenom: string;
  /** Nom de famille de l'agent : ce qui suit le prénom. */
  nom: string;
  /** Nom complet, tel qu'enregistré sur le compte. */
  nomComplet: string;
  /** Adresse email professionnelle de l'agent. */
  email: string;
};

/** Documentation affichée à l'admin sous l'éditeur, tirée de la même source. */
export const SIGNATURE_VARIABLES: { name: keyof SignatureVariables; description: string }[] = [
  { name: "prenom", description: "Prénom de l'agent qui répond, ex. « Camille »." },
  { name: "nom", description: "Nom de famille de l'agent, ex. « Martin »." },
  { name: "nomComplet", description: "Nom complet de l'agent, ex. « Camille Martin »." },
  { name: "email", description: "Adresse email de l'agent." },
];

/**
 * Sépare le nom de profil en prénom et nom de famille.
 *
 * Les comptes viennent de Google et ne portent qu'un seul champ « nom » : la
 * coupure a lieu au premier espace, tout ce qui suit est le nom de famille
 * (« Camille Le Bihan » → « Camille » + « Le Bihan »). Un nom d'un seul mot
 * laisse le nom de famille vide plutôt que de dupliquer le prénom.
 */
export function splitAgentName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { prenom: "", nom: "" };
  }
  if (parts.length === 1) {
    return { prenom: parts[0], nom: "" };
  }
  return { prenom: parts[0], nom: parts.slice(1).join(" ") };
}

export function signatureVariablesForAgent(agent: { name: string; email: string }): SignatureVariables {
  const { prenom, nom } = splitAgentName(agent.name);

  return {
    prenom,
    nom,
    nomComplet: agent.name.trim(),
    email: agent.email,
  };
}

/** Agent fictif de l'aperçu : un aperçu ne doit dépendre d'aucun compte réel. */
export const SIGNATURE_PREVIEW_AGENT = {
  name: "Camille Martin",
  email: "camille.martin@example.com",
};

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/**
 * Remplace les `{{variable}}` du corps de la signature.
 *
 * Les valeurs sont échappées : un nom de profil contenant `<` ne peut pas
 * fabriquer de balise. Un nom de variable inconnu est laissé en place, comme
 * dans le gabarit d'email — la faute de frappe se voit dans l'aperçu plutôt que
 * de disparaître silencieusement.
 */
export function fillSignatureVariables(bodyHtml: string, variables: SignatureVariables) {
  return bodyHtml.replace(PLACEHOLDER, (match, name: string) => {
    if (!Object.hasOwn(variables, name)) {
      return match;
    }
    return escapeHtml(variables[name as keyof SignatureVariables]);
  });
}

/**
 * Signature proposée dans /settings/signatures à la création. Rien n'est ajouté
 * aux emails tant qu'un admin ne l'a pas enregistrée.
 */
export const DEFAULT_SIGNATURE_BODY_HTML = `<p><strong>{{prenom}} {{nom}}</strong><br>Support Ideeri<br><a href="mailto:{{email}}">{{email}}</a></p>`;
