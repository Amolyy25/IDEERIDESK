"use client";

import { useState } from "react";
import { MAX_ATTACHMENTS, validateReplyAttachmentFile } from "@/lib/attachment-rules";

// Hors brouillon local : un `File` ne se sérialise pas dans localStorage. Le
// contrôle fait ici n'est qu'un pré-contrôle, celui qui tranche est côté serveur
// (voir `inspectReplyAttachments`).
export function useReplyAttachments() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Le lot est refusé en entier au premier fichier problématique : accepter les
  // autres en silence laisserait croire que tout est passé.
  function add(incoming: File[]) {
    if (incoming.length === 0) return;

    if (files.length + incoming.length > MAX_ATTACHMENTS) {
      setError(`Vous pouvez joindre au maximum ${MAX_ATTACHMENTS} fichiers.`);
      return;
    }

    for (const file of incoming) {
      const problem = validateReplyAttachmentFile(file);
      if (problem) {
        setError(problem);
        return;
      }
    }

    setError(null);
    setFiles((previous) => [...previous, ...incoming]);
  }

  function remove(index: number) {
    setError(null);
    setFiles((previous) => previous.filter((_, position) => position !== index));
  }

  return {
    files,
    error,
    add,
    remove,
    isFull: files.length >= MAX_ATTACHMENTS,
    clear: () => {
      setFiles([]);
      setError(null);
    },
    /** Envoi refusé : les fichiers reviennent avec le texte. */
    restore: (previous: File[]) => setFiles(previous),
  };
}
