import { test } from "node:test";
import assert from "node:assert/strict";
import {
  THEMES as SERVER_THEMES,
  cleanEmoji as serverCleanEmoji,
  normalizeRecipe,
  normalizeThemes,
  themeKeyFrom as serverThemeKeyFrom,
} from "../lib/recipe.js";
import { SYSTEM_PROMPT } from "../lib/extract.js";
import {
  MAX_THEMES,
  NO_THEME,
  THEMES,
  canonicalTheme,
  cleanThemes,
  matchesTheme,
  primaryTheme,
  recipeEmoji,
  themeCounts,
  themeInfo,
  themeKeyFrom,
} from "../public/js/themes.js";
import { cleanEmoji, sanitizeRecipe } from "../public/js/sanitize.js";

const base = { ingredients: [{ name: "riz", quantity: 1 }], steps: ["Cuire."] };
const item = (themes: string[] | undefined, title = "R") => ({
  id: title, savedAt: 1, servings: 4, videoId: null, recipe: { ...base, title, themes },
});

/* ---------- cohérence serveur / application ---------- */

test("thèmes : la liste du serveur et celle de l'application sont identiques", () => {
  assert.deepEqual(
    SERVER_THEMES.map(({ key, label, short, emoji, aliases }) => ({ key, label, short, emoji, aliases })),
    THEMES.map(({ key, label, short, emoji, aliases }) => ({ key, label, short, emoji, aliases })),
  );
});

test("thèmes : clés uniques, 3 couleurs, aucun emoji de drapeau (illisible sous Windows)", () => {
  assert.equal(new Set(THEMES.map((t) => t.key)).size, THEMES.length);
  for (const t of THEMES) {
    assert.equal(t.colors.length, 3, t.key);
    assert.ok(!/[\u{1F1E6}-\u{1F1FF}]/u.test(t.emoji), `${t.key} : drapeau`);
    assert.ok(t.label && t.short && t.emoji, t.key);
  }
});

test("prompt : toutes les thématiques sont proposées à Gemini, avec l'emoji", () => {
  for (const t of SERVER_THEMES) assert.ok(SYSTEM_PROMPT.includes(`- ${t.key} :`), t.key);
  assert.ok(SYSTEM_PROMPT.includes('"themes"'));
  assert.ok(SYSTEM_PROMPT.includes('"emoji"'));
});

/* ---------- serveur ---------- */

test("serveur : retrouve une thématique depuis une clé, un libellé ou un alias", () => {
  for (const v of ["italie", "Italie", "Cuisine italienne", "ITALIEN"]) assert.equal(serverThemeKeyFrom(v), "italie", v);
  assert.equal(serverThemeKeyFrom("Cuisine Réunionnaise !"), "reunion");
  assert.equal(serverThemeKeyFrom("dessert"), "gourmandises");
  assert.equal(serverThemeKeyFrom("Saveurs d'Asie"), "asie");
  assert.equal(serverThemeKeyFrom("inconnue"), null);
  assert.equal(serverThemeKeyFrom(""), null);
  assert.equal(serverThemeKeyFrom(42), null);
});

test("serveur : au plus 2 thématiques connues, sans doublon, inconnues écartées", () => {
  assert.deepEqual(normalizeThemes(["Italie", "rapide", "france"]), ["italie", "rapide"]);
  assert.deepEqual(normalizeThemes(["italie", "Cuisine italienne"]), ["italie"]);
  assert.deepEqual(normalizeThemes(["n'importe quoi", "asie"]), ["asie"]);
  assert.deepEqual(normalizeThemes("france"), ["france"]);
  assert.deepEqual(normalizeThemes(undefined), []);
  assert.deepEqual(normalizeThemes([null, 3, {}]), []);
});

test("serveur : emoji unique accepté, le reste écarté", () => {
  assert.equal(serverCleanEmoji("🥞"), "🥞");
  assert.equal(serverCleanEmoji(" 🍲 "), "🍲");
  assert.equal(serverCleanEmoji("❤️"), "❤️");
  assert.equal(serverCleanEmoji("👩‍🍳"), "👩‍🍳"); // séquence avec liant invisible
  assert.equal(serverCleanEmoji("🍕🍕"), null);
  assert.equal(serverCleanEmoji("pizza"), null);
  assert.equal(serverCleanEmoji("🍕 pizza"), null);
  assert.equal(serverCleanEmoji(""), null);
  assert.equal(serverCleanEmoji(12), null);
  assert.equal(serverCleanEmoji("<script>"), null);
});

test("serveur : la recette normalisée porte thématiques et emoji ; « theme » seul est accepté", () => {
  const r = normalizeRecipe({ ...base, emoji: "🥞", themes: ["Italie", "rapide"] });
  assert.deepEqual(r.themes, ["italie", "rapide"]);
  assert.equal(r.emoji, "🥞");
  assert.deepEqual(normalizeRecipe({ ...base, theme: "asie" }).themes, ["asie"]);
  const none = normalizeRecipe({ ...base });
  assert.deepEqual(none.themes, []);
  assert.equal(none.emoji, null);
});

