import { after, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

/**
 * Tests d'interface : le vrai code de l'application (public/app.js et ses modules) tourne dans
 * un navigateur simulé. On clique, on saisit, et le serveur est remplacé par des réponses préparées.
 */

const bundle = (
  await build({ entryPoints: ["public/app.js"], bundle: true, format: "iife", write: false })
).outputFiles[0].text;
const HTML = readFileSync("public/index.html", "utf8");

const ID = "dQw4w9WgXcQ";
const ID2 = "Zx9Yw8Vu7Ts";
const LINK = `https://www.youtube.com/watch?v=${ID}`;

const RECIPE = {
  title: "Pâte à crêpes",
  language: "fr",
  category: "dessert",
  emoji: "🥞",
  themes: ["france", "rapide"],
  tags: ["rapide", "végétarien"],
  servings: 4,
  prepTimeMin: 10,
  cookTimeMin: null,
  ingredients: [
    { name: "farine", quantity: 250, unit: "g", note: null, uncertain: false },
    { name: "œufs", quantity: 3, unit: null, note: null, uncertain: false },
    { name: "lait", quantity: 0.5, unit: "l", note: null, uncertain: false },
    { name: "rhum", quantity: null, unit: null, note: "à l'œil", uncertain: true },
  ],
  steps: [
    { text: "Mélanger la farine et les œufs.", durationMin: null },
    { text: "Laisser reposer la pâte.", durationMin: 5 },
    { text: "Cuire dans une poêle chaude.", durationMin: null },
  ],
  tips: ["Utiliser une poêle antiadhésive."],
  warnings: ["Le temps de cuisson n'est pas précisé."],
};
const SOUPE = {
  title: "Soupe de potiron",
  language: "fr",
  category: "plat",
  emoji: null,
  themes: ["reconfort"],
  tags: [],
  servings: 4,
  prepTimeMin: null,
  cookTimeMin: 30,
  ingredients: [
    { name: "potiron", quantity: 1, unit: "kg", note: null, uncertain: false },
    { name: "Farine", quantity: 50, unit: "g", note: null, uncertain: false },
    { name: "oeuf", quantity: 1, unit: null, note: null, uncertain: false },
  ],
  steps: [{ text: "Cuire le potiron.", durationMin: 30 }],
  tips: [],
  warnings: [],
};

type Reply = { status: number; body: any };
const ok = (recipe: any = RECIPE): Reply => ({ status: 200, body: { recipe, source: { method: "video" } } });

interface BootOptions {
  url?: string;
  storage?: Record<string, string>;
  replies?: Reply[];
  wakeLock?: boolean;
}

const openWindows: any[] = [];
after(() => openWindows.forEach((w) => w.close()));

async function boot(opts: BootOptions = {}) {
  const dom = new JSDOM(HTML, {
    url: opts.url ?? "https://cookclip.test/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window as any;
  openWindows.push(w);
  const doc = w.document as Document;

  for (const [k, v] of Object.entries(opts.storage ?? {})) w.localStorage.setItem(k, v);

  // --- le serveur et le téléphone sont simulés ---
  const calls: { headers: Record<string, string>; body: any }[] = [];
  const queue = [...(opts.replies ?? [])];
  w.fetch = async (_url: string, init: any) => {
    calls.push({ headers: init.headers, body: JSON.parse(init.body) });
    const reply = queue.shift() ?? ok();
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  };
  w.scrollTo = () => {};
  w.confirm = () => true;
  const clipboard: string[] = [];
  Object.defineProperty(w.navigator, "clipboard", {
    value: { writeText: async (t: string) => void clipboard.push(t) },
  });
  const wake = { requests: 0, released: 0 };
  if (opts.wakeLock !== false) {
    Object.defineProperty(w.navigator, "wakeLock", {
      value: {
        request: async () => {
          wake.requests++;
          return { release: () => void wake.released++ };
        },
      },
    });
  }
  const downloads: { blob: Blob; name: string }[] = [];
  w.URL.createObjectURL = (blob: Blob) => (downloads.push({ blob, name: "" }), "blob:test");
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function (this: any) {
    if (downloads.length) downloads[downloads.length - 1].name = this.download;
  };

  w.eval(bundle);
  await flush();

  const $ = (id: string) => doc.getElementById(id) as any;
  const api = {
    w, doc, $, calls, clipboard, wake, downloads,
    text: (id: string) => ($(id).textContent as string),
    visible: (id: string) => !$(id).hidden,
    click: async (idOrEl: any) => {
      const el = typeof idOrEl === "string" ? $(idOrEl) : idOrEl;
      el.click();
      await flush();
    },
    type: async (idOrEl: any, value: string) => {
      const el = typeof idOrEl === "string" ? $(idOrEl) : idOrEl;
      el.value = value;
      el.dispatchEvent(new w.Event("input", { bubbles: true }));
      await flush();
    },
    submit: async (id: string) => {
      $(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
      await flush();
    },
    extract: async (link: string) => {
      $("url").value = link;
      await api.submit("form");
    },
    stored: (key: string) => {
      const raw = w.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    saved: () => api.stored("cookclip.recipes.v1") ?? [],
    lines: (id: string) => [...$(id).children].map((li: any) => li.textContent.replace(/\s+/g, " ").trim()),
    all: (selector: string) => [...doc.querySelectorAll(selector)] as any[],
  };
  return api;
}

const flush = (ms = 15) => new Promise((r) => setTimeout(r, ms));

const savedItem = (recipe: any, over: any = {}) => ({
  id: "v:" + ID, savedAt: 1000, recipe, servings: recipe.servings, videoId: ID, ...over,
});
const withSaved = (items: any[]) => ({ "cookclip.recipes.v1": JSON.stringify(items) });

/* ======================= Extraction et affichage ======================= */

test("extraction : la fiche s'affiche avec ingrédients, étapes, mots-clés et lien vidéo", async () => {
  const app = await boot();
  await app.extract(LINK);

  assert.deepEqual(app.calls[0].body, { url: LINK, french: true });
  assert.equal(app.text("r-title"), "Pâte à crêpes");
  assert.equal(app.$("r-ingredients").children.length, 4);
  assert.equal(app.$("r-steps").children.length, 3);
  assert.match(app.text("r-tags"), /dessert/);
  assert.match(app.text("r-tags"), /végétarien/);
  assert.match(app.text("r-warnings"), /temps de cuisson/);
  assert.match(app.text("r-themes"), /Cuisine française/);
  assert.match(app.text("r-themes"), /Plat rapide du soir/);
  assert.equal(app.text("r-emoji"), "🥞");
  assert.equal(app.$("r-source-link").href, LINK);
  assert.equal(app.visible("recipe"), true);
  assert.equal(app.visible("view-home"), false);
});

test("extraction : une quantité absente est indiquée, une fraction est lisible", async () => {
  const app = await boot();
  await app.extract(LINK);
  const lines = app.lines("r-ingredients");
  assert.ok(lines[0].startsWith("250 g farine"));
  assert.ok(lines[2].startsWith("½ l lait"));
  assert.ok(lines[3].includes("rhum — à l'œil"));
});

test("extraction : erreur du serveur affichée, vidéo illisible -> champ transcription ouvert", async () => {
  const app = await boot({
    replies: [{ status: 422, body: { error: "Gemini n'a pas pu lire cette vidéo.", code: "VIDEO_UNREADABLE" } }],
  });
  await app.extract(LINK);
  assert.match(app.text("status"), /n'a pas pu lire/);
  assert.equal(app.$("manual").open, true);
  assert.equal(app.visible("recipe"), false);
  assert.equal(app.$("go").disabled, false); // le bouton redevient utilisable
});

test("partage Android : le lien reçu lance l'extraction sans rien saisir", async () => {
  const app = await boot({ url: `https://cookclip.test/?title=x&text=${encodeURIComponent("Regarde ça https://youtu.be/" + ID)}` });
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0].body.url, `https://youtu.be/${ID}`);
  assert.equal(app.text("r-title"), "Pâte à crêpes");
});

/* ======================= Mémoire et langue ======================= */

test("mémoire : même vidéo, quel que soit le format du lien -> aucun nouvel appel", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("back");
  await app.extract(`https://youtu.be/${ID}?si=abc`);
  await app.click("back");
  await app.extract(`Regarde ça ${LINK}`);
  assert.equal(app.calls.length, 1);
  assert.match(app.text("toast"), /aucun appel/);
});

test("mémoire : une autre vidéo déclenche un appel ; « Réextraire » en force un", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("back");
  await app.extract(`https://youtu.be/${ID2}`);
  assert.equal(app.calls.length, 2);
  await app.click("refresh");
  assert.equal(app.calls.length, 3);
  assert.equal(app.$("url").value, `https://www.youtube.com/watch?v=${ID2}`);
});

test("langue : l'option est envoyée, mémorisée, et la mémoire distingue les deux versions", async () => {
  const app = await boot();
  await app.extract(LINK);
  assert.equal(app.calls[0].body.french, true);
  await app.click("back");

  app.$("french").checked = false;
  app.$("french").dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await app.extract(LINK); // même vidéo mais version d'origine : nouvel appel
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].body.french, false);
  assert.equal(app.stored("cookclip.settings.v1").french, false);

  // l'option décochée est retrouvée au prochain lancement
  const again = await boot({ storage: { "cookclip.settings.v1": JSON.stringify({ french: false }) } });
  assert.equal(again.$("french").checked, false);
});

