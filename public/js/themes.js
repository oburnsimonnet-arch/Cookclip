/**
 * Thématiques : classement des recettes par cuisine d'origine ou par style.
 * - La liste fixe est la même que côté serveur (lib/recipe.ts) : c'est Gemini qui en propose 1 ou 2.
 * - L'utilisateur peut aussi créer les siennes (« Repas de Noël ») : ce sont des textes libres.
 */

/** colors : trois couleurs du dégradé de la carte (même principe que le projet de référence) */
export const THEMES = [
  { key: "france", label: "Cuisine française", short: "France", emoji: "🥖", aliases: ["francais", "francaise"], colors: ["#f87171", "#e11d48", "#be123c"] },
  { key: "italie", label: "Cuisine italienne", short: "Italie", emoji: "🍝", aliases: ["italien", "italienne"], colors: ["#ef4444", "#fb923c", "#facc15"] },
  { key: "reunion", label: "Cuisine réunionnaise", short: "Réunion", emoji: "🌺", aliases: ["reunionnaise", "creole", "ile de la reunion"], colors: ["#fb923c", "#ef4444", "#e11d48"] },
  { key: "asie", label: "Saveurs d'Asie", short: "Asie", emoji: "🍜", aliases: ["asiatique", "asie"], colors: ["#fb7185", "#ec4899", "#c026d3"] },
  { key: "orient", label: "Orient et Maghreb", short: "Orient", emoji: "🥙", aliases: ["maghreb", "moyen orient", "orient et maghreb"], colors: ["#fbbf24", "#f97316", "#dc2626"] },
  { key: "ameriques", label: "Amériques", short: "Amériques", emoji: "🌮", aliases: ["amerique", "mexicain", "tex mex", "americain"], colors: ["#a3e635", "#facc15", "#f97316"] },
  { key: "rapide", label: "Plat rapide du soir", short: "Rapide", emoji: "⏱️", aliases: ["plat rapide", "express"], colors: ["#facc15", "#f59e0b", "#f97316"] },
  { key: "leger", label: "Léger et healthy", short: "Léger", emoji: "🥗", aliases: ["healthy", "light", "leger et healthy"], colors: ["#a3e635", "#22c55e", "#10b981"] },
  { key: "vegetarien", label: "Végétarien", short: "Végé", emoji: "🥦", aliases: ["vegetarienne", "vegetal", "vegan", "vege"], colors: ["#22c55e", "#10b981", "#14b8a6"] },
  { key: "fetes", label: "Fêtes et apéro", short: "Fêtes", emoji: "🎉", aliases: ["fete", "apero", "aperitif", "fetes et apero"], colors: ["#d946ef", "#a855f7", "#6366f1"] },
  { key: "gourmandises", label: "Douceurs et pâtisserie", short: "Douceurs", emoji: "🍰", aliases: ["dessert", "desserts", "patisserie", "douceurs", "douceurs et patisserie"], colors: ["#f472b6", "#fb7185", "#fbbf24"] },
  { key: "reconfort", label: "Plats mijotés", short: "Mijotés", emoji: "🍲", aliases: ["mijote", "mijotes", "reconfort", "plats mijotes", "soupe"], colors: ["#f97316", "#dc2626", "#9f1239"] },
  { key: "monde", label: "Les incontournables du monde", short: "Monde", emoji: "🌍", aliases: ["incontournables", "international"], colors: ["#facc15", "#f97316", "#ef4444"] },
];

/** Une recette peut avoir jusqu'à 3 thématiques (le serveur en propose 2 au plus). */
export const MAX_THEMES = 3;
export const MAX_THEME_LENGTH = 30;

/** Clé réservée au regroupement « Non classées » (recettes sans thématique). */
export const NO_THEME = "__none";

const BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

/** Minuscules, sans accents ni ponctuation : « Cuisine Réunionnaise ! » -> « cuisine reunionnaise ». */
export function normText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Clé d'une thématique connue depuis une clé, un libellé ou un alias ; sinon null. */
export function themeKeyFrom(value) {
  if (typeof value !== "string") return null;
  const n = normText(value);
  if (!n) return null;
  for (const t of THEMES) {
    if (n === t.key || n === normText(t.label) || n === normText(t.short) || t.aliases.includes(n)) {
      return t.key;
    }
  }
  return null;
}

