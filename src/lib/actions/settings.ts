"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export async function getGlobalSettings() {
  return prisma.globalSetting.findMany({ orderBy: { label: "asc" } });
}

export async function updateGlobalSetting(key: string, value: string) {
  await prisma.globalSetting.update({ where: { key }, data: { value } });
  revalidatePath("/settings");
}
