import { requirePageAccess } from "@/lib/require-page-access";
import {
  getKnowledgeCategories,
  getArticleTemplates,
  getKnowledgeArticles,
} from "@/lib/actions/knowledge-base";
import { getTicketById } from "@/lib/actions/tickets";
import { can } from "@/lib/permissions";
import { ArticleForm } from "@/components/knowledge-base/article-form";

export default async function NewKnowledgeArticlePage({
  searchParams,
}: {
  /** `?ticket=<id>` : arrivée depuis « Créer un article » sur une fiche ticket. */
  searchParams: Promise<{ ticket?: string }>;
}) {
  const [session, params] = await Promise.all([requirePageAccess("kb.manage"), searchParams]);

  const [categories, templates, allArticles] = await Promise.all([
    getKnowledgeCategories(),
    getArticleTemplates(),
    getKnowledgeArticles(),
  ]);

  // Le ticket n'est chargé QUE pour être nommé dans l'assistant (« #128 —
  // sujet ») : son fil, lui, ne transite jamais par le navigateur, c'est la
  // route de génération qui le lit côté serveur. Un rédacteur sans accès aux
  // tickets arrive donc sur un formulaire vide plutôt que sur une erreur — et
  // la route lui refusera la génération de toute façon.
  let sourceTicket: { id: string; number: number; subject: string } | null = null;
  if (params.ticket && can(session.user.permissions, "tickets.view")) {
    const ticket = await getTicketById(params.ticket);
    if (ticket) {
      sourceTicket = { id: ticket.id, number: ticket.number, subject: ticket.subject };
    }
  }

  return (
    <ArticleForm
      categories={categories}
      templates={templates}
      allArticles={allArticles}
      sourceTicket={sourceTicket}
    />
  );
}
