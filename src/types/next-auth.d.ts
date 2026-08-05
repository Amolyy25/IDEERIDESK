import type { DefaultSession } from "next-auth";
import type { AgentRole, AgentApprovalStatus } from "@/generated/prisma/client";
import type { PermissionKey } from "@/lib/permissions";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AgentRole;
      /**
       * Permissions DÉJÀ résolues : la liste complète du registre pour un
       * administrateur, les clés accordées et refermées sur leurs prérequis
       * pour un agent (voir `effectivePermissions`). Aucun appelant n'a donc à
       * retester le rôle avant de tester une permission.
       */
      permissions: PermissionKey[];
      requiresApproval: boolean;
      /**
       * Posé dès qu'un agent actif est reconnu, même sans approbation — c'est
       * le seul champ disponible avant qu'un admin ait tranché (voir le
       * callback `session` dans `@/auth`). Absent pour un visiteur anonyme.
       */
      approvalStatus?: AgentApprovalStatus;
    } & DefaultSession["user"];
  }
}
