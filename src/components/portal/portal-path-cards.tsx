import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalConfig } from "@/lib/portal-theme";
import { PortalIcon } from "@/components/portal/portal-icon";

function PathCard({
  href,
  iconName,
  fallbackIcon,
  title,
  text,
  cta,
  interactive,
}: {
  href: string;
  iconName: string;
  fallbackIcon: string;
  title: string;
  text: string;
  cta: string;
  interactive: boolean;
}) {
  const classes =
    "group relative flex flex-col rounded-2xl border bg-card p-7 transition-all hover:border-primary/60 hover:shadow-[0_1px_24px_-8px] hover:shadow-primary/40";
  const content = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
        <PortalIcon name={iconName} fallback={fallbackIcon} className="h-5 w-5" />
      </span>
      <h2 className="mt-5 font-display text-xl font-medium">{title}</h2>
      <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{text}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        {cta}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </span>
    </>
  );

  if (!interactive) return <div className={classes}>{content}</div>;
  return (
    <Link href={href} className={classes}>
      {content}
    </Link>
  );
}

/** Les deux chemins proposés sous le hero : consulter la FAQ / créer un ticket. */
export function PortalPathCards({
  config,
  showFaq,
  interactive = true,
}: {
  config: PortalConfig;
  showFaq: boolean;
  interactive?: boolean;
}) {
  if (!config.cardsEnabled) return null;

  return (
    <section className="mx-auto max-w-5xl px-6 py-14">
      <div className={cn("grid gap-4", showFaq && "sm:grid-cols-2")}>
        {showFaq && (
          <PathCard
            href="#faq"
            iconName={config.faqCardIcon}
            fallbackIcon="BookOpen"
            title={config.faqCardTitle}
            text={config.faqCardText}
            cta="Parcourir les articles"
            interactive={interactive}
          />
        )}
        <PathCard
          href="/nouveau-ticket"
          iconName={config.ticketCardIcon}
          fallbackIcon="MessagesSquare"
          title={config.ticketCardTitle}
          text={config.ticketCardText}
          cta="Ouvrir une demande"
          interactive={interactive}
        />
      </div>
    </section>
  );
}
