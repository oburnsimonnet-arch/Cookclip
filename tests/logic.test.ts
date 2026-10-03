import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalVideoUrl, extractVideoId } from "../lib/youtube.js";
import { extractJson, normalizeRecipe } from "../lib/recipe.js";
import {
  buildTextMessage,
  DEFAULT_MODEL,
  extractRecipeFromText,
  extractRecipeFromVideo,
  SYSTEM_PROMPT,
} from "../lib/extract.js";
import { SAMPLE_MODEL_REPLY, SAMPLE_TRANSCRIPT } from "./fixtures.js";

const ID = "dQw4w9WgXcQ";

/** Faux client Gemini : enregistre l'appel et renvoie la réponse voulue. */
function fakeGemini(text: string | undefined) {
  const calls: any[] = [];
  const client = {
    models: {
      generateContent: async (params: any) => {
        calls.push(params);
        return { text };
      },
    },
  } as any;
  return { client, calls };
}

test("extractVideoId : formats de liens YouTube", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(extractVideoId(`https://youtu.be/${ID}?si=abc`), ID);
  assert.equal(extractVideoId(`https://m.youtube.com/watch?v=${ID}&t=30s`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/shorts/${ID}`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(extractVideoId(ID), ID);
});

test("extractVideoId : texte de partage Android (titre + lien)", () => {
  assert.equal(extractVideoId(`Pâte à crêpes facile https://youtu.be/${ID}`), ID);
});

test("extractVideoId : liens non pris en charge", () => {
  assert.equal(extractVideoId("https://www.tiktok.com/@chef/video/123456"), null);
  assert.equal(extractVideoId("https://example.com/watch?v=" + ID), null);
  assert.equal(extractVideoId("bonjour"), null);
  assert.equal(extractVideoId(""), null);
});

test("canonicalVideoUrl : lien propre quel que soit le format d'origine", () => {
  assert.equal(canonicalVideoUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
});

test("extractJson : accepte les blocs ```json et le texte autour", () => {
  const parsed = extractJson(SAMPLE_MODEL_REPLY) as { title: string };
  assert.equal(parsed.title, "Pâte à crêpes");
  assert.deepEqual(extractJson('Texte {"a": 1} fin'), { a: 1 });
  assert.throws(() => extractJson("pas de json ici"));
});

test("normalizeRecipe : recette complète", () => {
  const r = normalizeRecipe(extractJson(SAMPLE_MODEL_REPLY));
  assert.equal(r.servings, 6);
  assert.equal(r.ingredients.length, 7);
  assert.equal(r.steps.length, 6);
  const rhum = r.ingredients.find((i) => i.name === "rhum")!;
  assert.equal(rhum.quantity, null);
  assert.equal(rhum.uncertain, true);
  assert.equal(r.ingredients[0].uncertain, false);
});

test("normalizeRecipe : une quantité absente est toujours marquée incertaine", () => {
  const r = normalizeRecipe({
    ingredients: [{ name: "poivre", quantity: null, uncertain: false }],
    steps: ["Assaisonner."],
  });
  assert.equal(r.ingredients[0].uncertain, true);
  assert.equal(r.steps[0].text, "Assaisonner.");
});

test("normalizeRecipe : quantités textuelles et valeurs invalides", () => {
  const r = normalizeRecipe({
    servings: "4",
    ingredients: [
      { name: "huile", quantity: "0,5", unit: "cl" },
      { name: "", quantity: 3 },
      { name: "ail", quantity: -2 },
      null,
    ],
    steps: [{ text: "Chauffer.", durationMin: "abc" }],
  });
  assert.equal(r.servings, 4);
  assert.equal(r.ingredients.length, 2);
  assert.equal(r.ingredients[0].quantity, 0.5);
  assert.equal(r.ingredients[1].quantity, null);
  assert.equal(r.steps[0].durationMin, null);
});

test("normalizeRecipe : rejette ce qui n'est pas une recette", () => {
  assert.throws(() => normalizeRecipe({ isRecipe: false }), /ne semble pas contenir/);
  assert.throws(() => normalizeRecipe({ title: "x", ingredients: [], steps: [] }), /Aucune recette/);
  assert.throws(() => normalizeRecipe("n'importe quoi"));
});

test("vidéo : envoie le lien canonique à Gemini avec les bons réglages", async () => {
  const { client, calls } = fakeGemini(SAMPLE_MODEL_REPLY);
  const recipe = await extractRecipeFromVideo(ID, client);

  assert.equal(recipe.title, "Pâte à crêpes");
  assert.equal(recipe.ingredients.length, 7);

  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.model, DEFAULT_MODEL);
  assert.equal(call.contents[0].fileData.fileUri, `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(typeof call.contents[1].text, "string");
  assert.equal(call.config.systemInstruction, SYSTEM_PROMPT);
  assert.equal(call.config.responseMimeType, "application/json");
  assert.ok(call.config.httpOptions.timeout < 60_000);
  // pas de relance automatique : chaque relance consommerait du quota
  assert.equal(call.config.httpOptions.retryOptions.attempts, 1);
});

test("vidéo : GEMINI_MODEL permet de changer de modèle", async () => {
  const { client, calls } = fakeGemini(SAMPLE_MODEL_REPLY);
  process.env.GEMINI_MODEL = "gemini-test";
  try {
    await extractRecipeFromVideo(ID, client);
  } finally {
    delete process.env.GEMINI_MODEL;
  }
  assert.equal(calls[0].model, "gemini-test");
});

test("vidéo : réponse vide de Gemini -> erreur claire", async () => {
  const { client } = fakeGemini(undefined);
  await assert.rejects(() => extractRecipeFromVideo(ID, client), /aucune réponse/);
  const { client: client2 } = fakeGemini("   ");
  await assert.rejects(() => extractRecipeFromVideo(ID, client2), /aucune réponse/);
});

test("vidéo : Gemini dit que ce n'est pas une recette", async () => {
  const { client } = fakeGemini('{"isRecipe": false}');
  await assert.rejects(() => extractRecipeFromVideo(ID, client), /ne semble pas contenir/);
});

test("texte : la transcription collée est envoyée sans fileData", async () => {
  const { client, calls } = fakeGemini(SAMPLE_MODEL_REPLY);
  const recipe = await extractRecipeFromText(
    { title: "Pâte à crêpes", transcript: SAMPLE_TRANSCRIPT },
    client,
  );
  assert.equal(recipe.servings, 6);
  assert.equal(typeof calls[0].contents, "string");
  assert.ok(calls[0].contents.includes("250 grammes de farine"));
  assert.ok(calls[0].contents.startsWith("TITRE :\nPâte à crêpes"));
});

test("texte : tronque les contenus trop longs", () => {
  const msg = buildTextMessage({
    title: "Titre",
    description: "d".repeat(20_000),
    transcript: "t".repeat(200_000),
  });
  assert.ok(msg.length < 8_000 + 90_000 + 200);
});

test("texte : refuse une transcription vide sans appeler Gemini", async () => {
  const { client, calls } = fakeGemini(SAMPLE_MODEL_REPLY);
  await assert.rejects(() => extractRecipeFromText({ transcript: "  " }, client), /Aucun contenu/);
  assert.equal(calls.length, 0);
});
