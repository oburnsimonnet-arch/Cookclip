import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Vérifie le code d'accès envoyé par l'application.
 * - Si aucun code n'est configuré côté serveur (ACCESS_CODE absent), l'accès reste ouvert.
 * - La comparaison se fait sur des empreintes SHA-256, en temps constant.
 */
export function isAuthorized(provided: unknown, expected: string | undefined): boolean {
  if (!expected) return true;
  if (typeof provided !== "string" || !provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
