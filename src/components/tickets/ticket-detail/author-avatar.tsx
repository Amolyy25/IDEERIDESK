import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * Qui parle. Trois familles seulement, parce que c'est la seule distinction qui
 * change ce qu'un agent doit faire du message : le client attend une réponse,
 * un collègue non, la machine encore moins.
 */
export type AuthorKind = "client" | "agent" | "system";

/** « Camille Martin » → « CM ». Un seul mot donne une seule lettre. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

const FALLBACK_TONES: Record<AuthorKind, string> = {
  // Le client se distingue par un fond neutre plein, l'agent par l'accent de
  // l'application : à la lecture du fil, entrant et sortant se repèrent à la
  // couleur de la pastille avant même de lire le nom.
  client: "bg-secondary text-secondary-foreground",
  agent: "bg-primary/15 text-foreground",
  system: "bg-muted text-muted-foreground",
};

export function AuthorAvatar({
  name,
  kind,
  imageUrl,
}: {
  name: string;
  kind: AuthorKind;
  /** Photo de profil Google de l'agent, quand elle est connue. */
  imageUrl?: string | null;
}) {
  return (
    <Avatar className="size-8">
      {imageUrl && <AvatarImage src={imageUrl} alt="" />}
      <AvatarFallback
        className={cn("text-[11px] font-medium tracking-wide", FALLBACK_TONES[kind])}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
