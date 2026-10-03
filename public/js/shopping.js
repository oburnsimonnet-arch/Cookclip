import { formatNumber, formatQty } from "./format.js";

const UNIT_ALIASES = {
  g: "g", gr: "g", gramme: "g", grammes: "g",
  kg: "kg", kilo: "kg", kilos: "kg",
  ml: "ml", millilitre: "ml", millilitres: "ml",
  cl: "cl", centilitre: "cl", centilitres: "cl",
  dl: "dl", décilitre: "dl", décilitres: "dl",
  l: "l", litre: "l", litres: "l",
  "c. à soupe": "c. à soupe", "c à soupe": "c. à soupe", cas: "c. à soupe",
  "cuillère à soupe": "c. à soupe", "cuillères à soupe": "c. à soupe", "c.à.s": "c. à soupe",
  "c. à s.": "c. à soupe", "c. à s": "c. à soupe", tbsp: "c. à soupe",
  "c. à café": "c. à café", "c à café": "c. à café", cac: "c. à café",
  "cuillère à café": "c. à café", "cuillères à café": "c. à café", "c.à.c": "c. à café",
  "c. à c.": "c. à café", "c. à c": "c. à café", tsp: "c. à café",
  pincée: "pincée", pincées: "pincée",
  gousse: "gousse", gousses: "gousse",
};

const MASS = { g: 1, kg: 1000 };
const VOLUME = { ml: 1, cl: 10, dl: 100, l: 1000 };

function normalizeUnit(unit) {
  const u = (unit || "").trim().toLowerCase();
  return UNIT_ALIASES[u] ?? u;
}

/** Ramène les unités de masse en g et de volume en ml pour pouvoir additionner. */
function toBase(unit) {
  if (unit in MASS) return { base: "g", factor: MASS[unit] };
  if (unit in VOLUME) return { base: "ml", factor: VOLUME[unit] };
  return { base: unit, factor: 1 };
}

/** « Œufs » et « oeuf » -> même clé ; accents, majuscules et pluriels simples ignorés. */
export function nameKey(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w))
    .join(" ");
}

/**
 * Regroupe les ingrédients de plusieurs recettes en une seule liste de courses.
 * Chaque entrée : { recipe, servings } ; les quantités sont proportionnelles aux portions voulues.
 * @returns {{ name: string, quantity: number|null, unit: string, extra: boolean, from: string[] }[]}
 */
export function buildShoppingList(entries) {
  const map = new Map();
  for (const { recipe, servings } of entries) {
    const baseServings = recipe.servings || 4;
    const ratio = (servings || baseServings) / baseServings;
    for (const ing of recipe.ingredients) {
      const unit = normalizeUnit(ing.unit);
      const { base, factor } = toBase(unit);
      const key = nameKey(ing.name) + "|" + base;
      let line = map.get(key);
      if (!line) {
        line = { name: ing.name, quantity: null, unit: base, extra: false, from: [] };
        map.set(key, line);
      }
      if (ing.quantity === null || ing.quantity === undefined) {
        line.extra = true;
      } else {
        line.quantity = (line.quantity ?? 0) + ing.quantity * ratio * factor;
      }
      if (!line.from.includes(recipe.title)) line.from.push(recipe.title);
    }
  }

  const list = [...map.values()].map((line) => {
    // 1500 g -> 1,5 kg ; 2000 ml -> 2 l
    if (line.quantity !== null && line.unit === "g" && line.quantity >= 1000) {
      return { ...line, quantity: line.quantity / 1000, unit: "kg" };
    }
    if (line.quantity !== null && line.unit === "ml" && line.quantity >= 1000) {
      return { ...line, quantity: line.quantity / 1000, unit: "l" };
    }
    return line;
  });
  return list.sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name), "fr"));
}

/** Ligne affichable : « 750 g farine », « 3 œufs + un peu », « sel (quantité libre) ». */
export function shoppingLine(line) {
  if (line.quantity === null) return `${line.name} (quantité libre)`;
  const qty = line.unit === "kg" || line.unit === "l" ? formatNumber(line.quantity) : formatQty(line.quantity);
  const parts = [qty, line.unit, line.name].filter(Boolean);
  return parts.join(" ") + (line.extra ? " + un peu" : "");
}