/* ======================= Code d'accès ======================= */

const AUTH = { status: 401, body: { error: "Code d'accès requis ou incorrect.", code: "AUTH_REQUIRED" } };

test("accès : le code est demandé, puis la demande est rejouée avec le code", async () => {
  const app = await boot({ replies: [AUTH, ok()] });
  await app.extract(LINK);
  assert.equal(app.visible("access-form"), true);
  assert.match(app.text("status"), /Code d'accès requis/);
  assert.equal(app.calls[0].headers["x-access-code"], undefined);

  await app.type("access-code", "mon-code-secret");
  await app.submit("access-form");
  assert.equal(app.calls.length, 2);
  assert.equal(app.calls[1].headers["x-access-code"], "mon-code-secret");
  assert.equal(app.text("r-title"), "Pâte à crêpes"); // la demande initiale a abouti
  assert.equal(app.visible("access-form"), false);
});

test("accès : le code est retenu pour les demandes suivantes", async () => {
  const app = await boot({ storage: { "cookclip.access.v1": "mon-code-secret" } });
  await app.extract(LINK);
  assert.equal(app.calls[0].headers["x-access-code"], "mon-code-secret");
  assert.equal(app.visible("access-form"), false);
});

test("accès : un code refusé est oublié et redemandé", async () => {
  const app = await boot({ storage: { "cookclip.access.v1": "mauvais" }, replies: [AUTH] });
  await app.extract(LINK);
  assert.equal(app.visible("access-form"), true);
  assert.match(app.text("status"), /Code incorrect/);
  assert.equal(app.w.localStorage.getItem("cookclip.access.v1"), null);
  assert.equal(app.$("access-code").value, "");
});

/* ======================= Portions ======================= */

test("portions : les quantités suivent, sans descendre sous 1 ni remonter en haut de page", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("plus"); // 5 portions : 250 * 5/4 = 312,5
  assert.ok(app.lines("r-ingredients")[0].startsWith("312,5 g farine"));
  assert.equal(app.text("servings-value"), "5");
  for (let i = 0; i < 10; i++) await app.click("minus");
  assert.equal(app.text("servings-value"), "1");
  assert.ok(app.lines("r-ingredients")[0].startsWith("62,5 g farine"));
});

