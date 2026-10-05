import { legacyIdFor, savedIdFor, videoIdFrom, videoUrl } from "./js/ids.js";
import { formatQty } from "./js/format.js";
import { cacheKey, createStore } from "./js/store.js";
import { sanitizeRecipe } from "./js/sanitize.js";
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
import { h } from "./js/dom.js";
import { hydrateIcons, icon } from "./js/icons.js";
import { NO_THEME, matchesTheme, primaryTheme, recipeEmoji, recipeThemes, themeCounts, themeInfo } from "./js/themes.js";
import { chip, formatDuration, heroCard, recipeRow, thumb, themeTile } from "./js/ui.js";
import { createThemePicker } from "./js/picker.js";

const $ = (id) => document.getElementById(id);
hydrateIcons();

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
let previousScreen = "home"; // écran à retrouver avec « Retour »
let pending = null; // demande refusée faute de code d'accès, rejouée une fois le code saisi
let lastShopping = [];
let openedTheme = ""; // thématique affichée dans l'écran « theme »
const homeFilter = { q: "", theme: "" };
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

/* ---------- Écrans ---------- */
const SCREENS = {
  home: { id: "view-home", tab: "tab-home" },
  themes: { id: "view-themes", tab: "tab-themes" },
  theme: { id: "view-theme", tab: "tab-themes" },
  shopping: { id: "view-shopping", tab: "tab-shopping" },
  more: { id: "view-more", tab: "tab-more" },
  recipe: { id: "recipe", tab: null },
};

function visibleScreen() {
  return Object.keys(SCREENS).find((name) => !$(SCREENS[name].id).hidden) || "home";
}

function showScreen(name) {
  for (const [key, s] of Object.entries(SCREENS)) $(s.id).hidden = key !== name;
  for (const id of ["tab-home", "tab-themes", "tab-shopping", "tab-more"]) {
    const on = SCREENS[name].tab === id;
    if (on) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  }
  $("bottom-nav").hidden = name === "recipe";
  window.scrollTo({ top: 0 });
}

/** Affiche un écran en recalculant son contenu. */
function goto(name) {
  if (name === "home") renderHome();
  else if (name === "themes") renderThemes();
  else if (name === "theme") renderTheme();
  else if (name === "shopping") renderShopPick();
  else if (name === "more") renderMore();
  showScreen(name);
}

$("tab-home").addEventListener("click", () => goto("home"));
$("tab-themes").addEventListener("click", () => goto("themes"));
$("tab-shopping").addEventListener("click", () => goto("shopping"));
$("tab-more").addEventListener("click", () => goto("more"));
$("back").addEventListener("click", () => goto(previousScreen));

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

/** Les thématiques choisies sur la fiche s'appliquent tout de suite (et sont enregistrées). */
const picker = createThemePicker({
  idPrefix: "c",
  onChange(themes) {
    if (!current) return;
    current.recipe = { ...current.recipe, themes };
    if (current.cacheKey) store.cachePut(current.cacheKey, current.recipe);
    if (current.savedId) {
      const list = store.loadSaved();
      const item = list.find((r) => r.id === current.savedId);
      if (item) {
        item.recipe = current.recipe;
        persist(list, themes.length ? "Thématiques enregistrées" : "Thématiques retirées");
      }
    }
    renderRecipe({ keepPicker: true });
  },
});
$("r-picker").append(picker.element);

