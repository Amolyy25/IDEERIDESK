import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Rend à nouveau déplaçables les images redimensionnables de l'éditeur.
 *
 * La node view de redimensionnement de Tiptap coupe le glisser-déposer sur
 * l'image (`this.element.draggable = false` dans son constructeur) et n'expose
 * aucune option pour le rétablir : le conteneur qu'elle interpose n'est ni
 * `draggable`, ni marqué comme poignée de déplacement. Une image insérée se
 * retrouvait donc figée à l'endroit exact où elle avait été posée.
 *
 * On repose les deux marqueurs sur le conteneur — celui que ProseMirror
 * consulte pour démarrer un glissement de nœud. Le nœud image est déclaré
 * `draggable` dans son schéma, il n'y avait plus que le DOM à réaligner.
 *
 * Passe par un observateur plutôt que par un rendu unique : la node view crée
 * et recrée ses conteneurs au fil des modifications du document, un balayage
 * ponctuel manquerait toutes les images insérées ensuite.
 */

const DRAGGABLE_CONTAINER = "[data-resize-container]";

function makeDraggable(root: ParentNode) {
  for (const container of root.querySelectorAll(DRAGGABLE_CONTAINER)) {
    if (!(container instanceof HTMLElement)) continue;
    if (container.draggable) continue;

    container.draggable = true;
    // Marqueur lu par ProseMirror pour savoir par où le nœud se saisit.
    container.dataset.dragHandle = "";
  }
}

export const ImageDragSupport = Extension.create({
  name: "imageDragSupport",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("imageDragSupport"),
        view(editorView) {
          makeDraggable(editorView.dom);

          const observer = new MutationObserver(() => makeDraggable(editorView.dom));
          observer.observe(editorView.dom, { childList: true, subtree: true });

          return {
            destroy() {
              observer.disconnect();
            },
          };
        },
      }),
    ];
  },
});
