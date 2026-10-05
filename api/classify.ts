import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAuthorized } from "../lib/access.js";
import { MAX_CLASSIFY, classifyRecipes, type ClassifyInput } from "../lib/classify.js";

export const config = { maxDuration: 60 };

/**
 * POST /api/classify  { "recipes": [{ id, title, category?, tags?, ingredients?, totalMin? }] }
 * Un seul appel à Gemini pour toutes les recettes (texte seul, pas de vidéo).
 * Réponse : { themes: { "<id>": ["italie", "rapide"] } }
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
  const list = Array.isArray((body as any).recipes) ? ((body as any).recipes as unknown[]) : [];
  const items: ClassifyInput[] = list
    .slice(0, MAX_CLASSIFY)
    .map((r: any): ClassifyInput | null =>
      r && typeof r.id === "string" && typeof r.title === "string"
        ? {
            id: r.id.slice(0, 80),
            title: r.title.slice(0, 200),
            category: typeof r.category === "string" ? r.category.slice(0, 40) : null,
            tags: Array.isArray(r.tags) ? r.tags.filter((t: unknown) => typeof t === "string").slice(0, 6) : [],
            ingredients: Array.isArray(r.ingredients) ? r.ingredients.filter((t: unknown) => typeof t === "string").map((t: string) => t.slice(0, 60)).slice(0, 25) : [],
            totalMin: typeof r.totalMin === "number" && Number.isFinite(r.totalMin) ? r.totalMin : null,
          }
        : null,
    )
    .filter((x): x is ClassifyInput => x !== null);
  if (!items.length) return res.status(400).json({ error: "Aucune recette à classer." });

  try {
    return res.status(200).json({ themes: await classifyRecipes(items) });
  } catch (err) {
    const status = (err as { status?: number } | null)?.status;
    if (status === 429) {
      return res.status(429).json({ error: "Limite d'utilisation de Gemini atteinte. Réessaie dans quelques minutes." });
    }
    console.error("Échec du classement :", status ?? "", err instanceof Error ? err.message : err);
    return res.status(500).json({ error: "Le classement a échoué. Réessaie dans un instant." });
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
