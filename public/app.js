"use strict";

const $ = (id) => document.getElementById(id);
const STORE_KEY = "cookclip.recipes.v1";

let current = null; // { recipe, baseServings, servings }

/* ---------- Stockage local ---------- */
function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || [];
  } catch {
    return [];
  }
}
function storeSaved(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch {
    toast("Impossible d'enregistrer (stockage indisponible).");
  }
}

/* ---------- Utilitaires ---------- */
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2500);
}

function setStatus(msg, isError = false) {
  const s = $("status");
  s.hidden = !msg;
  s.textContent = msg || "";
  s.classList.toggle("error", isError);
}

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

function formatQty(q) {
  if (q === null || q === undefined) return "";
  // fractions courantes plus lisibles en cuisine
  const frac = { 0.25: "¼", 0.33: "⅓", 0.5: "½", 0.67: "⅔", 0.75: "¾" };
  const whole = Math.floor(q);
  const rest = Math.round((q - whole) * 100) / 100;
  if (rest in frac) return (whole ? whole + " " : "") + frac[rest];
  return fmt.format(Math.round(q * 100) / 100);
}

function scaled(ing) {
  if (ing.quantity === null || !current) return null;
  return (ing.quantity * current.servings) / current.baseServings;
}

function ingredientLabel(ing) {
  const q = scaled(ing);
  const parts = [];
  if (q !== null) parts.push(formatQty(q));
  if (ing.unit) parts.push(ing.unit);
  return { qty: parts.join(" "), name: ing.name };
}

/* ---------- Affichage de la recette ---------- */
function renderRecipe() {
  const { recipe } = current;
  $("r-title").textContent = recipe.title;

  const meta = [];
  if (recipe.prepTimeMin) meta.push(`Préparation ${recipe.prepTimeMin} min`);
  if (recipe.cookTimeMin) meta.push(`Cuisson ${recipe.cookTimeMin} min`);
  $("r-meta").textContent = meta.join(" · ");

  $("servings-value").textContent = current.servings;

  const warnBox = $("r-warnings");
  warnBox.hidden = !recipe.warnings.length;
  warnBox.replaceChildren();
  if (recipe.warnings.length) {
    const strong = document.createElement("strong");
    strong.textContent = "À vérifier";
    const ul = document.createElement("ul");
    recipe.warnings.forEach((w) => {
      const li = document.createElement("li");
      li.textContent = w;
      ul.append(li);
    });
    warnBox.append(strong, ul);
  }

  const ul = $("r-ingredients");
  ul.replaceChildren();
  recipe.ingredients.forEach((ing, i) => {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = "ing-" + i;
    cb.addEventListener("change", () => li.classList.toggle("done", cb.checked));

    const label = document.createElement("label");
    label.htmlFor = cb.id;
    label.style.fontWeight = "400";
    label.style.margin = "0";

    const { qty, name } = ingredientLabel(ing);
    if (qty) {
      const b = document.createElement("span");
      b.className = "qty";
      b.textContent = qty + " ";
      label.append(b);
    }
    label.append(document.createTextNode(name));
    if (ing.note || ing.uncertain) {
      const n = document.createElement("span");
      n.className = "approx";
      n.textContent = " — " + (ing.note || "quantité non précisée");
      label.append(n);
    }
    li.append(cb, label);
    ul.append(li);
  });

  const ol = $("r-steps");
  ol.replaceChildren();
  recipe.steps.forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.text;
    if (s.durationMin) {
      const d = document.createElement("span");
      d.className = "dur";
      d.textContent = ` (${s.durationMin} min)`;
      li.append(d);
    }
    ol.append(li);
  });

  $("r-tips-wrap").hidden = !recipe.tips.length;
  const tips = $("r-tips");
  tips.replaceChildren();
  recipe.tips.forEach((t) => {
    const li = document.createElement("li");
    li.textContent = t;
    tips.append(li);
  });

  $("view-new").hidden = true;
  $("view-saved").hidden = true;
  $("recipe").hidden = false;
  $("share").hidden = !navigator.share;
  window.scrollTo({ top: 0 });
}

function showRecipe(recipe, servings) {
  const base = recipe.servings || 4;
  current = { recipe, baseServings: base, servings: servings || base };
  renderRecipe();
}

/* ---------- Appel au backend ---------- */
async function extract(payload) {
  const btn = $("go");
  btn.disabled = true;
  setStatus("Lecture de la vidéo et extraction de la recette… (jusqu'à une minute)");
  try {
    const res = await fetch("/api/recipe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === "VIDEO_UNREADABLE") $("manual").open = true;
      throw new Error(data.error || "Erreur " + res.status);
    }
    setStatus("");
    showRecipe(data.recipe);
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

/* ---------- Portions, liste de courses, enregistrement ---------- */
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

function shoppingText() {
  return current.recipe.ingredients
    .map((ing) => {
      const { qty, name } = ingredientLabel(ing);
      return "- " + [qty, name].filter(Boolean).join(" ");
    })
    .join("\n");
}

$("copy-list").addEventListener("click", async () => {
  const text = `${current.recipe.title} (${current.servings} portions)\n${shoppingText()}`;
  try {
    await navigator.clipboard.writeText(text);
    toast("Liste copiée");
  } catch {
    toast("Copie impossible sur cet appareil.");
  }
});

$("share").addEventListener("click", async () => {
  try {
    await navigator.share({
      title: current.recipe.title,
      text: `${current.recipe.title}\n\n${shoppingText()}\n\n${current.recipe.steps
        .map((s, i) => `${i + 1}. ${s.text}`)
        .join("\n")}`,
    });
  } catch {
    /* annulé par l'utilisateur */
  }
});

$("save").addEventListener("click", () => {
  const list = loadSaved();
  const id = current.recipe.title + "|" + current.recipe.steps.length;
  if (list.some((r) => r.id === id)) return toast("Déjà enregistrée");
  list.unshift({ id, savedAt: Date.now(), recipe: current.recipe, servings: current.servings });
  storeSaved(list);
  toast("Recette enregistrée");
});

/* ---------- Onglets / recettes enregistrées ---------- */
function showTab(name) {
  $("tab-new").classList.toggle("active", name === "new");
  $("tab-saved").classList.toggle("active", name === "saved");
  $("view-new").hidden = name !== "new";
  $("view-saved").hidden = name !== "saved";
  $("recipe").hidden = true;
  if (name === "saved") renderSaved();
}
$("tab-new").addEventListener("click", () => showTab("new"));
$("tab-saved").addEventListener("click", () => showTab("saved"));

function renderSaved() {
  const list = loadSaved();
  $("saved-empty").hidden = list.length > 0;
  const ul = $("saved-list");
  ul.replaceChildren();
  list.forEach((item) => {
    const li = document.createElement("li");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "open";
    open.textContent = item.recipe.title;
    open.addEventListener("click", () => showRecipe(item.recipe, item.servings));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "del";
    del.textContent = "Supprimer";
    del.addEventListener("click", () => {
      storeSaved(loadSaved().filter((r) => r.id !== item.id));
      renderSaved();
    });
    li.append(open, del);
    ul.append(li);
  });
}

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
