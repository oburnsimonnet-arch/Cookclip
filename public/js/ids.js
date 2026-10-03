export const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extrait l'identifiant d'une vidéo YouTube depuis un lien (watch, youtu.be, shorts, embed) ou un texte de partage. */
export function videoIdFrom(input) {
  const text = (input || "").trim();
  if (ID_RE.test(text)) return text;
  const m = text.match(/https?:\/\/[^\s]+/i);
  if (!m) return null;
  let url;
  try {
    url = new URL(m[0]);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1];
    return id && ID_RE.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "music.youtube.com") {
    const v = url.searchParams.get("v");
    if (v && ID_RE.test(v)) return v;
    const p = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
    if (p) return p[1];
  }
  return null;
}

/** Lien de la vidéo d'origine (null si l'identifiant est absent ou invalide). */
export function videoUrl(id) {
  return id && ID_RE.test(id) ? "https://www.youtube.com/watch?v=" + id : null;
}

/** Identifiant d'une fiche enregistrée : la vidéo si on la connaît, sinon titre + nombre d'étapes. */
export function savedIdFor(recipe, videoId) {
  return videoId ? "v:" + videoId : legacyIdFor(recipe);
}

/** Ancien format d'identifiant (fiches enregistrées avant l'ajout du lien vidéo). */
export function legacyIdFor(recipe) {
  return recipe.title + "|" + recipe.steps.length;
}
