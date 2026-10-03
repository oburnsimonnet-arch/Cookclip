import { legacyIdFor, savedIdFor, videoIdFrom, videoUrl } from "./js/ids.js";
import { formatQty } from "./js/format.js";
import { cacheKey, createStore } from "./js/store.js";
import { CATEGORIES, sanitizeRecipe } from "./js/sanitize.js";
import {
  buildExport,
  exportFileName,
  MAX_IMPORT_BYTES,
  mergeSaved,
  parseImport,
} from "./js/backup.js";
import { buildShoppingList, nameKey, shoppingLine } from "./js/shopping.js";
import { initCook } from "./js/cook.js";
import { createEditor } from "./js/edit.js";

const $ = (id) => document.getElementById(id);

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    // stockage bloqué (navigation privée stricte…) : l'application reste utilisable, sans mémoire
    return {
      getItem: () => null,
      setItem() {
        throw new Error("stockage indisponible");
      },
      removeItem() {},
    };
  }
}
const store = createStore(getStorage());

/* ---------- État ---------- */
let current = null; // fiche affichée : { recipe, baseServings, servings, videoId, cacheKey, savedId }
let previousView = "new"; // vue à retrouver avec « Retour »
let pending = null; // demande refusée faute de code d'accès, rejouée une fois le code saisi
let lastShopping = [];
const savedFilter = { q: "", cat: "" };
const selected = new Set(); // identifiants des fiches cochées pour la liste de courses

/* ---------- Petits utilitaires ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2800);
}

function setStatus(msg, isError = false) {
  const s = $("status");
  s.hidden = !msg;
  s.textContent = msg || "";
  s.classList.toggle("error", isError);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/* ---------- Vues ---------- */
const VIEW_IDS = { new: "view-new", recipe: "recipe", saved: "view-saved", shopping: "view-shopping" };

function visibleView() {
  return Object.keys(VIEW_IDS).find((name) => !$(VIEW_IDS[name]).hidden) || "new";
}

function showView(name) {
  for (const [key, id] of Object.entries(VIEW_IDS)) $(id).hidden = key !== name;
  if (name !== "recipe") {
    const tab = name === "new" ? "new" : "saved";
    $("tab-new").classList.toggle("active", tab === "new");
    $("tab-saved").classList.toggle("active", tab === "saved");
  }
  window.scrollTo({ top: 0 });
}

$("tab-new").addEventListener("click", () => showView("new"));
$("tab-saved").addEventListener("click", () => {
  renderSaved();
  showView("saved");
});
$("back").addEventListener("click", () => {
  if (previousView === "saved") renderSaved();
  showView(previousView);
});

/* ---------- Affichage d'une fiche ---------- */
function scaledQty(ing) {
  if (ing.quantity === null || ing.quantity === undefined || !current) return null;
  return (ing.quantity * current.servings) / current.baseServings;
}

function ingredientLabel(ing) {
  const q = scaledQty(ing);
  const parts = [];
  if (q !== null) parts.push(formatQty(q));
  if (ing.unit) parts.push(ing.unit);
  return { qty: parts.join(" "), name: ing.name };
}

