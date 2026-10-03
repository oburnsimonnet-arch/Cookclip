import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractRecipe } from "../lib/extract.js";
import { extractVideoId, fetchVideoInfo } from "../lib/youtube.js";

export const config = { maxDuration: 60 };

/**
 * POST /api/recipe
 * Corps JSON, l'un des deux :
 *   { "url": "https://youtu.be/..." }
 *   { "transcript": "texte collé à la main", "title"?: "...", "description"?: "..." }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: "Le serveur n'est pas configuré (clé d'API manquante)." });
  }

  const body = (typeof req.body === "string" ? safeParse(req.body) : req.body) ?? {};
  const { url, transcript, title, description } = body as Record<string, unknown>;

  try {
    let input: { title?: string | null; description?: string | null; transcript?: string | null };
    let source: { videoId: string | null; transcriptFound: boolean };

    if (typeof transcript === "string" && transcript.trim().length > 40) {
      input = {
        title: typeof title === "string" ? title : null,
        description: typeof description === "string" ? description : null,
        transcript,
      };
      source = { videoId: null, transcriptFound: true };
    } else if (typeof url === "string" && url.trim()) {
      const id = extractVideoId(url);
      if (!id) {
        return res.status(400).json({
          error: "Lien non reconnu. Pour l'instant, seuls les liens YouTube sont pris en charge.",
        });
      }
      const info = await fetchVideoInfo(id);
      if (!info.transcript && !info.description) {
        return res.status(422).json({
          error:
            "Impossible de récupérer la transcription de cette vidéo (sous-titres absents ou accès bloqué). Colle la transcription à la main.",
          code: "NO_TRANSCRIPT",
        });
      }
      input = info;
      source = { videoId: id, transcriptFound: !!info.transcript };
    } else {
      return res.status(400).json({ error: "Fournis un lien YouTube ou une transcription." });
    }

    const recipe = await extractRecipe(input);
    if (!source.transcriptFound) {
      recipe.warnings.push(
        "Pas de transcription disponible : la recette vient uniquement de la description de la vidéo.",
      );
    }
    return res.status(200).json({ recipe, source });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    const userFacing =
      message.startsWith("Cette vidéo") || message.startsWith("Aucune recette");
    return res.status(userFacing ? 422 : 500).json({
      error: userFacing ? message : "L'extraction a échoué. Réessaie dans un instant.",
    });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
