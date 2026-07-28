import type { DefaultSession } from "next-auth";
import type { AgentRole, AgentApprovalStatus } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AgentRole;
      canRespond: boolean;
      requiresApproval: boolean;
      canApprove: boolean;
      /**
       * Posé dès qu'un agent actif est reconnu, même sans approbation — c'est
       * le seul champ disponible avant qu'un admin ait tranché (voir le
       * callback `session` dans `@/auth`). Absent pour un visiteur anonyme.
       */
      approvalStatus?: AgentApprovalStatus;
    } & DefaultSession["user"];
  }
}
