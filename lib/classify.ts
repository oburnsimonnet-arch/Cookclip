import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, type GeminiClient } from "./extract.js";
import { THEMES, extractJson, normalizeThemes } from "./recipe.js";

export const MAX_CLASSIFY = 40;

export interface ClassifyInput {
  id: string;
  title: string;
  category?: string | null;
  tags?: string[];
  ingredients?: string[];
  totalMin?: number | null;
}

export const CLASSIFY_PROMPT = `Tu ranges des recettes de cuisine dans des thématiques.
Pour chaque recette, choisis 1 ou 2 clés dans cette liste (l'origine du plat d'abord, puis le style) :
${THEMES.map((t) => `- ${t.key} : ${t.hint}`).join("\n")}
Règles : "rapide" seulement si la recette prend 30 minutes ou moins (si la durée est inconnue, ne l'utilise pas) ; "vegetarien" seulement sans viande ni poisson ; en cas de doute, "monde".
Réponds uniquement par un objet JSON {"themes": {"<id>": ["cle1", "cle2"]}} avec exactement les identifiants reçus, sans texte autour.`;

function makeClient(): GeminiClient {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

/** Renvoie, pour chaque identifiant reçu, 1 ou 2 clés de thématique (liste vide si Gemini n'a rien de valable). */
export async function classifyRecipes(
  items: ClassifyInput[],
  options: { client?: GeminiClient } = {},
): Promise<Record<string, string[]>> {
  if (!items.length) return {};
  const client = options.client ?? makeClient();
  const list = items.map((i) => ({
    id: i.id,
    titre: i.title,
    categorie: i.category ?? null,
    mots_cles: i.tags ?? [],
    ingredients: (i.ingredients ?? []).slice(0, 25),
    duree_min: i.totalMin ?? null,
  }));
  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: JSON.stringify(list),
    config: {
      systemInstruction: CLASSIFY_PROMPT,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
      httpOptions: { timeout: 55_000, retryOptions: { attempts: 1 } },
    },
  });
  if (!response.text || !response.text.trim()) throw new Error("Gemini n'a renvoyé aucune réponse.");
  const raw = extractJson(response.text) as { themes?: Record<string, unknown> } | null;
  const map = raw && typeof raw === "object" && raw.themes && typeof raw.themes === "object" ? raw.themes : {};
  const out: Record<string, string[]> = {};
  for (const item of items) out[item.id] = normalizeThemes(map[item.id]);
  return out;
}
