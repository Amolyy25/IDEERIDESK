import NextAuth from "next-auth";
import { prisma } from "@/lib/prisma";
import authConfig from "@/auth.config";
import { DEFAULT_AGENT_PERMISSIONS, effectivePermissions } from "@/lib/permissions";

const allowedDomain = process.env.ALLOWED_GOOGLE_DOMAIN?.toLowerCase();

// Sans domaine autorisé, n'importe quel compte Google peut créer une demande
// d'accès. Toléré en développement, refusé en production : une variable oubliée
// ne doit pas dégrader silencieusement le filtre d'entrée. Vérifié à la
// connexion et non au chargement du module — ce fichier est importé pendant la
// compilation, où les variables d'exécution ne sont pas encore celles du
// serveur, et un `throw` y ferait échouer le build.
function domainFilterIsUsable() {
  return Boolean(allowedDomain) || process.env.NODE_ENV !== "production";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Railway (comme la plupart des PaaS hors Vercel) n'est pas dans la liste
  // d'hôtes reconnus par défaut par Auth.js — sans ça, la détection de l'URL
  // publique derrière son proxy peut être instable.
  trustHost: true,
  // Durée explicite plutôt que le défaut de la librairie (30 jours) : cette
  // application donne accès aux données personnelles des clients finaux des
  // agences, une session oubliée sur un poste partagé ne doit pas survivre
  // une semaine.
  session: { strategy: "jwt", maxAge: 12 * 60 * 60, updateAge: 60 * 60 },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      if (!domainFilterIsUsable()) {
        console.error(
          "[auth] connexion refusée : ALLOWED_GOOGLE_DOMAIN n'est pas défini en production."
        );
        return false;
      }
      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
        return false;
      }

      const existingAgent = await prisma.agent.findUnique({ where: { email } });
      if (existingAgent) {
        // Un agent désactivé ou refusé par un admin ne peut plus se reconnecter.
        // Un compte encore en attente est laissé passer : il n'accède à rien
        // (voir le callback `session` ci-dessous, qui ne lui donne aucune
        // identité exploitable), mais il peut voir l'état de sa demande plutôt
        // qu'un simple « accès refusé ».
        return existingAgent.isActive && existingAgent.approvalStatus !== "REJECTED";
      }

      // Première connexion : compte créé en attente de validation. Un admin
      // l'approuve (ou le refuse) depuis /agents, puis ajuste rôle et
      // permissions fines.
      //
      // Les permissions courantes sont posées dès la création plutôt qu'à
      // l'approbation : elles ne donnent accès à rien tant que le compte n'est
      // pas approuvé (le callback `session` ci-dessous ne les expose pas), mais
      // l'admin qui tranche voit une proposition sensée à ajuster, au lieu d'un
      // compte approuvé qui n'accède à rien.
      await prisma.agent.create({
        data: {
          email,
          name: user.name ?? email,
          role: "AGENT",
          approvalStatus: "PENDING",
          permissions: DEFAULT_AGENT_PERMISSIONS,
        },
      });
      return true;
    },
    async session({ session }) {
      const email = session.user?.email?.toLowerCase();
      if (!email) return session;

      const agent = await prisma.agent.findUnique({ where: { email } });
      // Agent introuvable ou désactivé depuis la création du token : aucune
      // information n'est rattachée, ce qui fait échouer toutes les
      // vérifications en aval.
      if (!agent?.isActive) return session;

      // Toujours exposé, même sans approbation : /login et /en-attente s'en
      // servent pour distinguer « connecté mais pas encore tranché » de « pas
      // connecté du tout ». Lu à chaque requête (pas figé dans le token) : une
      // approbation prend effet à la navigation suivante, sans reconnexion.
      session.user.approvalStatus = agent.approvalStatus;

      // Tant qu'un admin n'a pas tranché, le compte n'obtient NI id, NI rôle,
      // NI permission. C'est ce qui empêche un compte en attente d'utiliser les
      // routes API et les Server Actions, qui ne voient qu'une session sans
      // identité : le blocage n'est pas la redirection du layout `(app)` (elle
      // ne s'exécute que pour une navigation de page), c'est cette absence
      // d'identité.
      if (agent.approvalStatus !== "APPROVED") return session;

      session.user.id = agent.id;
      session.user.role = agent.role;
      session.user.name = agent.name;
      // Résolues ici, une fois pour toutes : un ADMIN reçoit le registre
      // complet, un agent ses clés refermées sur leurs prérequis. Comme le
      // reste, c'est relu à chaque requête et non figé dans le token — un
      // retrait de permission prend effet à la navigation suivante, sans
      // attendre l'expiration de la session.
      session.user.permissions = effectivePermissions(agent);
      session.user.requiresApproval = agent.requiresApproval;

      return session;
    },
  },
});
