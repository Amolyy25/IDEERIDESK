import { z } from "zod";

// Les coordonnées d'un contact et leur normalisation. Hors de `actions/clients.ts`
// parce qu'un module `"use server"` ne peut exporter que des fonctions async :
// le schéma n'y serait lisible ni par les formulaires ni par un test.

// Lues par le schéma ET par les champs des formulaires : un champ qui laisse
// saisir plus que ce que l'action accepte fait buter l'agent sur un refus.
export const CLIENT_FIELD_LIMITS = { name: 120, phone: 30, company: 120 } as const;

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Nom requis").max(CLIENT_FIELD_LIMITS.name),
  // Normalisé en minuscules : Client.email est la clé de dédup utilisée
  // partout ailleurs (widget, synchro Gmail) — sans ça, une même personne
  // saisie ici avec une casse différente se retrouve avec deux fiches.
  email: z.string().trim().email("Email invalide").transform((v) => v.toLowerCase()),
  // `|| null` : un champ vidé dans le formulaire d'édition doit effacer la
  // valeur en base, pas laisser la colonne inchangée.
  phone: z
    .string()
    .trim()
    .max(CLIENT_FIELD_LIMITS.phone)
    .optional()
    .nullable()
    .transform((v) => v || null),
  company: z
    .string()
    .trim()
    .max(CLIENT_FIELD_LIMITS.company)
    .optional()
    .nullable()
    .transform((v) => v || null),
});

export type ClientFieldsInput = z.input<typeof clientSchema>;
