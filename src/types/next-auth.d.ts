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
      approvalStatus: AgentApprovalStatus;
    } & DefaultSession["user"];
  }
}
