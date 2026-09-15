# Ajouter la gestion manuelle du planning

Implémente dans l’application une fonctionnalité permettant à l’utilisateur d’adapter les séances proposées à ses contraintes personnelles.

L’utilisateur doit pouvoir :

- valider une séance ;
- refuser une séance ;
- déplacer une séance ;
- modifier certains paramètres d’une séance ;
- renseigner ses disponibilités personnelles ;
- organiser manuellement sa semaine.

Commence par analyser le fonctionnement actuel du calendrier, la génération automatique du plan, le détail d’une séance, les séances du club, les objectifs sportifs et le stockage local.

Le planning étant recalculé à partir des données réelles, les décisions manuelles de l’utilisateur doivent devenir des contraintes prioritaires et ne jamais disparaître lors d’un recalcul ou d’une synchronisation.

Ne réalise pas de refonte générale de l’application.

## Statuts d’une séance

Une séance planifiée peut avoir l’un des statuts suivants :

- `PROPOSÉE` : générée automatiquement, sans décision de l’utilisateur ;
- `VALIDÉE` : acceptée et verrouillée dans le planning ;
- `REFUSÉE` : écartée volontairement par l’utilisateur ;
- `DÉPLACÉE` : acceptée à une autre date ;
- `MODIFIÉE` : conservée avec des paramètres ajustés ;
- `RÉALISÉE` : réellement effectuée ;
- `ANNULÉE` : précédemment validée puis abandonnée.

Tous les libellés visibles doivent être en français.

## Actions sur une séance

Depuis la fiche d’une séance future proposée ou validée, ajouter :

- `VALIDER` ;
- `DÉPLACER` ;
- `MODIFIER` ;
- `REFUSER`.

Une séance déjà réalisée ne peut plus être déplacée, refusée ou modifiée. Une activité réelle provenant de COROS ne doit jamais être altérée rétroactivement.

## Valider une séance

Lorsqu’une séance est validée :

- son statut devient `VALIDÉE` ;
- sa date et son contenu sont verrouillés ;
- elle reste à sa place lors des futurs recalculs ;
- elle affiche l’indicateur `✓ VALIDÉE` ;
- elle peut encore être déplacée, modifiée ou annulée ultérieurement.

La décision doit persister après un rechargement ou une synchronisation COROS.

## Refuser une séance

Lors du refus, ouvrir une confirmation et proposer facultativement un motif :

- manque de temps ;
- fatigue ;
- douleur ou blessure ;
- indisponibilité personnelle ;
- matériel indisponible ;
- séance non pertinente ;
- autre.

Demander ensuite ce que l’application doit faire :

- supprimer uniquement cette séance ;
- chercher automatiquement un autre créneau ;
- proposer une séance plus courte ;
- remplacer la séance par de la récupération ou de la mobilité.

Ne jamais recréer automatiquement à la même date une séance explicitement refusée. Ne pas compenser son refus par une surcharge silencieuse sur les autres jours.

## Déplacer une séance

L’action `DÉPLACER` ouvre un sélecteur de dates affichant pour chaque jour :

- les séances déjà présentes ;
- les disponibilités personnelles ;
- la durée disponible ;
- le matériel accessible ;
- le niveau de compatibilité ;
- les éventuels conflits ou avertissements.

Exemple :

```text
JEUDI 17 SEPTEMBRE
Disponible · Aucun conflit
Recommandé
```

```text
MERCREDI 16 SEPTEMBRE
Attention : lendemain de la séance club
Récupération potentiellement insuffisante
```

Lors du déplacement :

- conserver le contenu, la durée et la charge prévus ;
- enregistrer la date d’origine ;
- enregistrer la nouvelle date ;
- appliquer le statut `DÉPLACÉE` ;
- recalculer les propositions non verrouillées autour de cette décision.

Afficher dans la fiche :

> Déplacée du lundi 14 au jeudi 17 septembre.

L’utilisateur peut confirmer un déplacement malgré un avertissement non bloquant. Une fois confirmé, son choix ne doit pas être annulé automatiquement.

Le glisser-déposer peut être ajouté s’il est fiable, mais une action `DÉPLACER` accessible au clavier et sur mobile reste obligatoire.

## Modifier une séance

Permettre de modifier :

- la durée ;
- l’horaire indicatif ;
- le type de séance ;
- l’intensité cible ;
- la distance ;
- le dénivelé positif ;
- le nombre de répétitions ou de blocs ;
- le contenu PPG ;
- un commentaire personnel.

Valider les valeurs saisies. Les exercices PPG doivent rester compatibles avec le matériel disponible.

Après modification :

