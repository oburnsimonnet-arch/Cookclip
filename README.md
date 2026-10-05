# Cookclip

Colle (ou partage) le lien d'une vidéo de cuisine YouTube : Cookclip en extrait la recette — ingrédients, étapes, temps — que tu peux ajuster, corriger, ranger, cuisiner pas à pas et transformer en liste de courses.

PWA installable sur Android + une route serverless (`/api/recipe`) qui confie la vidéo à Gemini et renvoie une recette structurée.

## Fonctions

- **Extraction** : Gemini regarde et écoute la vidéo (voix, texte affiché à l'écran, images). Il a pour consigne de ne **jamais inventer** une quantité : ce qui n'est pas dit ni affiché est marqué « quantité non précisée ».
- **En français** : case cochée par défaut ; une vidéo en anglais donne une recette traduite.
- **Portions** ajustables, ingrédients à cocher, liste de courses copiable.
- **Modifier** : corrige titre, catégorie, portions, ingrédients et étapes à la main (ajout, suppression, fractions `1/2` acceptées). Une fiche déjà enregistrée est mise à jour automatiquement.
- **Mode cuisine** : une étape à la fois en grand, glisser pour changer d'étape, **minuteurs** pour les étapes qui ont une durée (son + vibration à la fin, plusieurs minuteurs possibles), écran maintenu allumé.
- **Thématiques** : Gemini range chaque recette dans 1 ou 2 thématiques d'une liste fixe (cuisine française, italienne, réunionnaise, Asie, Orient et Maghreb, Amériques, plat rapide, léger, végétarien, fêtes et apéro, douceurs, plats mijotés, incontournables du monde). Onglet **Thèmes** (tuiles + liste), filtre par thématique sur l'accueil, recettes sans thématique dans « Non classées ». Pour classer : bouton **Classer cette recette** sur chaque fiche (enregistré tout de suite) et bouton **Classer automatiquement** dans l'onglet Thèmes (un seul appel Gemini, texte seul, pour toutes les recettes sans thématique, 40 au plus par appel). Dans **Modifier**, on change les thématiques (3 au plus) et on crée les siennes (« Repas de Noël »).
- **Rangement** : catégorie et mots-clés proposés par Gemini, recherche (titre, ingrédient, mot-clé, thématique — sans tenir compte des accents).
- **Visuel** : inspiré du projet « Saveurs » (cartes arrondies, titres en Fraunces, texte en Plus Jakarta Sans, navigation en bas, mode sombre). Pas de photos : chaque carte a la couleur de sa thématique et l'emoji du plat.
- **Liste de courses groupée** : coche plusieurs recettes enregistrées ; les ingrédients identiques sont additionnés selon les portions (`500 g` + `25 cl`… `œufs` / `oeuf`, `g` / `kg`, `ml` / `cl` / `l`).
- **Lien de la vidéo** conservé sur chaque fiche.
- **Sauvegarde** : export de toutes les recettes dans un fichier, import sans doublon.
- **Mémoire** : une vidéo déjà extraite n'est jamais relue (quota Gemini économisé).
- **Code d'accès** pour protéger l'API.

## Comment ça marche

1. Le front envoie le lien à `POST /api/recipe`.
2. Le backend transmet le lien YouTube à **Gemini**, qui analyse la vidéo et renvoie la recette en JSON.
3. Le JSON est validé (`lib/recipe.ts`) avant d'être renvoyé à l'application.

Si la vidéo ne peut pas être lue, l'application propose de **coller la transcription à la main** ; Gemini la traite alors comme du texte.

La clé d'API reste côté serveur, jamais dans l'application.

## Déploiement (Vercel)

1. Sur [vercel.com](https://vercel.com) : **Add New… → Project**, puis importe ce dépôt GitHub. Aucun réglage de build à changer.
2. Dans **Settings → Environment Variables**, ajoute :
   - `GEMINI_API_KEY` : ta clé, créée sur [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
   - `ACCESS_CODE` : un code d'accès long, de ton choix (voir ci-dessous).
   - *(optionnel)* `GEMINI_MODEL` : pour changer de modèle (défaut : `gemini-3.8-flash`).
3. Redéploie (**Deployments → Redeploy**) pour que les variables soient prises en compte.

> Ne mets jamais une clé ou un code dans le code ni dans GitHub : uniquement dans les variables d'environnement de Vercel.

### Protéger l'accès (important)

Sans `ACCESS_CODE`, **n'importe qui connaissant l'adresse du site peut appeler l'API** et consommer ton quota Gemini — ou ta facture si tu actives la facturation. Avec `ACCESS_CODE` défini :

- le serveur refuse toute demande sans le bon code, **avant** d'appeler Gemini ;
- l'application demande le code au premier usage, puis le retient sur l'appareil ;
- si le code est refusé, il est oublié et redemandé.

Choisis une phrase d'au moins 16 caractères : le serveur ralentit les essais répétés (0,4 s par essai) mais ne limite pas le nombre de tentatives par adresse IP. Pour changer le code : modifie la variable dans Vercel, redéploie, puis saisis le nouveau code sur chaque appareil.

## Installer sur Android

1. Ouvre l'adresse Vercel dans **Chrome** sur le téléphone.
2. Menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
3. Dans YouTube, bouton **Partager** → **Cookclip** : la recette s'affiche directement.

> Le partage vers l'application (`share_target`) n'apparaît dans la liste de partage qu'une fois la PWA **installée** via Chrome.

## Sauvegarde de tes recettes

Les recettes sont stockées **sur l'appareil**, dans le navigateur : effacer les données de Chrome ou changer de téléphone les supprime. Dans l'onglet **Enregistrées → Sauvegarde**, **Exporter** crée un fichier `cookclip-recettes-AAAA-MM-JJ.json` ; **Importer** le relit sur n'importe quel appareil, sans créer de doublon (à fiche identique, la plus récente est gardée). Exporte de temps en temps.

## Développement local

```bash
npm install
cp .env.example .env.local   # puis renseigne GEMINI_API_KEY (et ACCESS_CODE)
npm run typecheck
npm test                     # logique + interface simulée, sans appel réseau ni clé
npx vercel dev               # lance le site et l'API en local
```

## Limites connues

- **YouTube uniquement** : l'API Gemini ne lit que les liens YouTube. TikTok et Instagram demanderaient d'envoyer le fichier vidéo lui-même.
- **Vidéos publiques uniquement** : les vidéos privées ou non répertoriées ne sont pas lisibles par Gemini.
- **Quota** : en offre gratuite, Gemini 3.8 Flash est limité (à la date de rédaction) à 5 requêtes par minute et 20 par jour, plus 8 heures de vidéo YouTube par jour. Tes limites réelles sont sur [aistudio.google.com/rate-limit](https://aistudio.google.com/rate-limit). Pas de relance automatique côté serveur (elles consomment le quota). Vérifie les tarifs de l'offre payante : l'analyse d'une vidéo coûte plus qu'un simple texte.
- **Durée de traitement** : compte jusqu'à une minute. La fonction Vercel est limitée à 60 secondes, ce qui peut couper les très longues vidéos.
- **Quantités approximatives** : « un peu de », « à l'œil » restent sans valeur et sont signalées ; relis toujours les avertissements.
- **Catégorie et mots-clés** sont proposés par Gemini et peuvent être faux (« végétarien » en particulier) : corrige-les avec **Modifier**.
- **Écran allumé** : dépend du navigateur ; si l'appareil ne le permet pas, le mode cuisine prévient et fonctionne quand même.
- **Une seule langue d'interface** (français).
- **Recettes enregistrées avant les thématiques** : elles vont dans « Non classées » ; ouvre-les et touche **Modifier** pour les classer.
- **Bouton retour du téléphone** : il quitte l'application au lieu de revenir à l'écran précédent (utilise la flèche de l'application).

## Structure

```
api/recipe.ts      route serverless (code d'accès, vidéo ou transcription)
api/classify.ts    classement par thématiques de recettes déjà enregistrées (un appel)
lib/classify.ts    prompt et validation du classement
lib/access.ts      vérification du code d'accès
lib/youtube.ts     lien → identifiant de vidéo
lib/extract.ts     prompt + appels à Gemini (vidéo, ou texte en secours)
lib/recipe.ts      types, catégories, thématiques, extraction et validation du JSON
public/index.html  les écrans
public/app.js      assemblage de l'application
public/js/         modules : stockage, sauvegarde, liste de courses, minuteur,
                   mode cuisine, éditeur, validation, formats, thématiques,
                   icônes, composants d'interface
public/fonts/      Fraunces et Plus Jakarta Sans (licence SIL OFL, copiées ici)
tests/             tests de la logique et de l'interface (jsdom)
```

## Idées pour la suite

- TikTok / Instagram (envoi du fichier vidéo)
- Synchronisation entre appareils (compte)
- Regroupement des ingrédients par sections (« pour la sauce »)
- Limitation du nombre d'essais par adresse IP
