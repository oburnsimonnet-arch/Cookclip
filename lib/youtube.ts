import { YoutubeTranscript } from "youtube-transcript";

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

export interface VideoInfo {
  id: string;
  title: string | null;
  description: string | null;
  transcript: string | null;
}

/** Récupère titre et description depuis la page de la vidéo. Échec silencieux : c'est un bonus. */
async function fetchPageDetails(
  id: string,
): Promise<{ title: string | null; description: string | null }> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${id}&hl=fr`, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
        cookie: "CONSENT=YES+1",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { title: null, description: null };
    const html = await res.text();
    const m = html.match(/"videoDetails":(\{.*?"isLiveContent")/s);
    if (!m) return { title: null, description: null };
    const details = JSON.parse(m[1] + "}") as {
      title?: string;
      shortDescription?: string;
    };
    return {
      title: details.title ?? null,
      description: details.shortDescription ?? null,
    };
  } catch {
    return { title: null, description: null };
  }
}

async function fetchTranscript(id: string): Promise<string | null> {
  for (const lang of ["fr", "en", undefined]) {
    try {
      const parts = await YoutubeTranscript.fetchTranscript(
        id,
        lang ? { lang } : undefined,
      );
      const text = parts
        .map((p) => p.text.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join(" ");
      if (text) return decodeEntities(text);
    } catch {
      // essaie la langue suivante
    }
  }
  return null;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;#39;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function fetchVideoInfo(id: string): Promise<VideoInfo> {
  const [page, transcript] = await Promise.all([
    fetchPageDetails(id),
    fetchTranscript(id),
  ]);
  return { id, ...page, transcript };
}
