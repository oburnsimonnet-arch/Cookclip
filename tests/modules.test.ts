import { test } from "node:test";
import assert from "node:assert/strict";
import { ID_RE, legacyIdFor, savedIdFor, videoIdFrom, videoUrl } from "../public/js/ids.js";
import { formatClock, formatQty, parseQty } from "../public/js/format.js";
import { CATEGORIES, sanitizeRecipe } from "../public/js/sanitize.js";
import { cacheKey, CACHE_MAX, createStore } from "../public/js/store.js";
import {
  buildExport,
  exportFileName,
  mergeSaved,
  MAX_IMPORT_ITEMS,
  parseImport,
} from "../public/js/backup.js";
import { buildShoppingList, nameKey, shoppingLine } from "../public/js/shopping.js";
import { createTimer } from "../public/js/timer.js";

const ID = "dQw4w9WgXcQ";

/** Faux localStorage. */
function memoryStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    _map: m,
  };
}

const crepes = {
  title: "Pâte à crêpes",
  servings: 4,
  ingredients: [
    { name: "farine", quantity: 250, unit: "g", note: null, uncertain: false },
    { name: "œufs", quantity: 3, unit: null, note: null, uncertain: false },
    { name: "lait", quantity: 0.5, unit: "l", note: null, uncertain: false },
    { name: "rhum", quantity: null, unit: null, note: "à l'œil", uncertain: true },
  ],
  steps: [{ text: "Mélanger.", durationMin: null }],
};
const gaufres = {
  title: "Gaufres",
  servings: 4,
  ingredients: [
    { name: "Farine", quantity: 500, unit: "grammes", note: null, uncertain: false },
    { name: "oeuf", quantity: 2, unit: null, note: null, uncertain: false },
    { name: "lait", quantity: 25, unit: "cl", note: null, uncertain: false },
    { name: "rhum", quantity: 1, unit: "c. à soupe", note: null, uncertain: false },
  ],
  steps: [{ text: "Cuire.", durationMin: 5 }],
};

/* ---------- identifiants ---------- */
test("ids : tous les formats de lien donnent le même identifiant", () => {
  for (const u of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}?si=x`,
    `https://m.youtube.com/watch?v=${ID}&t=9s`,
    `https://www.youtube.com/shorts/${ID}`,
    `Super recette https://youtu.be/${ID}`,
    ID,
  ]) {
    assert.equal(videoIdFrom(u), ID, u);
  }
  assert.equal(videoIdFrom("https://www.tiktok.com/@a/video/1"), null);
  assert.equal(videoIdFrom(""), null);
  assert.equal(videoIdFrom(undefined), null);
});

test("ids : lien de vidéo refusé si l'identifiant est invalide", () => {
  assert.equal(videoUrl(ID), `https://www.youtube.com/watch?v=${ID}`);
  assert.equal(videoUrl('x"><script>'), null);
  assert.equal(videoUrl(null), null);
  assert.ok(ID_RE.test(ID));
});

test("ids : identifiant de fiche", () => {
  assert.equal(savedIdFor(crepes, ID), "v:" + ID);
  assert.equal(savedIdFor(crepes, null), "Pâte à crêpes|1");
  assert.equal(legacyIdFor(crepes), "Pâte à crêpes|1");
});

/* ---------- formats ---------- */
test("format : quantités lisibles", () => {
  assert.equal(formatQty(0.5), "½");
  assert.equal(formatQty(1.5), "1 ½");
  assert.equal(formatQty(250), "250");
  assert.equal(formatQty(0.33), "⅓");
  assert.equal(formatQty(null), "");
  assert.equal(formatQty(2.25), "2 ¼");
  // pas de fraction pour les grandes quantités (grammes, millilitres)
  assert.equal(formatQty(312.5), "312,5");
  assert.equal(formatQty(62.5), "62,5");
  assert.equal(formatQty(12.5), "12,5");
  assert.equal(formatQty(9.5), "9 ½");
});

