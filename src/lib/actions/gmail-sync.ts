"use server";

import { revalidatePath } from "next/cache";
import { syncGmailInbox } from "@/lib/gmail-sync";

export async function triggerManualGmailSync() {
  const result = await syncGmailInbox();
  revalidatePath("/tickets");
  revalidatePath("/settings/email");
  return result;
}
