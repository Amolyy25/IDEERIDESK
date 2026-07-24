import { Node } from "@tiptap/core";

// Sans ce node, `<style>...</style>` collé via "Coller du code HTML" n'a
// aucune règle de parsing dédiée dans le schéma Tiptap : ProseMirror éclate
// son contenu texte en paragraphes normaux (c'est le bug visible où du CSS
// brut apparaît ligne par ligne comme du texte). Ce node capture l'élément
// `<style>` tel quel et le restitue identique — `getHTML()` produit un vrai
// `<style>` que le navigateur applique, aussi bien dans l'éditeur qu'à la
// publication (rendu via dangerouslySetInnerHTML, qui exécute les styles
// nativement).
export const StyleBlock = Node.create({
  name: "styleBlock",
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "style" }];
  },

  renderHTML() {
    return ["style", {}, 0];
  },
});