/* ======================= Enregistrement ======================= */

test("enregistrement : la fiche garde le lien vidéo, se rouvre depuis la liste, pas de doublon", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("plus");
  await app.click("save");
  assert.match(app.text("toast"), /enregistrée/);
  let saved = app.saved();
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, "v:" + ID);
  assert.equal(saved[0].videoId, ID);
  assert.equal(saved[0].servings, 5);

  await app.click("save");
  assert.match(app.text("toast"), /Déjà enregistrée/);
  assert.equal(app.saved().length, 1);

  await app.click("back");
  await app.click("tab-home");
  assert.equal(app.$("saved-list").children.length, 1);
  await app.click(app.all("#saved-list .open")[0]);
  assert.equal(app.text("servings-value"), "5");
  assert.equal(app.$("r-source-link").href, LINK);
});

test("enregistrement : une fiche d'avant le lien vidéo est complétée au nouvel enregistrement", async () => {
  const legacy = { id: "Pâte à crêpes|3", savedAt: 1, recipe: RECIPE, servings: 4 };
  const app = await boot({ storage: withSaved([legacy]) });
  await app.extract(LINK);
  await app.click("save");
  assert.equal(app.saved().length, 1);
  assert.equal(app.saved()[0].videoId, ID);
});

test("enregistrement : rouvrir le lien d'une fiche enregistrée affiche la fiche (corrections comprises)", async () => {
  const edited = { ...RECIPE, title: "Mes crêpes corrigées" };
  const app = await boot({ storage: withSaved([savedItem(edited, { servings: 6 })]) });
  await app.extract(LINK);
  assert.equal(app.calls.length, 0);
  assert.equal(app.text("r-title"), "Mes crêpes corrigées");
  assert.equal(app.text("servings-value"), "6");
});

