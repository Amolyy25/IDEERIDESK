"use server";

import { revalidatePath } from "next/cache";
import { syncGmailInbox } from "@/lib/gmail-sync";
import { requireApprovedAgent } from "@/lib/require-permission";

export async function triggerManualGmailSync() {
  // Sans garde, un anonyme épuise le quota de l'API Gmail en boucle.
  await requireApprovedAgent();
  const result = await syncGmailInbox();
  revalidatePath("/tickets");
  revalidatePath("/settings/email");
  return result;
}
