import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "../lib/access.js";
import { extractRecipeFromText, extractRecipeFromVideo } from "../lib/extract.js";
import { extractVideoId } from "../lib/youtube.js";

export const config = { maxDuration: 60 };

/**
 * POST /api/recipe
 * En-tête optionnel : x-access-code (obligatoire si la variable ACCESS_CODE est définie).
 * Corps JSON, l'un des deux :
 *   { "url": "https://youtu.be/...", "french"?: true }        -> Gemini analyse la vidéo
 *   { "transcript": "texte collé", "title"?, "description"?, "french"? } -> secours, texte seul
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  // Protection de l'accès : avant tout appel à Gemini, pour ne jamais consommer de quota.
  const expected = process.env.ACCESS_CODE;
  if (!isAuthorized(req.headers["x-access-code"], expected)) {
    await new Promise((resolve) => setTimeout(resolve, 400)); // freine les essais répétés
    return res
      .status(401)
      .json({ error: "Code d'accès requis ou incorrect.", code: "AUTH_REQUIRED" });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Le serveur n'est pas configuré (clé d'API manquante)." });
  }

  const body = (typeof req.body === "string" ? safeParse(req.body) : req.body) ?? {};
  const { url, transcript, title, description, french } = body as Record<string, unknown>;
  const options = { french: french === true };

  try {
    if (typeof transcript === "string" && transcript.trim().length > 40) {
      const recipe = await extractRecipeFromText(
        {
          transcript,
          title: typeof title === "string" ? title : null,
          description: typeof description === "string" ? description : null,
        },
        options,
      );
      return res.status(200).json({ recipe, source: { method: "transcript" } });
    }

    if (typeof url === "string" && url.trim()) {
      const id = extractVideoId(url);
      if (!id) {
        return res.status(400).json({
          error: "Lien non reconnu. Pour l'instant, seuls les liens YouTube sont pris en charge.",
        });
      }
      const recipe = await extractRecipeFromVideo(id, options);
      return res.status(200).json({ recipe, source: { method: "video", videoId: id } });
    }

    return res.status(400).json({ error: "Fournis un lien YouTube ou une transcription." });
  } catch (err) {
    return sendError(res, err);
  }
}

function sendError(res: VercelResponse, err: unknown) {
  const message = err instanceof Error ? err.message : "Erreur inconnue.";
  const status = (err as { status?: number } | null)?.status;

  // Erreurs « métier » levées par la validation de la recette
  if (message.startsWith("Cette vidéo") || message.startsWith("Aucune recette")) {
    return res.status(422).json({ error: message });
  }
  if (status === 429) {
    console.error("Quota Gemini atteint :", message);
    return res.status(429).json({
      error: "Limite d'utilisation de Gemini atteinte. Réessaie dans quelques minutes.",
    });
  }
  if (status === 400 || status === 403 || status === 404) {
    console.error("Gemini a refusé la vidéo :", status, message);
    return res.status(422).json({
      error:
        "Gemini n'a pas pu lire cette vidéo (privée, non répertoriée, supprimée ou restreinte). Colle la transcription à la main.",
      code: "VIDEO_UNREADABLE",
    });
  }
  console.error("Échec de l'extraction :", status ?? "", message);
  return res.status(500).json({ error: "L'extraction a échoué. Réessaie dans un instant." });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