function renderRecipe({ keepPicker = false } = {}) {
  const { recipe } = current;
  if (!keepPicker) {
    picker.set(recipe.themes);
    $("r-classify").open = recipeThemes(recipe).length === 0;
  }
  $("r-classify-title").textContent = recipeThemes(recipe).length ? "Modifier les thématiques" : "Classer cette recette";
  const theme = primaryTheme(recipe);
  $("r-hero").style.background = theme.gradient;
  $("r-emoji").textContent = recipeEmoji(recipe);
  $("r-title").textContent = recipe.title;

  const themeBox = $("r-themes");
  themeBox.replaceChildren(...recipeThemes(recipe).map((t) => h("span", { class: "chip static", text: themeInfo(t).emoji + " " + themeInfo(t).label })));
  themeBox.hidden = !themeBox.children.length;

  const tagBox = $("r-tags");
  tagBox.replaceChildren(...[recipe.category, ...(recipe.tags || [])].filter(Boolean).map((t) => h("span", { class: "chip static", text: t })));
  tagBox.hidden = !tagBox.children.length;

  const stat = (iconName, value, label) =>
    h("div", { class: "stat" }, icon(iconName, 18), h("b", { text: value }), h("small", { text: label }));
  const stats = [];
  if (recipe.prepTimeMin) stats.push(stat("clock", formatDuration(recipe.prepTimeMin), "Préparation"));
  if (recipe.cookTimeMin) stats.push(stat("flame", formatDuration(recipe.cookTimeMin), "Cuisson"));
  stats.push(stat("users", String(current.servings), current.servings > 1 ? "Portions" : "Portion"));
  $("r-stats").replaceChildren(...stats);

  $("servings-value").textContent = current.servings;

  const warnBox = $("r-warnings");
  warnBox.replaceChildren();
  warnBox.hidden = !recipe.warnings.length;
  if (recipe.warnings.length) {
    warnBox.append(h("strong", { text: "À vérifier" }), h("ul", {}, recipe.warnings.map((w) => h("li", { text: w }))));
  }

  $("r-ingredients").replaceChildren(
    ...recipe.ingredients.map((ing, i) => {
      const { qty, name } = ingredientLabel(ing);
      const cb = h("input", { type: "checkbox", id: "ing-" + i });
      const row = h("li", { class: "check-row" });
      cb.addEventListener("change", () => row.classList.toggle("done", cb.checked));
      const label = h("label", { for: cb.id }, qty ? h("span", { class: "qty", text: qty + " " }) : "", name);
      if (ing.note || ing.uncertain) label.append(h("span", { class: "approx", text: " — " + (ing.note || "quantité non précisée") }));
      row.append(cb, label);
      return row;
    }),
  );

  $("r-steps").replaceChildren(
    ...recipe.steps.map((s) =>
      h(
        "li",
        { class: "step-card" },
        h("div", {}, h("p", { text: s.text }), s.durationMin ? h("span", { class: "dur" }, icon("clock", 14), `${s.durationMin} min`) : ""),
      ),
    ),
  );

  $("r-tips-wrap").hidden = !recipe.tips.length;
  $("r-tips").replaceChildren(...recipe.tips.map((t) => h("li", { text: t })));

  const sourceUrl = videoUrl(current.videoId);
  $("r-source").hidden = !sourceUrl;
  if (sourceUrl) $("r-source-link").href = sourceUrl;

  $("share").hidden = !navigator.share;
  $("refresh").hidden = !current.videoId;
  $("cook-start").hidden = !recipe.steps.length;
  $("delete").hidden = !current.savedId;
}

function savedIdForVideo(videoId) {
  if (!videoId) return null;
  const hit = store.loadSaved().find((r) => r.videoId === videoId);
  return hit ? hit.id : null;
}

function showRecipe(recipe, { servings = null, videoId = null, cacheKey: key = null, savedId = null } = {}) {
  const base = recipe.servings || 4;
  const screen = visibleScreen();
  if (screen !== "recipe") previousScreen = screen;
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
  showScreen("recipe");
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
    const task = pending;
    pending = null;
    if (task.classify) autoClassify();
    else extract(task.payload, task.opts);
  }
});

