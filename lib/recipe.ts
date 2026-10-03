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

export interface Recipe {
  title: string;
  language: string;
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
