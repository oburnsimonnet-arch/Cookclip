import Anthropic from "@anthropic-ai/sdk";
import { extractJson, normalizeRecipe, type Recipe } from "./recipe.js";

export const SYSTEM_PROMPT = `Tu es un assistant qui transforme le contenu d'une vidéo de cuisine en recette structurée.

Tu reçois : le titre, la description de la vidéo et/ou sa transcription automatique (souvent imparfaite : mots mal reconnus, pas de ponctuation, digressions).

Règles strictes :
1. N'invente JAMAIS une quantité, un temps ou une température. Si le cuisinier dit « un peu de », « à l'œil » ou ne précise rien, mets "quantity": null et "uncertain": true, et décris l'approximation dans "note" (ex. « un filet », « selon le goût »).
2. Si la description contient une liste d'ingrédients écrite, elle est plus fiable que la transcription : utilise-la en priorité et recoupe avec la transcription.
3. Corrige les erreurs de reconnaissance vocale évidentes (« cure cuma » → « curcuma »), sans changer le sens.
4. Normalise les unités : g, kg, ml, cl, l, c. à soupe, c. à café, pincée, gousse, etc. "quantity" est un nombre (0.5 pour « une demi »).
5. Les étapes sont à l'impératif, dans l'ordre, une action principale par étape. Mets "durationMin" seulement si un temps est cité.
6. Ignore le blabla : présentations, sponsors, « abonnez-vous ».
7. Écris la recette dans la langue de la vidéo.
8. Dans "warnings", signale tout ce qui limite la fiabilité (transcription tronquée, quantités absentes, étape peu claire).
9. Si le contenu n'est pas une recette de cuisine, renvoie {"isRecipe": false}.

Réponds UNIQUEMENT par un objet JSON, sans texte autour, de cette forme :
{
  "isRecipe": true,
  "title": string,
  "language": "fr" | "en" | ...,
  "servings": number | null,
  "prepTimeMin": number | null,
  "cookTimeMin": number | null,
  "ingredients": [{"name": string, "quantity": number | null, "unit": string | null, "note": string | null, "uncertain": boolean}],
  "steps": [{"text": string, "durationMin": number | null}],
  "tips": [string],
  "warnings": [string]
}`;

/** Limite de caractères envoyés au modèle (≈ 25 000 tokens), largement suffisant pour une vidéo de cuisine. */
const MAX_TRANSCRIPT_CHARS = 90_000;

export interface ExtractInput {
  title?: string | null;
  description?: string | null;
  transcript?: string | null;
}

export function buildUserMessage(input: ExtractInput): string {
  const parts: string[] = [];
  if (input.title) parts.push(`TITRE :\n${input.title}`);
  if (input.description) {
    parts.push(`DESCRIPTION :\n${input.description.slice(0, 8_000)}`);
  }
  if (input.transcript) {
    parts.push(`TRANSCRIPTION :\n${input.transcript.slice(0, MAX_TRANSCRIPT_CHARS)}`);
  }
  return parts.join("\n\n");
}

export async function extractRecipe(
  input: ExtractInput,
  client?: Pick<Anthropic, "messages">,
): Promise<Recipe> {
  if (!input.transcript && !input.description) {
    throw new Error("Aucun contenu à analyser (ni transcription, ni description).");
  }

  const anthropic =
    client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
    max_tokens: 4096,
    temperature: 0,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(input) }],
  });

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");

  return normalizeRecipe(extractJson(text));
}
