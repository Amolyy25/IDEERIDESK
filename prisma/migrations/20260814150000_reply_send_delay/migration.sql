-- Fenêtre de rattrapage avant qu'une réponse ne parte réellement (voir
-- src/lib/reply-send-delay.ts).
--
-- Vingt secondes par défaut : le temps de relire ce qu'on vient d'envoyer, ce
-- qui est exactement le moment où l'on voit la pièce jointe oubliée ou le
-- mauvais destinataire. 0 rend l'envoi immédiat, comme avant ce réglage.
--
-- Le réglage vit dans la liste générique de /settings/general : c'est un nombre
-- de secondes, saisissable tel quel, et sa valeur est validée à
-- l'enregistrement (voir `updateGlobalSetting`).
INSERT INTO "global_settings" ("key", "value", "label", "description", "multiline", "updatedAt")
VALUES
    ('reply_send_delay_seconds', '20', 'Délai d''annulation avant envoi',
     'Nombre de secondes pendant lesquelles une réponse reste annulable ou modifiable après le clic sur « Envoyer ». 0 envoie immédiatement, 120 au maximum.',
     false, NOW())
ON CONFLICT ("key") DO NOTHING;
