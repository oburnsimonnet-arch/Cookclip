import { h } from "./dom.js";
import { MAX_THEMES, THEMES, canonicalTheme, cleanThemes, normText, themeInfo } from "./themes.js";

/**
 * Sélecteur de thématiques : puces de la liste fixe + thématiques personnalisées, 3 au plus.
 * `idPrefix` sert à nommer les éléments (ex. « e » -> e-themes, e-theme-new…).
 * `onChange(liste)` est appelé à chaque modification.
 */
export function createThemePicker({ themes = [], idPrefix = "e", onChange = () => {} } = {}) {
  let selected = cleanThemes(themes);
  const box = h("div", { class: "chip-wrap", id: `${idPrefix}-themes`, role: "group", "aria-label": "Thématiques" });
  const hint = h("p", { class: "hint", id: `${idPrefix}-theme-hint`, role: "status" });
  const input = h("input", {
    type: "text", maxlength: 30, id: `${idPrefix}-theme-new`,
    placeholder: "Autre thématique (ex. Repas de Noël)", "aria-label": "Nouvelle thématique",
  });
  const add = h("button", { type: "button", class: "btn", id: `${idPrefix}-theme-add`, text: "Ajouter" });
  const has = (key) => selected.some((t) => normText(t) === normText(key));

  function toggle(key) {
    hint.textContent = "";
    if (has(key)) selected = selected.filter((t) => normText(t) !== normText(key));
    else if (selected.length >= MAX_THEMES) {
      hint.textContent = `${MAX_THEMES} thématiques au maximum : retires-en une d'abord.`;
      return;
    } else selected = [...selected, key];
    draw();
    onChange([...selected]);
  }

  function draw() {
    const keys = [...THEMES.map((t) => t.key), ...selected.filter((t) => !THEMES.some((k) => k.key === t))];
    box.replaceChildren(
      ...keys.map((key) => {
        const info = themeInfo(key);
        return h(
          "button",
          { type: "button", class: "chip", "data-theme": key, "aria-pressed": String(has(key)), onClick: () => toggle(key) },
          `${info.emoji} ${info.short}`,
        );
      }),
    );
  }

  add.addEventListener("click", () => {
    const key = canonicalTheme(input.value);
    input.value = "";
    if (!key) return;
    if (has(key)) hint.textContent = "Déjà choisie.";
    else toggle(key);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add.click();
    }
  });
  draw();

  return {
    element: h("div", {}, box, h("div", { class: "theme-add" }, input, add), hint),
    get: () => [...selected],
    set(list) {
      selected = cleanThemes(list);
      draw();
    },
  };
}
