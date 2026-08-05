"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AgentPermissionsSheet,
  type EditableAgent,
} from "@/components/agents/agent-permissions-sheet";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  effectivePermissions,
  type PermissionKey,
} from "@/lib/permissions";

/**
 * Tableau des comptes approuvés.
 *
 * Volontairement une ligne de synthèse par agent, pas une colonne par
 * permission : le détail vit dans le panneau (`AgentPermissionsSheet`). Ce qui
 * doit se lire d'un coup d'œil ici, c'est « qui est administrateur, qui est
 * désactivé, qui en a beaucoup » — le reste se regarde de près, une personne à
 * la fois.
 */
export function AgentsTable({
  agents,
  currentAgentId,
  canManage,
  grantablePermissions,
  canPromoteAdmin,
}: {
  agents: EditableAgent[];
  currentAgentId: string;
  /** Permission « team.manage » : sans elle, la page se consulte sans se modifier. */
  canManage: boolean;
  grantablePermissions: PermissionKey[];
  canPromoteAdmin: boolean;
}) {
  // Aucune copie locale de `agents` : les deux mutations de cette page
  // (`updateAgentPermissions`, `setAgentApproval`) appellent
  // `revalidatePath("/agents")`, donc le serveur renvoie la liste à jour. Un
  // `useState(agents)` ne se réinitialise pas au re-rendu — un compte approuvé
  // depuis le bloc du dessus n'apparaissait jamais dans ce tableau avant un
  // rechargement complet.
  const [editing, setEditing] = useState<EditableAgent | null>(null);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Permissions</TableHead>
              <TableHead>Validation requise</TableHead>
              <TableHead className="w-32 text-right">Accès</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((agent) => {
              const isSelf = agent.id === currentAgentId;
              return (
                <TableRow key={agent.id} className={agent.isActive ? undefined : "opacity-60"}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {agent.name}{" "}
                          {isSelf && <span className="text-muted-foreground">(vous)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{agent.email}</p>
                      </div>
                      {!agent.isActive && <Badge variant="outline">Désactivé</Badge>}
                    </div>
                  </TableCell>

                  <TableCell>
                    <Badge variant={agent.role === "ADMIN" ? "default" : "secondary"}>
                      {agent.role === "ADMIN" ? "Admin" : "Agent"}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <PermissionsSummary agent={agent} />
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground">
                    {agent.requiresApproval ? "Oui" : "—"}
                  </TableCell>

                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canManage || isSelf}
                      onClick={() => setEditing(agent)}
                      title={
                        isSelf
                          ? "Un autre administrateur doit modifier votre propre accès."
                          : undefined
                      }
                    >
                      <SlidersHorizontal className="size-4" />
                      Configurer
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AgentPermissionsSheet
        agent={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        grantablePermissions={grantablePermissions}
        canPromoteAdmin={canPromoteAdmin}
      />
    </>
  );
}

/**
 * Ce que le compte peut faire, en une ligne.
 *
 * Un décompte nu (« 7 permissions ») ne dit rien d'utile ; la liste complète ne
 * tient pas. On nomme donc les deux premières et on compte le reste, ce qui
 * suffit à repérer une ligne anormale — le panneau est à un clic.
 */
function PermissionsSummary({ agent }: { agent: EditableAgent }) {
  if (agent.role === "ADMIN") {
    return <span className="text-sm text-muted-foreground">Toutes</span>;
  }

  const granted = effectivePermissions(agent);
  if (granted.length === 0) {
    return <span className="text-sm text-muted-foreground">Aucune</span>;
  }

  const shown = granted.slice(0, 2);
  const rest = granted.length - shown.length;
  const sensitive = granted.filter((key) => PERMISSIONS[key].sensitive).length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((key) => (
        <Badge key={key} variant="secondary" className="font-normal">
          {PERMISSIONS[key].label}
        </Badge>
      ))}
      {rest > 0 && (
        <span className="text-xs text-muted-foreground">
          +{rest} sur {PERMISSION_KEYS.length}
        </span>
      )}
      {sensitive > 0 && (
        <Badge variant="outline" className="font-normal text-amber-600 dark:text-amber-500">
          {sensitive} sensible{sensitive > 1 ? "s" : ""}
        </Badge>
      )}
    </div>
  );
}
