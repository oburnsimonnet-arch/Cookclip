/**
 * Extrait de l'erreur 429 de Gemini ce qui aide à comprendre la limite atteinte
 * (nom de la limite, « limit: 0 » = fonction absente de l'offre gratuite, délai conseillé).
 * Ne contient ni clé ni donnée personnelle ; borné à 300 caractères.
 */
export function quotaDetail(raw: string): string | null {
  if (!raw) return null;
  let message = raw;
  // le SDK renvoie parfois le corps JSON brut de l'erreur : on n'en garde que le texte
  if (message.trim().startsWith("{")) {
    try {
      const m = JSON.parse(message)?.error?.message;
      if (typeof m === "string") message = m;
    } catch {
      /* texte brut conservé */
    }
  }
  // message générique de Gemini quand le quota gratuit est épuisé ou que la fonction n'est pas incluse
  if (/check your plan and billing/i.test(message) && !/limit:\s*\d+|retry in/i.test(message)) {
    return "quota de l'offre gratuite épuisé, ou fonction non incluse dans l'offre gratuite";
  }
  const parts: string[] = [];
  const metric = message.match(/quota(?:Metric|Id)?["':\s]+([A-Za-z0-9_./-]{6,120})/i);
  if (metric) parts.push(metric[1]);
  const limit = message.match(/limit:\s*(\d+)/i);
  if (limit) parts.push(`limite : ${limit[1]}`);
  const retry = message.match(/retry in ([\d.]+)s/i);
  if (retry) parts.push(`réessayer dans ${Math.ceil(Number(retry[1]))} s`);
  if (!parts.length) parts.push(message.replace(/\s+/g, " ").slice(0, 200));
  return parts.join(" · ").slice(0, 300);
}
