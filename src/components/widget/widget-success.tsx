import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WidgetSuccess({
  ticketNumber,
  onClose,
}: {
  ticketNumber: number;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
        <Check className="h-5 w-5 text-primary-foreground" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-medium">Ticket #{ticketNumber} créé</p>
        <p className="text-sm text-muted-foreground">
          Nous avons bien reçu votre demande. Notre équipe vous répondra rapidement.
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onClose}>
        Fermer
      </Button>
    </div>
  );
}
