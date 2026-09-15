# Ajouter un questionnaire quotidien de disponibilité à l’entraînement

Implémente dans l’application un **questionnaire quotidien de disponibilité** permettant d’adapter la séance du jour à l’état réel de l’utilisateur.

Le questionnaire doit tenir compte du temps disponible, de la fatigue, du sommeil, des courbatures, de la motivation et des douleurs éventuelles. Son résultat doit compléter les données COROS et influencer les recommandations du jour ainsi que les séances automatiques non verrouillées.

Commence par analyser :

- la structure actuelle de l’application ;
- l’écran Semaine ;
- l’écran de détail d’une séance ;
- l’écran Analyse ;
- le modèle de charge et de fraîcheur ;
- les données de récupération COROS ;
- la génération automatique du planning ;
- le stockage local existant.

Réutilise les composants, les styles, les conventions et les mécanismes de persistance déjà présents. Ne réalise pas de refonte générale de l’application.

## Objectif utilisateur

Chaque jour, l’utilisateur doit pouvoir répondre en moins de 30 secondes à la question :

> Comment es-tu aujourd’hui ?

À partir des réponses et des données d’entraînement disponibles, l’application doit produire une recommandation simple, expliquée et directement exploitable.

Le questionnaire ne doit pas établir de diagnostic médical.

## Accès au questionnaire

Afficher sur l’écran de la semaine, au niveau de la journée courante, une invitation :

> FAIRE LE POINT

Si le questionnaire a déjà été rempli :

- afficher un résumé compact ;
- permettre de modifier les réponses ;
- afficher l’heure de la dernière mise à jour ;
- ne pas redemander le questionnaire à chaque ouverture.

Le questionnaire doit également être accessible depuis la fiche de la séance du jour.

## Questions obligatoires

### Temps disponible

Demander :

> Combien de temps as-tu réellement aujourd’hui ?

Proposer :

- 20 minutes ;
- 30 minutes ;
- 40 minutes ;
- 50 minutes ;
- 60 minutes ;
- 1 h 30 ;
- 2 heures ;
- 3 heures ou plus ;
- indisponible aujourd’hui.

Prévoir une valeur personnalisée en minutes si cela s’intègre proprement à l’interface.

### Fatigue générale

Demander une note de 1 à 5 :

- 1 — très frais ;
- 2 — plutôt frais ;
- 3 — moyen ;
- 4 — fatigué ;
- 5 — très fatigué.

### Qualité du sommeil

Demander une note de 1 à 5 :

- 1 — très mauvaise ;
- 2 — mauvaise ;
- 3 — correcte ;
- 4 — bonne ;
- 5 — excellente.

Permettre facultativement d’indiquer la durée du sommeil si elle n’est pas déjà disponible depuis une source fiable.

### Courbatures

Demander le niveau global de courbatures :

- aucune ;
- légères ;
- modérées ;
- importantes.

Permettre de sélectionner les zones concernées :

- quadriceps ;
- ischio-jambiers ;
- mollets ;
- fessiers ;
- chevilles ou pieds ;
- genoux ;
- hanches ;
- dos ;
- épaules ;
- bras ;
- autre.

### Motivation

Demander une note de 1 à 5 :

- 1 — aucune envie ;
- 2 — faible ;
- 3 — normale ;
- 4 — bonne ;
- 5 — très motivé.

Une motivation faible ne doit pas, à elle seule, entraîner automatiquement la suppression d’une séance.

### Douleur

Demander :

> As-tu une douleur inhabituelle aujourd’hui ?

Si oui, demander :

- la zone ;
- l’intensité de 1 à 10 ;
- le type de gêne en texte libre facultatif ;
- si la douleur apparaît au repos, pendant un mouvement ou pendant la course ;
- les mouvements connus qui la déclenchent.

Une douleur doit être distinguée des courbatures normales.

## Questions facultatives

Ajouter, si cela reste rapide à remplir :

- niveau de stress de 1 à 5 ;
- sensation de jambes de 1 à 5 ;
- envie de courir, faire de la PPG ou récupérer ;
- accès au matériel du jour ;
- possibilité de courir dehors ;
- commentaire libre.

Les questions facultatives ne doivent pas rendre le parcours lourd.

