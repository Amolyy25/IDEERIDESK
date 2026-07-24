import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import type { TicketWithMessages } from "@/lib/actions/tickets";

export function MessageThread({ messages }: { messages: TicketWithMessages["messages"] }) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "rounded-lg border p-4",
            message.isPrivate ? "border-primary/40 bg-primary/5" : "bg-card"
          )}
        >
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              {message.agent?.name ?? (message.authorType === "CLIENT" ? "Client" : "Système")}
              {message.isPrivate && " · Note interne"}
              {message.emailSent && (
                <span className="ml-1 flex items-center gap-1 text-muted-foreground" title="Envoyé par email">
                  <Mail className="h-3 w-3" />
                </span>
              )}
            </span>
            <span>{formatDateTime(message.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap text-sm text-foreground">{message.content}</p>
        </div>
      ))}
    </div>
  );
}
