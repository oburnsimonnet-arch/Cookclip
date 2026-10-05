import { GoogleGenAI } from "@google/genai";
import { DEFAULT_MODEL, SYSTEM_PROMPT, type GeminiClient } from "./extract.js";
import { cleanSource, extractJson, normalizeRecipe, type Recipe, type RecipeSource } from "./recipe.js";

export const MAX_QUERY_CHARS = 200;
export const RESULT_COUNT = 3;

export interface SearchResult {
  recipe: Recipe;
  source: RecipeSource;
}

export const SEARCH_PROMPT = `${SYSTEM_PROMPT}

---
MODE RECHERCHE WEB. L'utilisateur cherche une recette. Utilise la recherche Google, puis choisis ${RESULT_COUNT} recettes DIFFÉRENTES qui existent réellement sur des sites de cuisine (pas de vidéos, pas de forums), de préférence de sites reconnus.
Pour chacune, rédige la fiche EN FRANÇAIS en suivant les règles ci-dessus, à partir de ce que dit la page : ne complète jamais une quantité absente de la page (quantity null, uncertain true). Si la page ne donne pas une information, laisse-la vide.
Réponds UNIQUEMENT par un objet JSON de cette forme (la valeur de "recipe" suit exactement la forme décrite plus haut) :
{"results": [{"site": "nom ou domaine du site, ex. marmiton.org", "url": "adresse de la page", "recipe": { ... }}]}
Si rien de convenable n'est trouvé, renvoie {"results": []}.`;

function makeClient(): GeminiClient {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

const norm = (s: string) =>
  s.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();

function host(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

interface Chunk {
  uri: string;
  title: string;
}

/**
 * Le lien d'une recette ne vient jamais de la seule parole du modèle : on le rapproche des pages
 * réellement consultées par la recherche (groundingChunks). Sans correspondance, on garde le nom du site seul.
 */
export function pickSource(site: unknown, url: unknown, chunks: Chunk[]): RecipeSource | null {
  const name = typeof site === "string" ? norm(site) : "";
  const modelHost = typeof url === "string" ? host(url) : null;
  const match = chunks.find((c) => {
    const t = norm(c.title);
    return !!t && ((name && (t === name || name.includes(t) || t.includes(name))) || (modelHost && (modelHost === t || modelHost.endsWith("." + t))));
  });
  if (match) return cleanSource({ name: norm(match.title), url: match.uri });
  if (name) return cleanSource({ name, url: null });
  return null;
}

export async function searchRecipes(
  query: string,
  options: { client?: GeminiClient } = {},
): Promise<SearchResult[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
  if (!q) throw new Error("Aucune recherche saisie.");
  const client = options.client ?? makeClient();
  const response = await client.models.generateContent({
    model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
    contents: `Recherche de recettes : ${q}`,
    config: {
      systemInstruction: SEARCH_PROMPT,
      tools: [{ googleSearch: {} }],
      maxOutputTokens: 16_384,
      httpOptions: { timeout: 55_000, retryOptions: { attempts: 1 } },
    },
  });
  if (!response.text || !response.text.trim()) throw new Error("Gemini n'a renvoyé aucune réponse.");

  const chunks: Chunk[] = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ uri: c.web?.uri ?? "", title: c.web?.title ?? "" }))
    .filter((c) => c.uri && c.title);

  const raw = extractJson(response.text) as { results?: unknown } | null;
  const list = raw && Array.isArray(raw.results) ? raw.results : [];
  const out: SearchResult[] = [];
  for (const entry of list.slice(0, 12)) {
    if (out.length >= RESULT_COUNT) break;
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    let recipe: Recipe;
    try {
      recipe = normalizeRecipe(e.recipe);
    } catch {
      continue;
    }
    if (!recipe.steps.length && !recipe.ingredients.length) continue;
    const source = pickSource(e.site, e.url, chunks);
    if (!source) continue;
    recipe.source = source;
    recipe.warnings = [
      `Recette reformulée par Gemini d'après ${source.name} : compare avec la page d'origine avant de cuisiner.`,
      ...recipe.warnings,
    ];
    out.push({ recipe, source });
  }
  return out;
}
