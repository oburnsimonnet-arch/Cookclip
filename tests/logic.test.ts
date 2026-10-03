import { test } from "node:test";
import assert from "node:assert/strict";
import { extractVideoId, decodeEntities } from "../lib/youtube.js";
import { extractJson, normalizeRecipe } from "../lib/recipe.js";
import { buildUserMessage, extractRecipe, SYSTEM_PROMPT } from "../lib/extract.js";
import { SAMPLE_MODEL_REPLY, SAMPLE_TRANSCRIPT } from "./fixtures.js";

const ID = "dQw4w9WgXcQ";

test("extractVideoId : formats de liens YouTube", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(extractVideoId(`https://youtu.be/${ID}?si=abc`), ID);
  assert.equal(extractVideoId(`https://m.youtube.com/watch?v=${ID}&t=30s`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/shorts/${ID}`), ID);
  assert.equal(extractVideoId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(extractVideoId(ID), ID);
});

test("extractVideoId : texte de partage Android (titre + lien)", () => {
  assert.equal(
    extractVideoId(`Pâte à crêpes facile https://youtu.be/${ID}`),
    ID,
  );
});

test("extractVideoId : liens non pris en charge", () => {
  assert.equal(extractVideoId("https://www.tiktok.com/@chef/video/123456"), null);
  assert.equal(extractVideoId("https://example.com/watch?v=" + ID), null);
  assert.equal(extractVideoId("bonjour"), null);
  assert.equal(extractVideoId(""), null);
});

test("decodeEntities", () => {
  assert.equal(decodeEntities("l&amp;#39;oeuf &amp; le lait"), "l'oeuf & le lait");
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

test("buildUserMessage : tronque les contenus trop longs", () => {
  const msg = buildUserMessage({
    title: "Titre",
    description: "d".repeat(20_000),
    transcript: "t".repeat(200_000),
  });
  assert.ok(msg.length < 8_000 + 90_000 + 200);
  assert.ok(msg.startsWith("TITRE :\nTitre"));
});

test("extractRecipe : de bout en bout avec un client simulé", async () => {
  let captured: any = null;
  const fakeClient = {
    messages: {
      create: async (params: any) => {
        captured = params;
        return { content: [{ type: "text", text: SAMPLE_MODEL_REPLY }] };
      },
    },
  } as any;

  const recipe = await extractRecipe(
    { title: "Pâte à crêpes", transcript: SAMPLE_TRANSCRIPT },
    fakeClient,
  );

  assert.equal(recipe.title, "Pâte à crêpes");
  assert.equal(recipe.ingredients.length, 7);
  assert.equal(captured.system, SYSTEM_PROMPT);
  assert.equal(captured.temperature, 0);
  assert.ok(captured.messages[0].content.includes("250 grammes de farine"));
});

test("extractRecipe : refuse un contenu vide sans appeler le modèle", async () => {
  const fakeClient = {
    messages: { create: async () => assert.fail("ne doit pas être appelé") },
  } as any;
  await assert.rejects(() => extractRecipe({ title: "x" }, fakeClient), /Aucun contenu/);
});