- appliquer le statut `MODIFIÉE` ;
- conserver la proposition originale ;
- recalculer la charge estimée ;
- mettre à jour les totaux hebdomadaires ;
- proposer l’action `RESTAURER LA PROPOSITION`.

## Disponibilités personnelles

Ajouter dans les réglages une section :

> MES DISPONIBILITÉS

Pour chaque jour de la semaine, permettre de définir :

- disponible ou indisponible ;
- durée maximale ;
- créneau court, normal ou long ;
- course possible ou non ;
- PPG possible ou non ;
- matériel accessible ;
- heure préférée facultative ;
- préférence pour le repos ou la sortie longue.

Permettre également des contraintes exceptionnelles par date :

- déplacement professionnel ;
- rendez-vous ;
- vacances ;
- indisponibilité ;
- créneau exceptionnel ;
- matériel différent ;
- jour de repos imposé.

Une contrainte datée prend toujours le dessus sur une disponibilité récurrente.

## Mode « Organiser ma semaine »

Ajouter dans l’écran Semaine une action :

> ORGANISER MA SEMAINE

Ce mode permet de :

- voir les disponibilités ;
- déplacer plusieurs séances ;
- valider ou refuser des propositions ;
- modifier une séance ;
- identifier les conflits ;
- consulter la charge quotidienne et hebdomadaire ;
- prévisualiser les conséquences avant d’enregistrer.

Exemple :

```text
Déplacer cette séance au jeudi entraîne :

- deux séances exigeantes en 24 h ;
- seulement 18 h de récupération ;
- une charge de 224 UC sur deux jours ;
- aucun impact sur la sortie longue.
```

Ajouter :

- `ENREGISTRER LES MODIFICATIONS` ;
- `ANNULER` ;
- `RESTAURER LE PLAN PROPOSÉ`.

Les changements réalisés dans ce mode restent dans un brouillon jusqu’à leur confirmation globale.

## Priorités du moteur de planification

Respecter cet ordre :

1. séances réellement effectuées ;
2. contraintes personnelles datées ;
3. séances validées, déplacées ou modifiées ;
4. séance club du mardi ;
5. indisponibilités récurrentes ;
6. objectif principal et phase de préparation ;
7. sortie longue ;
8. récupération entre les séances ;
9. propositions automatiques restantes.

Une décision utilisateur ne doit jamais disparaître silencieusement. Si elle devient impossible à respecter, afficher le conflit et laisser l’utilisateur décider.

## Détection des conflits

Détecter au minimum :

- deux séances de qualité consécutives ;
- une PPG jambes lourde avant la séance club ;
- une PPG jambes lourde avant la sortie longue ;
- une sortie longue trop proche d’une séance très intense ;
- une charge hebdomadaire excessive ;
- un manque de récupération autour du mardi ;
- une séance placée un jour indisponible ;
- une durée supérieure au temps disponible ;
- du matériel nécessaire non accessible ce jour-là.

Ces situations produisent un avertissement, pas nécessairement un blocage.

Exemple :

```text
ATTENTION

Cette PPG jambes est placée 18 heures avant la séance club.
Tu peux confirmer ce choix ou sélectionner un autre jour.
```

## Recalcul du planning

Après une décision :

1. conserver les décisions manuelles ;
2. recalculer uniquement les séances automatiques non verrouillées ;
3. mettre à jour la charge hebdomadaire ;
4. préserver la séance club ;
5. préserver la sortie longue si elle reste compatible ;
6. ne pas compenser une séance refusée par une surcharge automatique ;
7. expliquer les adaptations effectuées.

Exemple :

```text
PLANNING MIS À JOUR

- PPG déplacée au jeudi ;
- footing facile raccourci à 40 minutes ;
- sortie longue maintenue samedi ;
- charge hebdomadaire : 612 → 586 UC.
```

## Annulation et historique

Permettre d’annuler immédiatement une action récente.

Conserver un historique minimal :

- action réalisée ;
- séance concernée ;
- date précédente ;
- nouvelle date ;
- contenu précédent ;
- contenu modifié ;
- date de la décision.

Présenter cet historique dans une section secondaire :

> MODIFICATIONS DU PLANNING

## Modèle de données

Séparer clairement :

- le plan proposé automatiquement ;
- les décisions manuelles ;
- le planning final calculé ;
- les activités réellement effectuées.

Ne pas écraser les propositions d’origine. Appliquer les décisions sous forme d’une couche immuable au-dessus du plan automatique.

Exemple de déplacement :