test("enregistrement : stockage plein -> message clair", async () => {
  const app = await boot();
  await app.extract(LINK);
  app.w.Storage.prototype.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  await app.click("save");
  assert.match(app.text("toast"), /Stockage plein/);
});

test("suppression : depuis la fiche, après confirmation, retire la recette et revient à la liste", async () => {
  const app = await boot({ storage: withSaved([savedItem(RECIPE)]) });
  await app.click(app.all("#saved-list .open")[0]);
  assert.equal(app.$("delete").hidden, false);
  app.w.confirm = () => false;
  await app.click("delete");
  assert.equal(app.saved().length, 1);
  app.w.confirm = () => true;
  await app.click("delete");
  assert.equal(app.saved().length, 0);
  assert.equal(app.visible("view-home"), true);
  assert.equal(app.visible("saved-empty"), true);
});

test("suppression : une fiche non enregistrée n'a pas de bouton supprimer", async () => {
  const app = await boot();
  await app.extract(LINK);
  assert.equal(app.$("delete").hidden, true);
});

/* ======================= Modification à la main ======================= */

async function openEditor(app: Awaited<ReturnType<typeof boot>>) {
  await app.click("edit");
  assert.equal(app.visible("recipe-edit"), true);
  assert.equal(app.visible("recipe-read"), false);
}

test("modification : titre, quantité, ingrédient ajouté et supprimé, étape modifiée", async () => {
  const app = await boot();
  await app.extract(LINK);
  await openEditor(app);

  await app.type("e-title", "Crêpes de Mamie");
  const rows = () => app.all("#e-ingredients .ing-row");
  await app.type(rows()[0].querySelector(".e-qty"), "1/2"); // 250 g -> 0,5 g
  await app.type(rows()[0].querySelector(".e-qty"), "300");
  await app.click(rows()[1].querySelector(".icon-btn")); // supprime les œufs
  await app.click("e-add-ing");
  const added = rows()[rows().length - 1];
  await app.type(added.querySelector(".e-qty"), "1,5");
  await app.type(added.querySelector(".e-unit"), "c. à soupe");
  await app.type(added.querySelector(".e-name"), "sucre");
  await app.type(app.all("#e-steps .e-step")[0], "Fouetter la farine et les œufs.");
  await app.type("e-servings", "6");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));

  assert.equal(app.visible("recipe-edit"), false);
  assert.equal(app.text("r-title"), "Crêpes de Mamie");
  const lines = app.lines("r-ingredients");
  assert.equal(lines.length, 4); // 4 - 1 supprimé + 1 ajouté
  assert.ok(lines[0].startsWith("300 g farine"));
  assert.ok(lines.some((l: string) => l.startsWith("1 ½ c. à soupe sucre")));
  assert.ok(!lines.some((l: string) => l.includes("œufs")));
  assert.match(app.text("r-steps"), /Fouetter la farine/);
  assert.equal(app.text("servings-value"), "6");
});

test("modification : une quantité illisible est refusée avec un message", async () => {
  const app = await boot();
  await app.extract(LINK);
  await openEditor(app);
  await app.type(app.all("#e-ingredients .e-qty")[0], "beaucoup");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.equal(app.visible("recipe-edit"), true);
  assert.match(app.text("e-error"), /Quantité illisible/);
  assert.equal(app.text("r-title"), "Pâte à crêpes"); // rien n'a été appliqué
});

test("modification : titre vide refusé, annuler restaure la fiche", async () => {
  const app = await boot();
  await app.extract(LINK);
  await openEditor(app);
  await app.type("e-title", "   ");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.match(app.text("e-error"), /titre est obligatoire/);
  await app.type("e-title", "Changement abandonné");
  await app.click("e-cancel");
  assert.equal(app.visible("recipe-read"), true);
  assert.equal(app.text("r-title"), "Pâte à crêpes");
});

test("modification : une fiche vide (sans ingrédient ni étape) est refusée", async () => {
  const app = await boot();
  await app.extract(LINK);
  await openEditor(app);
  for (const btn of app.all("#e-ingredients .icon-btn")) await app.click(btn);
  for (const btn of app.all("#e-steps .icon-btn")) await app.click(btn);
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.match(app.text("e-error"), /au moins un ingrédient ou une étape/);
});

