import { cn } from "@/lib/utils";
import { splitMentionSegments, type MentionableAgent } from "@/lib/mentions";

/**
 * Contenu d'une note interne, mentions surlignées. La mention de l'agent
 * connecté ressort plus fort que celle d'un collègue : c'est ce qui permet de
 * repérer d'un coup d'œil les notes qui l'attendent dans un fil chargé.
 */
export function MentionText({
  content,
  agents,
  currentAgentId,
  className,
}: {
  content: string;
  agents: MentionableAgent[];
  currentAgentId: string | null;
  className?: string;
}) {
  const segments = splitMentionSegments(content, agents);

  return (
    <p className={cn("whitespace-pre-wrap text-sm text-foreground", className)}>
      {segments.map((segment, index) =>
        segment.agentId ? (
          <span
            key={index}
            className={cn(
              "rounded px-1 font-medium",
              segment.agentId === currentAgentId
                ? "bg-primary text-primary-foreground"
                : "bg-primary/15 text-foreground"
            )}
          >
            {segment.text}
          </span>
        ) : (
          segment.text
        )
      )}
    </p>
  );
}