function renderRecipe() {
  const { recipe } = current;
  $("r-title").textContent = recipe.title;

  const meta = [];
  if (recipe.prepTimeMin) meta.push(`Préparation ${recipe.prepTimeMin} min`);
  if (recipe.cookTimeMin) meta.push(`Cuisson ${recipe.cookTimeMin} min`);
  $("r-meta").textContent = meta.join(" · ");

  const tagBox = $("r-tags");
  tagBox.replaceChildren();
  [recipe.category, ...(recipe.tags || [])].filter(Boolean).forEach((t) => tagBox.append(el("span", "chip static", t)));
  tagBox.hidden = !tagBox.children.length;

  $("servings-value").textContent = current.servings;

  const warnBox = $("r-warnings");
  warnBox.replaceChildren();
  warnBox.hidden = !recipe.warnings.length;
  if (recipe.warnings.length) {
    const ul = el("ul");
    recipe.warnings.forEach((w) => ul.append(el("li", "", w)));
    warnBox.append(el("strong", "", "À vérifier"), ul);
  }

  const ul = $("r-ingredients");
  ul.replaceChildren();
  recipe.ingredients.forEach((ing, i) => {
    const li = el("li");
    const cb = el("input");
    cb.type = "checkbox";
    cb.id = "ing-" + i;
    cb.addEventListener("change", () => li.classList.toggle("done", cb.checked));

    const label = el("label", "plain");
    label.htmlFor = cb.id;
    const { qty, name } = ingredientLabel(ing);
    if (qty) label.append(el("span", "qty", qty + " "));
    label.append(document.createTextNode(name));
    if (ing.note || ing.uncertain) {
      label.append(el("span", "approx", " — " + (ing.note || "quantité non précisée")));
    }
    li.append(cb, label);
    ul.append(li);
  });

  const ol = $("r-steps");
  ol.replaceChildren();
  recipe.steps.forEach((s) => {
    const li = el("li", "", s.text);
    if (s.durationMin) li.append(el("span", "dur", ` (${s.durationMin} min)`));
    ol.append(li);
  });

  $("r-tips-wrap").hidden = !recipe.tips.length;
  const tips = $("r-tips");
  tips.replaceChildren();
  recipe.tips.forEach((t) => tips.append(el("li", "", t)));

  const sourceUrl = videoUrl(current.videoId);
  $("r-source").hidden = !sourceUrl;
  if (sourceUrl) $("r-source-link").href = sourceUrl;

  $("share").hidden = !navigator.share;
  $("refresh").hidden = !current.videoId;
  $("cook-start").hidden = !recipe.steps.length;
}

function savedIdForVideo(videoId) {
  if (!videoId) return null;
  const hit = store.loadSaved().find((r) => r.videoId === videoId);
  return hit ? hit.id : null;
}

function showRecipe(recipe, { servings = null, videoId = null, cacheKey: key = null, savedId = null } = {}) {
  const base = recipe.servings || 4;
  const view = visibleView();
  if (view !== "recipe") previousView = view === "shopping" ? "saved" : view;
  current = {
    recipe,
    baseServings: base,
    servings: servings || base,
    videoId,
    cacheKey: key,
    savedId: savedId || savedIdForVideo(videoId),
  };
  $("recipe-read").hidden = false;
  $("recipe-edit").hidden = true;
  renderRecipe();
  showView("recipe");
}

$("minus").addEventListener("click", () => {
  if (current.servings > 1) {
    current.servings -= 1;
    renderRecipe();
  }
});
$("plus").addEventListener("click", () => {
  current.servings += 1;
  renderRecipe();
});

/* ---------- Extraction (appel au serveur) ---------- */
async function extract(payload, { force = false } = {}) {
  const videoId = videoIdFrom(payload.url);
  const french = $("french").checked;
  const key = videoId ? cacheKey(videoId, french) : null;

  // Chaque extraction consomme du quota Gemini : on réutilise ce qu'on a déjà.
  if (key && !payload.transcript && !force) {
    const savedCopy = store.loadSaved().find((r) => r.videoId === videoId);
    const hit = store.cacheGet(key);
    if (savedCopy) {
      setStatus("");
      showRecipe(savedCopy.recipe, { servings: savedCopy.servings, videoId, savedId: savedCopy.id, cacheKey: key });
      toast("Fiche déjà enregistrée : aucun appel à Gemini");
      return;
    }
    if (hit) {
      setStatus("");
      showRecipe(hit.recipe, { videoId, cacheKey: key });
      toast("Recette déjà extraite : aucun appel à Gemini");
      return;
    }
  }

  const btn = $("go");
  btn.disabled = true;
  setStatus("Lecture de la vidéo et extraction de la recette… (jusqu'à une minute)");
  try {
    const code = store.getAccessCode();
    const res = await fetch("/api/recipe", {
      method: "POST",
      headers: { "content-type": "application/json", ...(code ? { "x-access-code": code } : {}) },
      body: JSON.stringify({ ...payload, french }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.status === 401 || data.code === "AUTH_REQUIRED") {
      pending = { payload, opts: { force } };
      if (code) store.setAccessCode("");
      $("access-form").hidden = false;
      $("access-code").value = "";
      $("access-code").focus();
      setStatus(code ? "Code incorrect. Réessaie." : "Code d'accès requis.", true);
      return;
    }
    if (!res.ok) {
      if (data.code === "VIDEO_UNREADABLE") $("manual").open = true;
      throw new Error(data.error || "Erreur " + res.status);
    }

    $("access-form").hidden = true;
    setStatus("");
    if (key) store.cachePut(key, data.recipe);
    showRecipe(data.recipe, { videoId, cacheKey: key });
  } catch (err) {
    setStatus(err.message || "Échec de la requête.", true);
  } finally {
    btn.disabled = false;
  }
}

$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  const transcript = $("transcript").value.trim();
  const url = $("url").value.trim();
  extract(transcript.length > 40 ? { transcript, url } : { url });
});

