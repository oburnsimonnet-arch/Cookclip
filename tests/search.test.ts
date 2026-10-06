import { test } from "node:test";
import assert from "node:assert/strict";
import { SEARCH_PROMPT, pickSource, searchRecipes } from "../lib/search.js";
import { cleanSource } from "../lib/recipe.js";

const recipe = (title: string) => ({
  isRecipe: true, title, emoji: "🥔", themes: ["france"], category: "plat",
  ingredients: [{ name: "pommes de terre", quantity: 1, unit: "kg" }],
  steps: [{ text: "Cuire." }],
});
const fake = (text: string, chunks: any[] = []) => {
  const calls: any[] = [];
  const client: any = {
    models: {
      generateContent: async (req: any) => {
        calls.push(req);
        return { text, candidates: [{ groundingMetadata: { groundingChunks: chunks } }] };
      },
    },
  };
  return { client, calls };
};
const chunk = (title: string, uri = `https://vertex.test/${title}`) => ({ web: { title, uri } });

test("recherche : une requête, outil de recherche Google activé, fiches avec source vérifiée", async () => {
  const { client, calls } = fake(
    JSON.stringify({
      results: [
        { site: "marmiton.org", url: "https://invente.example/x", recipe: recipe("Gratin A") },
        { site: "Cuisine Actuelle", url: "https://www.cuisineactuelle.fr/r", recipe: recipe("Gratin B") },
        { site: "site-sans-source.com", url: "https://site-sans-source.com/r", recipe: recipe("Gratin C") },
      ],
    }),
    [chunk("marmiton.org"), chunk("cuisineactuelle.fr")],
  );
  const out = await searchRecipes("gratin dauphinois", { client });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].config.tools, [{ googleSearch: {} }]);
  assert.match(calls[0].contents, /gratin dauphinois/);
  assert.equal(out.length, 3);
  // le lien vient de la recherche, jamais de l'adresse inventée par le modèle
  assert.deepEqual(out[0].source, { name: "marmiton.org", url: "https://vertex.test/marmiton.org" });
  assert.equal(out[1].source.url, "https://vertex.test/cuisineactuelle.fr");
  assert.deepEqual(out[2].source, { name: "site-sans-source.com", url: null });
  assert.match(out[0].recipe.warnings[0], /marmiton\.org/);
  assert.equal(out[0].recipe.source?.name, "marmiton.org");
});

test("recherche : résultats invalides écartés, 3 au plus, rien trouvé -> liste vide", async () => {
  const many = { results: [1, null, { site: "a.fr", recipe: { isRecipe: false } }, ...[1, 2, 3, 4].map((i) => ({ site: "a.fr", recipe: recipe("R" + i) }))] };
  const { client } = fake(JSON.stringify(many), [chunk("a.fr")]);
  assert.equal((await searchRecipes("x y", { client })).length, 3);
  const none = fake('```json\n{"results": []}\n```');
  assert.deepEqual(await searchRecipes("zzz", { client: none.client }), []);
});

test("recherche : requête vide ou réponse vide -> erreur", async () => {
  const never: any = { models: { generateContent: async () => assert.fail("appel inutile") } };
  await assert.rejects(searchRecipes("   ", { client: never }));
  await assert.rejects(searchRecipes("pizza", { client: fake("").client }));
});

test("source : seuls les liens http(s) sont gardés", () => {
  assert.deepEqual(cleanSource({ name: "x.fr", url: "javascript:alert(1)" }), { name: "x.fr", url: null });
  assert.deepEqual(cleanSource({ name: "x.fr", url: "https://x.fr/a" }), { name: "x.fr", url: "https://x.fr/a" });
  assert.equal(cleanSource({ url: "https://x.fr" }), null);
  assert.equal(pickSource("", "", []), null);
  assert.ok(SEARCH_PROMPT.includes('"results"'));
});

import { quotaDetail } from "../lib/quota.js";
test("quota : le détail de l'erreur 429 est lisible et borné", () => {
  const msg = 'Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0. Please retry in 31.2s';
  const d = quotaDetail(msg)!;
  assert.match(d, /limite : 0/);
  assert.match(d, /réessayer dans 32 s/);
  assert.equal(quotaDetail(""), null);
  assert.ok(quotaDetail("x".repeat(1000))!.length <= 300);
});

test("quota : message générique de Gemini (JSON brut) -> phrase claire", () => {
  const raw = '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.","status":"RESOURCE_EXHAUSTED"}}';
  assert.match(quotaDetail(raw)!, /offre gratuite/);
});