test("modification : une fiche déjà enregistrée est mise à jour automatiquement", async () => {
  const app = await boot({ storage: withSaved([savedItem(RECIPE)]) });
  await app.click("tab-home");
  await app.click(app.all("#saved-list .open")[0]);
  await openEditor(app);
  await app.type("e-title", "Titre corrigé");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.equal(app.saved().length, 1);
  assert.equal(app.saved()[0].recipe.title, "Titre corrigé");
  assert.match(app.text("toast"), /mise à jour/);
});

test("modification : une fiche non enregistrée garde sa correction dans la mémoire des extractions", async () => {
  const app = await boot();
  await app.extract(LINK);
  await openEditor(app);
  await app.type("e-title", "Version corrigée");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.match(app.text("toast"), /Pense à enregistrer/);
  assert.equal(app.saved().length, 0);

  await app.click("back");
  await app.extract(LINK); // aucun nouvel appel, et la version corrigée revient
  assert.equal(app.calls.length, 1);
  assert.equal(app.text("r-title"), "Version corrigée");
});

test("modification : on peut retirer les avertissements une fois vérifiés", async () => {
  const app = await boot();
  await app.extract(LINK);
  await openEditor(app);
  app.$("e-clear-warnings").checked = true;
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.equal(app.visible("r-warnings"), false);
});

/* ======================= Mode cuisine ======================= */

test("cuisine : ingrédients d'abord (quantités adaptées), puis étape par étape", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("plus"); // 5 portions
  await app.click("cook-start");

  assert.equal(app.visible("cook"), true);
  assert.equal(app.w.document.body.classList.contains("cook-open"), true);
  assert.match(app.text("cook-body"), /5 portions/);
  assert.match(app.text("cook-body"), /312,5 g farine/);
  assert.equal(app.$("cook-prev").disabled, true);
  assert.equal(app.text("cook-progress"), "Ingrédients");

  await app.click("cook-next");
  assert.equal(app.text("cook-progress"), "Étape 1 / 3");
  assert.equal(app.text("cook-body"), "Mélanger la farine et les œufs.");
  assert.equal(app.visible("cook-timer"), false); // pas de durée pour cette étape

  await app.click("cook-next");
  assert.equal(app.text("cook-progress"), "Étape 2 / 3");
  assert.equal(app.visible("cook-timer"), true);
  assert.equal(app.text("cook-clock"), "05:00");

  await app.click("cook-next");
  assert.equal(app.text("cook-next"), "Terminer");
  await app.click("cook-prev");
  assert.equal(app.text("cook-progress"), "Étape 2 / 3");
  await app.click("cook-next");
  await app.click("cook-next"); // « Terminer »
  assert.equal(app.visible("cook"), false);
});

test("cuisine : l'écran reste allumé pendant le mode, puis est relâché", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("cook-start");
  assert.equal(app.wake.requests, 1);
  assert.match(app.text("cook-wake"), /reste allumé/);
  await app.click("cook-quit");
  assert.equal(app.wake.released, 1);
  assert.equal(app.w.document.body.classList.contains("cook-open"), false);
});

test("cuisine : sans verrou d'écran sur l'appareil, l'utilisateur est prévenu", async () => {
  const app = await boot({ wakeLock: false });
  await app.extract(LINK);
  await app.click("cook-start");
  assert.match(app.text("cook-wake"), /Impossible de garder l'écran allumé/);
  assert.equal(app.visible("cook"), true); // le mode fonctionne quand même
});

test("cuisine : minuteur démarrer / pause / remise à zéro, alarme à la fin", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("cook-start");
  await app.click("cook-next");
  await app.click("cook-next"); // étape 2 : 5 minutes

  let now = 1_000_000;
  app.w.Date.now = () => now;
  await app.click("cook-timer-toggle");
  assert.equal(app.text("cook-timer-toggle"), "Pause");
  now += 60_000;
  await flush(600); // le minuteur se met à jour tout seul
  assert.equal(app.text("cook-clock"), "04:00");

  await app.click("cook-timer-toggle");
  assert.equal(app.text("cook-timer-toggle"), "Reprendre");
  now += 120_000;
  await flush(600);
  assert.equal(app.text("cook-clock"), "04:00"); // figé pendant la pause

  await app.click("cook-timer-reset");
  assert.equal(app.text("cook-clock"), "05:00");

  await app.click("cook-timer-toggle");
  now += 301_000;
  await flush(700);
  assert.equal(app.visible("cook-alert"), true);
  assert.match(app.text("cook-alert"), /Minuteur terminé \(étape 2\)/);
  assert.equal(app.text("cook-clock"), "00:00");
  assert.equal(app.$("cook-timer-toggle").disabled, true);

  await app.click("cook-alert"); // toucher l'alerte la ferme
  assert.equal(app.$("cook-alert").hidden, true);
});

