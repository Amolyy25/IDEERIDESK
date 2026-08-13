"use client";

import { unstable_isUnrecognizedActionError } from "next/navigation";
import { toast } from "sonner";

/**
 * Onglet resté ouvert sur une version de l'application qui n'est plus déployée.
 *
 * Ce qui se passe : l'identifiant d'une Server Action est un condensat calculé à
 * la construction. Chaque déploiement en produit de nouveaux, et le JavaScript
 * déjà chargé dans le navigateur d'un agent continue d'appeler les ANCIENS. Le
 * serveur ne les reconnaît plus, répond 404, et journalise « Failed to find
 * Server Action "003d113…" ».
 *
 * Le bruit dans les logs n'est que le symptôme visible. Le vrai problème est
 * qu'un onglet dans cet état est MORT sans le dire : la relève de fond ne
 * rapporte plus ni email entrant ni notification, la présence sur les fiches
 * n'est plus annoncée, et un envoi de réponse échoue sur un message d'erreur
 * générique. L'agent, lui, voit un tableau de bord normal — simplement figé, et
 * il peut le regarder une demi-journée sans se douter de rien.
 *
 * D'où ce module : reconnaître cette panne-là parmi les autres, arrêter les
 * boucles qui l'entretiennent (elles inondaient les logs de la plateforme sans
 * jamais aboutir), et proposer le rechargement à l'agent plutôt que de le lui
 * imposer — il est peut-être en train de lire un dossier. Le brouillon de
 * réponse survivant maintenant à un rechargement (voir `use-reply-draft.ts`),
 * accepter ne coûte plus rien.
 *
 * Détection par `unstable_isUnrecognizedActionError`, l'API prévue par Next
 * pour ce cas précis : le message d'erreur, lui, est réécrit en production et
 * ne peut pas servir de test.
 */

let stale = false;

/** Les boucles de fond interrogent ceci avant de repartir pour un tour. */
export function isStaleDeployment() {
  return stale;
}

/**
 * Examine l'échec d'une Server Action. Renvoie `true` si c'est un décalage de
 * version — auquel cas l'appelant doit renoncer, et non réessayer : aucune
 * requête de cet onglet n'aboutira plus.
 *
 * L'annonce n'est faite qu'une fois, quel que soit le nombre d'appels qui
 * échouent ensuite : trois boucles concurrentes ne doivent pas empiler trois
 * bandeaux identiques.
 */
export function noticeStaleDeployment(error: unknown): boolean {
  if (!unstable_isUnrecognizedActionError(error)) return false;
  if (stale) return true;

  stale = true;
  toast.warning("Une nouvelle version d'Ideeri Desk est en ligne", {
    // Sans durée : c'est un état, pas un événement. Un message qui s'efface au
    // bout de cinq secondes laisserait l'onglet figé sans plus rien pour
    // l'expliquer.
    duration: Infinity,
    id: "stale-deployment",
    description:
      "Cet onglet ne reçoit plus les nouveaux emails ni les notifications. " +
      "Rechargez pour reprendre — votre brouillon de réponse est conservé.",
    action: {
      label: "Recharger",
      onClick: () => window.location.reload(),
    },
  });

  return true;
}
