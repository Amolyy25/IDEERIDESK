"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { updateAgentPermissions } from "@/lib/actions/agents";
import {
  DEFAULT_AGENT_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  normalizePermissions,
  permissionsDependingOn,
  permissionsInGroup,
  type PermissionKey,
} from "@/lib/permissions";
import type { AgentRole } from "@/generated/prisma/client";

export type EditableAgent = {
  id: string;
  name: string;
  email: string;
  role: AgentRole;
  isActive: boolean;
  requiresApproval: boolean;
  permissions: string[];
};

type SharedProps = {
  /**
   * Permissions que l'utilisateur courant détient lui-même : les autres
   * s'affichent verrouillées. On ne distribue pas ce qu'on n'a pas — la même
   * règle est appliquée côté serveur, ici elle évite d'aller au refus.
   */
  grantablePermissions: PermissionKey[];
  /** Seul un administrateur peut en nommer un autre. */
  canPromoteAdmin: boolean;
};

/**
 * Panneau de permissions d'un agent.
 *
 * Un panneau et non des colonnes : dix-sept interrupteurs ne tiennent pas dans
 * un tableau, et surtout ils ne se décident pas d'un coup d'œil. Ici chaque
 * permission garde son libellé, sa description et, le cas échéant, son
 * avertissement — de quoi trancher en connaissance de cause plutôt que de
 * cocher une case au nom cryptique.
 */
