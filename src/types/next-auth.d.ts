import type { DefaultSession } from "next-auth";
import type { AgentRole } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AgentRole;
      canRespond: boolean;
      requiresApproval: boolean;
      canApprove: boolean;
    } & DefaultSession["user"];
  }
}