$("access-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("access-code").value.trim();
  if (!code) return;
  store.setAccessCode(code);
  $("access-form").hidden = true;
  setStatus("");
  if (pending) {
    const { payload, opts } = pending;
    pending = null;
    extract(payload, opts);
  }
});

// Nouvel appel à Gemini pour cette vidéo (si la recette extraite est fausse ou incomplète)
$("refresh").addEventListener("click", () => {
  if (!current || !current.videoId) return;
  showView("new");
  $("url").value = videoUrl(current.videoId);
  extract({ url: $("url").value }, { force: true });
});

$("french").checked = store.getSetting("french", true);
$("french").addEventListener("change", () => store.setSetting("french", $("french").checked));

/* ---------- Actions sur une fiche ---------- */
function shoppingText() {
  return current.recipe.ingredients
    .map((ing) => {
      const { qty, name } = ingredientLabel(ing);
      return "- " + [qty, name].filter(Boolean).join(" ");
    })
    .join("\n");
}

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    toast("Copie impossible sur cet appareil.");
  }
}

$("copy-list").addEventListener("click", () =>
  copyText(`${current.recipe.title} (${current.servings} portions)\n${shoppingText()}`, "Liste copiée"),
);

$("share").addEventListener("click", async () => {
  const link = videoUrl(current.videoId);
  try {
    await navigator.share({
      title: current.recipe.title,
      text:
        `${current.recipe.title}\n\n${shoppingText()}\n\n` +
        current.recipe.steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n") +
        (link ? `\n\nVidéo : ${link}` : ""),
    });
  } catch {
    /* annulé par l'utilisateur */
  }
});

function persist(list, message) {
  if (store.storeSaved(list)) toast(message);
  else toast("Stockage plein : exporte tes recettes puis supprime-en.");
}

$("save").addEventListener("click", () => {
  const list = store.loadSaved();
  const existing = list.find(
    (r) =>
      (current.savedId && r.id === current.savedId) ||
      (current.videoId && r.videoId === current.videoId) ||
      r.id === legacyIdFor(current.recipe),
  );
  if (existing) {
    current.savedId = existing.id;
    const same =
      JSON.stringify(existing.recipe) === JSON.stringify(current.recipe) &&
      existing.servings === current.servings &&
      (existing.videoId || null) === (current.videoId || null);
    if (same) return toast("Déjà enregistrée");
    existing.recipe = current.recipe;
    existing.servings = current.servings;
    existing.videoId = current.videoId || existing.videoId || null;
    return persist(list, "Fiche mise à jour");
  }
  const id = savedIdFor(current.recipe, current.videoId);
  list.unshift({
    id,
    savedAt: Date.now(),
    recipe: current.recipe,
    servings: current.servings,
    videoId: current.videoId || null,
  });
  current.savedId = id;
  persist(list, "Recette enregistrée");
});

