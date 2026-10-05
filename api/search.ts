import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "../lib/access.js";
import { quotaDetail } from "../lib/quota.js";
import { searchRecipes } from "../lib/search.js";

export const config = { maxDuration: 60 };

/**
 * POST /api/search  { "query": "gratin dauphinois" }
 * Gemini cherche sur Google et renvoie jusqu'à 3 fiches : { results: [{ recipe, source }] }.
 * Un seul appel à Gemini par recherche.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  if (!isAuthorized(req.headers["x-access-code"], process.env.ACCESS_CODE)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return res.status(401).json({ error: "Code d'accès requis ou incorrect.", code: "AUTH_REQUIRED" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "Le serveur n'est pas configuré (clé d'API manquante)." });
  }

  const body = (typeof req.body === "string" ? safeParse(req.body) : req.body) ?? {};
  const query = typeof (body as any).query === "string" ? (body as any).query.trim() : "";
  if (query.length < 2) return res.status(400).json({ error: "Écris ce que tu cherches (au moins 2 lettres)." });

  try {
    return res.status(200).json({ results: await searchRecipes(query) });
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 429) {
      return res.status(429).json({
        error: "Limite d'utilisation de Gemini atteinte. Réessaie dans quelques minutes.",
        detail: quotaDetail(err instanceof Error ? err.message : ""),
      });
    }
    console.error("Échec de la recherche :", status ?? "", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "La recherche a échoué. Réessaie dans un instant." });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