// Nouvel appel à Gemini pour cette vidéo (si la recette extraite est fausse ou incomplète)
$("refresh").addEventListener("click", () => {
  if (!current || !current.videoId) return;
  goto("home");
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
  if (current) $("delete").hidden = !current.savedId;
}

$("delete").addEventListener("click", () => {
  if (!current || !current.savedId) return;
  if (!window.confirm(`Supprimer « ${current.recipe.title} » ?`)) return;
  selected.delete(current.savedId);
  store.storeSaved(store.loadSaved().filter((r) => r.id !== current.savedId));
  current.savedId = null;
  toast("Recette supprimée");
  goto(previousScreen === "theme" && !themeCounts(store.loadSaved()).some((c) => c.info.key === openedTheme) ? "themes" : previousScreen);
});

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

/* ---------- Accueil : recherche et filtre par thématique ---------- */
function matchesSearch(item) {
  const r = item.recipe;
  const words = nameKey(homeFilter.q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const haystack = nameKey(
    [r.title, r.category, ...(r.tags || []), ...recipeThemes(r).map((t) => themeInfo(t).label), ...r.ingredients.map((i) => i.name)]
      .filter(Boolean)
      .join(" "),
  );
  return words.every((w) => haystack.includes(w));
}

const openItem = (item) => showRecipe(item.recipe, { servings: item.servings, videoId: item.videoId || null, savedId: item.id });

function renderHome() {
  const all = store.loadSaved();
  $("saved-empty").hidden = all.length > 0;
  $("saved-tools").hidden = all.length === 0;

  const counts = themeCounts(all);
  if (homeFilter.theme && !counts.some((c) => c.info.key === homeFilter.theme)) homeFilter.theme = "";
  const box = $("theme-chips");
  box.replaceChildren();
  box.hidden = counts.length < 2; // inutile de filtrer quand tout est dans la même thématique
  if (counts.length >= 2) {
    const pick = (key) => () => {
      homeFilter.theme = key;
      renderHome();
    };
    box.append(chip("✨ Tout", !homeFilter.theme, pick(""), all.length));
    counts.forEach(({ info, count }) => box.append(chip(`${info.emoji} ${info.short}`, homeFilter.theme === info.key, pick(info.key), count)));
  }

  const shown = all.filter((item) => matchesTheme(item.recipe, homeFilter.theme) && matchesSearch(item));
  $("saved-none").hidden = !(all.length > 0 && shown.length === 0);
  $("saved-title").textContent = homeFilter.theme ? themeInfo(homeFilter.theme).label : "Toutes les recettes";
  $("saved-count").textContent = all.length ? `${shown.length} recette${shown.length > 1 ? "s" : ""}` : "";
  $("saved-list").replaceChildren(...shown.map((item) => h("li", {}, recipeRow(item, () => openItem(item)))));

  // « à la une » : la dernière recette enregistrée, tant qu'on ne filtre pas
  const showHero = all.length > 0 && !homeFilter.theme && !homeFilter.q.trim();
  $("home-hero").hidden = !showHero;
  $("home-hero-slot").replaceChildren(...(showHero ? [heroCard(all[0], () => openItem(all[0]))] : []));
}

$("search").addEventListener("input", () => {
  homeFilter.q = $("search").value;
  renderHome();
});

/* ---------- Thématiques ---------- */
function renderThemes() {
  const counts = themeCounts(store.loadSaved());
  $("themes-empty").hidden = counts.length > 0;
  const unclassified = store.loadSaved().filter((i) => !recipeThemes(i.recipe).length).length;
  $("classify-banner").hidden = unclassified === 0;
  $("classify-count").textContent = `${unclassified} recette${unclassified > 1 ? "s" : ""}`;
  $("theme-grid").replaceChildren(
    ...counts.map(({ info, count }) =>
      themeTile(info, count, () => {
        openedTheme = info.key;
        goto("theme");
      }),
    ),
  );
}

function renderTheme() {
  const info = themeInfo(openedTheme);
  const items = store.loadSaved().filter((item) => matchesTheme(item.recipe, openedTheme));
  $("theme-title").textContent = `${info.emoji} ${info.label}`;
  $("theme-count").textContent = `${items.length} recette${items.length > 1 ? "s" : ""}`
    + (openedTheme === NO_THEME ? " à classer" : "");
  $("theme-classify").hidden = !(openedTheme === NO_THEME && items.length);
  $("theme-list").replaceChildren(...items.map((item) => h("li", {}, recipeRow(item, () => openItem(item)))));
}
$("theme-back").addEventListener("click", () => goto("themes"));

/* ---------- Classement automatique des recettes sans thématique (un seul appel Gemini) ---------- */
async function autoClassify() {
  const todo = store.loadSaved().filter((i) => !recipeThemes(i.recipe).length).slice(0, 40);
  if (!todo.length) return toast("Toutes les recettes sont déjà classées.");
  const buttons = document.querySelectorAll(".auto-classify");
  buttons.forEach((b) => (b.disabled = true));
  toast("Classement en cours…");
  try {
    const code = store.getAccessCode();
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "content-type": "application/json", ...(code ? { "x-access-code": code } : {}) },
      body: JSON.stringify({
        recipes: todo.map((i) => ({
          id: i.id,
          title: i.recipe.title,
          category: i.recipe.category,
          tags: i.recipe.tags || [],
          ingredients: i.recipe.ingredients.map((g) => g.name),
          totalMin: (i.recipe.prepTimeMin || 0) + (i.recipe.cookTimeMin || 0) || null,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || data.code === "AUTH_REQUIRED") {
      pending = { classify: true };
      if (code) store.setAccessCode("");
      goto("home");
      $("access-form").hidden = false;
      $("access-code").value = "";
      $("access-code").focus();
      return setStatus(code ? "Code incorrect. Réessaie." : "Code d'accès requis.", true);
    }
    if (!res.ok) throw new Error(data.error || "Erreur " + res.status);

    const list = store.loadSaved();
    let done = 0;
    for (const item of list) {
      const themes = data.themes && data.themes[item.id];
      if (!Array.isArray(themes) || recipeThemes(item.recipe).length) continue;
      const clean = sanitizeRecipe({ ...item.recipe, themes });
      if (clean && clean.themes.length) {
        item.recipe = { ...item.recipe, themes: clean.themes };
        done++;
      }
    }
    if (done) persist(list, `${done} recette${done > 1 ? "s" : ""} classée${done > 1 ? "s" : ""}`);
    else toast("Gemini n'a pas su classer ces recettes : choisis les thèmes sur chaque fiche.");
    const left = list.filter((i) => !recipeThemes(i.recipe).length).length;
    if (done && left) toast(`${done} classée${done > 1 ? "s" : ""}, ${left} restante${left > 1 ? "s" : ""}`);
    goto(openedTheme === NO_THEME && !left && visibleScreen() === "theme" ? "themes" : visibleScreen());
  } catch (err) {
    toast(err.message || "Classement impossible.");
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}
document.querySelectorAll(".auto-classify").forEach((b) => b.addEventListener("click", autoClassify));

/* ---------- Courses : choix des recettes, puis liste groupée ---------- */
function updateMakeList() {
  const n = selected.size;
  $("make-list").disabled = n === 0;
  $("make-list").textContent = n ? `Liste de courses (${n})` : "Liste de courses";
}

function renderShopPick() {
  const all = store.loadSaved();
  $("shop-pick").hidden = false;
  $("shop-result").hidden = true;
  $("shop-empty").hidden = all.length > 0;
  $("shop-recipes").replaceChildren(
    ...all.map((item) => {
      const cb = h("input", {
        type: "checkbox", class: "sel", id: "sel-" + item.id,
        "aria-label": `Ajouter « ${item.recipe.title} » à la liste de courses`,
      });
      cb.checked = selected.has(item.id);
      cb.addEventListener("change", () => {
        if (cb.checked) selected.add(item.id);
        else selected.delete(item.id);
        updateMakeList();
      });
      return h(
        "div",
        { class: "pick-row" },
        h(
          "label",
          { for: cb.id },
          cb,
          thumb(item.recipe),
          h("span", { class: "row-body" }, h("span", { class: "row-title", text: item.recipe.title }), h("span", { class: "row-meta", text: `${item.servings || item.recipe.servings || 4} portions` })),
        ),
      );
    }),
  );
  // seules les fiches existantes peuvent rester cochées
  const ids = new Set(all.map((r) => r.id));
  [...selected].forEach((id) => !ids.has(id) && selected.delete(id));
  updateMakeList();
}

$("make-list").addEventListener("click", () => {
  const chosen = store.loadSaved().filter((r) => selected.has(r.id));
  if (!chosen.length) return;
  lastShopping = buildShoppingList(chosen.map((r) => ({ recipe: r.recipe, servings: r.servings })));

  $("shopping-from").textContent = chosen
    .map((r) => `${r.recipe.title} (${r.servings || r.recipe.servings || 4} portions)`)
    .join(" · ");

  $("shopping-list").replaceChildren(
    ...lastShopping.map((line, i) => {
      const cb = h("input", { type: "checkbox", id: "shop-" + i });
      const row = h("li", { class: "check-row" });
      cb.addEventListener("change", () => row.classList.toggle("done", cb.checked));
      const label = h("label", { for: cb.id, text: shoppingLine(line) });
      if (chosen.length > 1) label.append(h("span", { class: "approx", text: " — " + line.from.join(", ") }));
      row.append(cb, label);
      return row;
    }),
  );
  $("shop-pick").hidden = true;
  $("shop-result").hidden = false;
  window.scrollTo({ top: 0 });
});

$("shopping-back").addEventListener("click", () => {
  renderShopPick();
  window.scrollTo({ top: 0 });
});
$("shopping-copy").addEventListener("click", () =>
  copyText(lastShopping.map((l) => "- " + shoppingLine(l)).join("\n"), "Liste copiée"),
);

/* ---------- Réglages ---------- */
function renderMore() {
  const all = store.loadSaved();
  const last = store.getSetting("lastExport", null);
  $("last-export").textContent = last
    ? "Dernière sauvegarde : " + new Date(last).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : all.length
      ? "Tu n'as encore jamais exporté tes recettes."
      : "";
}

$("forget-code").addEventListener("click", () => {
  store.setAccessCode("");
  toast("Code oublié sur cet appareil");
});

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
  renderMore();
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
    renderMore();
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

/* ---------- Démarrage ---------- */
goto("home");

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