/* ---------- application ---------- */

test("application : thématique connue ou personnalisée, forme canonique", () => {
  assert.equal(themeKeyFrom("Cuisine italienne"), "italie");
  assert.equal(canonicalTheme("  Italie "), "italie");
  assert.equal(canonicalTheme("Repas   de  Noël"), "Repas de Noël");
  assert.equal(canonicalTheme("x".repeat(80))?.length, 30);
  assert.equal(canonicalTheme(""), null);
  assert.equal(canonicalTheme("   "), null);
  assert.equal(canonicalTheme("!!!"), null);
  assert.equal(canonicalTheme(NO_THEME), null);
  assert.equal(canonicalTheme(12 as any), null);
});

test("application : liste de thématiques sans doublon (accents, casse), bornée", () => {
  assert.deepEqual(cleanThemes(["Noël", "noel", "NOËL"]), ["Noël"]);
  assert.deepEqual(cleanThemes(["italie", "Cuisine italienne"]), ["italie"]);
  assert.equal(cleanThemes(["a1", "b2", "c3", "d4", "e5"]).length, MAX_THEMES);
  assert.deepEqual(cleanThemes("france"), ["france"]);
  assert.deepEqual(cleanThemes(undefined), []);
});

test("application : infos d'affichage (connue, personnalisée, non classée)", () => {
  const known = themeInfo("italie");
  assert.equal(known.label, "Cuisine italienne");
  assert.equal(known.emoji, "🍝");
  assert.equal(known.custom, false);
  assert.match(known.gradient, /^linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6} 55%, #[0-9a-f]{6}\)$/);

  const custom = themeInfo("Repas de Noël");
  assert.equal(custom.custom, true);
  assert.equal(custom.label, "Repas de Noël");
  assert.equal(custom.emoji, "🍴");
  assert.equal(themeInfo("Repas de Noël").gradient, custom.gradient); // stable
  assert.notEqual(themeInfo("Barbecue").gradient, custom.gradient);

  const none = themeInfo(NO_THEME);
  assert.equal(none.label, "Non classées");
  assert.equal(none.none, true);
});

test("application : la carte prend la couleur de la 1re thématique et l'emoji du plat", () => {
  const r = { ...base, title: "x", themes: ["asie", "rapide"], emoji: "🥟" };
  assert.equal(primaryTheme(r).key, "asie");
  assert.equal(recipeEmoji(r), "🥟");
  assert.equal(recipeEmoji({ ...r, emoji: null }), "🍜"); // repli : emoji de la thématique
  assert.equal(primaryTheme({ ...base, title: "x", themes: [] }).key, NO_THEME);
  assert.equal(recipeEmoji({ ...base, title: "x" }), "🍴");
});

test("application : filtre par thématique (« toutes », « non classées », personnalisée)", () => {
  const a = { ...base, title: "a", themes: ["italie", "rapide"] };
  const b = { ...base, title: "b", themes: ["Repas de Noël"] };
  const c = { ...base, title: "c", themes: [] };
  assert.equal(matchesTheme(a, ""), true);
  assert.equal(matchesTheme(a, "rapide"), true);
  assert.equal(matchesTheme(a, "france"), false);
  assert.equal(matchesTheme(b, "repas de noel"), true); // casse et accents ignorés
  assert.equal(matchesTheme(c, NO_THEME), true);
  assert.equal(matchesTheme(a, NO_THEME), false);
});

test("application : décompte des thématiques, dans l'ordre de la liste, puis personnalisées, puis non classées", () => {
  const counts = themeCounts([
    item(["rapide", "italie"], "a"),
    item(["italie"], "b"),
    item(["Zèbre"], "c"),
    item(["Anniversaire"], "d"),
    item([], "e"),
    item(undefined, "f"),
  ]);
  assert.deepEqual(
    counts.map((c) => [c.info.key, c.count]),
    [["italie", 2], ["rapide", 1], ["Anniversaire", 1], ["Zèbre", 1], [NO_THEME, 2]],
  );
  assert.deepEqual(themeCounts([]), []);
});

test("application : sanitizeRecipe garde thématiques (connues et perso) et emoji", () => {
  const r = sanitizeRecipe({ ...base, title: "x", themes: ["Italie", "Repas de Noël", "italien"], emoji: "🍝" })!;
  assert.deepEqual(r.themes, ["italie", "Repas de Noël"]);
  assert.equal(r.emoji, "🍝");
  const bad = sanitizeRecipe({ ...base, title: "x", themes: "n'importe", emoji: "texte" })!;
  assert.equal(bad.emoji, null);
  assert.deepEqual(bad.themes, ["n'importe"]); // un texte libre devient une thématique personnalisée
  assert.equal(cleanEmoji("🥞"), "🥞");
  assert.equal(cleanEmoji("🥞🥞"), null);
});
