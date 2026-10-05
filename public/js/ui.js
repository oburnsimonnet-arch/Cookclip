import { h } from "./dom.js";
import { icon } from "./icons.js";
import { primaryTheme, recipeEmoji, recipeThemes, themeInfo } from "./themes.js";

/** 75 -> « 1 h 15 », 20 -> « 20 min ». */
export function formatDuration(min) {
  if (!min || min <= 0) return "";
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

export function totalMinutes(recipe) {
  return (recipe.prepTimeMin || 0) + (recipe.cookTimeMin || 0);
}

/** Pastille colorée avec l'emoji du plat (pas de photo : la couleur vient de la thématique). */
export function thumb(recipe, extraClass = "") {
  return h("span", { class: "thumb " + extraClass, style: `background:${primaryTheme(recipe).gradient}`, "aria-hidden": "true" }, recipeEmoji(recipe));
}

/** Ligne de la liste : pastille, titre, durée, portions, thématique. */
export function recipeRow(item, onOpen) {
  const { recipe } = item;
  const time = formatDuration(totalMinutes(recipe));
  const first = recipeThemes(recipe)[0];
  const meta = h("span", { class: "row-meta" });
  if (time) meta.append(h("span", {}, icon("clock", 12), time));
  if (item.servings) meta.append(h("span", {}, icon("users", 12), `${item.servings} pers.`));
  if (first) meta.append(h("span", { class: "pill" }, themeInfo(first).short));
  else meta.append(h("span", { class: "pill pill-none" }, "Non classée"));
  return h(
    "button",
    { type: "button", class: "row-card open", onClick: onOpen },
    thumb(recipe),
    h("span", { class: "row-body" }, h("span", { class: "row-title", text: recipe.title }), meta),
  );
}

/** Grande carte « à la une » : dégradé de la thématique, emoji, titre en bas. */
export function heroCard(item, onOpen) {
  const { recipe } = item;
  const time = formatDuration(totalMinutes(recipe));
  const first = recipeThemes(recipe)[0];
  const meta = h("div", { class: "hero-meta" });
  if (time) meta.append(h("span", {}, icon("clock", 13), time));
  if (item.servings) meta.append(h("span", {}, icon("users", 13), `${item.servings} pers.`));
  if (first) meta.append(h("span", {}, themeInfo(first).short));
  return h(
    "button",
    { type: "button", id: "home-hero-open", class: "hero-card", style: `background:${primaryTheme(recipe).gradient}`, onClick: onOpen },
    h("span", { class: "hero-emoji", "aria-hidden": "true" }, recipeEmoji(recipe)),
    h(
      "span",
      { class: "hero-text" },
      h("span", { class: "hero-badge" }, icon("chef-hat", 12), "Dernière recette"),
      h("span", { class: "hero-title", text: recipe.title }),
      meta,
    ),
  );
}

/** Tuile d'une thématique : dégradé, emoji, nom, nombre de recettes. */
export function themeTile(info, count, onClick) {
  return h(
    "button",
    { type: "button", class: "tile", style: `background:${info.gradient}`, onClick },
    h("span", { class: "big", "aria-hidden": "true" }, info.emoji),
    h("strong", { text: info.label }),
    h("small", { text: `${count} recette${count > 1 ? "s" : ""}` }),
  );
}

/** Puce de filtre (bouton à bascule). */
export function chip(label, pressed, onClick, count) {
  const b = h("button", { type: "button", class: "chip", "aria-pressed": String(pressed), onClick }, label);
  if (count !== undefined) b.append(h("span", { class: "n" }, String(count)));
  return b;
}

export function emptyState(emoji, title, text) {
  return h("div", { class: "empty" }, h("span", { class: "big", "aria-hidden": "true" }, emoji), h("strong", { text: title }), h("p", { text }));
}
