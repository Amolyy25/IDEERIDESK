import { Globe, Mail, MessageSquare, LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ticketSourceLabels } from "@/lib/ticket-source";
import type { TicketSource } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

const sourceIcons: Record<TicketSource, typeof Globe> = {
  WIDGET_PAPAIRIS: MessageSquare,
  EMAIL: Mail,
  DIRECT: Globe,
  PORTAL: LayoutTemplate,
};

export function SourceBadge({ source, className }: { source: TicketSource; className?: string }) {
  const Icon = sourceIcons[source];

  return (
    <Badge variant="outline" className={cn("gap-1 font-normal text-muted-foreground", className)}>
      <Icon className="h-3 w-3" />
      {ticketSourceLabels[source]}
    </Badge>
  );
}