test("format : saisie d'une quantité", () => {
  assert.equal(parseQty("4"), 4);
  assert.equal(parseQty("4,5"), 4.5);
  assert.equal(parseQty("1/2"), 0.5);
  assert.equal(parseQty("1 1/2"), 1.5);
  assert.equal(parseQty("½"), 0.5);
  assert.equal(parseQty("2 ½"), 2.5);
  assert.equal(parseQty(""), null);
  assert.equal(parseQty("  "), null);
  assert.equal(parseQty("beaucoup"), null);
  assert.equal(parseQty("-3"), null);
  assert.equal(parseQty("1/0"), null);
});

test("format : horloge du minuteur", () => {
  assert.equal(formatClock(90), "01:30");
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(3725), "1:02:05");
  assert.equal(formatClock(-5), "00:00");
});

/* ---------- validation ---------- */
test("sanitize : recette valide conservée et normalisée", () => {
  const r = sanitizeRecipe({ ...crepes, category: "dessert", tags: ["Rapide", "rapide", "Four"] })!;
  assert.equal(r.title, "Pâte à crêpes");
  assert.equal(r.category, "dessert");
  assert.deepEqual(r.tags, ["rapide", "four"]);
  assert.equal(r.ingredients.length, 4);
  assert.equal(r.ingredients[3].uncertain, true);
});

test("sanitize : rejette ce qui n'est pas une recette", () => {
  assert.equal(sanitizeRecipe(null), null);
  assert.equal(sanitizeRecipe("texte"), null);
  assert.equal(sanitizeRecipe({ title: "x", ingredients: [], steps: [] }), null);
  assert.equal(sanitizeRecipe({ ingredients: [{ name: "  " }], steps: [] }), null);
});

test("sanitize : catégorie inconnue -> autre, valeurs absurdes écartées", () => {
  const r = sanitizeRecipe({
    ...crepes,
    category: "inconnue",
    servings: "6",
    prepTimeMin: -4,
    ingredients: [{ name: "sel", quantity: -1 }, 42, null],
  })!;
  assert.equal(r.category, "autre");
  assert.equal(r.servings, 6);
  assert.equal(r.prepTimeMin, null);
  assert.equal(r.ingredients.length, 1);
  assert.equal(r.ingredients[0].quantity, null);
  assert.ok(CATEGORIES.includes("plat"));
});

test("sanitize : limites de taille", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ name: "ing" + i, quantity: 1 }));
  const r = sanitizeRecipe({ title: "t".repeat(900), ingredients: many, steps: ["x"] })!;
  assert.equal(r.ingredients.length, 200);
  assert.equal(r.title.length, 200);
});

/* ---------- stockage ---------- */
test("store : recettes enregistrées, lecture robuste", () => {
  const s = createStore(memoryStorage());
  assert.deepEqual(s.loadSaved(), []);
  assert.equal(s.storeSaved([{ id: "a" }]), true);
  assert.deepEqual(s.loadSaved(), [{ id: "a" }]);
  const broken = createStore(memoryStorage({ "cookclip.recipes.v1": "{pas du json" }));
  assert.deepEqual(broken.loadSaved(), []);
  const wrongType = createStore(memoryStorage({ "cookclip.recipes.v1": '{"a":1}' }));
  assert.deepEqual(wrongType.loadSaved(), []);
});

test("store : écriture impossible -> false, sans exception", () => {
  const full = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  const s = createStore(full);
  assert.equal(s.storeSaved([1]), false);
  assert.doesNotThrow(() => s.cachePut("k", {}));
  assert.doesNotThrow(() => s.setSetting("a", 1));
  assert.doesNotThrow(() => s.setAccessCode("x"));
});

