import { formatClock } from "./format.js";
import { createTimer } from "./timer.js";

/**
 * Mode cuisine : une étape à la fois en grand, minuteurs, écran maintenu allumé.
 * Diapositive 0 = ingrédients (quantités selon les portions choisies), puis une par étape.
 */
export function initCook({ getCurrent, ingredientLabel }) {
  const $ = (id) => document.getElementById(id);
  const root = $("cook");

  let slides = [];
  let index = 0;
  let isOpen = false;
  let tickId = null;
  let wakeLock = null;
  let audio = null;
  let touchX = null;
  const timers = new Map(); // numéro de diapositive -> minuteur

  /* ---------- écran maintenu allumé ---------- */
  async function acquireWake() {
    const note = $("cook-wake");
    try {
      if (!("wakeLock" in navigator)) throw new Error("non pris en charge");
      wakeLock = await navigator.wakeLock.request("screen");
      note.textContent = "L'écran reste allumé pendant la cuisine.";
    } catch {
      wakeLock = null;
      note.textContent = "Impossible de garder l'écran allumé sur cet appareil : règle sa mise en veille si besoin.";
    }
  }
  function releaseWake() {
    try {
      if (wakeLock) wakeLock.release();
    } catch {
      /* déjà relâché */
    }
    wakeLock = null;
  }
  // Android relâche le verrou quand l'application passe en arrière-plan : on le reprend au retour.
  document.addEventListener("visibilitychange", () => {
    if (isOpen && !document.hidden) acquireWake();
  });

  /* ---------- son et vibration ---------- */
  function ensureAudio() {
    try {
      if (!audio) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audio = new Ctx();
      }
      if (audio && audio.state === "suspended") audio.resume();
    } catch {
      audio = null;
    }
  }
  function beep() {
    try {
      if (!audio) return;
      for (let i = 0; i < 3; i++) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.frequency.value = 880;
        gain.gain.value = 0.2;
        osc.connect(gain);
        gain.connect(audio.destination);
        const t = audio.currentTime + i * 0.35;
        osc.start(t);
        osc.stop(t + 0.2);
      }
    } catch {
      /* pas de son disponible */
    }
  }

  /* ---------- affichage ---------- */
  function currentSlide() {
    return slides[index];
  }

  function renderTimerBox() {
    const box = $("cook-timer");
    const slide = currentSlide();
    const minutes = slide.type === "step" ? slide.step.durationMin : null;
    box.hidden = !minutes;
    if (!minutes) return;
    if (!timers.has(index)) timers.set(index, createTimer(minutes * 60));
    updateClock();
  }

  function updateClock() {
    const now = Date.now();

    // minuteurs en cours sur les autres étapes (à rappeler même quand l'étape affichée n'en a pas)
    const others = [];
    for (const [i, other] of timers) {
      if (i !== index && other.running()) {
        others.push(`étape ${i} : ${formatClock(other.remainingSec(now))}`);
      }
    }
    $("cook-others").textContent = others.length ? "Minuteurs en cours — " + others.join(" · ") : "";

    const t = timers.get(index);
    if (!t) return;
    $("cook-clock").textContent = formatClock(t.remainingSec(now));
    $("cook-timer-toggle").textContent = t.running()
      ? "Pause"
      : t.remainingSec(now) === 0
        ? "Terminé"
        : t.remainingSec(now) < t.total
          ? "Reprendre"
          : "Démarrer";
    $("cook-timer-toggle").disabled = !t.running() && t.remainingSec(now) === 0;
  }

  function render() {
    const cur = getCurrent();
    const slide = currentSlide();
    const last = slides.length - 1;
    $("cook-title").textContent = cur.recipe.title;

    const body = $("cook-body");
    body.replaceChildren();
    if (slide.type === "ingredients") {
      const h = document.createElement("h2");
      h.textContent = `Ingrédients · ${cur.servings} portion${cur.servings > 1 ? "s" : ""}`;
      const ul = document.createElement("ul");
      ul.className = "cook-ingredients";
      cur.recipe.ingredients.forEach((ing) => {
        const li = document.createElement("li");
        const { qty, name } = ingredientLabel(ing);
        if (qty) {
          const b = document.createElement("strong");
          b.textContent = qty + " ";
          li.append(b);
        }
        li.append(document.createTextNode(name));
        if (ing.note || ing.uncertain) {
          const n = document.createElement("span");
          n.className = "approx";
          n.textContent = " — " + (ing.note || "quantité non précisée");
          li.append(n);
        }
        ul.append(li);
      });
      body.append(h, ul);
    } else {
      const p = document.createElement("p");
      p.className = "cook-step-text";
      p.textContent = slide.step.text;
      body.append(p);
    }

    $("cook-progress").textContent = slide.type === "ingredients" ? "Ingrédients" : `Étape ${slide.n} / ${last}`;
    $("cook-prev").disabled = index === 0;
    $("cook-next").textContent = index === last ? "Terminer" : "Suivant";
    renderTimerBox();
    if (slide.type !== "step") $("cook-timer").hidden = true;
    updateClock();
  }

  function go(delta) {
    const next = index + delta;
    if (next < 0) return;
    if (next >= slides.length) return close();
    index = next;
    render();
  }

  /* ---------- minuteurs ---------- */
  function tick() {
    const now = Date.now();
    for (const [i, t] of timers) {
      if (t.tick(now)) alarm(i);
    }
    updateClock();
  }

  function alarm(slideNumber) {
    const a = $("cook-alert");
    a.textContent = `Minuteur terminé (étape ${slideNumber}). Touche ici pour fermer.`;
    a.hidden = false;
    beep();
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate([300, 150, 300, 150, 300]);
    } catch {
      /* vibration indisponible */
    }
  }

  /* ---------- ouverture / fermeture ---------- */
  function open() {
    const cur = getCurrent();
    if (!cur || !cur.recipe.steps.length) return false;
    slides = [
      { type: "ingredients" },
      ...cur.recipe.steps.map((step, i) => ({ type: "step", step, n: i + 1 })),
    ];
    index = 0;
    timers.clear();
    isOpen = true;
    root.hidden = false;
    $("cook-alert").hidden = true;
    document.body.classList.add("cook-open");
    ensureAudio();
    acquireWake();
    render();
    tickId = setInterval(tick, 500);
    return true;
  }

  function close() {
    isOpen = false;
    clearInterval(tickId);
    tickId = null;
    releaseWake();
    timers.clear();
    root.hidden = true;
    document.body.classList.remove("cook-open");
  }

  $("cook-quit").addEventListener("click", close);
  $("cook-prev").addEventListener("click", () => go(-1));
  $("cook-next").addEventListener("click", () => go(1));
  $("cook-alert").addEventListener("click", () => ($("cook-alert").hidden = true));
  $("cook-timer-toggle").addEventListener("click", () => {
    const t = timers.get(index);
    if (!t) return;
    ensureAudio(); // le toucher autorise le son plus tard
    if (t.running()) t.pause(Date.now());
    else t.start(Date.now());
    updateClock();
  });
  $("cook-timer-reset").addEventListener("click", () => {
    const t = timers.get(index);
    if (t) t.reset();
    updateClock();
  });

  // glisser vers la gauche / droite pour changer d'étape
  const body = $("cook-body");
  body.addEventListener("touchstart", (e) => (touchX = e.changedTouches[0].clientX), { passive: true });
  body.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  });
  document.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "Escape") close();
  });

  return { open, close, isOpen: () => isOpen };
}
