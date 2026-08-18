# Règles de lisibilité humaine — Ideeri Desk

Ce projet est codé quasi intégralement avec Claude Code. Ce n'est pas un problème
en soi, mais ça laisse des traces reconnaissables (fichiers énormes, commentaires
en forme d'essai philosophique, sur-justification de choix triviaux). Un dev qui
reprend ce code dans 6 mois sans contexte ne doit PAS pouvoir deviner que c'est de
l'IA qui a écrit ça. Il doit juste comprendre vite.

Ces règles s'appliquent à tout code écrit ou modifié dans ce repo, sans exception.

## 1. Taille des fichiers

- Cible : 150-300 lignes pour un composant ou un module métier.
- Au-delà de 400 lignes : refactor obligatoire avant d'ajouter quoi que ce soit
  d'autre dans ce fichier.
- Un fichier de 1500 lignes = plusieurs responsabilités mélangées, point final.
  Ce n'est jamais "normal", c'est de la dette qu'on continue d'empiler.
- Règle pratique : si comprendre un fichier demande de scroller plus de 2 écrans,
  il est trop gros.

Découpage type pour un composant React volumineux :

- `useXxx.ts` → état + logique métier (le hook fait le travail)
- `Xxx.tsx` → uniquement le rendu (JSX), le hook lui fournit tout
- `xxx.utils.ts` → fonctions pures réutilisables (formatage, transformations)
- `useXxxShortcuts.ts` → si un composant gère des raccourcis clavier/focus,
  ça sort du composant principal

Avant d'ajouter une feature à un fichier qui dépasse déjà 400 lignes : extraire
d'abord, ajouter ensuite. Pas l'inverse.

## 2. Commentaires : un seul test à passer

Un commentaire utile répond à "pourquoi ce choix n'était pas évident" — jamais
à "qu'est-ce que fait ce code" (le code le dit déjà lui-même s'il est bien nommé).

**Interdit** :
- Ton narratif ou rhétorique ("ce n'est pas un hasard si...", "un coût sans
  retour", "c'est précisément ce que... cherchait à éviter", "faute de quoi...")
- Un bloc JSDoc systématique au-dessus de CHAQUE fonction, même triviale
- Justifier des choix UX/produit dans le code d'implémentation — ça va dans un
  ticket ou une doc produit, pas au-dessus d'une fonction de 5 lignes
- Un commentaire qui reformule juste le nom de la fonction en phrase

**Attendu** :
- Une ligne sèche et technique quand un piège existe (pourquoi un `setTimeout(0)`,
  pourquoi tel ordre d'opérations, pourquoi telle API a été écartée)
- Rien du tout si le code est déjà clair par lui-même
- `// TODO:` explicite si un truc reste bancal, pas une justification déguisée

### Exemple de reformulation

Avant (voix IA — un paragraphe narratif par fonction) :

```ts
/**
 * Rend le curseur au champ, après le rendu qui l'aura déverrouillé.
 *
 * Le minuteur à zéro n'est pas une facilité : `setQueued(null)` ne déverrouille
 * l'éditeur qu'au rendu suivant, et un `focus()` appelé avant retomberait sur
 * un champ encore en lecture seule.
 */
function focusComposer(privateMode: boolean) {
    setTimeout(() => {
        const focus = privateMode ? noteFocusRef.current : editorFocusRef.current;
        focus?.();
    }, 0);
}
```

Après (voix humaine — même info, sans l'essai) :

```ts
// setTimeout(0) : le champ ne se déverrouille qu'au rendu suivant, focus() avant échouerait
function focusComposer(privateMode: boolean) {
    setTimeout(() => {
        const focus = privateMode ? noteFocusRef.current : editorFocusRef.current;
        focus?.();
    }, 0);
}
```

Même contenu technique, zéro perte d'information, mais ça ne se lit plus comme
un plaidoyer.

## 3. Naming & structure

- Cohérence avec l'existant : avant d'écrire un nouveau fichier, regarder comment
  un fichier du même type est structuré ailleurs dans Papiris et suivre le même
  pattern (pas de nouvelle convention perso).
- Pas de sur-ingénierie : pas de wrapper générique pour un seul cas d'usage,
  pas de `try/catch` défensif si l'erreur ne peut objectivement pas se produire.
- Pas de duplication : chercher (grep, recherche dans l'IDE) si une fonction
  équivalente existe déjà avant d'en écrire une nouvelle.

## 4. Appels réseau : jamais inline dans un composant

Un `fetch` (URL, headers, parsing JSON, gestion d'erreur) ne vit jamais dans
le handler d'un composant. Il part dans un fichier `api/<feature>.ts` qui
regroupe **tous** les appels réseau de cette feature (pas un fichier par
endpoint — un fichier par domaine). Le handler du composant ne fait plus que
de l'orchestration : appeler la fonction, gérer le state (loading/erreur),
appliquer le résultat.

Pareil pour une valeur dérivée réutilisable (ex: calcul d'un label à partir
d'un intent) : elle sort dans un `utils/<domaine>.ts`, testable isolément,
au lieu de rester en ternaire imbriquée à l'intérieur du handler.

Attention à l'excès inverse : pas de fichier par fonction individuelle
(`.hook`, `.api`, `.constante` pour une seule fonction chacun). Ça fragmente
autant que ça n'aide pas — la bonne granularité, c'est un fichier par
domaine/feature, pas par fonction.

Avant :

```ts
const label =
  intent === "custom"
    ? (instruction ?? "").trim()
    : findRewriteIntent(intent).label;

setRewriteIntent(intent);
setIsRewriting(true);
try {
  const response = await fetch("/api/ai/rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticketId, text: source, format: isPrivate ? "text" : "html", intent, instruction }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Impossible de réécrire le message.");
  const produced = typeof result.result === "string" ? result.result : "";
  if (!produced.trim()) throw new Error("L'IA n'a rien renvoyé.");
  // ... suite du handler
} catch (error) {
  // ...
}
```

Après :

```ts
// api/aiComposer.ts — tous les appels réseau du composer IA regroupés ici
export async function rewriteMessage(payload: RewritePayload): Promise<string> {
  const response = await fetch("/api/ai/rewrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Impossible de réécrire le message.");
  const produced = typeof result.result === "string" ? result.result : "";
  if (!produced.trim()) throw new Error("L'IA n'a rien renvoyé.");
  return produced;
}
```

```ts
// utils/rewriteIntents.ts — dérivation du label, réutilisable, testable isolément
export function getRewriteLabel(intent: RewriteIntent, instruction?: string) {
  return intent === "custom" ? (instruction ?? "").trim() : findRewriteIntent(intent).label;
}
```

```ts
// dans le composant : le handler ne fait plus que de l'orchestration
async function handleRewrite(intent: RewriteIntent, instruction?: string) {
  setRewriteIntent(intent);
  setIsRewriting(true);
  try {
    const produced = await rewriteMessage({ ticketId, text: source, format: isPrivate ? "text" : "html", intent, instruction });
    applyAiEdit({ label: getRewriteLabel(intent, instruction), isPrivate, previous: html, produced });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Impossible de réécrire le message.");
  } finally {
    setIsRewriting(false);
  }
}
```

## 5. Espacement

Une ligne vide = une frontière logique (déclarations d'état / effects / handlers
/ return). Ni tout collé en un bloc dense, ni une ligne vide toutes les deux
lignes.

## 6. Checklist de fin de tâche

- [ ] Aucun fichier touché ne dépasse 400 lignes (sinon : extraction faite ou
  explicitement justifiée en commentaire de PR, pas dans le code)
- [ ] Chaque commentaire ajouté passe le test "pourquoi, pas quoi" et n'a pas
  de ton narratif
- [ ] Pas de logique dupliquée par rapport à l'existant
- [ ] Aucun `fetch` inline dans un handler de composant — regroupé dans
  `api/<feature>.ts`
- [ ] Relecture du diff en se mettant à la place d'un dev qui prend la suite
  dans 6 mois sans contexte

À la fin de toute tâche de code sur ce repo, lance une passe de relecture avec
le skill `lisibilite-humaine` avant de considérer la tâche terminée.
