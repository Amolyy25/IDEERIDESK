import type { TicketSource } from "@/generated/prisma/client";

export const ticketSourceLabels: Record<TicketSource, string> = {
  WIDGET_PAPAIRIS: "Widget Papairis",
  EMAIL: "Email",
  DIRECT: "Formulaire web",
};