test("cuisine : un minuteur en cours reste visible sur les autres étapes", async () => {
  const app = await boot();
  await app.extract(LINK);
  await app.click("cook-start");
  await app.click("cook-next");
  await app.click("cook-next");
  await app.click("cook-timer-toggle");
  await app.click("cook-next"); // étape 3
  assert.match(app.text("cook-others"), /étape 2 : \d\d:\d\d/);
});

test("cuisine : bouton masqué si la fiche n'a pas d'étapes", async () => {
  const app = await boot({ replies: [ok({ ...RECIPE, steps: [] })] });
  await app.extract(LINK);
  assert.equal(app.$("cook-start").hidden, true);
});

/* ======================= Recherche, catégories, liste de courses ======================= */

const two = () =>
  withSaved([
    savedItem(RECIPE, { id: "v:" + ID, savedAt: 2000, servings: 4 }),
    savedItem(SOUPE, { id: "v:" + ID2, savedAt: 1000, videoId: ID2, servings: 8 }),
  ]);

test("rangement : recherche par titre, ingrédient ou mot-clé, sans tenir compte des accents", async () => {
  const app = await boot({ storage: two() });
  await app.click("tab-home");
  assert.equal(app.$("saved-list").children.length, 2);

  await app.type("search", "CREPES");
  assert.equal(app.$("saved-list").children.length, 1);
  assert.match(app.text("saved-list"), /Pâte à crêpes/);

  await app.type("search", "potiron");
  assert.match(app.text("saved-list"), /Soupe de potiron/);

  await app.type("search", "vegetarien"); // mot-clé, sans accent
  assert.match(app.text("saved-list"), /Pâte à crêpes/);
  assert.equal(app.$("saved-list").children.length, 1);

  await app.type("search", "introuvable");
  assert.equal(app.$("saved-list").children.length, 0);
  assert.equal(app.visible("saved-none"), true);
});

test("rangement : filtre par thématique depuis l'accueil", async () => {
  const app = await boot({ storage: two() });
  const chips = app.all("#theme-chips .chip");
  assert.deepEqual(chips.map((c: any) => c.textContent), ["Toutes2", "🥖 France1", "⏱️ Rapide1", "🍲 Mijotés1"]);
  await app.click(chips[3]);
  assert.equal(app.$("saved-list").children.length, 1);
  assert.match(app.text("saved-list"), /Soupe de potiron/);
  await app.click(app.all("#theme-chips .chip")[0]);
  assert.equal(app.$("saved-list").children.length, 2);
});

test("thèmes : tuiles avec effectifs, liste d'une thématique, retour", async () => {
  const app = await boot({ storage: two() });
  await app.click("tab-themes");
  assert.equal(app.visible("view-themes"), true);
  const tiles = app.all("#theme-grid .tile");
  assert.deepEqual(tiles.map((t: any) => t.querySelector("strong").textContent), ["Cuisine française", "Plat rapide du soir", "Plats mijotés"]);
  await app.click(tiles[2]);
  assert.equal(app.visible("view-theme"), true);
  assert.match(app.text("theme-title"), /Plats mijotés/);
  assert.equal(app.$("theme-list").children.length, 1);
  await app.click(app.all("#theme-list .open")[0]);
  assert.equal(app.text("r-title"), "Soupe de potiron");
  await app.click("back");
  assert.equal(app.visible("view-theme"), true);
  await app.click("theme-back");
  assert.equal(app.visible("view-themes"), true);
});

test("thèmes : les recettes sans thématique vont dans « Non classées »", async () => {
  const bare = { ...SOUPE, themes: [] };
  const app = await boot({ storage: withSaved([savedItem(bare)]) });
  await app.click("tab-themes");
  const tiles = app.all("#theme-grid .tile");
  assert.equal(tiles.length, 1);
  assert.match(tiles[0].textContent, /Non classées/);
  assert.equal(app.visible("themes-empty"), false);
});

test("thèmes : sans recette, un message invite à en enregistrer", async () => {
  const app = await boot();
  await app.click("tab-themes");
  assert.equal(app.visible("themes-empty"), true);
});