## Résultat du questionnaire

Après validation, afficher une synthèse courte :

```text
DISPONIBILITÉ DU JOUR

Temps : 40 min
Fatigue : moyenne
Sommeil : bon
Jambes : courbatures légères aux mollets
Motivation : bonne
Douleur : aucune
```

Produire ensuite une recommandation classée parmi :

- `SÉANCE MAINTENUE` ;
- `SÉANCE À RACCOURCIR` ;
- `SÉANCE À ADAPTER` ;
- `SÉANCE À DÉPLACER` ;
- `RÉCUPÉRATION CONSEILLÉE` ;
- `AVIS PROFESSIONNEL CONSEILLÉ` en présence de signaux préoccupants.

La recommandation doit toujours être expliquée par des éléments observables.

Exemple :

```text
SÉANCE À ADAPTER

Tu disposes de 40 minutes au lieu des 60 prévues et tes mollets sont encore
courbaturés. Conserve le travail de gainage et de force du haut du corps,
mais évite la pliométrie aujourd’hui.
```

Ne jamais afficher uniquement une note ou une couleur sans explication.

## Calcul de la disponibilité

Créer un moteur de décision déterministe et testable. Ne pas dépendre obligatoirement d’une IA pour produire la recommandation.

Le moteur doit combiner :

- les réponses du jour ;
- la durée de la séance prévue ;
- le type de séance prévue ;
- la charge des trois derniers jours ;
- la fraîcheur et le ratio aigu/chronique disponibles ;
- la fréquence cardiaque au repos comparée à sa moyenne récente ;
- la proximité de la séance club ;
- la proximité de la sortie longue ;
- la phase de préparation de l’objectif principal.

Chaque règle doit être explicable et testable séparément.

Ne pas présenter le score comme une mesure médicale ou une vérité absolue.

## Règles minimales

### Temps disponible

- Si la durée disponible couvre la séance, ne pas la modifier pour ce motif.
- Si la durée disponible est inférieure, proposer une version raccourcie ou un déplacement.
- Si l’utilisateur est indisponible, proposer de déplacer ou refuser la séance.
- Ne pas supprimer silencieusement une séance.

### Fatigue et sommeil

- Une fatigue élevée combinée à un mauvais sommeil doit produire un avertissement significatif.
- Une seule mauvaise nuit ne doit pas automatiquement annuler une séance si les autres indicateurs sont favorables.
- Plusieurs signaux défavorables doivent peser davantage qu’un indicateur isolé.

### Courbatures

- Adapter les exercices aux zones courbaturées.
- Éviter une forte sollicitation du même groupe musculaire en cas de courbatures importantes.
- Des courbatures légères ne doivent pas automatiquement empêcher l’entraînement.

### Douleur

- Une douleur inhabituelle doit toujours être visible dans la recommandation.
- Ne pas proposer de mouvement explicitement déclaré douloureux.
- Une douleur intense, persistante au repos ou associée à une incapacité fonctionnelle doit déclencher un message prudent recommandant de ne pas poursuivre sans avis approprié.
- Ne pas diagnostiquer la cause de la douleur.

### Motivation

- Utiliser la motivation comme un signal secondaire.
- Une motivation faible isolée peut conduire à proposer une séance simple ou courte, mais pas à imposer du repos.
- Une forte motivation ne doit pas annuler les avertissements liés à la douleur ou à une récupération très dégradée.

## Adaptation de la séance

Lorsque la séance doit être adaptée, produire une proposition concrète.

L’adaptation peut :

- raccourcir l’échauffement sans supprimer sa fonction essentielle ;
- réduire le nombre de blocs ;
- conserver le bloc prioritaire ;
- remplacer un exercice incompatible avec les courbatures ou douleurs ;
- retirer la pliométrie ;
- transformer une course intense en endurance facile ;
- proposer mobilité ou récupération ;
- déplacer la séance à une date compatible.

L’utilisateur doit voir les différences :

```text
SÉANCE ADAPTÉE

Avant : 60 min · PPG jambes et pliométrie
Après : 40 min · gainage, haut du corps et mobilité

Retiré : box jumps
Conservé : tirage, pompes, gainage
Ajouté : mobilité des chevilles
```

