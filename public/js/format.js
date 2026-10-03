const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

// fractions courantes, plus lisibles en cuisine
const FRACTIONS = { 0.25: "¼", 0.33: "⅓", 0.5: "½", 0.67: "⅔", 0.75: "¾" };

export function formatNumber(n) {
  return nf.format(Math.round(n * 100) / 100);
}

/**
 * 0.5 -> « ½ », 1.5 -> « 1 ½ », 250 -> « 250 », 312.5 -> « 312,5 ». null -> « ».
 * Les fractions ne servent que pour les petites quantités (cuillères, pièces, litres) :
 * « 312 ½ g » serait absurde.
 */
export function formatQty(q) {
  if (q === null || q === undefined) return "";
  const whole = Math.floor(q);
  const rest = Math.round((q - whole) * 100) / 100;
  if (whole < 10 && rest in FRACTIONS) return (whole ? whole + " " : "") + FRACTIONS[rest];
  return formatNumber(q);
}

/** « 4 », « 4,5 », « 1/2 », « 1 1/2 », « ½ » -> nombre ; texte vide ou illisible -> null. */
export function parseQty(text) {
  const t = String(text ?? "")
    .trim()
    .replace(",", ".");
  if (!t) return null;
  const uni = { "¼": 0.25, "⅓": 1 / 3, "½": 0.5, "⅔": 2 / 3, "¾": 0.75 };
  if (t in uni) return uni[t];
  let m = t.match(/^(\d+)\s*([¼⅓½⅔¾])$/);
  if (m) return Number(m[1]) + uni[m[2]];
  m = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[3]) > 0) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (m && Number(m[2]) > 0) return Number(m[1]) / Number(m[2]);
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 90 -> « 01:30 », 3725 -> « 1:02:05 ». */
export function formatClock(totalSec) {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