test("thèmes : on classe une fiche à la main (puce connue, thématique perso, maximum 3)", async () => {
  const bare = { ...SOUPE, themes: [] };
  const app = await boot({ storage: withSaved([savedItem(bare)]) });
  await app.click(app.all("#saved-list .open")[0]);
  await openEditor(app);
  const chipFor = (key: string) => app.$("e-themes").querySelector(`[data-theme="${key}"]`);
  await app.click(chipFor("asie"));
  assert.equal(chipFor("asie").getAttribute("aria-pressed"), "true");
  await app.type("e-theme-new", "Repas de Noël");
  await app.click("e-theme-add");
  await app.click(chipFor("rapide"));
  await app.click(chipFor("france")); // 4e : refusée
  assert.match(app.text("e-theme-hint"), /3 thématiques au maximum/);
  assert.equal(chipFor("france").getAttribute("aria-pressed"), "false");
  await app.type("e-emoji", "🥟");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.deepEqual(app.saved()[0].recipe.themes, ["asie", "Repas de Noël", "rapide"]);
  assert.equal(app.saved()[0].recipe.emoji, "🥟");
  assert.match(app.text("r-themes"), /Repas de Noël/);

  await app.click("back");
  await app.click("tab-themes");
  const labels = app.all("#theme-grid .tile strong").map((t: any) => t.textContent);
  assert.deepEqual(labels, ["Saveurs d'Asie", "Plat rapide du soir", "Repas de Noël"]);
});

test("thèmes : un emoji invalide dans la fiche est refusé", async () => {
  const app = await boot({ storage: withSaved([savedItem(RECIPE)]) });
  await app.click(app.all("#saved-list .open")[0]);
  await openEditor(app);
  await app.type("e-emoji", "pizza");
  await app.click(app.$("recipe-edit").querySelector("[type=submit]"));
  assert.equal(app.visible("e-error"), true);
  assert.match(app.text("e-error"), /emoji/);
});

test("courses : liste groupée de plusieurs recettes, quantités additionnées selon les portions", async () => {
  const app = await boot({ storage: two() });
  await app.click("tab-shopping");
  assert.equal(app.$("make-list").disabled, true);

  for (const cb of app.all("#shop-recipes .sel")) await app.click(cb);
  assert.equal(app.text("make-list"), "Liste de courses (2)");
  await app.click("make-list");

  assert.equal(app.visible("view-shopping"), true);
  const lines = app.lines("shopping-list");
  // farine : 250 g (4 portions) + 50 g × (8/4) = 100 g -> 350 g
  assert.ok(lines.some((l: string) => l.startsWith("350 g farine")), lines.join(" | "));
  // œufs : 3 + 1 × 2 = 5, même si l'un est écrit « œufs » et l'autre « oeuf »
  assert.ok(lines.some((l: string) => l.startsWith("5 œufs")), lines.join(" | "));
  assert.ok(lines.some((l: string) => l.startsWith("1 kg potiron") || l.startsWith("2 kg potiron")));
  assert.match(app.text("shopping-from"), /Pâte à crêpes.*Soupe de potiron/);

  await app.click("shopping-copy");
  assert.match(app.clipboard[0], /^- /);
  assert.ok(app.clipboard[0].includes("350 g farine"));

  await app.click("shopping-back");
  assert.equal(app.visible("shop-pick"), true);
  assert.equal(app.visible("shop-result"), false);
});

test("courses : une fiche supprimée disparaît de la sélection", async () => {
  const app = await boot({ storage: two() });
  await app.click("tab-shopping");
  await app.click(app.all("#shop-recipes .sel")[0]);
  assert.equal(app.text("make-list"), "Liste de courses (1)");
  await app.click("tab-home");
  await app.click(app.all("#saved-list .open")[0]); // la plus récente : la même fiche
  await app.click("delete");
  await app.click("tab-shopping");
  assert.equal(app.$("shop-recipes").children.length, 1);
  assert.equal(app.$("make-list").disabled, true);
});

/* ======================= Export / import ======================= */

const readBlob = (w: any, blob: Blob) =>
  new Promise<string>((resolve) => {
    const r = new w.FileReader();
    r.onload = () => resolve(String(r.result));
    r.readAsText(blob);
  });

test("sauvegarde : l'export contient toutes les fiches et date la dernière sauvegarde", async () => {
  const app = await boot({ storage: two() });
  await app.click("tab-more");
  assert.match(app.text("last-export"), /jamais exporté/);

  await app.click("export");
  assert.equal(app.downloads.length, 1);
  assert.match(app.downloads[0].name, /^cookclip-recettes-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readBlob(app.w, app.downloads[0].blob));
  assert.equal(data.app, "cookclip");
  assert.equal(data.recipes.length, 2);
  assert.match(app.text("last-export"), /Dernière sauvegarde/);
});

