# Cookclip

Colle (ou partage) le lien d'une vidéo de cuisine YouTube : Cookclip en extrait la recette — ingrédients, étapes, temps — avec ajustement des portions et liste de courses.

PWA installable sur Android + une route serverless (`/api/recipe`) qui confie la vidéo à Gemini et renvoie une recette structurée.

## Comment ça marche

1. Le front envoie le lien à `POST /api/recipe`.
2. Le backend transmet le lien YouTube à **Gemini**, qui regarde et écoute la vidéo : voix, texte affiché à l'écran (quantités incrustées) et images.
3. Gemini renvoie la recette en JSON. Il a pour consigne de ne **jamais inventer** une quantité : ce qui n'est pas dit ni affiché est marqué « quantité non précisée ».
4. Le JSON est validé (`lib/recipe.ts`) avant d'être renvoyé à l'application.

Si la vidéo ne peut pas être lue, l'application propose de **coller la transcription à la main** ; Gemini la traite alors comme du texte.

La clé d'API reste côté serveur, jamais dans l'application.

## Déploiement (Vercel)

1. Sur [vercel.com](https://vercel.com) : **Add New… → Project**, puis importe ce dépôt GitHub. Aucun réglage de build à changer.
2. Dans **Settings → Environment Variables**, ajoute :
   - `GEMINI_API_KEY` : ta clé, créée sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
   - *(optionnel)* `GEMINI_MODEL` : pour changer de modèle (défaut : `gemini-3.8-flash`).
3. Redéploie (**Deployments → Redeploy**) pour que la variable soit prise en compte.

> Ne mets jamais la clé dans le code ni dans GitHub : uniquement dans les variables d'environnement de Vercel.

## Installer sur Android

1. Ouvre l'adresse Vercel dans **Chrome** sur le téléphone.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Dans YouTube, bouton **Partager** → **Cookclip** : la recette s'affiche directement.

> Le partage vers l'application (`share_target`) n'apparaît dans la liste de partage qu'une fois la PWA **installée** via Chrome.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigne GEMINI_API_KEY
npm run typecheck
npm test                     # tests de la logique, sans appel réseau ni clé
npx vercel dev               # lance le site et l'API en local
```

## Limites connues

- **YouTube uniquement** : l'API Gemini ne lit que les liens YouTube. TikTok et Instagram demanderaient une autre approche.
- **Vidéos publiques uniquement** : les vidéos privées ou non répertoriées ne sont pas lisibles par Gemini.
- **Quota** : en offre gratuite, Gemini 3.8 Flash est limité (à la date de rédaction) à 5 requêtes par minute et 20 par jour, plus 8 heures de vidéo YouTube par jour. Tes limites réelles sont sur [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). Pas de relance automatique côté serveur (elles consomment le quota). Vérifie les tarifs de l'offre payante : l'analyse d'une vidéo coûte plus qu'un simple texte.
- **Lien de la vidéo** : chaque fiche garde le lien de la vidéo d'origine, affiché en bas de la recette et conservé à l'enregistrement. Il est aussi ajouté au texte du bouton « Partager ».
- **Mémoire locale** : chaque recette extraite est gardée sur l'appareil (40 dernières vidéos). Rouvrir le même lien, quel que soit son format, n'appelle donc pas Gemini. Le bouton « Réextraire » force un nouvel appel si la recette est fausse.
- **Durée de traitement** : compte jusqu'à une minute. La fonction Vercel est limitée à 60 secondes, ce qui peut couper les très longues vidéos.
- **Quantités approximatives** : « un peu de », « à l'œil » restent sans valeur et sont signalées.
- Les recettes enregistrées sont stockées **sur l'appareil** (pas de compte, pas de synchronisation).

## Structure

```
api/recipe.ts      route serverless
lib/youtube.ts     lien → identifiant de vidéo
lib/extract.ts     prompt + appels à Gemini (vidéo, ou texte en secours)
lib/recipe.ts      types, extraction et validation du JSON
public/            PWA (HTML, CSS, JS, manifeste, service worker, icônes)
tests/             tests unitaires
```

## Idées pour la suite

- Prise en charge de TikTok / Instagram
- Liste de courses regroupée entre plusieurs recettes
- Mode cuisine : écran allumé, étapes une par une, minuteurs
- Export de la recette (PDF, partage)