/* ---------- Modification à la main ---------- */
const editor = createEditor($("recipe-edit"), {
  onSubmit(raw) {
    const recipe = sanitizeRecipe(raw);
    if (!recipe) return editor.showError("Il faut au moins un ingrédient ou une étape.");

    current.recipe = recipe;
    current.baseServings = recipe.servings || 4;
    current.servings = current.baseServings;

    // la version corrigée remplace l'ancienne dans la mémoire des extractions…
    if (current.cacheKey) store.cachePut(current.cacheKey, recipe);
    // …et dans les recettes enregistrées si la fiche l'est déjà
    let message = "Modifications appliquées. Pense à enregistrer.";
    if (current.savedId) {
      const list = store.loadSaved();
      const item = list.find((r) => r.id === current.savedId);
      if (item) {
        item.recipe = recipe;
        item.servings = current.servings;
        persist(list, "Fiche mise à jour");
        message = null;
      }
    }
    if (message) toast(message);

    $("recipe-edit").hidden = true;
    $("recipe-read").hidden = false;
    renderRecipe();
    window.scrollTo({ top: 0 });
  },
  onCancel() {
    $("recipe-edit").hidden = true;
    $("recipe-read").hidden = false;
  },
});

$("edit").addEventListener("click", () => {
  $("recipe-read").hidden = true;
  $("recipe-edit").hidden = false;
  editor.open(current.recipe);
  window.scrollTo({ top: 0 });
});

/* ---------- Mode cuisine ---------- */
const cook = initCook({ getCurrent: () => current, ingredientLabel });
$("cook-start").addEventListener("click", () => {
  if (!cook.open()) toast("Cette fiche n'a pas d'étapes.");
});

