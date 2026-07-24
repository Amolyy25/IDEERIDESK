import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.globalSetting.upsert({
    where: { key: "company_name" },
    update: {},
    create: {
      key: "company_name",
      value: "Ideeri",
      label: "Nom de l'entreprise",
      description: "Affiché dans l'interface et les communications sortantes.",
    },
  });

  await prisma.globalSetting.upsert({
    where: { key: "support_email" },
    update: {},
    create: {
      key: "support_email",
      value: "support@ideeri.fr",
      label: "Email de support",
      description: "Adresse utilisée comme expéditeur pour les réponses aux tickets.",
    },
  });

  await prisma.globalSetting.upsert({
    where: { key: "timezone" },
    update: {},
    create: {
      key: "timezone",
      value: "Europe/Paris",
      label: "Fuseau horaire",
      description: "Fuseau horaire utilisé pour l'affichage des dates.",
    },
  });

  await prisma.globalSetting.upsert({
    where: { key: "widget_banner_message" },
    update: {},
    create: {
      key: "widget_banner_message",
      value:
        "Merci de prendre en compte que si vous ajoutez des captures d'écran, une description détaillée et l'URL de la page où votre problème est survenu, nous pourrons répondre plus rapidement à votre besoin.",
      label: "Bandeau d'aide du widget",
      description:
        "Affiché en haut du formulaire de contact public (/widget). Laissez vide pour le masquer.",
      multiline: true,
    },
  });

  const statuses = [
    { name: "Nouveau", color: "#a1a1aa", order: 0, isDefault: true, isClosed: false },
    { name: "En cours", color: "#eab308", order: 1, isDefault: false, isClosed: false },
    { name: "En attente client", color: "#71717a", order: 2, isDefault: false, isClosed: false },
    { name: "Résolu", color: "#3f3f46", order: 3, isDefault: false, isClosed: true },
  ];
  for (const status of statuses) {
    await prisma.ticketStatus.upsert({
      where: { name: status.name },
      update: {},
      create: status,
    });
  }

  const priorities = [
    { name: "Basse", color: "#d4d4d8", order: 0, isDefault: false },
    { name: "Normale", color: "#a1a1aa", order: 1, isDefault: true },
    { name: "Haute", color: "#52525b", order: 2, isDefault: false },
    { name: "Urgente", color: "#eab308", order: 3, isDefault: false },
  ];
  for (const priority of priorities) {
    await prisma.ticketPriority.upsert({
      where: { name: priority.name },
      update: {},
      create: priority,
    });
  }

  // "Produits concernés" (ex-"Catégories") : liste renommée intégralement.
  // On réassigne d'abord les tickets existants avant de supprimer les anciennes
  // lignes, sinon la contrainte de clé étrangère bloque la suppression.
  const obsoleteCategoryNames = ["Technique", "Facturation", "Général", "Compte"];
  const obsoleteCategories = await prisma.ticketCategory.findMany({
    where: { name: { in: obsoleteCategoryNames } },
  });
  if (obsoleteCategories.length > 0) {
    await prisma.ticket.updateMany({
      where: { categoryId: { in: obsoleteCategories.map((c) => c.id) } },
      data: { categoryId: null },
    });
    await prisma.ticketCategory.deleteMany({
      where: { name: { in: obsoleteCategoryNames } },
    });
  }

  const categories = [
    {
      name: "Papairis",
      description: "Demandes liées au logiciel métier Papairis.",
      color: "#eab308",
      order: 0,
      isDefault: true,
    },
    {
      name: "App compagnon",
      description: "Application mobile compagnon.",
      color: "#a1a1aa",
      order: 1,
      isDefault: false,
    },
    {
      name: "Site web",
      description: "Site web vitrine ou institutionnel.",
      color: "#d4d4d8",
      order: 2,
      isDefault: false,
    },
    {
      name: "App Ideeri",
      description: "Application Ideeri Desk et outils internes.",
      color: "#71717a",
      order: 3,
      isDefault: false,
    },
    {
      name: "Diffusion des annonces",
      description: "Diffusion et publication des annonces immobilières.",
      color: "#52525b",
      order: 4,
      isDefault: false,
    },
    {
      name: "Support informatique",
      description: "Assistance matérielle ou logicielle générale.",
      color: "#3f3f46",
      order: 5,
      isDefault: false,
    },
    {
      name: "Autres",
      description: "Demandes ne rentrant dans aucune autre catégorie.",
      color: "#27272a",
      order: 6,
      isDefault: false,
    },
  ];
  for (const category of categories) {
    await prisma.ticketCategory.upsert({
      where: { name: category.name },
      update: {},
      create: category,
    });
  }

  // Anciennes clés renommées : on les nettoie pour que le seed reste idempotent
  // après un renommage plutôt que de laisser une ligne orpheline en base.
  await prisma.customField.deleteMany({
    where: { key: { in: ["reference_annonce", "type_de_bien"] } },
  });

  const customFields = [
    {
      label: "Référence page",
      key: "reference_page",
      type: "TEXT" as const,
      helpText:
        "C'est la page où vous êtes actuellement. Si ce n'est pas la bonne URL, merci de copier-coller l'URL de la page concernée.",
      autofillFromSourceUrl: true,
      isRequired: false,
      order: 0,
    },
    {
      label: "Type",
      key: "type",
      type: "DROPDOWN" as const,
      options: ["Question", "Problème technique", "Demande spécifique"],
      isRequired: false,
      order: 1,
    },
    {
      label: "Urgence commerciale",
      key: "urgence_commerciale",
      type: "CHECKBOX" as const,
      isRequired: false,
      order: 2,
    },
  ];
  for (const field of customFields) {
    await prisma.customField.upsert({
      where: { key: field.key },
      update: {},
      create: field,
    });
  }

  const admin = await prisma.agent.upsert({
    where: { email: "agent@ideeri.fr" },
    update: {},
    create: {
      email: "agent@ideeri.fr",
      name: "Agent Support",
      role: "ADMIN",
    },
  });

  const client = await prisma.client.upsert({
    where: { email: "client.demo@example.com" },
    update: {},
    create: {
      name: "Client Démo",
      email: "client.demo@example.com",
      company: "Agence Démo",
    },
  });

  const defaultStatus = await prisma.ticketStatus.findFirstOrThrow({
    where: { isDefault: true },
  });
  const defaultPriority = await prisma.ticketPriority.findFirstOrThrow({
    where: { isDefault: true },
  });
  const defaultCategory = await prisma.ticketCategory.findFirstOrThrow({
    where: { isDefault: true },
  });

  const existingTicket = await prisma.ticket.findFirst({
    where: { subject: "Exemple de ticket" },
  });

  if (!existingTicket) {
    await prisma.ticket.create({
      data: {
        subject: "Exemple de ticket",
        description: "Ceci est un ticket de démonstration créé par le script de seed.",
        statusId: defaultStatus.id,
        priorityId: defaultPriority.id,
        categoryId: defaultCategory.id,
        clientId: client.id,
        assigneeId: admin.id,
        messages: {
          create: [
            {
              content: "Bonjour, merci de nous confirmer la disponibilité du bien.",
              authorType: "CLIENT",
              isPrivate: false,
            },
            {
              content: "Note interne : vérifier le mandat avant de répondre.",
              authorType: "AGENT",
              agentId: admin.id,
              isPrivate: true,
            },
          ],
        },
      },
    });
  }

  console.log("Seed terminé.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