L’adaptation n’est appliquée qu’après confirmation explicite de l’utilisateur.

Ajouter les actions :

- `APPLIQUER L’ADAPTATION` ;
- `GARDER LA SÉANCE PRÉVUE` ;
- `DÉPLACER LA SÉANCE` ;
- `MODIFIER MES RÉPONSES`.

Le choix de conserver la séance prévue doit rester possible lorsqu’aucun blocage de sécurité majeur n’est détecté.

## Interaction avec la gestion manuelle du planning

Si les fonctionnalités de validation, refus, déplacement et modification existent déjà, réutiliser leur logique métier.

Le questionnaire peut proposer une action, mais ne doit jamais :

- déplacer une séance sans confirmation ;
- refuser une séance sans confirmation ;
- modifier une séance validée sans confirmation ;
- écraser une décision manuelle précédente ;
- modifier rétroactivement une activité réalisée.

Une séance explicitement validée peut recevoir un avertissement, mais elle reste verrouillée jusqu’à une nouvelle décision de l’utilisateur.

## Interaction avec la PPG

Le questionnaire doit alimenter le générateur de PPG et de WOD avec :

- la durée disponible ;
- les zones courbaturées ;
- les douleurs et mouvements interdits ;
- le matériel accessible aujourd’hui ;
- le niveau de fatigue ;
- l’intensité recommandée.

Le générateur ne doit jamais sélectionner un exercice incompatible avec une douleur déclarée ou un matériel indisponible.

## Historique quotidien

Conserver l’historique des questionnaires afin d’identifier des tendances.

Enregistrer au minimum :

- la date ;
- l’heure de saisie ;
- les réponses ;
- les données COROS utilisées ;
- la recommandation calculée ;
- l’action choisie par l’utilisateur ;
- la séance finalement réalisée si elle devient disponible.

Ne pas modifier rétroactivement la recommandation originale lorsque les données changent. Conserver les données ayant servi à la produire.

## Modèle de données

Utiliser une structure explicite et versionnée, adaptée au modèle existant.

Exemple indicatif :

```json
{
  "version": 1,
  "date": "2026-09-14",
  "updatedAt": "2026-09-14T06:45:00.000Z",
  "answers": {
    "availableMinutes": 40,
    "fatigue": 3,
    "sleepQuality": 4,
    "sleepMinutes": 435,
    "soreness": {
      "level": "light",
      "areas": ["calves"]
    },
    "motivation": 4,
    "pain": {
      "present": false,
      "area": null,
      "intensity": null,
      "triggers": []
    },
    "stress": 2,
    "availableEquipment": ["bodyweight", "dumbbells"],
    "comment": ""
  },
  "context": {
    "plannedSessionId": "planned-2026-09-14-ppg",
    "plannedDurationMinutes": 60,
    "freshness": -8,
    "restingHeartRate": 53,
    "restingHeartRateBaseline": 51,
    "recentLoad": 184
  },
  "recommendation": {
    "status": "ADAPT",
    "reasons": [
      "Temps disponible inférieur à la durée prévue",
      "Courbatures légères aux mollets"
    ],
    "proposedAction": "shorten-and-substitute"
  },
  "userDecision": null
}
```

Ne pas enregistrer de libellés traduits comme valeurs métier si des identifiants stables sont préférables.

## Persistance et confidentialité

Utiliser le système de stockage déjà présent dans l’application.

Pour une première version locale :

- versionner la clé de stockage ;
- valider les données à la lecture ;
- gérer les anciennes versions ;
- ne pas planter si les données sont invalides ;
- permettre de supprimer l’historique des questionnaires depuis les réglages.

Les informations de douleur et de récupération sont sensibles. Ne pas les envoyer à un service externe sans besoin fonctionnel et sans accord explicite.

## Interface

Le questionnaire doit :

- tenir dans un parcours court ;
- utiliser de grandes zones tactiles ;
- afficher la progression ;
- permettre de revenir à la question précédente ;
- conserver les réponses en cas de fermeture accidentelle ;
- fonctionner sur mobile ;
- être utilisable au clavier ;
- ne pas dépendre uniquement de couleurs ou d’emojis ;
- respecter le design actuel de l’application ;
- conserver tous les textes visibles en français.