/**
 * Forme canonique d'une thématique : la clé si elle est connue, sinon le texte saisi nettoyé
 * (espaces réduits, 30 caractères au plus). Renvoie null si rien d'exploitable.
 */
export function canonicalTheme(value) {
  if (typeof value !== "string") return null;
  const known = themeKeyFrom(value);
  if (known) return known;
  const text = value.replace(/\s+/g, " ").trim().slice(0, MAX_THEME_LENGTH).trim();
  if (!normText(text) || normText(text) === normText(NO_THEME)) return null;
  return text;
}

/** Liste de thématiques propre : formes canoniques, sans doublon (accents et casse ignorés), bornée. */
export function cleanThemes(list, max = MAX_THEMES) {
  const source = Array.isArray(list) ? list : typeof list === "string" ? [list] : [];
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const t = canonicalTheme(item);
    if (!t) continue;
    const id = normText(t);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function gradientCss(colors) {
  return `linear-gradient(135deg, ${colors[0]}, ${colors[1]} 55%, ${colors[2]})`;
}

/** Dégradé stable pour une thématique personnalisée (même nom -> même couleur). */
function customColors(name) {
  let hash = 0;
  for (const ch of normText(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return [`hsl(${hue} 90% 60%)`, `hsl(${(hue + 28) % 360} 85% 54%)`, `hsl(${(hue + 55) % 360} 80% 48%)`];
}

/** Tout ce qu'il faut pour afficher une thématique (connue, personnalisée ou « non classées »). */
export function themeInfo(key) {
  if (key === NO_THEME) {
    return {
      key,
      label: "Non classées",
      short: "Non classées",
      emoji: "🍴",
      colors: ["#d6d3d1", "#a8a29e", "#78716c"],
      gradient: gradientCss(["#d6d3d1", "#a8a29e", "#78716c"]),
      custom: false,
      none: true,
    };
  }
  const known = BY_KEY.get(key);
  if (known) {
    return { key, label: known.label, short: known.short, emoji: known.emoji, colors: known.colors, gradient: gradientCss(known.colors), custom: false, none: false };
  }
  const colors = customColors(key);
  return { key, label: key, short: key, emoji: "🍴", colors, gradient: gradientCss(colors), custom: true, none: false };
}

export function recipeThemes(recipe) {
  return cleanThemes(recipe && recipe.themes);
}

/** Infos de la première thématique de la recette (celle qui colore sa carte), ou « non classées ». */
export function primaryTheme(recipe) {
  const [first] = recipeThemes(recipe);
  return themeInfo(first ?? NO_THEME);
}

/** Emoji de la carte : celui du plat si on le connaît, sinon celui de la thématique. */
export function recipeEmoji(recipe) {
  return (recipe && recipe.emoji) || primaryTheme(recipe).emoji;
}

/** key vide = toutes les recettes ; NO_THEME = celles sans thématique. */
export function matchesTheme(recipe, key) {
  if (!key) return true;
  const themes = recipeThemes(recipe);
  if (key === NO_THEME) return themes.length === 0;
  const id = normText(key);
  return themes.some((t) => normText(t) === id);
}

/**
 * Thématiques présentes dans les recettes enregistrées, avec leur effectif.
 * Ordre : celles de la liste fixe, puis les personnalisées (alphabétique), puis « non classées ».
 */
export function themeCounts(saved) {
  const counts = new Map();
  let none = 0;
  for (const item of saved) {
    const themes = recipeThemes(item.recipe);
    if (!themes.length) none++;
    for (const t of themes) counts.set(t, (counts.get(t) || 0) + 1);
  }
  const known = THEMES.filter((t) => counts.has(t.key)).map((t) => t.key);
  const custom = [...counts.keys()]
    .filter((k) => !BY_KEY.has(k))
    .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
  const list = [...known, ...custom].map((key) => ({ info: themeInfo(key), count: counts.get(key) }));
  if (none) list.push({ info: themeInfo(NO_THEME), count: none });
  return list;
}
