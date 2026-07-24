import { Paperclip } from "lucide-react";
import type { TicketWithMessages } from "@/lib/actions/tickets";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  return `${Math.round(bytes / 1024)} Ko`;
}

export function AttachmentsList({
  attachments,
}: {
  attachments: TicketWithMessages["attachments"];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <a
          key={attachment.id}
          href={`/api/attachments/${attachment.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
        >
          <Paperclip className="h-3 w-3" />
          {attachment.filename}
          <span className="text-muted-foreground/60">{formatSize(attachment.size)}</span>
        </a>
      ))}
    </div>
  );
}
