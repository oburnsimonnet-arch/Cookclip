const ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extrait l'identifiant d'une vidéo YouTube depuis un lien (watch, youtu.be, shorts, embed) ou un texte partagé. */
export function extractVideoId(input: string): string | null {
  const text = input.trim();
  if (ID_RE.test(text)) return text;

  const urlMatch = text.match(/https?:\/\/[^\s]+/i);
  if (!urlMatch) return null;

  let url: URL;
  try {
    url = new URL(urlMatch[0]);
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
    const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return null;
}

/** Lien canonique envoyé à Gemini : sans paramètres de suivi, sans horodatage, quel que soit le format d'origine. */
export function canonicalVideoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}