/* ---------- Recettes enregistrées : liste, recherche, filtre ---------- */
function matchesFilter(item) {
  const r = item.recipe;
  if (savedFilter.cat && (r.category || "autre") !== savedFilter.cat) return false;
  const words = nameKey(savedFilter.q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = nameKey(
    [r.title, r.category, ...(r.tags || []), ...r.ingredients.map((i) => i.name)].filter(Boolean).join(" "),
  );
  return words.every((w) => haystack.includes(w));
}

function renderChips(all) {
  const box = $("cat-filters");
  box.replaceChildren();
  const counts = new Map();
  all.forEach((item) => {
    const c = item.recipe.category || "autre";
    counts.set(c, (counts.get(c) || 0) + 1);
  });
  if (savedFilter.cat && !counts.has(savedFilter.cat)) savedFilter.cat = "";
  if (counts.size < 2) return; // inutile de filtrer quand tout est dans la même catégorie

  const make = (label, value, count) => {
    const b = el("button", "chip", `${label} (${count})`);
    b.type = "button";
    b.setAttribute("aria-pressed", String(savedFilter.cat === value));
    b.addEventListener("click", () => {
      savedFilter.cat = value;
      renderSaved();
    });
    box.append(b);
  };
  make("Toutes", "", all.length);
  CATEGORIES.filter((c) => counts.has(c)).forEach((c) => make(c, c, counts.get(c)));
}

function renderSaved() {
  const all = store.loadSaved();
  $("saved-empty").hidden = all.length > 0;
  document.querySelector(".toolbar").hidden = all.length === 0;
  renderChips(all);

  const shown = all.filter(matchesFilter);
  $("saved-none").hidden = !(all.length > 0 && shown.length === 0);

  const ul = $("saved-list");
  ul.replaceChildren();
  shown.forEach((item) => {
    const li = el("li");

    const cb = el("input");
    cb.type = "checkbox";
    cb.className = "sel";
    cb.checked = selected.has(item.id);
    cb.setAttribute("aria-label", `Ajouter « ${item.recipe.title} » à la liste de courses`);
    cb.addEventListener("change", () => {
      if (cb.checked) selected.add(item.id);
      else selected.delete(item.id);
      updateMakeList();
    });

    const open = el("button", "open");
    open.type = "button";
    open.append(el("span", "open-title", item.recipe.title));
    const meta = [
      item.recipe.category,
      `${item.recipe.ingredients.length} ingrédient${item.recipe.ingredients.length > 1 ? "s" : ""}`,
      item.servings ? `${item.servings} portions` : null,
    ].filter(Boolean);
    open.append(el("small", "open-meta", meta.join(" · ")));
    open.addEventListener("click", () =>
      showRecipe(item.recipe, { servings: item.servings, videoId: item.videoId || null, savedId: item.id }),
    );

    const del = el("button", "del", "Supprimer");
    del.type = "button";
    del.addEventListener("click", () => {
      if (!window.confirm(`Supprimer « ${item.recipe.title} » ?`)) return;
      selected.delete(item.id);
      store.storeSaved(store.loadSaved().filter((r) => r.id !== item.id));
      renderSaved();
    });

    li.append(cb, open, del);
    ul.append(li);
  });

  // seules les fiches existantes peuvent rester cochées
  const ids = new Set(all.map((r) => r.id));
  [...selected].forEach((id) => !ids.has(id) && selected.delete(id));
  updateMakeList();

  const last = store.getSetting("lastExport", null);
  $("last-export").textContent = last
    ? "Dernière sauvegarde : " + new Date(last).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : all.length
      ? "Tu n'as encore jamais exporté tes recettes."
      : "";
}

function updateMakeList() {
  const n = selected.size;
  $("make-list").disabled = n === 0;
  $("make-list").textContent = n ? `Liste de courses (${n})` : "Liste de courses";
}

$("search").addEventListener("input", () => {
  savedFilter.q = $("search").value;
  renderSaved();
});

/* ---------- Liste de courses groupée ---------- */
$("make-list").addEventListener("click", () => {
  const chosen = store.loadSaved().filter((r) => selected.has(r.id));
  if (!chosen.length) return;
  lastShopping = buildShoppingList(chosen.map((r) => ({ recipe: r.recipe, servings: r.servings })));

  $("shopping-from").textContent = chosen
    .map((r) => `${r.recipe.title} (${r.servings || r.recipe.servings || 4} portions)`)
    .join(" · ");

  const ul = $("shopping-list");
  ul.replaceChildren();
  lastShopping.forEach((line, i) => {
    const li = el("li");
    const cb = el("input");
    cb.type = "checkbox";
    cb.id = "shop-" + i;
    cb.addEventListener("change", () => li.classList.toggle("done", cb.checked));
    const label = el("label", "plain", shoppingLine(line));
    label.htmlFor = cb.id;
    if (chosen.length > 1) label.append(el("span", "approx", " — " + line.from.join(", ")));
    li.append(cb, label);
    ul.append(li);
  });
  showView("shopping");
});

$("shopping-back").addEventListener("click", () => {
  renderSaved();
  showView("saved");
});
$("shopping-copy").addEventListener("click", () =>
  copyText(lastShopping.map((l) => "- " + shoppingLine(l)).join("\n"), "Liste copiée"),
);

/* ---------- Sauvegarde : export / import ---------- */
$("export").addEventListener("click", () => {
  const saved = store.loadSaved();
  if (!saved.length) return toast("Aucune recette à exporter.");
  const blob = new Blob([JSON.stringify(buildExport(saved), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName();
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  store.setSetting("lastExport", Date.now());
  renderSaved();
  toast(`${saved.length} recette${saved.length > 1 ? "s" : ""} exportée${saved.length > 1 ? "s" : ""}`);
});

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Lecture du fichier impossible."));
    reader.readAsText(file);
  });
}

$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async () => {
  const input = $("import-file");
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error("Fichier trop volumineux (5 Mo maximum).");
    const { items, rejected } = parseImport(await readText(file));
    const { list, added, updated } = mergeSaved(store.loadSaved(), items);
    if (!store.storeSaved(list)) throw new Error("Stockage plein : impossible d'importer.");
    renderSaved();
    const parts = [`${added} ajoutée${added > 1 ? "s" : ""}`];
    if (updated) parts.push(`${updated} mise${updated > 1 ? "s" : ""} à jour`);
    if (rejected) parts.push(`${rejected} ignorée${rejected > 1 ? "s" : ""}`);
    toast("Import : " + parts.join(", "));
  } catch (err) {
    toast(err.message || "Import impossible.");
  } finally {
    input.value = ""; // permet de réimporter le même fichier
  }
});

/* ---------- Partage Android (share_target) ---------- */
(function handleShare() {
  const params = new URLSearchParams(location.search);
  const shared = params.get("url") || params.get("text") || "";
  const match = shared.match(/https?:\/\/\S+/);
  if (match) {
    $("url").value = match[0];
    history.replaceState(null, "", "/");
    extract({ url: match[0] });
  }
})();

/* ---------- Service worker ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
