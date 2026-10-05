import { cleanThemes } from "./themes.js";

/** Catégories proposées (même liste que côté serveur, lib/recipe.ts). */
export const CATEGORIES = [
  "entrée",
  "plat",
  "dessert",
  "boisson",
  "apéritif",
  "sauce",
  "pain et pâtisserie",
  "autre",
];

const MAX_ITEMS = 200;
const MAX_TEXT = 2000;

const str = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXT) : null);

const num = (v) => {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
};

// Un seul emoji (éventuellement composé : teinte, séquence avec liant invisible)
const EMOJI_RE =
  /^\p{Extended_Pictographic}\uFE0F?[\u{1F3FB}-\u{1F3FF}]?(?:\u200D\p{Extended_Pictographic}\uFE0F?[\u{1F3FB}-\u{1F3FF}]?)*$/u;

export function cleanEmoji(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= 16 && EMOJI_RE.test(s) ? s : null;
}

/** Page d'où vient une recette trouvée sur le web : nom + lien http(s) seulement. */
export function cleanSource(v) {
  if (!v || typeof v !== "object") return null;
  const name = typeof v.name === "string" ? v.name.trim().slice(0, 80) : "";
  if (!name) return null;
  let url = null;
  if (typeof v.url === "string" && v.url.length <= 1000) {
    try {
      const u = new URL(v.url);
      if (u.protocol === "https:" || u.protocol === "http:") url = u.href;
    } catch {
      /* lien invalide : le nom seul est gardé */
    }
  }
  return { name, url };
}

const strList = (v, max) =>
  (Array.isArray(v) ? v : []).map(str).filter(Boolean).slice(0, max);

/**
 * Nettoie une recette venant d'un fichier importé ou d'un formulaire de modification.
 * Renvoie une recette bien formée, ou null si elle n'est pas exploitable.
 */
export function sanitizeRecipe(raw) {
  if (!raw || typeof raw !== "object") return null;

  const ingredients = (Array.isArray(raw.ingredients) ? raw.ingredients : [])
    .slice(0, MAX_ITEMS)
    .map((i) => {
      if (!i || typeof i !== "object") return null;
      const name = str(i.name);
      if (!name) return null;
      const quantity = num(i.quantity);
      return {
        name,
        quantity,
        unit: str(i.unit),
        note: str(i.note),
        uncertain: i.uncertain === true || quantity === null,
      };
    })
    .filter(Boolean);

  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .slice(0, MAX_ITEMS)
    .map((s) => {
      if (typeof s === "string") {
        const text = str(s);
        return text ? { text, durationMin: null } : null;
      }
      if (!s || typeof s !== "object") return null;
      const text = str(s.text);
      return text ? { text, durationMin: num(s.durationMin) } : null;
    })
    .filter(Boolean);

  if (ingredients.length === 0 && steps.length === 0) return null;

  const category = str(raw.category);
  const source = cleanSource(raw.source);
  return {
    title: (str(raw.title) || "Recette sans titre").slice(0, 200),
    language: str(raw.language) || "fr",
    emoji: cleanEmoji(raw.emoji),
    themes: cleanThemes(raw.themes ?? raw.theme),
    category: category && CATEGORIES.includes(category) ? category : category ? "autre" : null,
    tags: [...new Set(strList(raw.tags, 12).map((t) => t.toLowerCase().slice(0, 30)))].slice(0, 6),
    servings: num(raw.servings) ? Math.round(num(raw.servings)) : null,
    prepTimeMin: num(raw.prepTimeMin),
    cookTimeMin: num(raw.cookTimeMin),
    ingredients,
    steps,
    tips: strList(raw.tips, 50),
    warnings: strList(raw.warnings, 50),
    ...(source ? { source } : {}),
  };
}
