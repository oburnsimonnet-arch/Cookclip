const SAVED_KEY = "cookclip.recipes.v1";
const CACHE_KEY = "cookclip.cache.v1";
const SETTINGS_KEY = "cookclip.settings.v1";
const ACCESS_KEY = "cookclip.access.v1";
export const CACHE_MAX = 40;

/** Clé de mémoire d'une extraction : la vidéo ET la langue demandée (une version française diffère de l'originale). */
export function cacheKey(videoId, french) {
  return videoId + (french ? ":fr" : ":orig");
}

/**
 * Accès au stockage local de l'appareil (recettes, mémoire des extractions, réglages, code d'accès).
 * `storage` a la forme de localStorage ; tout échec (stockage plein ou indisponible) est absorbé.
 */
export function createStore(storage) {
  const read = (key, fallback) => {
    try {
      const v = JSON.parse(storage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  };

  return {
    loadSaved() {
      const v = read(SAVED_KEY, []);
      return Array.isArray(v) ? v : [];
    },
    /** @returns {boolean} false si l'écriture a échoué (stockage plein) */
    storeSaved(list) {
      return write(SAVED_KEY, list);
    },

    cacheGet(key) {
      const cache = read(CACHE_KEY, {});
      return cache && typeof cache === "object" ? cache[key] || null : null;
    },
    cachePut(key, recipe) {
      const cache = read(CACHE_KEY, {});
      cache[key] = { recipe, at: Date.now() };
      // on ne garde que les plus récentes
      const keys = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at);
      keys.slice(CACHE_MAX).forEach((old) => delete cache[old]);
      write(CACHE_KEY, cache);
    },

    getSetting(name, fallback) {
      const s = read(SETTINGS_KEY, {});
      return s && name in s ? s[name] : fallback;
    },
    setSetting(name, value) {
      const s = read(SETTINGS_KEY, {});
      s[name] = value;
      write(SETTINGS_KEY, s);
    },

    getAccessCode() {
      try {
        return storage.getItem(ACCESS_KEY) || "";
      } catch {
        return "";
      }
    },
    setAccessCode(code) {
      try {
        if (code) storage.setItem(ACCESS_KEY, code);
        else storage.removeItem(ACCESS_KEY);
      } catch {
        /* stockage indisponible : le code sera redemandé */
      }
    },
  };
}
