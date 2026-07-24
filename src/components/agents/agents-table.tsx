"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { updateAgentPermissions } from "@/lib/actions/agents";
import type { Agent, AgentRole } from "@/generated/prisma/client";

type AgentPermissions = {
  role: AgentRole;
  isActive: boolean;
  canRespond: boolean;
  requiresApproval: boolean;
  canApprove: boolean;
};

export function AgentsTable({
  agents,
  currentAgentId,
  isAdmin,
}: {
  agents: Agent[];
  currentAgentId: string;
  isAdmin: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [rows, setRows] = useState(agents);

  function applyChange(agentId: string, patch: Partial<AgentPermissions>) {
    const previous = rows;
    const updated = rows.map((a) => (a.id === agentId ? { ...a, ...patch } : a));
    setRows(updated);

    const agent = updated.find((a) => a.id === agentId);
    if (!agent) return;

    startTransition(async () => {
      try {
        await updateAgentPermissions(agentId, {
          role: agent.role,
          isActive: agent.isActive,
          canRespond: agent.canRespond,
          requiresApproval: agent.requiresApproval,
          canApprove: agent.canApprove,
        });
      } catch (error) {
        setRows(previous);
        toast.error(error instanceof Error ? error.message : "Mise à jour impossible");
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Rôle</TableHead>
            <TableHead>Actif</TableHead>
            <TableHead>Peut répondre</TableHead>
            <TableHead>Validation requise</TableHead>
            <TableHead>Peut valider</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((agent) => {
            const isSelf = agent.id === currentAgentId;
            return (
              <TableRow key={agent.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="font-medium">
                        {agent.name}{" "}
                        {isSelf && <span className="text-muted-foreground">(vous)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{agent.email}</p>
                    </div>
                    {!agent.isActive && <Badge variant="outline">Désactivé</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  <Select
                    value={agent.role}
                    onValueChange={(v) => applyChange(agent.id, { role: v as AgentRole })}
                    disabled={isPending || !isAdmin}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AGENT">Agent</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={agent.isActive}
                    onCheckedChange={(checked) => applyChange(agent.id, { isActive: checked })}
                    disabled={isPending || !isAdmin || isSelf}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={agent.canRespond}
                    onCheckedChange={(checked) => applyChange(agent.id, { canRespond: checked })}
                    disabled={isPending || !isAdmin}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={agent.requiresApproval}
                    onCheckedChange={(checked) =>
                      applyChange(agent.id, { requiresApproval: checked })
                    }
                    disabled={isPending || !isAdmin}
                  />
                </TableCell>
                <TableCell>
                  <Switch
                    checked={agent.canApprove}
                    onCheckedChange={(checked) => applyChange(agent.id, { canApprove: checked })}
                    disabled={isPending || !isAdmin}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
