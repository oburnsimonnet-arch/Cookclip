export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  /** true quand la quantité est devinée, approximative ou absente de la source */
  uncertain: boolean;
}

export interface Step {
  text: string;
  durationMin: number | null;
}

/** Catégories proposées pour ranger les recettes (même liste côté application). */
export const CATEGORIES = [
  "entrée",
  "plat",
  "dessert",
  "boisson",
  "apéritif",
  "sauce",
  "pain et pâtisserie",
  "autre",
] as const;

export interface ThemeDef {
  key: string;
  label: string;
  short: string;
  emoji: string;
  /** Aide donnée à Gemini pour choisir la thématique. */
  hint: string;
  /** Autres écritures acceptées quand le modèle ne renvoie pas exactement la clé. */
  aliases: string[];
}

/**
 * Thématiques proposées pour ranger les recettes (même liste côté application : public/js/themes.js,
 * vérifiée par un test). Une recette en a 1 ou 2 : d'abord la cuisine d'origine, puis un style.
 */
export const THEMES: ThemeDef[] = [
  { key: "france", label: "Cuisine française", short: "France", emoji: "🥖", hint: "cuisine française, bistrot, terroir", aliases: ["francais", "francaise"] },
  { key: "italie", label: "Cuisine italienne", short: "Italie", emoji: "🍝", hint: "pâtes, pizza, risotto, cuisine italienne", aliases: ["italien", "italienne"] },
  { key: "reunion", label: "Cuisine réunionnaise", short: "Réunion", emoji: "🌺", hint: "cuisine réunionnaise, créole, océan Indien et outre-mer (rougail, cari, massalé)", aliases: ["reunionnaise", "creole", "ile de la reunion"] },
  { key: "asie", label: "Saveurs d'Asie", short: "Asie", emoji: "🍜", hint: "Chine, Japon, Corée, Thaïlande, Vietnam, Inde, wok, nouilles, curry", aliases: ["asiatique", "asie"] },
  { key: "orient", label: "Orient et Maghreb", short: "Orient", emoji: "🥙", hint: "Maghreb, Moyen-Orient, Méditerranée de l'est (tajine, couscous, mezzé)", aliases: ["maghreb", "moyen orient", "orient et maghreb"] },
  { key: "ameriques", label: "Amériques", short: "Amériques", emoji: "🌮", hint: "Mexique, Amérique latine, États-Unis, Caraïbes", aliases: ["amerique", "mexicain", "tex mex", "americain"] },
  { key: "rapide", label: "Plat rapide du soir", short: "Rapide", emoji: "⏱️", hint: "prêt en 30 minutes ou moins, très simple", aliases: ["plat rapide", "express"] },
  { key: "leger", label: "Léger et healthy", short: "Léger", emoji: "🥗", hint: "salades, plats légers, peu gras, équilibrés", aliases: ["healthy", "light", "leger et healthy"] },
  { key: "vegetarien", label: "Végétarien", short: "Végé", emoji: "🥦", hint: "sans viande ni poisson", aliases: ["vegetarienne", "vegetal", "vegan", "vege"] },
  { key: "fetes", label: "Fêtes et apéro", short: "Fêtes", emoji: "🎉", hint: "repas de fête, apéritif, buffet, à partager", aliases: ["fete", "apero", "aperitif", "fetes et apero"] },
  { key: "gourmandises", label: "Douceurs et pâtisserie", short: "Douceurs", emoji: "🍰", hint: "desserts, gâteaux, pâtisserie, goûter", aliases: ["dessert", "desserts", "patisserie", "douceurs", "douceurs et patisserie"] },
  { key: "reconfort", label: "Plats mijotés", short: "Mijotés", emoji: "🍲", hint: "plats mijotés, soupes, gratins, réconfort", aliases: ["mijote", "mijotes", "reconfort", "plats mijotes", "soupe"] },
  { key: "monde", label: "Les incontournables du monde", short: "Monde", emoji: "🌍", hint: "classique international ou origine incertaine", aliases: ["incontournables", "international"] },
];