export function AgentPermissionsSheet({
  agent,
  open,
  onOpenChange,
  ...shared
}: SharedProps & {
  agent: EditableAgent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        {agent && (
          // Le formulaire tient son propre état, initialisé au montage. La clé
          // le remonte quand on passe d'un agent à l'autre, et la fermeture du
          // panneau le démonte : il ne peut donc pas rouvrir sur les hésitations
          // d'une session d'édition précédente.
          <PermissionsForm
            key={agent.id}
            agent={agent}
            onClose={() => onOpenChange(false)}
            {...shared}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PermissionsForm({
  agent,
  onClose,
  grantablePermissions,
  canPromoteAdmin,
}: SharedProps & { agent: EditableAgent; onClose: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<AgentRole>(agent.role);
  const [isActive, setIsActive] = useState(agent.isActive);
  const [requiresApproval, setRequiresApproval] = useState(agent.requiresApproval);
  const [granted, setGranted] = useState<PermissionKey[]>(() =>
    normalizePermissions(agent.permissions),
  );

  const isAdminRole = role === "ADMIN";

  const effective = useMemo(
    () => new Set<PermissionKey>(isAdminRole ? PERMISSION_KEYS : granted),
    [isAdminRole, granted],
  );

  /**
   * Les dépendances du registre sont appliquées à la volée : accorder
   * « Répondre et modifier » accorde « Accéder aux tickets », retirer l'accès
   * retire ce qui en découlait — laisser « Fusionner les doublons » à un compte
   * qui ne peut plus répondre serait un droit sans effet, refusé au premier
   * clic. Le serveur refait le même calcul, ceci n'est qu'un confort.
   */
  /**
   * Rétrograder un administrateur repart des permissions courantes et non de
   * rien : son enregistrement n'en stocke aucune (le rôle les portait toutes),
   * et enregistrer tel quel fabriquerait un compte actif sans le moindre accès,
   * renvoyé sur /aucun-acces. Le point de départ se voit et se corrige.
   */
  function changeRole(nextIsAdmin: boolean) {
    setRole(nextIsAdmin ? "ADMIN" : "AGENT");
    if (!nextIsAdmin && granted.length === 0) {
      setGranted(DEFAULT_AGENT_PERMISSIONS.filter((key) => grantablePermissions.includes(key)));
    }
  }

  function toggle(key: PermissionKey, checked: boolean) {
    setGranted((current) => {
      if (checked) return normalizePermissions([...current, key]);
      const removed = new Set<PermissionKey>([key, ...permissionsDependingOn(key)]);
      return current.filter((entry) => !removed.has(entry));
    });
  }

  function save() {
    startTransition(async () => {
      try {
        await updateAgentPermissions(agent.id, {
          role,
          isActive,
          requiresApproval,
          permissions: granted,
        });
        // Pas de mise à jour optimiste de la liste : l'action revalide
        // `/agents`, le tableau se redessine avec ce que la base contient
        // vraiment — y compris les prérequis que le serveur a pu ajouter.
        toast.success(`Accès de ${agent.name} enregistrés.`);
        onClose();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
      }
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{agent.name}</SheetTitle>
        <SheetDescription>{agent.email}</SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-2">
        <section className="space-y-3">
          <Row
            id="account-active"
            label="Compte actif"
            description="Désactivé, l'agent ne peut plus se connecter."
            checked={isActive}
            onChange={setIsActive}
            disabled={isPending}
          />
          <Row
            id="account-admin"
            label="Administrateur"
            description="Accorde toutes les permissions, y compris celles ajoutées plus tard, et le droit de nommer d'autres administrateurs."
            checked={isAdminRole}
            onChange={changeRole}
            disabled={isPending || !canPromoteAdmin}
            lockedReason={
              canPromoteAdmin ? undefined : "Seul un administrateur peut en nommer un autre."
            }
            sensitive
          />
          <Row
            id="account-requires-approval"
            label="Réponses soumises à validation"
            description="Les réponses publiques de cet agent partent en attente au lieu d'être envoyées au client."
            checked={requiresApproval}
            onChange={setRequiresApproval}
            disabled={isPending}
          />
        </section>

        <Separator />

        {isAdminRole ? (
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Toutes les permissions</p>
              <p className="text-sm text-muted-foreground">
                Un administrateur n&apos;a rien à cocher : son rôle couvre l&apos;intégralité des
                permissions, présentes et à venir. Retirez le rôle pour détailler ses accès.
              </p>
            </div>
          </div>
        ) : (
          PERMISSION_GROUPS.map((group) => (
            <section key={group.key} className="space-y-3">
              <div className="space-y-0.5">
                <h3 className="text-sm font-medium">{group.label}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>

              <div className="space-y-3">
                {permissionsInGroup(group.key).map((key) => {
                  const meta = PERMISSIONS[key];
                  const held = grantablePermissions.includes(key);
                  const isOn = effective.has(key);
                  // Exactement la règle du serveur (`refuseEscalation`) : on ne
                  // peut pas ACCORDER ce qu'on n'a pas, on peut toujours le
                  // RETIRER. Verrouiller les deux sens empêchait de nettoyer les
                  // droits d'un partant, alors que le serveur l'autorisait.
                  const locked = !held && !isOn;
                  return (
                    <Row
                      key={key}
                      id={key}
                      label={meta.label}
                      description={meta.description}
                      checked={isOn}
                      onChange={(checked) => toggle(key, checked)}
                      disabled={isPending || locked}
                      lockedReason={
                        locked ? "Vous ne détenez pas cette permission." : undefined
                      }
                      sensitive={meta.sensitive}
                      indented={Boolean(meta.requires)}
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <SheetFooter>
        <Button onClick={save} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={isPending}>
          Annuler
        </Button>
      </SheetFooter>
    </>
  );
}

/** Une ligne « libellé + explication + interrupteur ». */
function Row({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  lockedReason,
  sensitive,
  indented,
}: {
  /** Identifiant stable du commutateur — la clé de permission, ou celle du réglage de compte. */
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Pourquoi l'interrupteur est verrouillé — un contrôle grisé sans motif est une impasse. */
  lockedReason?: string;
  sensitive?: boolean;
  /** Décalée sous son prérequis, pour que la dépendance se voie. */
  indented?: boolean;
}) {
  return (
    <div className={indented ? "border-l pl-4" : undefined}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={id} className="flex flex-wrap items-center gap-2 font-medium">
            {label}
            {sensitive && (
              <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                <AlertTriangle className="size-3" />
                Sensible
              </Badge>
            )}
          </Label>
          <p className="text-xs text-muted-foreground">{description}</p>
          {lockedReason && <p className="text-xs text-muted-foreground/80">{lockedReason}</p>}
        </div>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="mt-0.5 shrink-0"
        />
      </div>
    </div>
  );
}
