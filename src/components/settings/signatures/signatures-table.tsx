"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { SignatureDialog } from "@/components/settings/signatures/signature-dialog";
import type { SignatureAgentOption } from "@/components/settings/signatures/signature-dialog";
import { deleteEmailSignature } from "@/lib/actions/signatures";
import type { EmailSignatureWithAgents } from "@/lib/actions/signatures";

export function SignaturesTable({
  signatures,
  agents,
  logoUrl,
}: {
  signatures: EmailSignatureWithAgents[];
  agents: SignatureAgentOption[];
  logoUrl: string | null;
}) {
  const router = useRouter();

  async function handleDelete(id: string) {
    try {
      await deleteEmailSignature(id);
      toast.success("Signature supprimée");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  }

  if (signatures.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center">
        <p className="text-sm font-medium">Aucune signature</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Les réponses partent sans signature. Créez-en une pour ajouter le nom de l&apos;agent qui
          répond en bas de chaque email.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Appliquée à</TableHead>
            <TableHead className="w-24">État</TableHead>
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {signatures.map((signature) => (
            <TableRow key={signature.id}>
              <TableCell className="font-medium">{signature.name}</TableCell>
              <TableCell>
                <ScopeCell signature={signature} />
              </TableCell>
              <TableCell>
                {signature.isActive && <Badge variant="secondary">Active</Badge>}
                {!signature.isActive && <Badge variant="outline">En pause</Badge>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <SignatureDialog
                    signature={signature}
                    agents={agents}
                    logoUrl={logoUrl}
                    trigger={
                      <Button size="icon" variant="ghost">
                        <Pencil className="size-4" />
                      </Button>
                    }
                  />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="icon" variant="ghost">
                        <Trash2 className="size-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer cette signature ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Cette action est irréversible. Les agents concernés répondront sans
                          signature, ou avec celle de toute l&apos;équipe si elle existe.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(signature.id)}>
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Portée de la signature, lisible sans ouvrir la fiche : les agents nommés sont
 * listés, parce que c'est exactement la question qu'on se pose devant la liste
 * (« qui signe comment ? »).
 */
function ScopeCell({ signature }: { signature: EmailSignatureWithAgents }) {
  if (signature.scope === "ALL_AGENTS") {
    return <Badge variant="secondary">Toute l&apos;équipe</Badge>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {signature.agents.map((agent) => (
        <Badge key={agent.id} variant="outline">
          {agent.name}
        </Badge>
      ))}
    </div>
  );
}
