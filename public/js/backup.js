import { ID_RE, savedIdFor } from "./ids.js";
import { sanitizeRecipe } from "./sanitize.js";

export const MAX_IMPORT_ITEMS = 500;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Contenu du fichier d'export : toutes les recettes enregistrées sur l'appareil. */
export function buildExport(saved, now = new Date()) {
  return { app: "cookclip", version: 1, exportedAt: now.toISOString(), recipes: saved };
}

export function exportFileName(now = new Date()) {
  return `cookclip-recettes-${now.toISOString().slice(0, 10)}.json`;
}

/**
 * Lit un fichier d'export (ou une simple liste de fiches) et en ressort des fiches propres.
 * Tout ce qui est illisible est écarté plutôt que de risquer de corrompre les recettes existantes.
 * @returns {{ items: any[], rejected: number }}
 */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Fichier illisible : ce n'est pas un export Cookclip.");
  }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.recipes) ? data.recipes : null;
  if (!list) throw new Error("Fichier non reconnu : aucune recette trouvée.");

  const items = [];
  let rejected = Math.max(0, list.length - MAX_IMPORT_ITEMS);
  for (const raw of list.slice(0, MAX_IMPORT_ITEMS)) {
    const recipe = sanitizeRecipe(raw && raw.recipe);
    if (!recipe) {
      rejected++;
      continue;
    }
    const videoId = typeof raw.videoId === "string" && ID_RE.test(raw.videoId) ? raw.videoId : null;
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 200)
        : savedIdFor(recipe, videoId);
    const servings = Number.isFinite(raw.servings) && raw.servings > 0 ? Math.round(raw.servings) : null;
    const savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now();
    items.push({ id, savedAt, recipe, servings, videoId });
  }
  return { items, rejected };
}

/**
 * Fusionne des fiches importées avec celles de l'appareil, sans doublon :
 * à identifiant égal, la plus récente est conservée.
 */
export function mergeSaved(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const current = byId.get(item.id);
    if (!current) {
      byId.set(item.id, item);
      added++;
    } else if ((item.savedAt || 0) > (current.savedAt || 0)) {
      byId.set(item.id, item);
      updated++;
    }
  }
  const list = [...byId.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return { list, added, updated };
}
