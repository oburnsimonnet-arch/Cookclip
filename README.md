# Cookclip

Colle (ou partage) le lien d'une vidéo de cuisine YouTube : Cookclip en extrait la recette — ingrédients, étapes, temps — avec ajustement des portions et liste de courses.

PWA installable sur Android + une route serverless (`/api/recipe`) qui lit la transcription de la vidéo et demande à Claude de la structurer.

## Comment ça marche

1. Le front envoie le lien à `POST /api/recipe`.
2. Le backend récupère la **transcription** et la **description** de la vidéo YouTube.
3. Claude les transforme en JSON structuré. Il a pour consigne de ne **jamais inventer** une quantité : ce qui n'est pas dit est marqué « quantité non précisée ».
4. Le JSON est validé (`lib/recipe.ts`) avant d'être renvoyé à l'application.

La clé d'API reste côté serveur, jamais dans l'application.

## Déploiement (Vercel)

1. Sur [vercel.com](https://vercel.com) : **Add New… → Project**, puis importe ce dépôt GitHub. Aucun réglage de build à changer.
2. Dans **Settings → Environment Variables**, ajoute :
   - `ANTHROPIC_API_KEY` : ta clé, créée sur [console.anthropic.com](https://console.anthropic.com).
   - *(optionnel)* `CLAUDE_MODEL` : pour changer de modèle (défaut : `claude-sonnet-5-5`).
3. Redéploie (**Deployments → Redeploy**) pour que la variable soit prise en compte.

## Installer sur Android

1. Ouvre l'adresse Vercel dans **Chrome** sur le téléphone.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Dans YouTube, bouton **Partager** → **Cookclip** : la recette s'affiche directement.

> Le partage vers l'application (`share_target`) n'apparaît dans la liste de partage qu'une fois la PWA **installée** via Chrome.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigne ANTHROPIC_API_KEY
npm run typecheck
npm test                     # tests de la logique, sans appel réseau ni clé
npx vercel dev               # lance le site et l'API en local
```

## Limites connues

- **YouTube uniquement** pour l'instant. TikTok et Instagram demandent une autre approche (analyse des images), prévue plus tard.
- **La récupération de la transcription peut échouer** : YouTube bloque parfois les requêtes venant des serveurs (dont Vercel) et certaines vidéos n'ont pas de sous-titres. Dans ce cas, l'application propose de **coller la transcription à la main** (YouTube → « … plus » → « Afficher la transcription »).
- **Quantités approximatives** : « un peu de », « à l'œil » restent sans valeur et sont signalées.
- Les recettes enregistrées sont stockées **sur l'appareil** (pas de compte, pas de synchronisation).

## Structure

```
api/recipe.ts      route serverless
lib/youtube.ts     lien → identifiant, transcription, description
lib/extract.ts     prompt + appel à Claude
lib/recipe.ts      types, extraction et validation du JSON
public/            PWA (HTML, CSS, JS, manifeste, service worker, icônes)
tests/             tests unitaires
```

## Idées pour la suite

- Prise en charge de TikTok / Instagram (analyse d'images clés)
- Liste de courses regroupée entre plusieurs recettes
- Mode cuisine : écran allumé, étapes une par une, minuteurs
- Export de la recette (PDF, partage)
