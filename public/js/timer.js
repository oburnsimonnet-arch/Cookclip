/**
 * Minuteur basé sur l'heure de fin (et non sur un compteur) : il reste exact même si
 * l'écran se met en veille ou si le navigateur ralentit les intervalles.
 * Toutes les méthodes reçoivent l'heure courante en millisecondes (Date.now()).
 */
export function createTimer(totalSec) {
  const totalMs = Math.max(0, Math.round(totalSec * 1000));
  let remainingMs = totalMs;
  let endAt = null;

  return {
    total: totalMs / 1000,
    start(now) {
      if (endAt === null && remainingMs > 0) endAt = now + remainingMs;
    },
    pause(now) {
      if (endAt !== null) {
        remainingMs = Math.max(0, endAt - now);
        endAt = null;
      }
    },
    reset() {
      remainingMs = totalMs;
      endAt = null;
    },
    running() {
      return endAt !== null;
    },
    remainingSec(now) {
      const ms = endAt !== null ? Math.max(0, endAt - now) : remainingMs;
      return Math.ceil(ms / 1000);
    },
    /** Renvoie true une seule fois, au moment où le minuteur atteint zéro. */
    tick(now) {
      if (endAt !== null && now >= endAt) {
        remainingMs = 0;
        endAt = null;
        return true;
      }
      return false;
    },
  };
}
