import { parseQty } from "./format.js";
import { CATEGORIES } from "./sanitize.js";

/** Petit constructeur d'éléments : jamais d'innerHTML, le texte des recettes reste du texte. */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  el.append(...children);
  return el;
}

const intOrNull = (text) => {
  const n = parseInt(String(text).trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Formulaire de modification d'une fiche. `onSubmit(recette brute)` reçoit le contenu saisi
 * (à nettoyer ensuite) ; `onCancel()` abandonne les changements.
 */
export function createEditor(root, { onSubmit, onCancel }) {
  function field(label, control) {
    return h("label", { class: "field" }, h("span", { text: label }), control);
  }

  function ingredientRow(ing = {}) {
    const qty = h("input", {
      type: "text", inputmode: "decimal", placeholder: "Qté", "aria-label": "Quantité", class: "e-qty",
    });
    qty.value = ing.quantity === null || ing.quantity === undefined ? "" : String(ing.quantity).replace(".", ",");
    const unit = h("input", { type: "text", placeholder: "Unité", "aria-label": "Unité", class: "e-unit", maxlength: 30 });
    unit.value = ing.unit ?? "";
    const name = h("input", {
      type: "text", placeholder: "Ingrédient", "aria-label": "Nom de l'ingrédient", class: "e-name", maxlength: 200,
    });
    name.value = ing.name ?? "";
    const note = h("input", {
      type: "text", placeholder: "Précision (facultatif)", "aria-label": "Précision", class: "e-note", maxlength: 200,
    });
    note.value = ing.note ?? "";
    const del = h("button", { type: "button", class: "icon-btn", "aria-label": "Supprimer cet ingrédient", text: "✕" });
    const row = h("div", { class: "edit-row ing-row" }, qty, unit, name, note, del);
    del.addEventListener("click", () => row.remove());
    row.read = () => {
      const quantity = parseQty(qty.value);
      const unchanged = ing.quantity !== null && ing.quantity !== undefined && quantity === ing.quantity;
      return {
        name: name.value,
        quantity,
        unit: unit.value,
        note: note.value,
        // une quantité absente reste « incertaine » ; une quantité devinée par l'IA le reste tant qu'on n'y touche pas
        uncertain: quantity === null || (ing.uncertain === true && unchanged),
        _invalidQty: qty.value.trim() !== "" && quantity === null ? qty : null,
      };
    };
    return row;
  }

  function stepRow(step = {}) {
    const text = h("textarea", { rows: 2, "aria-label": "Texte de l'étape", class: "e-step", maxlength: 2000 });
    text.value = step.text ?? "";
    const dur = h("input", {
      type: "number", min: 0, max: 1440, inputmode: "numeric", placeholder: "min", "aria-label": "Durée en minutes", class: "e-dur",
    });
    dur.value = step.durationMin ?? "";
    const del = h("button", { type: "button", class: "icon-btn", "aria-label": "Supprimer cette étape", text: "✕" });
    const row = h("div", { class: "edit-row step-row" }, text, dur, del);
    del.addEventListener("click", () => row.remove());
    row.read = () => ({ text: text.value, durationMin: intOrNull(dur.value) });
    return row;
  }

  function open(recipe) {
    root.replaceChildren();

    const title = h("input", { type: "text", maxlength: 200, "aria-label": "Titre", id: "e-title" });
    title.value = recipe.title;

    const category = h("select", { "aria-label": "Catégorie", id: "e-category" });
    category.append(h("option", { value: "", text: "—" }));
    CATEGORIES.forEach((c) => category.append(h("option", { value: c, text: c })));
    category.value = recipe.category || "";

    const servings = h("input", { type: "number", min: 1, max: 100, inputmode: "numeric", "aria-label": "Portions", id: "e-servings" });
    servings.value = recipe.servings ?? "";
    const prep = h("input", { type: "number", min: 0, inputmode: "numeric", "aria-label": "Préparation en minutes", id: "e-prep" });
    prep.value = recipe.prepTimeMin ?? "";
    const cook = h("input", { type: "number", min: 0, inputmode: "numeric", "aria-label": "Cuisson en minutes", id: "e-cook" });
    cook.value = recipe.cookTimeMin ?? "";

    const ingList = h("div", { class: "edit-list", id: "e-ingredients" });
    recipe.ingredients.forEach((i) => ingList.append(ingredientRow(i)));
    const addIng = h("button", { type: "button", id: "e-add-ing", text: "+ Ingrédient" });
    addIng.addEventListener("click", () => {
      const row = ingredientRow();
      ingList.append(row);
      row.querySelector(".e-name").focus();
    });

    const stepList = h("div", { class: "edit-list", id: "e-steps" });
    recipe.steps.forEach((s) => stepList.append(stepRow(s)));
    const addStep = h("button", { type: "button", id: "e-add-step", text: "+ Étape" });
    addStep.addEventListener("click", () => {
      const row = stepRow();
      stepList.append(row);
      row.querySelector(".e-step").focus();
    });

    let clearWarnings = null;
    if (recipe.warnings && recipe.warnings.length) {
      clearWarnings = h("input", { type: "checkbox", id: "e-clear-warnings" });
    }

    const error = h("p", { class: "status error", id: "e-error", role: "alert", hidden: true });
    const cancel = h("button", { type: "button", id: "e-cancel", text: "Annuler" });
    cancel.addEventListener("click", () => onCancel());

    root.append(
      h("h2", { text: "Modifier la recette" }),
      field("Titre", title),
      h("div", { class: "edit-grid" }, field("Catégorie", category), field("Portions", servings)),
      h("div", { class: "edit-grid" }, field("Préparation (min)", prep), field("Cuisson (min)", cook)),
      h("h3", { text: "Ingrédients" }),
      h("p", { class: "hint", text: "Laisse la quantité vide si elle n'est pas précisée (ex. « à l'œil »). Fractions acceptées : 1/2, 1 1/2." }),
      ingList,
      addIng,
      h("h3", { text: "Préparation" }),
      stepList,
      addStep,
      clearWarnings
        ? h("label", { class: "check" }, clearWarnings, " J'ai vérifié : retirer les avertissements")
        : "",
      error,
      h("div", { class: "actions" }, h("button", { type: "submit", class: "primary", text: "Terminer" }), cancel),
    );

    root.onsubmit = (e) => {
      e.preventDefault();
      error.hidden = true;

      const ingredients = [...ingList.children].map((row) => row.read());
      const bad = ingredients.find((i) => i._invalidQty);
      if (bad) {
        error.textContent = "Quantité illisible : écris un nombre (ex. 250, 1,5 ou 1/2) ou laisse vide.";
        error.hidden = false;
        bad._invalidQty.focus();
        return;
      }
      if (!title.value.trim()) {
        error.textContent = "Le titre est obligatoire.";
        error.hidden = false;
        title.focus();
        return;
      }
      onSubmit({
        ...recipe,
        title: title.value,
        category: category.value || null,
        servings: intOrNull(servings.value),
        prepTimeMin: intOrNull(prep.value),
        cookTimeMin: intOrNull(cook.value),
        ingredients: ingredients.map(({ _invalidQty, ...ing }) => ing),
        steps: [...stepList.children].map((row) => row.read()),
        warnings: clearWarnings && clearWarnings.checked ? [] : recipe.warnings,
      });
    };

    title.focus();
  }

  /** Affiche un message d'erreur venant de l'extérieur (ex. fiche vide). */
  function showError(message) {
    const error = root.querySelector("#e-error");
    if (error) {
      error.textContent = message;
      error.hidden = false;
    }
  }

  return { open, showError };
}