test("store : la mémoire distingue la langue et reste bornée", () => {
  const s = createStore(memoryStorage());
  assert.notEqual(cacheKey(ID, true), cacheKey(ID, false));
  s.cachePut(cacheKey(ID, true), crepes);
  assert.ok(s.cacheGet(cacheKey(ID, true)));
  assert.equal(s.cacheGet(cacheKey(ID, false)), null);
  for (let i = 0; i < CACHE_MAX + 10; i++) s.cachePut("v" + i, crepes);
  const storage = memoryStorage();
  const s2 = createStore(storage);
  for (let i = 0; i < CACHE_MAX + 10; i++) s2.cachePut("v" + i, crepes);
  assert.equal(Object.keys(JSON.parse(storage._map.get("cookclip.cache.v1")!)).length, CACHE_MAX);
});

test("store : réglages et code d'accès", () => {
  const s = createStore(memoryStorage());
  assert.equal(s.getSetting("french", true), true);
  s.setSetting("french", false);
  assert.equal(s.getSetting("french", true), false);
  assert.equal(s.getAccessCode(), "");
  s.setAccessCode("abc");
  assert.equal(s.getAccessCode(), "abc");
  s.setAccessCode("");
  assert.equal(s.getAccessCode(), "");
});

/* ---------- sauvegarde ---------- */
test("backup : un export se réimporte à l'identique", () => {
  const saved = [{ id: "v:" + ID, savedAt: 1000, recipe: crepes, servings: 6, videoId: ID }];
  const file = JSON.stringify(buildExport(saved, new Date("2026-10-03T10:00:00Z")));
  const { items, rejected } = parseImport(file);
  assert.equal(rejected, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].id, "v:" + ID);
  assert.equal(items[0].videoId, ID);
  assert.equal(items[0].servings, 6);
  assert.equal(items[0].recipe.title, "Pâte à crêpes");
  assert.equal(exportFileName(new Date("2026-10-03T10:00:00Z")), "cookclip-recettes-2026-10-03.json");
});

test("backup : fichiers invalides refusés avec un message clair", () => {
  assert.throws(() => parseImport("pas du json"), /illisible/);
  assert.throws(() => parseImport('{"autre": 1}'), /non reconnu/);
  assert.throws(() => parseImport("42"), /non reconnu/);
});

test("backup : fiches abîmées écartées, identifiant de vidéo falsifié neutralisé", () => {
  const file = JSON.stringify({
    recipes: [
      { id: "a", recipe: crepes, videoId: 'x"><img src=x onerror=alert(1)>' },
      { id: "b", recipe: { title: "vide" } },
      "n'importe quoi",
      null,
    ],
  });
  const { items, rejected } = parseImport(file);
  assert.equal(items.length, 1);
  assert.equal(items[0].videoId, null);
  assert.equal(rejected, 3);
});

test("backup : un identifiant est créé s'il manque, une liste nue est acceptée", () => {
  const { items } = parseImport(JSON.stringify([{ recipe: crepes, videoId: ID }]));
  assert.equal(items[0].id, "v:" + ID);
});

test("backup : plafond du nombre de fiches importées", () => {
  const many = Array.from({ length: MAX_IMPORT_ITEMS + 20 }, (_, i) => ({ id: "r" + i, recipe: crepes }));
  const { items, rejected } = parseImport(JSON.stringify(many));
  assert.equal(items.length, MAX_IMPORT_ITEMS);
  assert.equal(rejected, 20);
});

test("backup : fusion sans doublon, la plus récente gagne", () => {
  const mk = (id: string, savedAt: number, title: string) => ({
    id, savedAt, recipe: { ...crepes, title }, servings: 4, videoId: null,
  });
  const existing = [mk("a", 100, "A ancienne"), mk("b", 500, "B récente")];
  const incoming = [mk("a", 200, "A plus récente"), mk("b", 100, "B plus ancienne"), mk("c", 50, "C")];
  const { list, added, updated } = mergeSaved(existing, incoming);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.equal(list.length, 3);
  assert.equal(list.find((r) => r.id === "a")!.recipe.title, "A plus récente");
  assert.equal(list.find((r) => r.id === "b")!.recipe.title, "B récente");
  assert.deepEqual(list.map((r) => r.id), ["b", "a", "c"]); // tri par date décroissante
  // réimporter deux fois ne change rien
  const again = mergeSaved(list, incoming);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
});

