/**
 * Jeu de démonstration : remet à zéro LES TICKETS et rejoue une cinquantaine de
 * demandes fictives réparties sur tous les axes de l'application (statut,
 * priorité, produit concerné, source, assignation, ancienneté).
 *
 * Ce que le script touche :
 *   - tickets, et par cascade leurs messages, pièces jointes, notifications et
 *     rapprochements de doublons ;
 *   - les clients fictifs qu'il crée lui-même (upsert sur l'email) ;
 *   - le renommage « Papiris » → « Papairis » (faute de frappe du paramétrage).
 *
 * Ce que le script NE touche PAS, volontairement : agents, permissions,
 * groupes, statuts, priorités, catégories (hors renommage), sources, réponses
 * prédéfinies, base de connaissances, modèles d'email, portail, et le journal
 * d'audit — qui est de toute façon en ajout seul.
 *
 * Effet de bord inévitable sur le journal : supprimer un ticket dénoue le lien
 * `audit_logs.ticketId` (ON DELETE SET NULL). Les traces existantes restent
 * lisibles — numéro et sujet y sont recopiés — mais ne pointent plus vers une
 * fiche. C'est le comportement prévu par la migration
 * `20260805170000_audit_log_append_only`.
 *
 * AUCUNE DONNÉE PERSONNELLE RÉELLE ici : tous les contacts sont fictifs et
 * utilisent le domaine réservé `example.com`.
 *
 *   npx tsx scripts/seed-demo-tickets.ts --confirm
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Prisma, TicketSource } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Aléatoire reproductible
// ---------------------------------------------------------------------------
// Un générateur à graine fixe plutôt que Math.random : deux exécutions du script
// produisent le même jeu, ce qui rend une démo rejouable à l'identique.
let seedState = 20260806;
function rnd() {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function pick<T>(values: readonly T[]): T {
  return values[Math.floor(rnd() * values.length)];
}

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
/** Date située `days` jours plus tôt, à une heure ouvrée plausible. */
function daysAgo(days: number, hour = 9 + Math.floor(rnd() * 9)) {
  const date = new Date(NOW - days * DAY);
  date.setHours(hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
  return date;
}

// PNG 1×1 transparent : de quoi montrer une pièce jointe dans le fil sans
// embarquer d'image réelle dans le dépôt.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// ---------------------------------------------------------------------------
// Contacts fictifs
// ---------------------------------------------------------------------------

type DemoClient = { key: string; name: string; email: string; company: string; phone: string };

const CLIENTS: DemoClient[] = [
  { key: "tilleuls-marie", name: "Marie Laurent", email: "marie.laurent@example.com", company: "Agence Les Tilleuls", phone: "01 23 45 67 01" },
  { key: "tilleuls-paul", name: "Paul Mercier", email: "paul.mercier@example.com", company: "Agence Les Tilleuls", phone: "01 23 45 67 02" },
  { key: "horizon-sophie", name: "Sophie Vasseur", email: "sophie.vasseur@example.com", company: "Horizon Immobilier", phone: "01 23 45 67 03" },
  { key: "horizon-karim", name: "Karim Benali", email: "karim.benali@example.com", company: "Horizon Immobilier", phone: "01 23 45 67 04" },
  { key: "provence-claire", name: "Claire Fontaine", email: "claire.fontaine@example.com", company: "Provence Habitat", phone: "04 91 00 00 05" },
  { key: "provence-thomas", name: "Thomas Girard", email: "thomas.girard@example.com", company: "Provence Habitat", phone: "04 91 00 00 06" },
  { key: "cle-julien", name: "Julien Moreau", email: "julien.moreau@example.com", company: "La Clé du Nord", phone: "03 20 00 00 07" },
  { key: "cle-nadia", name: "Nadia Chevalier", email: "nadia.chevalier@example.com", company: "La Clé du Nord", phone: "03 20 00 00 08" },
  { key: "atlantique-eric", name: "Éric Dubreuil", email: "eric.dubreuil@example.com", company: "Atlantique Transactions", phone: "02 40 00 00 09" },
  { key: "atlantique-lea", name: "Léa Rousseau", email: "lea.rousseau@example.com", company: "Atlantique Transactions", phone: "02 40 00 00 10" },
  { key: "cevennes-hugo", name: "Hugo Delaunay", email: "hugo.delaunay@example.com", company: "Cévennes Immo", phone: "04 66 00 00 11" },
  { key: "cevennes-ines", name: "Inès Marchand", email: "ines.marchand@example.com", company: "Cévennes Immo", phone: "04 66 00 00 12" },
  { key: "alsace-david", name: "David Klein", email: "david.klein@example.com", company: "Alsace Patrimoine", phone: "03 88 00 00 13" },
  { key: "alsace-camille", name: "Camille Perrot", email: "camille.perrot@example.com", company: "Alsace Patrimoine", phone: "03 88 00 00 14" },
  { key: "littoral-yann", name: "Yann Le Goff", email: "yann.legoff@example.com", company: "Littoral Gestion", phone: "02 97 00 00 15" },
  { key: "littoral-sarah", name: "Sarah Petit", email: "sarah.petit@example.com", company: "Littoral Gestion", phone: "02 97 00 00 16" },
  { key: "capitole-antoine", name: "Antoine Faure", email: "antoine.faure@example.com", company: "Capitole Immobilier", phone: "05 61 00 00 17" },
  { key: "capitole-fatou", name: "Fatou Diallo", email: "fatou.diallo@example.com", company: "Capitole Immobilier", phone: "05 61 00 00 18" },
  { key: "rhone-vincent", name: "Vincent Aubert", email: "vincent.aubert@example.com", company: "Rhône Résidences", phone: "04 72 00 00 19" },
  { key: "rhone-elodie", name: "Élodie Barbier", email: "elodie.barbier@example.com", company: "Rhône Résidences", phone: "04 72 00 00 20" },
];

// ---------------------------------------------------------------------------
// Scénarios
// ---------------------------------------------------------------------------

type Turn = {
  /** c = client, a = réponse publique de l'agent, n = note interne */
  r: "c" | "a" | "n";
  t: string;
};

type Scenario = {
  key: string;
  subject: string;
  description: string;
  /** Nom du produit concerné (TicketCategory). */
  category: string;
  /** Nom de la priorité (TicketPriority). */
  priority: "Basse" | "Normale" | "Haute" | "Urgente";
  /** Nom du statut (TicketStatus). */
  status: "Nouveau" | "En cours" | "En attente client" | "Résolu";
  channel: "widget" | "email" | "portal" | "direct";
  client: string;
  /** Ancienneté de la demande, en jours. */
  age: number;
  thread?: Turn[];
  /** Valeur du champ personnalisé « Type ». */
  type?: "Question" | "Problème technique" | "Demande spécifique";
  /** Page d'origine, pour les demandes déposées depuis le logiciel. */
  page?: string;
  /** Le fil porte une réponse client non encore lue par l'équipe. */
  unread?: boolean;
  /** Pièce jointe déposée avec la demande initiale. */
  attachment?: string;
  /** Ticket (clé) dans lequel celui-ci a été fusionné. */
  mergeInto?: string;
  /** Rapprochement de doublon proposé vers ce ticket (clé, plus ancien). */
  duplicateOf?: { key: string; score: number; reason: string };
};

const SCENARIOS: Scenario[] = [
  {
    key: "mandat-pdf",
    subject: "Impossible de générer le mandat de vente en PDF",
    description:
      "Depuis ce matin, la génération du mandat reste bloquée sur « préparation du document ». Cela concerne tous les postes de l'agence, y compris après redémarrage.",
    category: "Papairis",
    priority: "Urgente",
    status: "En cours",
    channel: "widget",
    client: "tilleuls-marie",
    age: 1,
    type: "Problème technique",
    page: "https://app.papairis.fr/mandats/nouveau",
    attachment: "capture-blocage-mandat.png",
    thread: [
      { r: "n", t: "Reproduit sur l'environnement de recette : le service de rendu PDF ne répond plus. Escalade équipe plateforme." },
      { r: "a", t: "Bonjour, nous confirmons l'incident sur la génération des mandats et nos équipes sont déjà dessus. Nous revenons vers vous dès le rétablissement." },
    ],
  },
  {
    key: "compromis-500",
    subject: "Erreur 500 à l'enregistrement d'un compromis",
    description:
      "L'enregistrement d'un compromis affiche une erreur 500 quand le bien comporte plus de deux acquéreurs. Le dossier est perdu et il faut tout ressaisir.",
    category: "Papairis",
    priority: "Haute",
    status: "En cours",
    channel: "widget",
    client: "horizon-sophie",
    age: 3,
    type: "Problème technique",
    page: "https://app.papairis.fr/transactions/compromis",
    thread: [
      { r: "a", t: "Bonjour, merci pour le signalement. Pouvez-vous nous préciser si l'erreur survient dès l'ajout du troisième acquéreur ou seulement à la validation finale ?" },
      { r: "c", t: "À la validation finale uniquement. L'ajout des acquéreurs se passe bien." },
      { r: "n", t: "Piste : contrainte d'unicité sur la table acquéreurs. À vérifier avec l'équipe back." },
    ],
  },
  {
    key: "seloger-publication",
    subject: "Annonces non publiées sur SeLoger depuis ce matin",
    description:
      "Aucune de nos annonces mises en ligne aujourd'hui n'apparaît sur SeLoger. Le flux semble bloqué, les autres portails fonctionnent normalement.",
    category: "Diffusion des annonces",
    priority: "Urgente",
    status: "En cours",
    channel: "email",
    client: "provence-claire",
    age: 2,
    unread: true,
    thread: [
      { r: "a", t: "Bonjour, nous vérifions l'état du flux de diffusion vers SeLoger et revenons vers vous rapidement." },
      { r: "c", t: "Merci. Trois nouveaux mandats sont concernés, c'est urgent pour nous." },
    ],
  },
  {
    key: "seloger-doublon",
    subject: "Diffusion SeLoger bloquée",
    description:
      "Nos annonces ne remontent plus sur SeLoger depuis ce matin. Est-ce une panne générale de votre côté ?",
    category: "Diffusion des annonces",
    priority: "Haute",
    status: "Nouveau",
    channel: "widget",
    client: "provence-thomas",
    age: 2,
    type: "Problème technique",
    page: "https://app.papairis.fr/diffusion/portails",
    duplicateOf: {
      key: "seloger-publication",
      score: 91,
      reason: "Même incident de diffusion SeLoger signalé le même jour par deux collaborateurs de la même agence.",
    },
  },
  {
    key: "leboncoin-photos",
    subject: "Photos en basse résolution sur Leboncoin",
    description:
      "Les photos publiées sur Leboncoin sortent floues alors que les originaux sont en 4000 px. Le rendu est correct sur les autres portails.",
    category: "Diffusion des annonces",
    priority: "Normale",
    status: "En attente client",
    channel: "widget",
    client: "cle-julien",
    age: 6,
    type: "Problème technique",
    page: "https://app.papairis.fr/biens/photos",
    thread: [
      { r: "a", t: "Bonjour, pourriez-vous nous transmettre la référence d'une annonce concernée ainsi qu'une des photos d'origine ? Cela nous permettra de comparer le fichier envoyé au portail." },
    ],
  },
  {
    key: "app-crash-android",
    subject: "L'application mobile se ferme au lancement sur Android",
    description:
      "Depuis la dernière mise à jour, l'application se ferme immédiatement après l'écran d'accueil sur les téléphones Android. Sur iPhone tout fonctionne.",
    category: "App compagnon",
    priority: "Haute",
    status: "En cours",
    channel: "portal",
    client: "atlantique-eric",
    age: 4,
    type: "Problème technique",
    thread: [
      { r: "a", t: "Bonjour, merci de votre retour. Pouvez-vous nous indiquer la version d'Android et le modèle de téléphone ?" },
      { r: "c", t: "Android 15, sur Samsung Galaxy S23 et S24. Trois collaborateurs sont concernés." },
      { r: "n", t: "Correctif prévu dans la 2.4.1, publication store en cours." },
    ],
  },
  {
    key: "site-formulaire",
    subject: "Le formulaire de contact du site ne renvoie plus d'emails",
    description:
      "Les demandes déposées depuis notre site vitrine n'arrivent plus dans notre boîte. Un test effectué ce matin n'a rien déclenché.",
    category: "Site web",
    priority: "Haute",
    status: "Résolu",
    channel: "email",
    client: "cevennes-hugo",
    age: 12,
    thread: [
      { r: "n", t: "Adresse de réception mal renseignée côté configuration du site après la refonte." },
      { r: "a", t: "Bonjour, l'adresse de réception du formulaire avait été perdue lors de la refonte du site. Elle est rétablie et un test de bout en bout est passé avec succès. N'hésitez pas à confirmer de votre côté." },
      { r: "c", t: "C'est bon, nous recevons de nouveau les demandes. Merci pour la réactivité." },
    ],
  },
  {
    key: "agent-ajout",
    subject: "Impossible d'ajouter un collaborateur dans l'équipe",
    description:
      "Nous avons recruté une négociatrice et n'arrivons pas à lui créer un accès : le bouton « Inviter » reste grisé.",
    category: "App Ideeri",
    priority: "Normale",
    status: "Résolu",
    channel: "widget",
    client: "alsace-david",
    age: 15,
    type: "Question",
    page: "https://app.papairis.fr/parametres/equipe",
    thread: [
      { r: "a", t: "Bonjour, le bouton reste inactif tant que le nombre d'accès inclus dans votre formule est atteint. Nous avons ajouté un poste à votre contrat, l'invitation est de nouveau possible." },
      { r: "c", t: "Parfait, l'invitation est partie. Merci." },
    ],
  },
  {
    key: "imprimante",
    subject: "Imprimante réseau introuvable depuis le poste de l'accueil",
    description:
      "Le poste de l'accueil ne voit plus l'imprimante du couloir depuis la coupure électrique de samedi. Les autres postes impriment normalement.",
    category: "Support informatique",
    priority: "Normale",
    status: "Résolu",
    channel: "email",
    client: "littoral-yann",
    age: 18,
    thread: [
      { r: "a", t: "Bonjour, l'imprimante avait changé d'adresse sur le réseau après la coupure. Nous avons réinstallé la file d'impression sur le poste concerné, une page de test est bien sortie." },
    ],
  },
  {
    key: "devis-module",
    subject: "Demande de devis pour le module de gestion locative",
    description:
      "Nous souhaitons étendre notre activité à la gestion locative et aimerions connaître les conditions d'ajout du module.",
    category: "Autres",
    priority: "Basse",
    status: "En attente client",
    channel: "direct",
    client: "capitole-antoine",
    age: 9,
    type: "Demande spécifique",
    thread: [
      { r: "a", t: "Bonjour, nous vous avons transmis une proposition détaillée par email. Restons disponibles pour en échanger de vive voix si vous le souhaitez." },
    ],
  },
  {
    key: "import-clients",
    subject: "Import du fichier clients : lignes rejetées",
    description:
      "Sur 480 lignes importées, 37 sont rejetées sans message d'erreur explicite. Nous ne savons pas quoi corriger.",
    category: "Papairis",
    priority: "Normale",
    status: "En cours",
    channel: "widget",
    client: "rhone-vincent",
    age: 5,
    type: "Problème technique",
    page: "https://app.papairis.fr/contacts/import",
    attachment: "rapport-import.png",
    thread: [
      { r: "a", t: "Bonjour, nous récupérons le rapport d'import détaillé et vous indiquons ligne par ligne la cause des rejets." },
      { r: "n", t: "Rejets liés au format de téléphone international. Prévoir un message d'erreur plus clair côté produit." },
    ],
  },
  {
    key: "recherche-lente",
    subject: "La recherche de biens met plus de 30 secondes",
    description:
      "La recherche multicritères est devenue très lente en fin de journée. Avec un filtre sur le secteur, il faut parfois attendre une minute.",
    category: "Papairis",
    priority: "Haute",
    status: "En cours",
    channel: "widget",
    client: "horizon-karim",
    age: 7,
    type: "Problème technique",
    page: "https://app.papairis.fr/biens/recherche",
    unread: true,
    thread: [
      { r: "a", t: "Bonjour, merci pour la précision sur l'horaire, elle nous aide beaucoup. Nous analysons la charge sur ce créneau." },
      { r: "c", t: "C'est reparti ce soir, entre 17h et 18h30 surtout." },
    ],
  },
  {
    key: "bienici-mapping",
    subject: "Type de bien mal repris sur Bien'ici",
    description:
      "Nos lofts sont publiés en « appartement » sur Bien'ici alors que la fiche est correcte chez nous.",
    category: "Diffusion des annonces",
    priority: "Basse",
    status: "En attente client",
    channel: "widget",
    client: "cle-nadia",
    age: 11,
    type: "Problème technique",
    page: "https://app.papairis.fr/diffusion/correspondances",
    thread: [
      { r: "a", t: "Bonjour, le portail ne propose pas de catégorie « loft » : la correspondance par défaut est « appartement ». Souhaitez-vous que nous la basculions vers « maison » pour ces biens, ou préférez-vous conserver le comportement actuel ?" },
    ],
  },
  {
    key: "signature-electronique",
    subject: "La signature électronique ne part pas au vendeur",
    description:
      "Le mandataire reçoit bien la demande de signature mais le vendeur ne reçoit rien, même après relance.",
    category: "Papairis",
    priority: "Haute",
    status: "Résolu",
    channel: "email",
    client: "atlantique-lea",
    age: 21,
    thread: [
      { r: "n", t: "Adresse du vendeur en erreur dans la fiche contact (faute de frappe sur le domaine)." },
      { r: "a", t: "Bonjour, l'adresse email du vendeur comportait une faute de frappe dans sa fiche contact. Après correction, la demande de signature est bien partie." },
      { r: "c", t: "Effectivement, c'est signé. Merci beaucoup." },
    ],
  },
  {
    key: "notif-mobile",
    subject: "Pas de notification pour les nouveaux rendez-vous",
    description:
      "L'application mobile ne notifie plus les nouveaux rendez-vous depuis une dizaine de jours.",
    category: "App compagnon",
    priority: "Normale",
    status: "En cours",
    channel: "portal",
    client: "cevennes-ines",
    age: 8,
    type: "Problème technique",
    thread: [
      { r: "a", t: "Bonjour, pouvez-vous vérifier que les notifications sont bien autorisées pour l'application dans les réglages du téléphone ? Nous contrôlons en parallèle l'envoi côté serveur." },
      { r: "c", t: "Les autorisations sont bien actives, j'ai vérifié sur deux appareils." },
    ],
  },
  {
    key: "photos-ordre",
    subject: "L'ordre des photos n'est pas conservé",
    description:
      "Quand je réorganise les photos d'un bien, l'ordre est bon à l'écran mais revient à l'ordre d'origine après actualisation.",
    category: "Papairis",
    priority: "Normale",
    status: "Nouveau",
    channel: "widget",
    client: "alsace-camille",
    age: 1,
    type: "Problème technique",
    page: "https://app.papairis.fr/biens/photos",
  },
  {
    key: "export-compta",
    subject: "Export comptable : montants en double",
    description:
      "L'export du mois dernier fait apparaître deux fois les honoraires sur trois dossiers. Notre expert-comptable nous l'a signalé.",
    category: "Papairis",
    priority: "Haute",
    status: "En cours",
    channel: "email",
    client: "capitole-fatou",
    age: 4,
    thread: [
      { r: "a", t: "Bonjour, pourriez-vous nous communiquer les références des trois dossiers concernés ? Nous rapprochons les écritures et corrigeons l'export." },
      { r: "c", t: "Il s'agit des dossiers 2026-0341, 2026-0358 et 2026-0362." },
      { r: "n", t: "Doublons confirmés : l'avenant rejoue la ligne d'honoraires. Correctif à prévoir avant la prochaine clôture." },
    ],
  },
  {
    key: "mdp-oubli",
    subject: "Réinitialisation de mot de passe sans effet",
    description:
      "Je demande la réinitialisation de mon mot de passe mais l'email n'arrive jamais, y compris dans les indésirables.",
    category: "App Ideeri",
    priority: "Normale",
    status: "Résolu",
    channel: "portal",
    client: "rhone-elodie",
    age: 24,
    type: "Problème technique",
    thread: [
      { r: "a", t: "Bonjour, votre adresse figurait sur une liste de blocage de notre routeur email à la suite d'un ancien rejet. Nous l'avons retirée et vous venez de recevoir le lien de réinitialisation." },
    ],
  },
  {
    key: "site-lenteur",
    subject: "Le site vitrine est très lent sur mobile",
    description:
      "Nos clients nous signalent des temps de chargement de plusieurs secondes sur téléphone, notamment sur les pages de biens.",
    category: "Site web",
    priority: "Normale",
    status: "En cours",
    channel: "email",
    client: "tilleuls-paul",
    age: 10,
    thread: [
      { r: "a", t: "Bonjour, nous avons lancé un audit de performance sur les pages concernées. Les photos non compressées ressortent comme la cause principale, nous préparons une optimisation." },
    ],
  },
  {
    key: "sauvegarde",
    subject: "Question sur la sauvegarde de nos données",
    description:
      "Dans le cadre de notre audit interne, nous aimerions connaître la fréquence des sauvegardes et leur durée de conservation.",
    category: "Autres",
    priority: "Basse",
    status: "Résolu",
    channel: "portal",
    client: "littoral-sarah",
    age: 27,
    type: "Question",
    thread: [
      { r: "a", t: "Bonjour, les sauvegardes sont quotidiennes, chiffrées et conservées trente jours, avec une copie hebdomadaire conservée un an. Nous vous transmettons la fiche technique par email." },
      { r: "c", t: "Merci, c'est exactement ce qu'il nous fallait." },
    ],
  },
  {
    key: "vitrine-annonce",
    subject: "Une annonce vendue reste affichée sur le site",
    description:
      "Un bien passé en « vendu » il y a trois jours apparaît toujours sur notre site vitrine.",
    category: "Site web",
    priority: "Normale",
    status: "Résolu",
    channel: "widget",
    client: "provence-claire",
    age: 16,
    type: "Problème technique",
    page: "https://app.papairis.fr/biens/publication",
    thread: [
      { r: "n", t: "Cache du site non invalidé au changement de statut. Purge manuelle effectuée." },
      { r: "a", t: "Bonjour, le cache du site n'avait pas été rafraîchi au changement de statut. Le bien n'apparaît plus, et nous avons réduit la durée de mise en cache pour éviter que cela se reproduise." },
    ],
  },
  {
    key: "agenda-sync",
    subject: "L'agenda ne se synchronise plus avec Google Agenda",
    description:
      "Les rendez-vous créés dans le logiciel n'apparaissent plus dans Google Agenda depuis vendredi dernier.",
    category: "Papairis",
    priority: "Haute",
    status: "En attente client",
    channel: "widget",
    client: "horizon-sophie",
    age: 6,
    type: "Problème technique",
    page: "https://app.papairis.fr/agenda",
    thread: [
      { r: "a", t: "Bonjour, l'autorisation d'accès à votre agenda a expiré. Pourriez-vous relancer la connexion depuis Paramètres › Agenda, puis nous confirmer que les nouveaux rendez-vous remontent ?" },
    ],
  },
  {
    key: "estimation-champ",
    subject: "Ajouter un champ « DPE » sur la fiche d'estimation",
    description:
      "Nous aimerions faire figurer le diagnostic de performance énergétique directement dans le rapport d'estimation remis au vendeur.",
    category: "Papairis",
    priority: "Basse",
    status: "Nouveau",
    channel: "widget",
    client: "cle-julien",
    age: 2,
    type: "Demande spécifique",
    page: "https://app.papairis.fr/estimations",
  },
  {
    key: "app-photos-upload",
    subject: "Envoi des photos depuis le mobile très long",
    description:
      "L'envoi d'une série de photos depuis l'application prend plusieurs minutes en 4G, et échoue une fois sur deux.",
    category: "App compagnon",
    priority: "Normale",
    status: "Nouveau",
    channel: "portal",
    client: "atlantique-eric",
    age: 1,
    type: "Problème technique",
  },
  {
    key: "poste-lent",
    subject: "Poste de travail très lent au démarrage",
    description:
      "Le poste de la négociatrice met près de dix minutes à démarrer. Le problème s'aggrave depuis deux semaines.",
    category: "Support informatique",
    priority: "Basse",
    status: "En cours",
    channel: "direct",
    client: "cevennes-hugo",
    age: 5,
    thread: [
      { r: "a", t: "Bonjour, nous programmons une intervention à distance pour analyser les programmes lancés au démarrage. Quel créneau vous conviendrait cette semaine ?" },
    ],
  },
  {
    key: "facture-tva",
    subject: "Taux de TVA erroné sur une facture d'honoraires",
    description:
      "Une facture d'honoraires est éditée avec un taux de 10 % au lieu de 20 %. Nous devons l'avoir corrigée avant la fin du mois.",
    category: "Papairis",
    priority: "Urgente",
    status: "Résolu",
    channel: "email",
    client: "alsace-david",
    age: 20,
    thread: [
      { r: "n", t: "Taux hérité d'un modèle de facture obsolète encore rattaché à l'agence." },
      { r: "a", t: "Bonjour, un ancien modèle de facture portant un taux à 10 % était encore actif sur votre agence. Nous l'avons désactivé et régénéré la facture au bon taux." },
      { r: "c", t: "Facture reçue et conforme, merci." },
    ],
  },
  {
    key: "portail-acces",
    subject: "Créer des accès en lecture seule pour notre comptable",
    description:
      "Notre cabinet comptable souhaite consulter les écritures sans pouvoir modifier les dossiers. Est-ce possible ?",
    category: "App Ideeri",
    priority: "Basse",
    status: "En attente client",
    channel: "portal",
    client: "capitole-antoine",
    age: 13,
    type: "Question",
    thread: [
      { r: "a", t: "Bonjour, c'est tout à fait possible via un profil restreint à la consultation. Merci de nous communiquer l'adresse email du cabinet pour que nous créions l'accès." },
    ],
  },
  {
    key: "annonce-doublon-portail",
    subject: "Une même annonce publiée deux fois sur Leboncoin",
    description:
      "Le bien référence 2026-0417 apparaît en double sur Leboncoin, avec deux prix différents.",
    category: "Diffusion des annonces",
    priority: "Haute",
    status: "En cours",
    channel: "widget",
    client: "rhone-vincent",
    age: 3,
    type: "Problème technique",
    page: "https://app.papairis.fr/diffusion/portails",
    thread: [
      { r: "a", t: "Bonjour, nous avons demandé la dépublication du doublon auprès du portail. Le délai de prise en compte est de quelques heures." },
    ],
  },
  {
    key: "mail-signature",
    subject: "Notre signature d'email n'apparaît plus",
    description:
      "Les emails envoyés depuis le logiciel partent sans notre signature d'agence depuis la mise à jour.",
    category: "Papairis",
    priority: "Normale",
    status: "Résolu",
    channel: "widget",
    client: "littoral-yann",
    age: 19,
    type: "Problème technique",
    page: "https://app.papairis.fr/parametres/emails",
    thread: [
      { r: "a", t: "Bonjour, la signature avait été désactivée lors de la migration des modèles d'email. Elle est réactivée et s'applique de nouveau aux envois." },
    ],
  },
  {
    key: "rgpd-suppression",
    subject: "Demande de suppression de données d'un ancien prospect",
    description:
      "Un prospect nous demande la suppression de ses données. Quelle est la procédure de votre côté ?",
    category: "Autres",
    priority: "Normale",
    status: "Résolu",
    channel: "email",
    client: "tilleuls-marie",
    age: 30,
    thread: [
      { r: "a", t: "Bonjour, la suppression se fait depuis la fiche contact, bouton « Effacer les données ». L'opération est définitive et journalisée. Nous vous transmettons la procédure détaillée par email." },
      { r: "c", t: "Procédure suivie, tout est en ordre. Merci." },
    ],
  },
  {
    key: "wifi-agence",
    subject: "Coupures Wi-Fi répétées dans les bureaux",
    description:
      "Le Wi-Fi coupe plusieurs fois par jour dans la partie arrière de l'agence, ce qui interrompt les visioconférences.",
    category: "Support informatique",
    priority: "Normale",
    status: "En attente client",
    channel: "email",
    client: "provence-thomas",
    age: 14,
    thread: [
      { r: "a", t: "Bonjour, la couverture semble insuffisante dans cette zone. Pourriez-vous nous préciser la surface concernée et la position de la box ? Un répéteur sera sans doute nécessaire." },
    ],
  },
  {
    key: "stat-visites",
    subject: "Statistiques de visites incohérentes",
    description:
      "Le tableau de bord affiche 0 visite sur nos annonces depuis lundi, alors que nous recevons des appels tous les jours.",
    category: "Diffusion des annonces",
    priority: "Normale",
    status: "Nouveau",
    channel: "widget",
    client: "cle-nadia",
    age: 2,
    type: "Problème technique",
    page: "https://app.papairis.fr/statistiques",
  },
  {
    key: "app-hors-ligne",
    subject: "Mode hors ligne : les visites saisies disparaissent",
    description:
      "Une visite saisie sans réseau est bien enregistrée localement, mais disparaît au retour de la connexion.",
    category: "App compagnon",
    priority: "Haute",
    status: "En cours",
    channel: "portal",
    client: "atlantique-lea",
    age: 4,
    type: "Problème technique",
    unread: true,
    thread: [
      { r: "a", t: "Bonjour, merci pour ce signalement précis. Nous investiguons la reprise de synchronisation après retour du réseau." },
      { r: "c", t: "Cela s'est reproduit ce matin sur une visite, nous avons perdu le compte rendu." },
    ],
  },
  {
    key: "certificat-site",
    subject: "Avertissement de sécurité sur notre site",
    description:
      "Les visiteurs voient un avertissement « connexion non sécurisée » depuis hier soir sur notre site.",
    category: "Site web",
    priority: "Urgente",
    status: "Résolu",
    channel: "email",
    client: "cevennes-ines",
    age: 22,
    thread: [
      { r: "n", t: "Certificat expiré, renouvellement automatique bloqué par une redirection ajoutée la semaine dernière." },
      { r: "a", t: "Bonjour, le certificat de votre site avait expiré, son renouvellement automatique étant bloqué par une redirection récente. Le certificat est renouvelé et le renouvellement automatique de nouveau opérationnel." },
      { r: "c", t: "Plus d'avertissement, merci pour la rapidité." },
    ],
  },
  {
    key: "modele-bail",
    subject: "Personnaliser le modèle de bail d'habitation",
    description:
      "Nous souhaitons ajouter deux clauses spécifiques à notre modèle de bail. Pouvez-vous nous accompagner ?",
    category: "Papairis",
    priority: "Basse",
    status: "En attente client",
    channel: "widget",
    client: "capitole-fatou",
    age: 17,
    type: "Demande spécifique",
    page: "https://app.papairis.fr/modeles/baux",
    thread: [
      { r: "a", t: "Bonjour, merci de nous transmettre le texte exact des deux clauses ainsi que leur emplacement souhaité dans le bail. Nous préparons le modèle et vous le soumettons pour relecture." },
    ],
  },
  {
    key: "recherche-adresse",
    subject: "L'autocomplétion d'adresse ne trouve pas les hameaux",
    description:
      "La saisie d'adresse ne propose pas les lieux-dits et hameaux, fréquents sur notre secteur rural.",
    category: "Papairis",
    priority: "Basse",
    status: "Nouveau",
    channel: "widget",
    client: "provence-claire",
    age: 3,
    type: "Demande spécifique",
    page: "https://app.papairis.fr/biens/nouveau",
  },
  {
    key: "compte-desactive",
    subject: "Compte d'une collaboratrice partie à désactiver",
    description:
      "Une collaboratrice a quitté l'agence vendredi. Merci de désactiver son accès et de réattribuer ses dossiers.",
    category: "App Ideeri",
    priority: "Haute",
    status: "Résolu",
    channel: "email",
    client: "rhone-elodie",
    age: 25,
    thread: [
      { r: "n", t: "Accès révoqué et dossiers réattribués au responsable d'agence, conformément à la demande." },
      { r: "a", t: "Bonjour, l'accès est désactivé et les dossiers en cours ont été réattribués au responsable d'agence. Les traces de connexion restent conservées comme prévu." },
    ],
  },
  {
    key: "duplicata-facture",
    subject: "Obtenir un duplicata de facture d'abonnement",
    description:
      "Nous avons besoin d'un duplicata de la facture d'abonnement du mois dernier pour notre comptabilité.",
    category: "Autres",
    priority: "Basse",
    status: "Résolu",
    channel: "portal",
    client: "horizon-karim",
    age: 26,
    type: "Question",
    thread: [
      { r: "a", t: "Bonjour, le duplicata vous a été envoyé par email. Vos factures restent également téléchargeables à tout moment depuis Paramètres › Facturation." },
    ],
  },
  {
    key: "alerte-acquereur",
    subject: "Les alertes acquéreurs partent en double",
    description:
      "Nos acquéreurs reçoivent deux fois le même email d'alerte pour un bien correspondant à leur recherche.",
    category: "Papairis",
    priority: "Normale",
    status: "En cours",
    channel: "widget",
    client: "alsace-camille",
    age: 5,
    type: "Problème technique",
    page: "https://app.papairis.fr/acquereurs/alertes",
    thread: [
      { r: "n", t: "Deux recherches enregistrées quasi identiques sur les mêmes contacts. À confirmer avant d'incriminer l'envoi." },
      { r: "a", t: "Bonjour, il semble que deux recherches enregistrées très proches déclenchent chacune une alerte. Nous vous proposons de les fusionner : confirmez-vous ?" },
    ],
  },
  {
    key: "visite-virtuelle",
    subject: "Intégrer nos visites virtuelles aux annonces",
    description:
      "Nous produisons des visites virtuelles chez un prestataire et souhaitons les rattacher automatiquement aux annonces diffusées.",
    category: "Diffusion des annonces",
    priority: "Basse",
    status: "Nouveau",
    channel: "portal",
    client: "littoral-sarah",
    age: 4,
    type: "Demande spécifique",
  },
  {
    key: "mail-spam",
    subject: "Nos emails arrivent dans les indésirables",
    description:
      "Depuis deux semaines, une partie de nos envois aux clients atterrit dans le dossier spam.",
    category: "Papairis",
    priority: "Haute",
    status: "En cours",
    channel: "email",
    client: "tilleuls-paul",
    age: 8,
    thread: [
      { r: "a", t: "Bonjour, nous vérifions la configuration d'authentification de votre domaine (SPF, DKIM, DMARC), qui est la cause la plus fréquente de ce comportement." },
      { r: "n", t: "DKIM absent sur le domaine de l'agence. Prévoir l'enregistrement DNS avec leur prestataire." },
    ],
  },
  {
    key: "champ-obligatoire",
    subject: "Rendre le champ « honoraires » obligatoire",
    description:
      "Nous aimerions que la saisie des honoraires soit obligatoire avant publication d'une annonce, pour éviter les oublis.",
    category: "Papairis",
    priority: "Basse",
    status: "En attente client",
    channel: "widget",
    client: "cle-julien",
    age: 12,
    type: "Demande spécifique",
    page: "https://app.papairis.fr/parametres/annonces",
    thread: [
      { r: "a", t: "Bonjour, ce réglage est disponible au niveau de l'agence. Souhaitez-vous l'appliquer à tous les types de mandats ou uniquement aux mandats exclusifs ?" },
    ],
  },
  {
    key: "double-ecran",
    subject: "Second écran non détecté après changement de station d'accueil",
    description:
      "Depuis le remplacement de la station d'accueil, le second écran n'est plus reconnu sur le poste de direction.",
    category: "Support informatique",
    priority: "Basse",
    status: "Résolu",
    channel: "email",
    client: "capitole-antoine",
    age: 23,
    thread: [
      { r: "a", t: "Bonjour, le pilote de la nouvelle station n'était pas installé. Après mise à jour, les deux écrans sont bien détectés." },
    ],
  },
  {
    key: "annonce-prix",
    subject: "Baisse de prix non répercutée sur les portails",
    description:
      "Nous avons baissé le prix d'un bien hier, l'ancien prix est toujours affiché sur deux portails.",
    category: "Diffusion des annonces",
    priority: "Haute",
    status: "En attente client",
    channel: "widget",
    client: "provence-thomas",
    age: 7,
    type: "Problème technique",
    page: "https://app.papairis.fr/diffusion/portails",
    unread: true,
    thread: [
      { r: "a", t: "Bonjour, la mise à jour a bien été transmise de notre côté. Pourriez-vous nous confirmer si l'ancien prix est toujours visible ce matin ?" },
      { r: "c", t: "Oui, toujours l'ancien prix sur les deux portails." },
    ],
  },
  {
    key: "app-connexion",
    subject: "Déconnexion de l'application plusieurs fois par jour",
    description:
      "L'application mobile nous déconnecte plusieurs fois par jour et il faut ressaisir le mot de passe à chaque fois.",
    category: "App compagnon",
    priority: "Normale",
    status: "En cours",
    channel: "portal",
    client: "horizon-sophie",
    age: 9,
    type: "Problème technique",
    thread: [
      { r: "a", t: "Bonjour, nous analysons la durée de validité des sessions mobiles. En attendant, activer la connexion biométrique évite la ressaisie du mot de passe." },
    ],
  },
  {
    key: "kb-article",
    subject: "Où trouver la documentation sur les mandats ?",
    description:
      "Nous formons deux nouveaux collaborateurs et cherchons la documentation sur la création des mandats.",
    category: "Autres",
    priority: "Basse",
    status: "Résolu",
    channel: "portal",
    client: "atlantique-eric",
    age: 28,
    type: "Question",
    thread: [
      { r: "a", t: "Bonjour, la documentation est disponible dans notre centre d'aide, rubrique « Mandats ». Nous vous en transmettons le lien direct par email." },
    ],
  },
  {
    key: "logo-annonce",
    subject: "Ajouter notre logo sur les photos publiées",
    description:
      "Nous souhaitons apposer automatiquement notre logo sur les photos diffusées, comme le fait un confrère.",
    category: "Diffusion des annonces",
    priority: "Basse",
    status: "Nouveau",
    channel: "widget",
    client: "cevennes-hugo",
    age: 6,
    type: "Demande spécifique",
    page: "https://app.papairis.fr/parametres/photos",
  },
  {
    key: "site-mentions",
    subject: "Mettre à jour les mentions légales du site",
    description:
      "Notre numéro de carte professionnelle a changé, il faut le corriger dans les mentions légales.",
    category: "Site web",
    priority: "Basse",
    status: "Résolu",
    channel: "email",
    client: "alsace-david",
    age: 29,
    thread: [
      { r: "a", t: "Bonjour, les mentions légales sont à jour avec le nouveau numéro de carte professionnelle. Merci de vérifier de votre côté." },
      { r: "c", t: "C'est parfait, merci." },
    ],
  },
  {
    key: "restitution-cle",
    subject: "Suivi des clés : ajouter un historique des remises",
    description:
      "Nous aimerions tracer qui a pris et rendu les clés d'un bien, avec la date. Aujourd'hui nous le notons sur un cahier.",
    category: "Papairis",
    priority: "Normale",
    status: "Nouveau",
    channel: "direct",
    client: "rhone-vincent",
    age: 1,
    type: "Demande spécifique",
  },
  {
    key: "mandat-pdf-doublon",
    subject: "Génération du mandat bloquée",
    description:
      "Impossible d'éditer un mandat depuis ce matin, la fenêtre tourne indéfiniment. Deux collaborateurs sont bloqués.",
    category: "Papairis",
    priority: "Haute",
    status: "Nouveau",
    channel: "email",
    client: "tilleuls-paul",
    age: 1,
    duplicateOf: {
      key: "mandat-pdf",
      score: 88,
      reason: "Même blocage de génération de mandat, signalé le même jour, sur la même agence.",
    },
  },
  {
    key: "app-crash-doublon",
    subject: "Application mobile inutilisable sur Android",
    description:
      "Notre équipe terrain ne peut plus ouvrir l'application sur Android, elle se referme aussitôt.",
    category: "App compagnon",
    priority: "Haute",
    status: "Nouveau",
    channel: "widget",
    client: "atlantique-lea",
    age: 4,
    type: "Problème technique",
    page: "https://app.papairis.fr/aide",
    duplicateOf: {
      key: "app-crash-android",
      score: 84,
      reason: "Fermeture immédiate de l'application mobile sur Android décrite dans les deux demandes.",
    },
  },
  {
    key: "wifi-fusionne",
    subject: "Wi-Fi instable côté bureaux",
    description:
      "Complément à notre demande précédente : les coupures touchent aussi la salle de réunion.",
    category: "Support informatique",
    priority: "Basse",
    status: "Résolu",
    channel: "email",
    client: "provence-thomas",
    age: 13,
    mergeInto: "wifi-agence",
  },
  {
    key: "seloger-fusionne",
    subject: "Relance : diffusion SeLoger",
    description:
      "Nous relançons au sujet du blocage de diffusion SeLoger signalé ce matin.",
    category: "Diffusion des annonces",
    priority: "Normale",
    status: "Résolu",
    channel: "email",
    client: "provence-claire",
    age: 2,
    mergeInto: "seloger-publication",
  },
];

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.error(
      [
        "Ce script SUPPRIME tous les tickets de la base pointée par DATABASE_URL",
        "(et par cascade leurs messages, pièces jointes, notifications et doublons).",
        "",
        "Relancez avec --confirm si c'est bien ce que vous voulez :",
        "  npx tsx scripts/seed-demo-tickets.ts --confirm",
      ].join("\n"),
    );
    process.exit(1);
  }

  const host = process.env.DATABASE_URL?.match(/@([^/]+)\//)?.[1] ?? "inconnu";
  console.log(`Base ciblée : ${host}`);

  // --- Faute de frappe du paramétrage : « Papiris » → « Papairis » ---
  const misspelled = await prisma.ticketCategory.findUnique({ where: { name: "Papiris" } });
  const alreadyCorrect = await prisma.ticketCategory.findUnique({ where: { name: "Papairis" } });
  if (misspelled && !alreadyCorrect) {
    await prisma.ticketCategory.update({
      where: { id: misspelled.id },
      data: { name: "Papairis" },
    });
    console.log("Produit concerné renommé : « Papiris » → « Papairis ».");
  }

  // --- Remise à zéro des tickets ---
  const before = await prisma.ticket.count();
  // Les messages, pièces jointes, notifications et rapprochements de doublons
  // partent en cascade (voir les `onDelete` du schéma) ; les liens du journal
  // d'audit se dénouent (SET NULL) sans que ses lignes disparaissent.
  const { count: deleted } = await prisma.ticket.deleteMany({});
  console.log(`Tickets supprimés : ${deleted} (sur ${before} présents).`);

  // --- Référentiels (lus, jamais modifiés) ---
  const [statuses, priorities, categories, agents, sources] = await Promise.all([
    prisma.ticketStatus.findMany(),
    prisma.ticketPriority.findMany(),
    prisma.ticketCategory.findMany(),
    prisma.agent.findMany({
      where: { isActive: true, approvalStatus: "APPROVED" },
      orderBy: { createdAt: "asc" },
    }),
    prisma.source.findMany(),
  ]);

  const byName = <T extends { name: string }>(list: T[], name: string): T => {
    const found = list.find((entry) => entry.name === name);
    if (!found) throw new Error(`Référentiel introuvable : « ${name} ».`);
    return found;
  };
  const sourceBySlug = (slug: string) => sources.find((entry) => entry.slug === slug) ?? null;

  if (agents.length === 0) throw new Error("Aucun agent actif : impossible d'assigner les tickets.");

  const widgetSource = sourceBySlug("widget-papairis");
  const portalSource = sourceBySlug("portail");

  // --- Contacts fictifs ---
  for (const client of CLIENTS) {
    await prisma.client.upsert({
      where: { email: client.email },
      update: { name: client.name, company: client.company, phone: client.phone },
      create: {
        name: client.name,
        email: client.email,
        company: client.company,
        phone: client.phone,
      },
    });
  }
  const clientRows = await prisma.client.findMany({
    where: { email: { in: CLIENTS.map((client) => client.email) } },
  });
  const clientIdByKey = new Map(
    CLIENTS.map((client) => [
      client.key,
      clientRows.find((row) => row.email === client.email)!.id,
    ]),
  );
  console.log(`Contacts fictifs prêts : ${clientIdByKey.size}.`);

  // --- Tickets ---
  const ticketIdByKey = new Map<string, string>();
  const ticketCreatedAtByKey = new Map<string, Date>();

  for (const [index, scenario] of SCENARIOS.entries()) {
    const status = byName(statuses, scenario.status);
    const priority = byName(priorities, scenario.priority);
    const category = byName(categories, scenario.category);
    const clientId = clientIdByKey.get(scenario.client)!;
    const contact = CLIENTS.find((client) => client.key === scenario.client)!;

    // Un ticket clos a forcément été pris en charge par quelqu'un ; un ticket
    // « Nouveau » attend le plus souvent son preneur. Entre les deux, on
    // répartit sur l'équipe.
    const leaveUnassigned =
      scenario.status === "Nouveau" ? index % 4 !== 3 : scenario.status !== "Résolu" && index % 7 === 0;
    const assignee = leaveUnassigned ? null : agents[index % agents.length];

    // Un doublon — comme un ticket destiné à être fusionné — est POSTÉRIEUR au
    // dossier qu'il redouble. Ce n'est pas cosmétique : la détection ne regarde
    // que vers le passé (`findLexicalCandidates`) et la bannière annonce le sens
    // de la fusion d'après l'antériorité. On le date donc à partir de son
    // original, et non d'un tirage indépendant dont l'heure aléatoire pouvait
    // inverser les deux quand ils partageaient le même `age`.
    const originalKey = scenario.duplicateOf?.key ?? scenario.mergeInto;
    const originalCreatedAt = originalKey ? ticketCreatedAtByKey.get(originalKey) : undefined;
    const createdAt = originalCreatedAt
      ? new Date(originalCreatedAt.getTime() + 2 * 60 * 60 * 1000)
      : daysAgo(scenario.age);
    const turns = scenario.thread ?? [];
    // Le fil s'étale entre la création et maintenant. Les instants se déduisent
    // de `createdAt` par addition, et non d'un second tirage aléatoire : c'est
    // ce qui garantit qu'une réponse ne peut pas être horodatée avant la
    // demande qu'elle traite.
    const spanMs = Math.max(NOW - createdAt.getTime() - 2 * 60 * 60 * 1000, 30 * 60 * 1000);
    const stepMs = turns.length > 0 ? spanMs / (turns.length + 1) : 0;
    const turnAt = (turnIndex: number) => new Date(createdAt.getTime() + stepMs * (turnIndex + 1));

    const updatedAt = turns.length > 0 ? turnAt(turns.length - 1) : createdAt;

    let ticketSource: TicketSource;
    let formSourceId: string | null = null;
    const metadata: Record<string, unknown> = {};
    if (scenario.type) metadata.type = scenario.type;

    switch (scenario.channel) {
      case "widget":
        ticketSource = "WIDGET_PAPAIRIS";
        formSourceId = widgetSource?.id ?? null;
        if (scenario.page) metadata.reference_page = scenario.page;
        metadata._papairis = {
          userId: `PAP-${1000 + index}`,
          appVersion: pick(["7.4.2", "7.4.3", "7.5.0"]),
          papairisClientId: contact.company.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6),
        };
        break;
      case "portal":
        ticketSource = "PORTAL";
        formSourceId = portalSource?.id ?? null;
        break;
      case "email":
        ticketSource = "EMAIL";
        // Les en-têtes d'origine suffisent à rendre la fiche crédible. On ne
        // pose volontairement NI `gmailThreadId` NI `gmailMessageId` : des
        // identifiants inventés feraient échouer une réponse envoyée en direct
        // pendant la démonstration, puisque l'envoi tenterait de répondre dans
        // un fil Gmail inexistant.
        metadata._email = {
          from: contact.email,
          fromName: contact.name,
          to: "support@ideeri.fr",
          subject: scenario.subject,
          date: createdAt.toUTCString(),
        };
        break;
      default:
        ticketSource = "DIRECT";
        break;
    }

    const ticket = await prisma.ticket.create({
      data: {
        subject: scenario.subject,
        description: scenario.description,
        source: ticketSource,
        formSourceId,
        sourceUrl: scenario.page ?? null,
        metadata: metadata as Prisma.InputJsonValue,
        statusId: status.id,
        priorityId: priority.id,
        categoryId: category.id,
        clientId,
        assigneeId: assignee?.id ?? null,
        hasUnreadActivity: status.isClosed ? false : Boolean(scenario.unread),
        // Posé dès la création plutôt que par une mise à jour ultérieure, qui
        // repousserait `updatedAt` à maintenant et écraserait l'ancienneté
        // travaillée ci-dessus.
        duplicateScanAt: scenario.duplicateOf ? updatedAt : null,
        createdAt,
        updatedAt,
        closedAt: status.isClosed ? updatedAt : null,
      },
    });

    ticketIdByKey.set(scenario.key, ticket.id);
    ticketCreatedAtByKey.set(scenario.key, createdAt);

    // --- Fil de conversation ---
    for (const [turnIndex, turn] of turns.entries()) {
      await prisma.message.create({
        data: {
          ticketId: ticket.id,
          content: turn.t,
          authorType: turn.r === "c" ? "CLIENT" : "AGENT",
          isPrivate: turn.r === "n",
          // Une note interne ne part jamais au client ; une réponse publique
          // écrite par l'équipe, si.
          emailSent: turn.r === "a",
          agentId: turn.r === "c" ? null : (assignee?.id ?? agents[0].id),
          createdAt: turnAt(turnIndex),
        },
      });
    }

    // --- Pièce jointe de la demande initiale ---
    if (scenario.attachment) {
      await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          filename: scenario.attachment,
          mimeType: "image/png",
          size: TINY_PNG.length,
          data: TINY_PNG,
          createdAt,
        },
      });
    }
  }

  console.log(`Tickets créés : ${ticketIdByKey.size}.`);

  // --- Fusions de doublons ---
  let merges = 0;
  for (const scenario of SCENARIOS) {
    if (!scenario.mergeInto) continue;
    const sourceId = ticketIdByKey.get(scenario.key)!;
    const targetId = ticketIdByKey.get(scenario.mergeInto);
    if (!targetId) continue;
    const mergedAt = new Date(ticketCreatedAtByKey.get(scenario.key)!.getTime() + 90 * 60 * 1000);
    await prisma.ticket.update({
      where: { id: sourceId },
      // `updatedAt` explicite : sans lui, `@updatedAt` remonterait le ticket
      // fusionné en tête de liste, à rebours de son ancienneté.
      data: { mergedIntoId: targetId, mergedAt, updatedAt: mergedAt },
    });
    merges += 1;
  }
  console.log(`Tickets fusionnés : ${merges}.`);

  // --- Rapprochements de doublons en attente de décision ---
  let suggestions = 0;
  for (const scenario of SCENARIOS) {
    if (!scenario.duplicateOf) continue;
    const ticketId = ticketIdByKey.get(scenario.key)!;
    const candidateId = ticketIdByKey.get(scenario.duplicateOf.key);
    if (!candidateId) continue;
    // `duplicateScanAt` a déjà été posé à la création du ticket : sans ce
    // marqueur, la fiche relancerait une détection facturée dès son ouverture
    // et écraserait la proposition préparée ici.
    await prisma.ticketDuplicateSuggestion.create({
      data: {
        ticketId,
        candidateId,
        score: scenario.duplicateOf.score,
        reason: scenario.duplicateOf.reason,
        status: "PENDING",
        createdAt: new Date(ticketCreatedAtByKey.get(scenario.key)!.getTime() + 30 * 60 * 1000),
      },
    });
    suggestions += 1;
  }
  console.log(`Rapprochements de doublons proposés : ${suggestions}.`);

  // --- Récapitulatif vérifiable ---
  const distribution = async (label: string, groupBy: "statusId" | "priorityId" | "categoryId") => {
    const rows = await prisma.ticket.groupBy({ by: [groupBy], _count: { _all: true } });
    const names = new Map<string, string>([
      ...statuses.map((s) => [s.id, s.name] as const),
      ...priorities.map((p) => [p.id, p.name] as const),
      ...categories.map((c) => [c.id, c.name] as const),
    ]);
    const summary = rows
      .map((row) => `${names.get(row[groupBy] as string) ?? "—"}: ${row._count._all}`)
      .join(", ");
    console.log(`  ${label} → ${summary}`);
  };

  const bySource = await prisma.ticket.groupBy({ by: ["source"], _count: { _all: true } });
  const unassigned = await prisma.ticket.count({ where: { assigneeId: null } });
  const unread = await prisma.ticket.count({ where: { hasUnreadActivity: true } });
  const messages = await prisma.message.count();

  console.log("\nRépartition :");
  await distribution("Statut", "statusId");
  await distribution("Priorité", "priorityId");
  await distribution("Produit concerné", "categoryId");
  console.log(
    `  Source → ${bySource.map((row) => `${row.source}: ${row._count._all}`).join(", ")}`,
  );
  console.log(`  Non assignés : ${unassigned} · Activité non lue : ${unread} · Messages : ${messages}`);
  console.log("\nJeu de démonstration prêt.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