```json
{
  "sessionId": "planned-2026-09-17-ppg",
  "action": "reschedule",
  "originalDate": "2026-09-17",
  "scheduledDate": "2026-09-18",
  "status": "DÉPLACÉE",
  "reason": "indisponibilité personnelle",
  "updatedAt": "2026-09-14T18:30:00.000Z"
}
```

Exemple de modification :

```json
{
  "sessionId": "planned-2026-09-19-long-run",
  "action": "modify",
  "status": "MODIFIÉE",
  "changes": {
    "durationSec": 7200,
    "dplus": 800
  },
  "updatedAt": "2026-09-14T18:35:00.000Z"
}
```

Exemple de refus :

```json
{
  "sessionId": "planned-2026-09-21-easy-run",
  "action": "reject",
  "status": "REFUSÉE",
  "reason": "manque de temps",
  "replacementStrategy": "none",
  "updatedAt": "2026-09-14T18:40:00.000Z"
}
```

Adapte le modèle à l’architecture existante sans créer un second système de planification.

## Persistance

Utiliser le mécanisme de stockage existant et enregistrer séparément :

- les disponibilités récurrentes ;
- les contraintes exceptionnelles ;
- les décisions sur les séances ;
- les brouillons hebdomadaires.

Versionner le format stocké et valider toutes les données lors de leur lecture. Une donnée locale invalide ne doit pas faire planter l’application.

## Interface du calendrier

Afficher clairement l’état des séances futures :

- `À VALIDER` ;
- `VALIDÉE` ;
- `DÉPLACÉE` ;
- `MODIFIÉE` ;
- `CONFLIT`.

Les séances refusées restent visibles uniquement dans l’historique ou via une option dédiée.

Respecter le design existant et ne pas surcharger l’écran principal. Les actions détaillées peuvent rester dans la fiche de séance.

## Accessibilité

Toutes les actions doivent fonctionner :

- au clavier ;
- sur mobile ;
- avec un lecteur d’écran ;
- sans dépendre uniquement d’une couleur ;
- sans imposer le glisser-déposer.

## Architecture attendue

Séparer :

- le stockage des disponibilités ;
- le stockage des décisions ;
- l’application des décisions au plan automatique ;
- la détection des conflits ;
- le recalcul du planning ;
- l’interface de modification ;
- l’historique et l’annulation.

La logique métier ne doit pas dépendre des composants visuels. Utiliser des fonctions pures et des mises à jour immuables.

Ne pas ajouter de dépendance si les outils présents suffisent.

## Première version à livrer

La première version doit inclure :

1. les actions `VALIDER`, `DÉPLACER`, `MODIFIER` et `REFUSER` ;
2. la persistance locale des décisions ;
3. leur conservation après recalcul ;
4. les disponibilités hebdomadaires ;
5. les contraintes exceptionnelles par date ;
6. la sélection d’une nouvelle date ;
7. la détection des conflits principaux ;
8. les avertissements non bloquants ;
9. la mise à jour de la charge hebdomadaire ;
10. l’annulation d’une modification ;
11. la restauration de la proposition automatique ;
12. l’affichage des statuts dans le calendrier.

## Tests obligatoires

Écrire les tests avant l’implémentation.

Tester au minimum :

- la validation d’une séance ;
- sa persistance ;
- le refus d’une séance ;
- l’absence de recréation immédiate d’une séance refusée ;
- le déplacement vers un jour libre ;
- le déplacement vers un jour occupé ;
- le déplacement vers un jour indisponible ;
- le déplacement autour de la séance club ;
- la modification de la durée ;
- le recalcul de la charge ;
- la priorité d’une contrainte exceptionnelle ;
- la conservation des décisions après recalcul ;
- la restauration de la proposition ;
- l’annulation d’une action ;
- la lecture de données locales invalides ;
- l’accessibilité des commandes principales.

Ajouter des tests unitaires, des tests d’intégration et un test du parcours utilisateur principal.

## Méthode d’implémentation

1. Analyse le modèle actuel et la reconstruction du planning.
2. Identifie les fichiers concernés.
3. Présente un plan court.
4. Définis le modèle des contraintes et décisions.
5. Écris les tests avant le code.
6. Implémente les fonctions métier.
7. Intègre les actions dans la fiche de séance.
8. Ajoute les disponibilités dans les réglages.
9. Intègre les statuts dans le calendrier.
10. Vérifie qu’une synchronisation ne supprime aucune décision.
11. Exécute les tests, le lint et le build.
12. Corrige toutes les erreurs liées à l’implémentation.
13. Termine par un récapitulatif des fichiers modifiés, des règles retenues, des tests exécutés et des limites restantes.

Ne crée pas de faux boutons : toutes les actions affichées doivent être réellement fonctionnelles.
