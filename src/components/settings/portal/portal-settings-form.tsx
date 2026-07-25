"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  PORTAL_ALIGNS,
  PORTAL_COLOR_MODES,
  PORTAL_DEFAULTS,
  PORTAL_DISPLAY_FONTS,
  PORTAL_NAV_VARIANTS,
  PORTAL_RADIUS_OPTIONS,
  PORTAL_SANS_FONTS,
  portalSettingsSchema,
  type PortalConfig,
} from "@/lib/portal-theme";
import { deletePortalAsset, savePortalSettings } from "@/lib/actions/portal-settings";
import { PortalPreview } from "@/components/settings/portal/portal-preview";
import {
  AssetField,
  ColorField,
  IconField,
  LinkListField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleRow,
} from "@/components/settings/portal/portal-fields";

// Les couleurs facultatives non renseignées suivent le thème : ces valeurs ne
// servent qu'à pré-remplir le sélecteur de couleur du navigateur.
const THEME_HINT_COLORS = {
  LIGHT: {
    background: "#ffffff",
    foreground: "#0a0a0a",
    card: "#ffffff",
    border: "#e5e5e5",
    muted: "#f7f7f7",
    mutedForeground: "#737373",
  },
  DARK: {
    background: "#0a0a0a",
    foreground: "#fafafa",
    card: "#1f1f1f",
    border: "#2e2e2e",
    muted: "#3d3d3d",
    mutedForeground: "#a3a3a3",
  },
} as const;

