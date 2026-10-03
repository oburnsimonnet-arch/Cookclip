/** Extrait de transcription automatique réaliste (pas de ponctuation, erreurs de reconnaissance). */
export const SAMPLE_TRANSCRIPT = `bonjour à tous aujourd'hui on prépare une pâte à crêpes toute simple pour six personnes
alors il vous faut 250 grammes de farine 4 oeufs un demi litre de lait deux cuillères à soupe de sucre
une pincée de sel et 50 grammes de beurre fondu vous pouvez aussi ajouter un peu de rhum à l'oeil
on met la farine dans un saladier on fait un puits on ajoute les oeufs et le sucre on mélange
puis on verse le lait petit à petit en fouettant pour éviter les grumeaux ensuite on ajoute le beurre fondu
on laisse reposer la pâte une heure au frais n'oubliez pas de vous abonner à la chaîne
pour la cuisson une poêle bien chaude une petite louche de pâte deux minutes de chaque côté`;

/** Ce qu'un bon modèle devrait renvoyer pour la transcription ci-dessus (entouré de ```json comme souvent). */
export const SAMPLE_MODEL_REPLY = `Voici la recette :
\`\`\`json
{
  "isRecipe": true,
  "title": "Pâte à crêpes",
  "language": "fr",
  "servings": 6,
  "prepTimeMin": 10,
  "cookTimeMin": null,
  "ingredients": [
    {"name": "farine", "quantity": 250, "unit": "g", "note": null, "uncertain": false},
    {"name": "œufs", "quantity": 4, "unit": null, "note": null, "uncertain": false},
    {"name": "lait", "quantity": 0.5, "unit": "l", "note": null, "uncertain": false},
    {"name": "sucre", "quantity": 2, "unit": "c. à soupe", "note": null, "uncertain": false},
    {"name": "sel", "quantity": 1, "unit": "pincée", "note": null, "uncertain": false},
    {"name": "beurre fondu", "quantity": 50, "unit": "g", "note": null, "uncertain": false},
    {"name": "rhum", "quantity": null, "unit": null, "note": "à l'œil, facultatif", "uncertain": true}
  ],
  "steps": [
    {"text": "Mettre la farine dans un saladier et faire un puits.", "durationMin": null},
    {"text": "Ajouter les œufs et le sucre, puis mélanger.", "durationMin": null},
    {"text": "Verser le lait petit à petit en fouettant pour éviter les grumeaux.", "durationMin": null},
    {"text": "Incorporer le beurre fondu.", "durationMin": null},
    {"text": "Laisser reposer la pâte au frais.", "durationMin": 60},
    {"text": "Cuire une petite louche de pâte dans une poêle bien chaude, des deux côtés.", "durationMin": 4}
  ],
  "tips": [],
  "warnings": ["Le temps de cuisson total n'est pas précisé."]
}
\`\`\``;