Ne pas afficher toutes les questions sur un écran trop dense. Utiliser des étapes courtes ou des groupes clairement séparés.

## États à gérer

Prévoir :

- questionnaire non rempli ;
- questionnaire en cours ;
- brouillon sauvegardé ;
- questionnaire terminé ;
- réponses modifiées ;
- aucune séance prévue ;
- données COROS disponibles ;
- données COROS indisponibles ;
- recommandation calculée ;
- adaptation proposée ;
- adaptation acceptée ou refusée ;
- erreur de sauvegarde.

Le questionnaire doit fonctionner même sans données COROS, en indiquant que la recommandation repose uniquement sur les réponses déclaratives et l’historique local.

## Architecture attendue

Séparer clairement :

- les composants du questionnaire ;
- le schéma de validation ;
- la persistance ;
- le moteur de décision ;
- la génération des explications ;
- l’adaptation d’une séance ;
- l’intégration au planning ;
- l’historique.

Le moteur de décision ne doit pas dépendre de l’interface.

Utiliser des fonctions pures et des mises à jour immuables. Ne pas muter directement les séances, réponses ou recommandations existantes.

Ne pas ajouter de dépendance si les outils installés suffisent.

## Première version à livrer

La première version doit inclure :

1. le questionnaire quotidien ;
2. le temps disponible ;
3. la fatigue ;
4. le sommeil ;
5. les courbatures et zones concernées ;
6. la motivation ;
7. les douleurs ;
8. la sauvegarde locale ;
9. un moteur de recommandation déterministe ;
10. une explication lisible du résultat ;
11. l’adaptation proposée de la séance du jour ;
12. la confirmation avant toute modification du planning ;
13. la modification des réponses ;
14. l’historique quotidien ;
15. le fonctionnement sans COROS.

Les analyses de tendances avancées peuvent être préparées dans le modèle de données mais ne doivent pas retarder cette première version.

## Tests obligatoires

Suivre une démarche TDD : écrire les tests avant l’implémentation et vérifier qu’ils échouent pour la bonne raison.

Tester au minimum :

- la validation de chaque réponse ;
- l’enregistrement d’un brouillon ;
- la reprise du questionnaire ;
- la modification d’un questionnaire terminé ;
- une journée avec tous les indicateurs favorables ;
- une mauvaise nuit isolée ;
- une fatigue élevée combinée à un mauvais sommeil ;
- des courbatures légères ;
- des courbatures importantes sur la zone ciblée par la séance ;
- une douleur inhabituelle ;
- une durée disponible inférieure à la séance ;
- une indisponibilité totale ;
- une motivation faible isolée ;
- l’absence de données COROS ;
- la présence de données COROS ;
- la priorité d’une douleur sur une forte motivation ;
- l’absence de modification automatique avant confirmation ;
- la protection d’une séance validée ;
- la génération des explications ;
- la lecture de données locales invalides ;
- l’accessibilité du parcours principal.

Ajouter :

- des tests unitaires pour les règles de décision ;
- des tests d’intégration pour la persistance et l’adaptation du planning ;
- un test de bout en bout du parcours quotidien principal.

Maintenir au moins 80 % de couverture sur le nouveau code métier.

## Méthode d’implémentation

1. Analyse l’existant et identifie les fichiers concernés.
2. Présente un plan d’implémentation court.
3. Définis le modèle de données et les règles de décision.
4. Écris les tests du moteur avant son implémentation.
5. Implémente le moteur déterministe et les explications.
6. Ajoute la persistance locale et la validation des données.
7. Construis l’interface du questionnaire.
8. Intègre le résultat dans l’écran Semaine et la séance du jour.
9. Connecte l’adaptation au moteur de planning existant.
10. Vérifie qu’aucune séance n’est modifiée sans confirmation.
11. Exécute les tests, le lint, la vérification des types et le build.
12. Corrige toutes les erreurs liées à l’implémentation.
13. Termine par un récapitulatif des fichiers modifiés, des règles retenues, des tests exécutés et des limites connues.

Ne crée pas de faux boutons. Toutes les actions visibles doivent être réellement fonctionnelles.