test("sauvegarde : rien à exporter sur un appareil vide", async () => {
  const app = await boot();
  await app.click("tab-more");
  await app.click("export");
  assert.equal(app.downloads.length, 0);
  assert.match(app.text("toast"), /Aucune recette à exporter/);
});

async function importFile(app: Awaited<ReturnType<typeof boot>>, content: string, name = "recettes.json") {
  const file = new app.w.File([content], name, { type: "application/json" });
  Object.defineProperty(app.$("import-file"), "files", { value: [file], configurable: true });
  app.$("import-file").dispatchEvent(new app.w.Event("change", { bubbles: true }));
  await flush(60);
}

test("sauvegarde : un export se réimporte sur un autre appareil, sans doublon au second import", async () => {
  const source = await boot({ storage: two() });
  await source.click("tab-more");
  await source.click("export");
  const file = await readBlob(source.w, source.downloads[0].blob);

  const other = await boot();
  await other.click("tab-more");
  await importFile(other, file);
  assert.equal(other.saved().length, 2);
  assert.match(other.text("toast"), /2 ajoutées/);
  await other.click("tab-home");
  assert.equal(other.$("saved-list").children.length, 2);
  assert.equal(other.saved().find((r: any) => r.videoId === ID).recipe.title, "Pâte à crêpes");

  await importFile(other, file); // deuxième import du même fichier
  assert.equal(other.saved().length, 2);
  assert.match(other.text("toast"), /0 ajoutée/);
});

test("sauvegarde : un fichier invalide est refusé sans toucher aux recettes", async () => {
  const app = await boot({ storage: two() });
  await app.click("tab-more");
  await importFile(app, "ceci n'est pas du json");
  assert.match(app.text("toast"), /illisible/);
  await importFile(app, '{"autre": true}');
  assert.match(app.text("toast"), /non reconnu/);
  assert.equal(app.saved().length, 2);
});

test("sauvegarde : un fichier piégé ne peut pas injecter de code dans la page", async () => {
  const app = await boot();
  await app.click("tab-more");
  const evil = {
    recipes: [
      {
        id: "x",
        videoId: 'abc"><img src=x onerror="window.__pwned=1">',
        recipe: {
          title: '<img src=x onerror="window.__pwned=1">',
          ingredients: [{ name: "<script>window.__pwned=1</script>", quantity: 1 }],
          steps: ['<img src=x onerror="window.__pwned=1">'],
        },
      },
    ],
  };
  await importFile(app, JSON.stringify(evil));
  await app.click("tab-home");
  await app.click(app.all("#saved-list .open")[0]);
  await app.click("cook-start");
  assert.equal(app.w.__pwned, undefined);
  assert.equal(app.doc.querySelectorAll("img").length, 0);
  assert.equal(app.doc.querySelectorAll("script:not([src])").length, 0);
  assert.equal(app.visible("r-source"), false); // identifiant de vidéo falsifié -> pas de lien
});

/* ======================= Navigation ======================= */

test("navigation : « Retour » revient à l'écran d'où l'on vient, la barre du bas se masque sur la fiche", async () => {
  const app = await boot({ storage: two() });
  await app.click(app.all("#saved-list .open")[0]);
  assert.equal(app.visible("recipe"), true);
  assert.equal(app.$("bottom-nav").hidden, true);
  await app.click("back");
  assert.equal(app.visible("view-home"), true);
  assert.equal(app.$("bottom-nav").hidden, false);
  assert.equal(app.$("tab-home").getAttribute("aria-current"), "page");

  await app.click("tab-more");
  assert.equal(app.$("tab-more").getAttribute("aria-current"), "page");
  assert.equal(app.$("tab-home").hasAttribute("aria-current"), false);

  await app.click("tab-home");
  await app.extract(`https://youtu.be/${ID2}`);
  await app.click("back");
  assert.equal(app.visible("view-home"), true);
});

test("réglages : oublier le code d'accès", async () => {
  const app = await boot({ storage: { "cookclip.access.v1": JSON.stringify("secret") } });
  await app.click("tab-more");
  await app.click("forget-code");
  assert.match(app.text("toast"), /Code oublié/);
  assert.ok(!app.w.localStorage.getItem("cookclip.access.v1") || !/secret/.test(app.w.localStorage.getItem("cookclip.access.v1")));
});
