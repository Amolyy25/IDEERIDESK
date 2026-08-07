import net from "node:net";

/**
 * Client clamd (ClamAV) parlant le protocole INSTREAM.
 *
 * Pourquoi un démon distant et pas une bibliothèque en process : le moteur
 * ClamAV charge ~1 Go de signatures en mémoire et les rafraîchit en continu
 * (freshclam). Le tenir dans le process Next reviendrait à payer ce Go dans
 * chaque instance web et à redémarrer l'application pour mettre à jour les
 * définitions. Le démon vit donc dans son propre service, joint en TCP sur le
 * réseau privé (voir `CLAMAV_HOST`).
 *
 * Pourquoi pas un service tiers (VirusTotal & co) : y envoyer une pièce jointe
 * de ticket, c'est transmettre à un tiers un document de mandant ou
 * d'acquéreur. Le fichier ne doit pas sortir de notre infrastructure.
 *
 * Cette fonction ne lève jamais. Une panne du scanner se traduit par un verdict
 * `UNAVAILABLE`, que l'appelant traduit en « à rescanner » (voir
 * `upload-inspection.ts`) — couper la création de tickets parce que le démon
 * redémarre serait un déni de service que l'on s'infligerait nous-mêmes.
 */

/** Taille des blocs envoyés à clamd. Valeur usuelle des clients INSTREAM. */
const CHUNK_SIZE = 64 * 1024;

const DEFAULT_PORT = 3310;
const DEFAULT_TIMEOUT_MS = 15_000;

export type ScanVerdict =
  | { status: "CLEAN" }
  | { status: "INFECTED"; signature: string }
  | { status: "UNAVAILABLE"; reason: string };

type ClamConfig = { host: string; port: number; timeoutMs: number };

/**
 * Lu à chaque appel et non au chargement du module : le scanner doit pouvoir
 * être branché ou débranché en changeant l'environnement, sans rebuild, et un
 * `CLAMAV_HOST` absent ne doit pas faire échouer l'import du module — les
 * routes d'upload doivent continuer à répondre, en marquant simplement les
 * fichiers « à scanner ».
 */
function readConfig(): ClamConfig | null {
  const host = process.env.CLAMAV_HOST?.trim();
  if (!host) return null;

  const port = Number(process.env.CLAMAV_PORT);
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS);

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

export function isAntivirusConfigured() {
  return readConfig() !== null;
}

/**
 * Attend que le tampon d'écriture se vide, sans jamais rester bloqué si la
 * socket meurt entre-temps : clamd ferme la connexion dès qu'il a un verdict,
 * y compris au milieu de l'envoi (cas du dépassement de `StreamMaxLength`).
 * Sans les écouteurs `close`/`error`, l'envoi resterait suspendu jusqu'au
 * délai de garde.
 */
function waitForDrain(socket: net.Socket) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      socket.off("drain", finish);
      socket.off("close", finish);
      socket.off("error", finish);
      resolve();
    };
    socket.once("drain", finish);
    socket.once("close", finish);
    socket.once("error", finish);
  });
}

/**
 * Trame INSTREAM : la commande, puis une suite de blocs préfixés de leur
 * longueur sur 4 octets big-endian, puis une longueur nulle qui signale la fin.
 */
async function writeStream(socket: net.Socket, data: Uint8Array, isSettled: () => boolean) {
  socket.write("zINSTREAM\0");

  for (let offset = 0; offset < data.byteLength; offset += CHUNK_SIZE) {
    // clamd a déjà tranché (infection détectée, ou erreur) : inutile de lui
    // pousser la suite du fichier.
    if (isSettled() || socket.destroyed) return;

    const chunk = data.subarray(offset, offset + CHUNK_SIZE);
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(chunk.byteLength, 0);

    if (!socket.write(header)) await waitForDrain(socket);
    if (!socket.write(chunk)) await waitForDrain(socket);
  }

  if (isSettled() || socket.destroyed) return;
  socket.write(Buffer.from([0, 0, 0, 0]));
}

/**
 * Réponses possibles : `stream: OK`, `stream: <signature> FOUND`, ou un
 * message terminé par ERROR (flux trop gros, base de signatures absente…).
 * Tout ce qui n'est pas un verdict franc est traité comme une indisponibilité,
 * jamais comme un fichier sain.
 */
function parseResponse(raw: string): ScanVerdict {
  const text = raw.replaceAll("\0", "").trim();

  const infected = /^stream:\s*(.+?)\s+FOUND$/i.exec(text);
  if (infected) return { status: "INFECTED", signature: infected[1] };

  if (/^stream:\s*OK$/i.test(text)) return { status: "CLEAN" };

  return { status: "UNAVAILABLE", reason: text || "réponse illisible du scanner" };
}

type Exchange = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Ouvre une connexion clamd, laisse `send` écrire la commande, et résout à la
 * première réponse complète. Le contenu de la réponse n'est pas interprété ici :
 * `scanBuffer` et `pingAntivirus` n'attendent pas la même chose.
 */
function talkToClamd(
  cfg: ClamConfig,
  send: (socket: net.Socket, isSettled: () => boolean) => Promise<void> | void,
): Promise<Exchange> {
  return new Promise<Exchange>((resolve) => {
    let settled = false;
    const isSettled = () => settled;

    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    socket.setTimeout(cfg.timeoutMs);

    const settle = (result: Exchange) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    let response = "";

    socket.on("connect", () => {
      void Promise.resolve(send(socket, isSettled)).catch((error: unknown) => {
        settle({
          ok: false,
          reason: error instanceof Error ? error.message : "envoi interrompu",
        });
      });
    });

    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      // clamd termine chaque réponse par un octet nul (préfixe de commande `z`).
      if (response.includes("\0")) settle({ ok: true, text: response });
    });

    socket.on("timeout", () => {
      settle({ ok: false, reason: `pas de réponse en ${cfg.timeoutMs} ms` });
    });

    socket.on("error", (error) => {
      settle({ ok: false, reason: error.message });
    });

    // Filet : clamd a fermé la connexion sans terminateur.
    socket.on("close", () => {
      settle(
        response.trim()
          ? { ok: true, text: response }
          : { ok: false, reason: "connexion fermée sans réponse" },
      );
    });
  });
}

/**
 * Soumet un fichier au scanner. Ne lève pas : voir l'en-tête du module.
 */
export async function scanBuffer(data: Uint8Array): Promise<ScanVerdict> {
  const cfg = readConfig();
  if (!cfg) {
    return { status: "UNAVAILABLE", reason: "CLAMAV_HOST n'est pas configuré" };
  }

  const exchange = await talkToClamd(cfg, (socket, isSettled) =>
    writeStream(socket, data, isSettled),
  );
  if (!exchange.ok) return { status: "UNAVAILABLE", reason: exchange.reason };

  return parseResponse(exchange.text);
}

/**
 * Test de disponibilité, indépendant de tout fichier : permet de vérifier la
 * configuration sans attendre qu'un téléversement arrive.
 */
export async function pingAntivirus(): Promise<{ ok: boolean; detail: string }> {
  const cfg = readConfig();
  if (!cfg) return { ok: false, detail: "CLAMAV_HOST n'est pas configuré" };

  const exchange = await talkToClamd(cfg, (socket) => {
    socket.write("zPING\0");
  });
  if (!exchange.ok) return { ok: false, detail: exchange.reason };

  if (/PONG/i.test(exchange.text)) return { ok: true, detail: `${cfg.host}:${cfg.port}` };
  return { ok: false, detail: `réponse inattendue : ${exchange.text.replaceAll("\0", "").trim()}` };
}
