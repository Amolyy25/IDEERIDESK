"use server";

import { prisma } from "@/lib/prisma";

export async function getAgents() {
  return prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}