/** Minuscules, sans accents ni ponctuation : « Cuisine Réunionnaise ! » -> « cuisine reunionnaise ». */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Retrouve la clé d'une thématique connue depuis une clé, un libellé ou un alias ; sinon null. */
export function themeKeyFrom(value: unknown): string | null {
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

/** 0 à 2 thématiques connues, sans doublon ; tout ce qui est inconnu est écarté. */
export function normalizeThemes(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const keys: string[] = [];
  for (const item of list) {
    const key = themeKeyFrom(item);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys.slice(0, 2);
}

// Un seul emoji (éventuellement composé : drapeau, teinte, séquence avec liant invisible)
const EMOJI_RE =
  /^\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?(?:‍\p{Extended_Pictographic}️?[\u{1F3FB}-\u{1F3FF}]?)*$/u;

export function cleanEmoji(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= 16 && EMOJI_RE.test(s) ? s : null;
}

export interface Recipe {
  title: string;
  language: string;
  /** Emoji qui représente le plat (affiché sur la carte) */
  emoji: string | null;
  /** Clés de thématiques (voir THEMES), 2 au maximum côté serveur */
  themes: string[];
  category: string | null;
  /** Mots-clés courts (régime, rapidité, matériel…), 6 au maximum */
  tags: string[];
  servings: number | null;
  prepTimeMin: number | null;
  cookTimeMin: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  tips: string[];
  /** Remarques sur la fiabilité de l'extraction (quantités manquantes, etc.) */
  warnings: string[];
}

/** Ramène la catégorie proposée par le modèle à l'une des catégories connues. */
export function normalizeCategory(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!s) return null;
  if (/^entr[ée]e/.test(s)) return "entrée";
  if (/^plat/.test(s)) return "plat";
  if (/^dessert|^g[âa]teau/.test(s)) return "dessert";
  if (/^boisson|^cocktail/.test(s)) return "boisson";
  if (/^ap[ée]ro/.test(s)) return "apéritif";
  if (/^sauce|^condiment/.test(s)) return "sauce";
  if (/^pain|p[âa]tisserie|viennoiserie/.test(s)) return "pain et pâtisserie";
  return "autre";
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
};

/** Extrait le premier objet JSON d'un texte (le modèle peut entourer de ```json). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Aucun JSON trouvé dans la réponse du modèle.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Valide et normalise la sortie du modèle. Lève une erreur si ce n'est pas une recette exploitable. */
export function normalizeRecipe(raw: unknown): Recipe {
  if (!raw || typeof raw !== "object") {
    throw new Error("Réponse du modèle invalide.");
  }
  const r = raw as Record<string, unknown>;

  if (r.isRecipe === false) {
    throw new Error("Cette vidéo ne semble pas contenir de recette.");
  }

  const ingredients: Ingredient[] = (Array.isArray(r.ingredients) ? r.ingredients : [])
    .map((i): Ingredient | null => {
      if (!i || typeof i !== "object") return null;
      const o = i as Record<string, unknown>;
      const name = str(o.name);
      if (!name) return null;
      const quantity = num(o.quantity);
      return {
        name,
        quantity,
        unit: str(o.unit),
        note: str(o.note),
        uncertain: o.uncertain === true || quantity === null,
      };
    })
    .filter((i): i is Ingredient => i !== null);

  const steps: Step[] = (Array.isArray(r.steps) ? r.steps : [])
    .map((s): Step | null => {
      if (typeof s === "string") {
        const text = str(s);
        return text ? { text, durationMin: null } : null;
      }
      if (!s || typeof s !== "object") return null;
      const o = s as Record<string, unknown>;
      const text = str(o.text);
      return text ? { text, durationMin: num(o.durationMin) } : null;
    })
    .filter((s): s is Step => s !== null);

  if (ingredients.length === 0 && steps.length === 0) {
    throw new Error("Aucune recette exploitable n'a pu être extraite.");
  }

  const strList = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).map(str).filter((x): x is string => x !== null);

  const tags = [
    ...new Set(strList(r.tags).map((t) => t.toLowerCase().slice(0, 30))),
  ].slice(0, 6);

  return {
    title: str(r.title) ?? "Recette sans titre",
    language: str(r.language) ?? "fr",
    emoji: cleanEmoji(r.emoji),
    themes: normalizeThemes(r.themes ?? r.theme),
    category: normalizeCategory(r.category),
    tags,
    servings: num(r.servings),
    prepTimeMin: num(r.prepTimeMin),
    cookTimeMin: num(r.cookTimeMin),
    ingredients,
    steps,
    tips: strList(r.tips),
    warnings: strList(r.warnings),
  };
}