export function PortalSettingsForm({ settings }: { settings: PortalConfig }) {
  const [config, setConfig] = useState<PortalConfig>(settings);
  const [isSaving, startSaving] = useTransition();

  function set<K extends keyof PortalConfig>(key: K, value: PortalConfig[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
  }

  // Un texte vidé signifie « pas de valeur » (le portail retombe alors sur son
  // libellé par défaut), d'où la conversion en null.
  function setText<K extends keyof PortalConfig>(key: K, value: string) {
    set(key, (value.trim() === "" ? null : value) as PortalConfig[K]);
  }

  const themeHints = THEME_HINT_COLORS[config.colorMode];

  function handleSave() {
    const parsed = portalSettingsSchema.safeParse(config);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Réglages invalides");
      return;
    }
    startSaving(async () => {
      try {
        await savePortalSettings(parsed.data);
        setConfig(parsed.data);
        toast.success("Portail mis à jour");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible");
      }
    });
  }

  function handleReset() {
    // Remise à zéro locale : l'admin voit le résultat dans l'aperçu et doit
    // encore enregistrer (les visuels téléversés, eux, restent en place).
    setConfig({
      ...PORTAL_DEFAULTS,
      logoAssetId: config.logoAssetId,
      faviconAssetId: config.faviconAssetId,
    });
    toast.info("Valeurs par défaut rétablies — enregistrez pour appliquer");
  }

  // La colonne d'aperçu passe sous les réglages en dessous de `xl` : la barre
  // latérale des paramètres laisse trop peu de place pour deux colonnes.
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-5">
        <Tabs defaultValue="identite">
          <TabsList className="flex-wrap">
            <TabsTrigger value="identite">Identité</TabsTrigger>
            <TabsTrigger value="apparence">Apparence</TabsTrigger>
            <TabsTrigger value="navigation">Navigation</TabsTrigger>
            <TabsTrigger value="accueil">Accueil</TabsTrigger>
            <TabsTrigger value="faq">FAQ</TabsTrigger>
            <TabsTrigger value="pied">Pied de page</TabsTrigger>
          </TabsList>

          {/* ---------------- Identité ---------------- */}
          <TabsContent value="identite" className="space-y-5 pt-5">
            <TextField
              label="Nom du site"
              hint="Utilisé dans le titre des onglets et comme repli des textes du portail."
              value={config.siteName}
              maxLength={60}
              onChange={(value) => set("siteName", value)}
            />
            <TextField
              label="Baseline"
              hint="Court mot affiché à côté du logo (ex. « Support »)."
              value={config.tagline ?? ""}
              maxLength={40}
              onChange={(value) => setText("tagline", value)}
            />
            <div className="space-y-2">
              <ToggleRow
                label="Afficher le logo"
                checked={config.showLogo}
                onChange={(value) => set("showLogo", value)}
              />
              <ToggleRow
                label="Afficher le nom du site"
                hint="En plus ou à la place du logo."
                checked={config.showSiteName}
                onChange={(value) => set("showSiteName", value)}
              />
              <ToggleRow
                label="Afficher la baseline"
                checked={config.showTagline}
                onChange={(value) => set("showTagline", value)}
              />
            </div>

            <Separator />

            <AssetField
              label="Logo"
              hint="PNG, JPEG ou WEBP, 1 Mo maximum. Sans logo téléversé, celui d'Ideeri est utilisé."
              kind="logo"
              accept="image/png,image/jpeg,image/webp"
              assetId={config.logoAssetId}
              onUploaded={(id) => set("logoAssetId", id)}
              onDeleted={async () => {
                await deletePortalAsset("logo");
                set("logoAssetId", null);
              }}
            />
            <SelectField
              label="Hauteur du logo"
              value={String(config.logoHeight)}
              options={[16, 20, 24, 28, 32, 40, 48, 56, 64].map((height) => ({
                value: String(height),
                label: `${height} px`,
              }))}
              onChange={(value) => set("logoHeight", Number(value))}
            />
            <AssetField
              label="Favicon"
              hint="PNG, ICO ou WEBP carré (32×32 ou 64×64 recommandé), 1 Mo maximum."
              kind="favicon"
              accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/webp"
              assetId={config.faviconAssetId}
              onUploaded={(id) => set("faviconAssetId", id)}
              onDeleted={async () => {
                await deletePortalAsset("favicon");
                set("faviconAssetId", null);
              }}
            />

            <Separator />

            <TextField
              label="Titre de l'onglet (accueil)"
              hint={`Par défaut : « Support — ${config.siteName} ».`}
              value={config.metaTitle ?? ""}
              maxLength={120}
              onChange={(value) => setText("metaTitle", value)}
            />
            <TextAreaField
              label="Description pour les moteurs de recherche"
              value={config.metaDescription ?? ""}
              maxLength={300}
              rows={2}
              onChange={(value) => setText("metaDescription", value)}
            />
          </TabsContent>

          {/* ---------------- Apparence ---------------- */}
          <TabsContent value="apparence" className="space-y-5 pt-5">
            <SelectField
              label="Mode de couleur"
              hint="Le portail ne suit pas le thème de l'application interne : il est toujours affiché dans ce mode."
              value={config.colorMode}
              options={PORTAL_COLOR_MODES}
              onChange={(value) => set("colorMode", value)}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                label="Couleur principale"
                hint="Boutons, halo, accents et liens mis en avant."
                value={config.primaryColor}
                fallback={PORTAL_DEFAULTS.primaryColor}
                onChange={(value) => set("primaryColor", value ?? PORTAL_DEFAULTS.primaryColor)}
              />
              <ColorField
                label="Texte sur couleur principale"
                hint="À garder lisible sur la couleur principale."
                value={config.primaryForegroundColor}
                fallback={PORTAL_DEFAULTS.primaryForegroundColor}
                onChange={(value) =>
                  set("primaryForegroundColor", value ?? PORTAL_DEFAULTS.primaryForegroundColor)
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Les couleurs ci-dessous sont facultatives : laissées vides, elles suivent le mode
              clair ou sombre.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField
                label="Fond de page"
                value={config.backgroundColor}
                fallback={themeHints.background}
                nullable
                onChange={(value) => set("backgroundColor", value)}
              />
              <ColorField
                label="Texte"
                value={config.foregroundColor}
                fallback={themeHints.foreground}
                nullable
                onChange={(value) => set("foregroundColor", value)}
              />
              <ColorField
                label="Fond des cartes"
                value={config.cardColor}
                fallback={themeHints.card}
                nullable
                onChange={(value) => set("cardColor", value)}
              />
              <ColorField
                label="Bordures et champs"
                value={config.borderColor}
                fallback={themeHints.border}
                nullable
                onChange={(value) => set("borderColor", value)}
              />
              <ColorField
                label="Fonds secondaires"
                hint="Section FAQ, survols, zones atténuées."
                value={config.mutedColor}
                fallback={themeHints.muted}
                nullable
                onChange={(value) => set("mutedColor", value)}
              />
              <ColorField
                label="Texte secondaire"
                value={config.mutedForegroundColor}
                fallback={themeHints.mutedForeground}
                nullable
                onChange={(value) => set("mutedForegroundColor", value)}
              />
            </div>

            <Separator />

            <SelectField
              label="Arrondi des angles"
              value={String(config.radius)}
              options={PORTAL_RADIUS_OPTIONS.map((option) => ({
                value: String(option.value),
                label: option.label,
              }))}
              onChange={(value) => set("radius", Number(value))}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Police du texte"
                value={config.fontSans}
                options={PORTAL_SANS_FONTS}
                onChange={(value) => set("fontSans", value)}
              />
              <SelectField
                label="Police des titres"
                value={config.fontDisplay}
                options={PORTAL_DISPLAY_FONTS}
                onChange={(value) => set("fontDisplay", value)}
              />
            </div>
          </TabsContent>

          {/* ---------------- Navigation ---------------- */}
          <TabsContent value="navigation" className="space-y-5 pt-5">
            <SelectField
              label="Disposition de la barre"
              value={config.navVariant}
              options={PORTAL_NAV_VARIANTS}
              onChange={(value) => set("navVariant", value)}
            />
            <div className="space-y-2">
              <ToggleRow
                label="Barre fixe au défilement"
                hint="La barre reste visible quand le visiteur descend dans la page."
                checked={config.navSticky}
                onChange={(value) => set("navSticky", value)}
              />
              <ToggleRow
                label="Fond translucide"
                hint="Effet de flou derrière la barre."
                checked={config.navBlur}
                onChange={(value) => set("navBlur", value)}
              />
              <ToggleRow
                label="Bordure basse"
                checked={config.navBordered}
                onChange={(value) => set("navBordered", value)}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <ToggleRow
                label="Lien vers la FAQ"
                hint="Masqué automatiquement si aucun article n'est publié."
                checked={config.navShowFaq}
                onChange={(value) => set("navShowFaq", value)}
              />
              <ToggleRow
                label="Lien « Se connecter »"
                hint="Accès à l'espace interne des agents."
                checked={config.navShowLogin}
                onChange={(value) => set("navShowLogin", value)}
              />
              <ToggleRow
                label="Bouton d'action"
                hint="Le bouton mis en avant vers le formulaire de ticket."
                checked={config.navCtaEnabled}
                onChange={(value) => set("navCtaEnabled", value)}
              />
            </div>
            <TextField
              label="Libellé du bouton d'action"
              value={config.navCtaLabel}
              maxLength={40}
              onChange={(value) => set("navCtaLabel", value)}
            />

            <Separator />

            <LinkListField
              label="Liens supplémentaires"
              hint="Ajoutés entre la FAQ et « Se connecter ». Lien interne (/page), ancre (#section) ou URL complète."
              links={config.navLinks}
              onChange={(links) => set("navLinks", links)}
            />
          </TabsContent>

          {/* ---------------- Accueil ---------------- */}
          <TabsContent value="accueil" className="space-y-5 pt-5">
            <ToggleRow
              label="Afficher le bandeau d'accueil"
              checked={config.heroEnabled}
              onChange={(value) => set("heroEnabled", value)}
            />
            <TextField
              label="Accroche"
              hint="Petite ligne en majuscules au-dessus du titre."
              value={config.heroEyebrow ?? ""}
              maxLength={80}
              onChange={(value) => setText("heroEyebrow", value)}
            />
            <TextField
              label="Titre"
              value={config.heroTitle ?? ""}
              maxLength={120}
              onChange={(value) => setText("heroTitle", value)}
            />
            <TextAreaField
              label="Message d'accueil"
              hint="Affiché sous le titre, et repris en haut du formulaire de ticket."
              value={config.introMessage ?? ""}
              maxLength={1000}
              onChange={(value) => setText("introMessage", value)}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Alignement"
                value={config.heroAlign}
                options={PORTAL_ALIGNS}
                onChange={(value) => set("heroAlign", value)}
              />
            </div>
            <ToggleRow
              label="Halo coloré"
              hint="Dégradé flou dans la couleur principale, derrière le titre."
              checked={config.heroGlow}
              onChange={(value) => set("heroGlow", value)}
            />

            <Separator />

            <ToggleRow
              label="Afficher les deux cartes"
              hint="« Consulter la FAQ » et « Créer un ticket », sous le bandeau."
              checked={config.cardsEnabled}
              onChange={(value) => set("cardsEnabled", value)}
            />
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm font-medium">Carte FAQ</p>
              <TextField
                label="Titre"
                value={config.faqCardTitle}
                maxLength={60}
                onChange={(value) => set("faqCardTitle", value)}
              />
              <TextAreaField
                label="Texte"
                value={config.faqCardText}
                maxLength={300}
                rows={2}
                onChange={(value) => set("faqCardText", value)}
              />
              <IconField
                label="Icône"
                value={config.faqCardIcon}
                onChange={(value) => set("faqCardIcon", value)}
              />
            </div>
            <div className="space-y-4 rounded-md border p-4">
              <p className="text-sm font-medium">Carte création de ticket</p>
              <TextField
                label="Titre"
                value={config.ticketCardTitle}
                maxLength={60}
                onChange={(value) => set("ticketCardTitle", value)}
              />
              <TextAreaField
                label="Texte"
                value={config.ticketCardText}
                maxLength={300}
                rows={2}
                onChange={(value) => set("ticketCardText", value)}
              />
              <IconField
                label="Icône"
                value={config.ticketCardIcon}
                onChange={(value) => set("ticketCardIcon", value)}
              />
            </div>
          </TabsContent>

          {/* ---------------- FAQ ---------------- */}
          <TabsContent value="faq" className="space-y-5 pt-5">
            <ToggleRow
              label="Afficher la FAQ"
              hint="Donne accès aux articles publiés de la base de connaissances depuis le portail."
              checked={config.faqEnabled}
              onChange={(value) => set("faqEnabled", value)}
            />
            <ToggleRow
              label="Champ de recherche"
              hint="Filtre les articles au fur et à mesure de la saisie."
              checked={config.faqSearchEnabled}
              onChange={(value) => set("faqSearchEnabled", value)}
            />
            <TextField
              label="Accroche de la section"
              value={config.faqEyebrow ?? ""}
              maxLength={80}
              onChange={(value) => setText("faqEyebrow", value)}
            />
            <TextField
              label="Titre de la section"
              value={config.faqTitle ?? ""}
              maxLength={120}
              onChange={(value) => setText("faqTitle", value)}
            />
          </TabsContent>

          {/* ---------------- Pied de page ---------------- */}
          <TabsContent value="pied" className="space-y-5 pt-5">
            <ToggleRow
              label="Afficher le pied de page"
              checked={config.footerEnabled}
              onChange={(value) => set("footerEnabled", value)}
            />
            <TextField
              label="Texte"
              hint={`Par défaut : le nom du site (« ${config.siteName} »).`}
              value={config.footerText ?? ""}
              maxLength={200}
              onChange={(value) => setText("footerText", value)}
            />
            <IconField
              label="Icône"
              value={config.footerIcon}
              onChange={(value) => set("footerIcon", value)}
            />
            <LinkListField
              label="Liens supplémentaires"
              hint="Mentions légales, politique de confidentialité, site principal…"
              links={config.footerLinks}
              onChange={(links) => set("footerLinks", links)}
            />
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <Button variant="ghost" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="h-3.5 w-3.5" />
            Valeurs par défaut
          </Button>
        </div>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <p className="mb-2 text-xs text-muted-foreground">
          Aperçu en direct — reflète les réglages en cours, avant enregistrement.
        </p>
        <PortalPreview config={config} />
      </div>
    </div>
  );
}
