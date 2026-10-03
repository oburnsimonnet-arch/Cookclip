import { GoogleGenAI } from "@google/genai";
import { CATEGORIES, extractJson, normalizeRecipe, type Recipe } from "./recipe.js";
import { canonicalVideoUrl } from "./youtube.js";

export const DEFAULT_MODEL = "gemini-3.8-flash";

export const SYSTEM_PROMPT = `Tu es un assistant qui transforme une vidéo de cuisine (ou sa transcription) en recette structurée.

Tu peux recevoir : la vidéo elle-même (image et son), ou un texte (titre, description, transcription automatique souvent imparfaite : mots mal reconnus, pas de ponctuation, digressions).

Règles strictes :
1. N'invente JAMAIS une quantité, un temps ou une température. Si le cuisinier dit « un peu de », « à l'œil » ou ne précise rien, mets "quantity": null et "uncertain": true, et décris l'approximation dans "note" (ex. « un filet », « selon le goût »).
2. Sur une vidéo, utilise TOUTES les sources : ce qui est dit, le texte affiché à l'écran (quantités, temps, températures incrustés) et ce qui est montré. Si le texte à l'écran et la voix se contredisent, signale-le dans "warnings".
3. Si une liste d'ingrédients est écrite (à l'écran ou dans la description), elle est plus fiable que la voix : utilise-la en priorité et recoupe.
4. Corrige les erreurs de reconnaissance vocale évidentes (« cure cuma » → « curcuma »), sans changer le sens.
5. Normalise les unités : g, kg, ml, cl, l, c. à soupe, c. à café, pincée, gousse, etc. "quantity" est un nombre (0.5 pour « une demi »).
6. Les étapes sont à l'impératif, dans l'ordre, une action principale par étape. Mets "durationMin" seulement si un temps est cité ou affiché.
7. Ignore le blabla : présentations, sponsors, « abonnez-vous ».
8. Écris la recette dans la langue de la vidéo, sauf consigne contraire donnée avec la demande.
9. Dans "warnings", signale tout ce qui limite la fiabilité (quantités absentes, passage inaudible, étape peu claire).
10. Si le contenu n'est pas une recette de cuisine, renvoie {"isRecipe": false}.
11. "category" : l'une de ces valeurs exactement : ${CATEGORIES.join(", ")}.
12. "tags" : 0 à 5 mots-clés courts et vérifiables (ex. « végétarien » seulement si aucun ingrédient n'est de la viande ou du poisson ; « rapide », « four », « une poêle », « sans gluten » seulement si c'est évident). En cas de doute, n'en mets pas.

Réponds UNIQUEMENT par un objet JSON, sans texte autour, de cette forme :
{
  "isRecipe": true,
  "title": string,
  "language": "fr" | "en" | ...,
  "category": string,
  "tags": [string],
  "servings": number | null,
  "prepTimeMin": number | null,
  "cookTimeMin": number | null,
  "ingredients": [{"name": string, "quantity": number | null, "unit": string | null, "note": string | null, "uncertain": boolean}],
  "steps": [{"text": string, "durationMin": number | null}],
  "tips": [string],
  "warnings": [string]
}`;

const VIDEO_INSTRUCTION =
  "Extrais la recette de cette vidéo de cuisine, en suivant strictement les consignes.";

/** Ajoutée à la demande quand l'utilisateur veut une recette en français. */
export const FRENCH_INSTRUCTION =
  ' Rédige toute la recette en français (titre, ingrédients, étapes, astuces, avertissements) : traduis-la si la vidéo est dans une autre langue, et mets "language": "fr".';

/** Limite de caractères pour une transcription collée à la main (≈ 25 000 tokens). */
const MAX_TRANSCRIPT_CHARS = 90_000;

/** Sous-ensemble du client Gemini utilisé ici (facilite les tests). */
export type GeminiClient = Pick<GoogleGenAI, "models">;

export interface ExtractOptions {
  /** Demande une recette rédigée en français, quelle que soit la langue de la vidéo. */
  french?: boolean;
  /** Client à utiliser (tests). Par défaut : client réel configuré par GEMINI_API_KEY. */
  client?: GeminiClient;
}

function makeClient(): GeminiClient {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function modelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

const BASE_CONFIG = {
  systemInstruction: SYSTEM_PROMPT,
  responseMimeType: "application/json",
  // Large marge : sur les modèles « réflexion », les tokens de réflexion comptent dans cette limite.
  maxOutputTokens: 16_384,
  // Vercel coupe la fonction à 60 s ; on s'arrête un peu avant pour répondre proprement.
  // attempts: 1 = aucune relance automatique. Par défaut le SDK retente jusqu'à 5 fois en cas
  // d'erreur 429/5xx, et chaque relance consomme le quota (limite gratuite : 20 requêtes/jour).
  httpOptions: { timeout: 55_000, retryOptions: { attempts: 1 } },
};

function parseResponse(text: string | undefined): Recipe {
  if (!text || !text.trim()) {
    throw new Error("Gemini n'a renvoyé aucune réponse.");
  }
  return normalizeRecipe(extractJson(text));
}

/** Gemini regarde et écoute la vidéo YouTube directement (vidéos publiques uniquement). */
export async function extractRecipeFromVideo(
  videoId: string,
  options: ExtractOptions = {},
): Promise<Recipe> {
  const client = options.client ?? makeClient();
  const response = await client.models.generateContent({
    model: modelName(),
    contents: [
      { fileData: { fileUri: canonicalVideoUrl(videoId) } },
      { text: VIDEO_INSTRUCTION + (options.french ? FRENCH_INSTRUCTION : "") },
    ],
    config: BASE_CONFIG,
  });
  return parseResponse(response.text);
}

export interface TextInput {
  title?: string | null;
  description?: string | null;
  transcript: string;
}

export function buildTextMessage(input: TextInput, french = false): string {
  const parts: string[] = [];
  if (input.title) parts.push(`TITRE :\n${input.title}`);
  if (input.description) parts.push(`DESCRIPTION :\n${input.description.slice(0, 8_000)}`);
  parts.push(`TRANSCRIPTION :\n${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`);
  if (french) parts.push(`CONSIGNE :${FRENCH_INSTRUCTION}`);
  return parts.join("\n\n");
}

/** Secours : l'utilisateur colle lui-même la transcription. */
export async function extractRecipeFromText(
  input: TextInput,
  options: ExtractOptions = {},
): Promise<Recipe> {
  if (!input.transcript.trim()) {
    throw new Error("Aucun contenu à analyser.");
  }
  const client = options.client ?? makeClient();
  const response = await client.models.generateContent({
    model: modelName(),
    contents: buildTextMessage(input, options.french),
    config: BASE_CONFIG,
  });
  return parseResponse(response.text);
}
