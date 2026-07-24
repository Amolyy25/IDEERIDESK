import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoEmbed: {
      setVideoEmbed: (url: string) => ReturnType;
    };
  }
}

// YouTube et Vimeo partagent le même besoin (une iframe pointant vers leur
// URL d'embed) — un seul node couvre les deux plutôt que deux extensions
// distinctes pour une fonctionnalité identique.
function toEmbedUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);

    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname === "youtu.be") {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export const VideoEmbed = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-video-embed": "",
        style: "position:relative;padding-top:56.25%;",
      }),
      [
        "iframe",
        {
          src: HTMLAttributes.src,
          frameborder: "0",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
          style: "position:absolute;top:0;left:0;width:100%;height:100%;border:0;",
        },
      ],
    ];
  },

  addCommands() {
    return {
      setVideoEmbed:
        (rawUrl: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ commands }: any) => {
          const embedUrl = toEmbedUrl(rawUrl);
          if (!embedUrl) return false;
          return commands.insertContent({ type: this.name, attrs: { src: embedUrl } });
        },
    };
  },
});