/* ---------- liste de courses ---------- */
test("courses : mêmes ingrédients additionnés malgré accents, pluriels et unités", () => {
  assert.equal(nameKey("Œufs"), nameKey("oeuf"));
  assert.equal(nameKey("Farine"), nameKey("farine"));
  const list = buildShoppingList([
    { recipe: crepes, servings: 4 },
    { recipe: gaufres, servings: 4 },
  ]);
  const get = (n: string) => list.find((l) => nameKey(l.name) === nameKey(n))!;
  assert.equal(get("farine").quantity, 750);
  assert.equal(get("farine").unit, "g");
  assert.equal(get("oeufs").quantity, 5);
  assert.deepEqual(get("farine").from.sort(), ["Gaufres", "Pâte à crêpes"]);
  // 0,5 l + 25 cl = 750 ml
  assert.equal(get("lait").quantity, 750);
  assert.equal(get("lait").unit, "ml");
});

test("courses : quantités proportionnelles aux portions", () => {
  const list = buildShoppingList([{ recipe: crepes, servings: 8 }]);
  assert.equal(list.find((l) => l.name === "farine")!.quantity, 500);
});

test("courses : conversion en kg et en l, quantité libre conservée", () => {
  const list = buildShoppingList([
    { recipe: crepes, servings: 12 },
    { recipe: gaufres, servings: 4 },
  ]);
  const farine = list.find((l) => nameKey(l.name) === "farine")!;
  assert.equal(farine.unit, "kg");
  assert.equal(farine.quantity, 1.25);
  const rhum = list.filter((l) => nameKey(l.name) === "rhum");
  assert.equal(rhum.length, 2); // « à l'œil » (sans unité) et « 1 c. à soupe » restent séparés
  assert.ok(rhum.some((l) => l.quantity === null));
});

test("courses : textes affichés", () => {
  assert.equal(shoppingLine({ name: "farine", quantity: 750, unit: "g", extra: false, from: [] }), "750 g farine");
  assert.equal(shoppingLine({ name: "farine", quantity: 1.25, unit: "kg", extra: false, from: [] }), "1,25 kg farine");
  assert.equal(shoppingLine({ name: "œufs", quantity: 3, unit: "", extra: true, from: [] }), "3 œufs + un peu");
  assert.equal(shoppingLine({ name: "sel", quantity: null, unit: "", extra: true, from: [] }), "sel (quantité libre)");
  assert.equal(shoppingLine({ name: "lait", quantity: 0.5, unit: "l", extra: false, from: [] }), "0,5 l lait");
});

/* ---------- minuteur ---------- */
test("minuteur : démarre, se met en pause, reprend et se termine une seule fois", () => {
  const t = createTimer(60);
  assert.equal(t.remainingSec(0), 60);
  assert.equal(t.running(), false);
  t.start(1000);
  assert.equal(t.running(), true);
  assert.equal(t.remainingSec(11_000), 50);
  t.pause(11_000);
  assert.equal(t.running(), false);
  assert.equal(t.remainingSec(99_999), 50); // figé pendant la pause
  t.start(100_000);
  assert.equal(t.tick(120_000), false);
  assert.equal(t.tick(150_000), true); // 50 s plus tard
  assert.equal(t.tick(151_000), false); // une seule fois
  assert.equal(t.remainingSec(151_000), 0);
  t.reset();
  assert.equal(t.remainingSec(0), 60);
});

test("minuteur : exact même si les tics sont en retard", () => {
  const t = createTimer(10);
  t.start(0);
  assert.equal(t.remainingSec(7_300), 3); // arrondi par excès
  assert.equal(t.tick(60_000), true); // écran éteint pendant une minute : terminé
});
