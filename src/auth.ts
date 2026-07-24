import NextAuth from "next-auth";
import { prisma } from "@/lib/prisma";
import authConfig from "@/auth.config";

const allowedDomain = process.env.ALLOWED_GOOGLE_DOMAIN?.toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Railway (comme la plupart des PaaS hors Vercel) n'est pas dans la liste
  // d'hôtes reconnus par défaut par Auth.js — sans ça, la détection de l'URL
  // publique derrière son proxy peut être instable.
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;

      if (allowedDomain && !email.endsWith(`@${allowedDomain}`)) {
        return false;
      }

      const existingAgent = await prisma.agent.findUnique({ where: { email } });
      if (existingAgent) {
        // Un agent désactivé par un admin ne peut plus se reconnecter.
        return existingAgent.isActive;
      }

      // Première connexion : auto-provisionné comme agent standard. Un admin
      // pourra changer le rôle ou désactiver le compte depuis les paramètres.
      await prisma.agent.create({
        data: { email, name: user.name ?? email, role: "AGENT" },
      });
      return true;
    },
    async session({ session }) {
      const email = session.user?.email?.toLowerCase();
      if (!email) return session;

      const agent = await prisma.agent.findUnique({ where: { email } });
      // Agent introuvable ou désactivé depuis la création du token : on ne
      // rattache pas d'id/rôle, ce qui fait échouer les vérifications en
      // aval (ex: le layout protégé redirige vers la connexion).
      if (agent?.isActive) {
        session.user.id = agent.id;
        session.user.role = agent.role;
        session.user.name = agent.name;
        session.user.canRespond = agent.canRespond;
        session.user.requiresApproval = agent.requiresApproval;
        session.user.canApprove = agent.canApprove;
      }

      return session;
    },
  },
});
