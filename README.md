# DÉNIVELÉ

Planification trail + PPG dans le même calendrier, alimentée par les données
Coros. Implémentation de `Trail PPG App.dc.html` (artboard `1a`), habillée par
le design system Modernist dans `_ds/`.

Trois écrans : **Semaine** (le calendrier registre), **Analyse** (une séance
enregistrée, décortiquée), **PPG** (la bibliothèque d'exercices). Un panneau
plein écran s'ouvre sur une séance et porte l'action *Envoyer sur la Coros*.

---

## Démarrer

```bash
npm install
```

```bash
npm run dev
```

L'app tourne sur <http://localhost:5173> avec les **données de démo** — celles
écrites dans le design. Rien à configurer pour la regarder.

**Un seul processus.** Le pont Coros est monté sur le serveur Vite lui-même
(`corosBridge` dans `vite.config.js`) : pas de second terminal, pas de proxy, et
rien qui journalise une erreur parce qu'un pont que tu n'as pas lancé n'écoute
pas. Quand Coros sera configuré, les vraies données arriveront par le même
`npm run dev`.

`npm run server` existe toujours — il sert la même API sur son propre port
(8787) pour un déploiement où le front est un build statique.

---

## Connecter Coros

MCP est un protocole **serveur** : le navigateur ne peut pas le parler. Tout
passe donc par `server/`, qui est client MCP du serveur Coros et expose une
petite API HTTP à l'app.

```
React (navigateur)  →  /api  →  server/app.js  →  MCP  →  serveur Coros
```

`server/app.js` porte l'API ; `vite.config.js` la monte en développement et
`server/index.js` la sert sur son propre port en production. Le même code dans
les deux cas.

### 1. Renseigner la connexion

Dans `coros.config.json`, ou par variables d'environnement (préférable pour un
jeton — le fichier vit dans OneDrive) :

| Transport | Config | Environnement |
| --- | --- | --- |
| HTTP (défaut) | `"transport": "http"`, `"url": "https://…/mcp"` | `COROS_MCP_URL` |
| SSE | `"transport": "sse"`, `"url": "…"` | `COROS_MCP_TRANSPORT=sse` |
| stdio | `"transport": "stdio"`, `"command"`, `"args"` | `COROS_MCP_COMMAND`, `COROS_MCP_ARGS` |

Un jeton passé en `COROS_MCP_TOKEN` devient un en-tête `Authorization: Bearer`.
Dans le fichier de config, `${MA_VARIABLE}` est remplacé depuis l'environnement,
ce qui permet de décrire la connexion sans y écrire de secret.

### 2. Vérifier ce qui a été trouvé

Au démarrage, `npm run dev` résume :

```
  coros   connecté (http) — 6 outils · absents : pushWorkout
```

`npm run server` détaille capacité par capacité :

```
[denivele] Coros connecté (http) — 6 outils
  ✓ athlete         get_athlete_profile
  ✓ activities      list_activities
  ✗ pushWorkout     (aucun outil correspondant)
```

Les noms d'outils ne sont **pas codés en dur** : le pont appelle `tools/list` et
résout chaque capacité par alias puis par correspondance approchée
(`server/coros/toolmap.js`). Une capacité absente dégrade l'écran concerné, elle
ne casse pas l'app — et la raison s'affiche sous le téléphone.

Si une capacité tombe sur le mauvais outil, épingle-la :

```json
"toolOverrides": { "activities": "coros_list_workouts" }
```

`GET /api/health` renvoie la même chose en JSON.

### 3. Les sept capacités

| Capacité | Sert à |
| --- | --- |
| `athlete` | FC max / repos, appareil, nom |
| `zones` | bornes des zones Z1–Z5 |
| `activities` | la liste des séances enregistrées |
| `activityDetail` | tours, répartition par zone, métriques |
| `streams` | les courbes FC / altitude |
| `plan` | les séances planifiées |
| `pushWorkout` | envoyer une séance sur la montre |

Coros ne connaît pas la bibliothèque PPG : elle reste locale
(`src/data/fixtures.js`).

---

## Mode instantané (sans connexion)

```bash
npm run sync:coros
```

Écrit `public/coros-snapshot.json`. L'app le lit directement — vraies données,
`npm run dev` seul, aucun processus de pont. Pratique pour une démo, pour
travailler hors ligne, et pour lire exactement ce que Coros a renvoyé.

```bash
npm run sync:coros -- --days 90
```

---

## D'où viennent les données

`/api/snapshot` répond **toujours 200**, y compris quand Coros n'est pas
configuré : « pas de source » est un état normal de cette app, pas une panne, et
répondre 503 remplit la console de rouge sur une installation parfaitement
saine. Le pont sert, dans l'ordre : le direct MCP, sinon l'instantané sur
disque, sinon un corps vide qui dit pourquoi — et l'app bascule sur les données
de démo.

Un build statique servi sans le pont est le seul cas qui tente ensuite
`/coros-snapshot.json`.

Le bandeau sous le téléphone dit toujours laquelle a répondu (**COROS —
DIRECT**, **COROS — INSTANTANÉ**, **DONNÉES DE DÉMO**) et pourquoi, le cas
échéant. Une bascule silencieuse, c'est la meilleure façon de démontrer des
données de démo en croyant regarder son entraînement.

---

## La PPG

Les exercices viennent de [`hasaneyldrm/exercises-dataset`](https://github.com/hasaneyldrm/exercises-dataset)
(MIT) — 1 324 exercices, 17 Mo, consignes traduites en dix langues dont le
français. `npm run build:ppg` en extrait une sélection trail de 43 exercices :

```bash
mkdir -p .cache && curl -sL -o .cache/exercises.json   https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/data/exercises.json
npm run build:ppg
```

Ce que le script **ajoute** au dataset, et qui n'y est pas : un nom français
(les noms sources sont anglais), un rôle trail, la raison pour laquelle un
traileur fait cet exercice, une dose et un tempo. Les consignes pas-à-pas
viennent du dataset, en français, telles quelles.

| Rôle | Nombre |
| --- | --- |
| FORCE | 16 |
| GAINAGE | 8 |
| MOBILITÉ | 9 |
| EXCENTRIQUE | 5 |
| PLIOMÉTRIE | 5 |

### Deux séances par semaine, toujours

| Jour | Profil | Contenu |
| --- | --- | --- |
| **Mercredi** | Entretien | mobilité ×2, gainage ×2, un seul exercice de force — au lendemain du club, c'est de la récupération active |
| **Vendredi** | Développement | mobilité, force ×2, excentrique, pliométrie, gainage ×2 — à 48 h de la sortie longue, jambes fraîches |

Elles ne sont **pas la variable d'ajustement** : leur charge s'ajoute au budget
course au lieu de le manger. Le coût aérobie du renforcement est marginal (la
Coros compte 19 pour 33 minutes de musculation) et les semaines qui servent de
référence n'en contenaient aucune — les soustraire revenait à supprimer le
footing du jeudi pour financer du gainage.

Les deux séances sont composées **ensemble** : la seconde reçoit la liste de la
première et ne reprend aucun de ses exercices. Deux séances à 48 h d'écart qui
proposent le même gainage, c'est une séance et demie.

Depuis le planning, chaque exercice d'une séance affiche sa vignette et ouvre sa
fiche complète — GIF animé et consignes — d'un tap.

### La composition d'une séance

Une séance de renforcement n'est pas une liste au hasard, c'est un ordre :
mobilité pour ouvrir, force pendant que le système nerveux est frais,
excentrique tant que le contrôle est bon, pliométrie seulement si la semaine le
permet, gainage pour finir, mobilité pour refermer.

- **Le matériel filtre.** Un exercice n'apparaît que si *tout* ce qu'il suppose
  est coché. Une fente bulgare a besoin d'un banc même si le dataset la classe
  « poids de corps » — d'où le champ `needs`, qui complète l'équipement déclaré.
- **Deux exercices du même bloc ne visent pas le même muscle.** Sans cette
  contrainte on obtenait deux squats à la suite, sans travail de mollet.
- **La rotation est déterministe**, indexée sur la date : la séance change d'une
  semaine à l'autre mais reste stable dans la journée. Un tirage aléatoire la
  changerait à chaque rafraîchissement du plan.
- **Pas de pliométrie** en semaine d'assimilation ni en affûtage.

### Les visuels

Chaque exercice a une photo dans la liste et un **GIF animé** dans le tiroir —
un mouvement ne se lit pas sur une image fixe.

Ils sont **© Gym visual**, sous une licence distincte du MIT qui couvre les
données, et redistribués par le dépôt source avec son autorisation. Ce projet ne
les recopie pas : `data/ppg-library.json` ne contient que des URL vers le dépôt,
et le navigateur va les chercher là-bas — comme le fait la page de démonstration
du dépôt. Rien n'est redistribué ici.

Conséquences pratiques : il faut être en ligne, et un visuel manquant retombe
sur le placeholder du design sans rien casser. Pour un usage public ou hors
ligne, prendre une licence chez Gym visual et recopier les fichiers.

---

## Le bouton SYNCHRONISER

Sous le téléphone. Il appelle `POST /api/sync` et **dit toujours lequel des deux
modes il vient d'exécuter** — un bouton qui affiche « synchronisé » sans avoir
rien téléchargé est pire que pas de bouton du tout.

| Mode | Quand | Ce qu'il fait |
| --- | --- | --- |
| **live** | un serveur MCP Coros est configuré et joignable | va chercher les données, réécrit `public/coros-snapshot.json` |
| **rebuild** | aucun serveur configuré *(cas actuel)* | réassemble l'instantané depuis `data/*.json` — utile après une modification à la main, mais **rien n'est téléchargé**, et la réponse l'annonce |

Si Coros est configuré mais injoignable, le bouton bascule en *rebuild* et
affiche l'erreur : l'app ne reste jamais sans données.

Le bandeau montre aussi l'âge du **relevé**, pas celui du dernier clic —
« relevé il y a 5 h » reste vrai même si on vient de reconstruire.

`server/localSnapshot.js` porte la construction, partagée par le bouton et par
`npm run build:snapshot` : une seule implémentation, donc pas de divergence
possible entre la ligne de commande et l'app.

### Pour passer en mode live

Renseigner `url` (ou `command`) dans `coros.config.json`, ou exporter
`COROS_MCP_URL`, puis relancer `npm run dev`. La découverte d'outils fait le
reste — voir « Connecter Coros » plus bas.

---

## Réglages : objectifs et matériel

Le réglage **Intensité de la semaine** propose huit niveaux, de
**1 — Récupération** (footings faciles uniquement) à **8 — Très intense**
(week-end bloc montagne samedi–dimanche). Il recompose immédiatement volume,
qualité et dénivelé, tout en laissant l'affûtage, l'assimilation et les alertes
de récupération prioritaires. Le niveau 4 conserve le comportement équilibré
par défaut et le choix est synchronisé avec le compte utilisateur.

Onglet **RÉGLAGES** : nom, date, distance, D+, priorité (A/B/C) et
caractéristiques en texte libre. Stockés en `localStorage`
(`denivele.goals.v1` et `denivele.equipment.v1`) — ils vivent dans ce navigateur,
pas sur la montre. Chaque modification **reconstruit le plan immédiatement**.

Seul l'objectif **A** le plus proche commande la forme des semaines :

| Semaines avant | Phase | Charge |
| --- | --- | --- |
| > 12 | Base | −5 % |
| 6 – 12 | Développement | référence |
| 3 – 5 | Bloc spécifique | +10 % |
| 2 | Début d'affûtage | −20 % |
| 1 | Affûtage | −45 % |
| 0 | Semaine de course | −65 % |

Deux garde-fous sur le dénivelé, sans lesquels une CCC à 6 100 m réclamait
**2 349 m de D+ sur une sortie d'1 h 39** :

- ce qu'on peut grimper en Z2 dans le temps imparti (≈ 600 m/h) ;
- ce qu'on grimpe réellement aujourd'hui, majoré de 35 % par semaine.

La sortie longue plafonne à une fraction de la durée estimée de la course —
85 % jusqu'à 25 km-effort, 32 % au-delà de 80. On ne court pas 100 km à
l'entraînement.

Le **km-effort** (distance + D+/100) sert à estimer la durée de course, avec une
majoration de fatigue qui grandit avec la distance : personne ne court 80 km à
l'allure de sa sortie longue de 2 h.

---

## Les séances du club

`data/club-sessions.json`, recopié dans `public/` pour que l'app le lise. Une
séance par semaine, le mardi. Le club annonce son contenu, la Coros ne le
connaît pas à l'avance — d'où la saisie manuelle.

```json
{ "date": "2026-09-15", "name": "Pyramide 2-3-4-5-4-3-2′",
  "blocks": [{ "work": 120, "rec": 60 }, …] }

{ "date": "2026-09-22", "name": "4 séries courtes 30″ → 1′30",
  "sets": [{ "n": 5, "work": 30, "rec": 30 }, …] }
```

Quand le contenu est connu, charge et durée en sont **déduites** (travail au
tarif qualité, échauffement / récupérations / retour au calme au tarif facile)
et le déroulé s'écrit tout seul. Sinon, retour à la médiane des mardis passés.

---

## Le plan, deux semaines d'avance

`src/data/plan.js`. Reconstruit à chaque ouverture, **jamais stocké** : il part
de la charge réellement encaissée, donc le figer le rendrait faux dès la
première séance qui s'écarte du prévu. Le réel écrase toujours le prévu — une
séance planifiée dont le jour est couru disparaît.

### Les contraintes, dans l'ordre

1. **Le mardi est au club.** Donnée d'entrée, pas variable : ni le contenu ni la
   charge ne se décident. Sa charge est estimée sur la **médiane** des mardis
   passés (pas le dernier : une « rentrée des classes » à 267 est un pic, et
   bâtir le plan dessus écraserait le reste de la semaine). Sa durée vient aussi
   de l'historique — la déduire de sa charge affichait 57′ pour une séance
   d'1h29. Lundi et mercredi sont fermés : 48 h de part et d'autre.
2. **La sortie longue est une contrainte, pas un reste.** Elle monte de 10′ par
   semaine depuis la plus longue des six dernières, plancher 1h15, plafond 3h.
   Calculée sur le reliquat du budget, elle donnait des « sorties longues » de
   58 minutes.
3. **Le reste se partage ce qui subsiste.** Une deuxième séance de qualité
   n'apparaît que si le budget la porte. Quand le club et la sortie longue
   remplissent déjà la semaine, le plan le dit au lieu d'ajouter du volume.

### La charge visée

Médiane des quatre dernières semaines (pas la moyenne : une semaine de vacances
à 110 casserait la progression sans rien dire de ce qu'il encaisse), puis :

| Ratio aigu/chronique Coros | Progression hebdomadaire |
| --- | --- |
| ≤ 0,65 — de la marge | +8 % |
| 0,65–0,90 | +3 % |
| ≥ 0,90 — au plafond | −5 % |

Une semaine sur quatre redescend à 70 %. Les allures viennent du seuil mesuré
par la Coros (4:01/km), pas d'un pourcentage de FC max.

---

## Le commentaire de séance

`src/data/commentary.js`. Chaque séance est lue dans l'ordre où un entraîneur
la lit, et le commentaire est **calculé à l'affichage** : il dépend de la charge
des jours précédents, donc il change quand les données changent.

| Bloc | Ce qu'il regarde |
| --- | --- |
| **Ce que tu avais dans les jambes** | charge des 3 jours précédents, jours depuis la dernière séance, ratio aigu/chronique Coros, FC de repos contre sa moyenne 14 j |
| **Verdict** | structure réelle des tours, tenue des répétitions (1er vs dernier tiers), montée de FC à allure égale, ou dérive cardiaque sur une séance continue |
| **On adapte la suite** | ce qu'on change à la prochaine séance de qualité, et pourquoi |

Deux points de méthode qui font la différence entre un commentaire juste et un
commentaire faux :

- **Repérage des répétitions.** Les tours sont séparés en travail / récupération
  au **plus grand écart d'allure**, pas à la médiane. La médiane ramassait le
  retour au calme avec les répétitions (11 reps annoncées sur une séance qui en
  comptait 10) ; le plus grand trou trouve la vraie frontière, y compris sur une
  pyramide dont les blocs n'ont ni la même longueur ni la même allure.
- **Durée des récupérations.** Seules les récupérations *entre deux
  répétitions* comptent. L'échauffement et le retour au calme sont aussi des
  tours lents, et les compter donnait « récup 18′ » sur une séance qui
  récupérait 5 minutes.

Le commentaire de séance ne se contente jamais de constater : chaque cas dit
quoi faire de la prochaine séance de qualité. Un constat sans adaptation ne sert
à rien.

---

## Source actuelle : MCP COROS + Strava

Les deux connecteurs sont authentifiés dans Claude, pas dans ce projet : le pont
Node ne peut appeler ni l'un ni l'autre. Les relevés sont donc figés dans
`data/`, et :

```bash
npm run build:snapshot
```

les assemble en `public/coros-snapshot.json`. Le bandeau affiche **COROS —
INSTANTANÉ**.

| Donnée | Source |
| --- | --- |
| Noms de séance | MCP COROS (« La pyramide », « Seuil contrôlé 3 × 6 min » — Strava n'en garde que « Afternoon Run ») |
| Tours réels, allures, FC par bloc | MCP COROS (`queryActivityLapData`) |
| Charge d'entraînement (UC), dénivelé | MCP COROS (`getActivityDetail`) |
| Effets d'entraînement, focus, performance | MCP COROS |
| Ratio aigu/chronique, FC de repos, récupération | MCP COROS, quotidiens |
| VO2max 54, seuil 4:01/km, pronostics | MCP COROS |
| Flux FC / altitude par échantillon | Strava (3 séances sur 15) — le MCP Coros ne les expose pas |

La charge était auparavant lue dans la description que le sync écrit dans Strava
(« 151 charge d'entraînement — de COROS »). `getActivityDetail` la donne
directement : même chiffre, une dépendance de moins.

Le jour où le pont Node pourra parler au MCP Coros directement,
`npm run sync:coros` écrit le même fichier et `npm run dev` sert le direct :
rien dans `src/` ne change.

---

## Tester sans Coros

`scripts/mock-coros-mcp.mjs` est un faux serveur MCP aux formes Coros —
camelCase, durées en millisecondes, flux en tableau d'échantillons — choisies
pour exercer le normaliseur sur des formes qu'il doit *adapter*.

```bash
COROS_MCP_TRANSPORT=stdio COROS_MCP_COMMAND=node COROS_MCP_ARGS=scripts/mock-coros-mcp.mjs npm run dev
```

---

## La charge (UC)

TRIMP de Banister, plus un terme vertical : `D+ / 100 × 1,6`. Un TRIMP purement
cardiaque sous-évalue lourdement une séance de trail, où le coût est autant dans
le dénivelé que dans la fréquence cardiaque. Une séance PPG, sans flux FC
exploitable, est cotée à la durée.

La **fraîcheur** est la charge aiguë (7 j) moins la charge chronique (moyenne
journalière sur 28 j × 7). Négatif = tu portes de la fatigue.

Les barres de la semaine sont relatives au jour le plus lourd de cette
semaine-là, pas à un plafond fixe : une semaine légère doit garder une forme.

Voir `src/data/model.js` (app) et `loadFor()` dans `server/snapshot.js`.

---

## Structure

```
src/
  App.jsx                  onglets, état, bandeau de source
  screens/                 Semaine · Analyse · PPG · détail de séance
  data/model.js            le modèle de domaine + charge / fraîcheur
  data/fixtures.js         les données du design
  data/provider.js         la source des données et son repli
  lib/ui.js                primitives de style (tokens Modernist)
  components/ios-frame.jsx repris de ../ios-frame.jsx, exports ES
server/
  app.js                   l'API (/api/health, /api/snapshot, /api/push-workout)
  index.js                 la même API sur son propre port (production)
  config.js                coros.config.json + environnement
  snapshot.js              assemble un Snapshot depuis les capacités
  coros/client.js          client MCP + découverte des outils
  coros/toolmap.js         capacité → nom d'outil
  coros/normalize.js       charges utiles Coros → modèle de domaine
scripts/
  sync-coros.mjs           écrit l'instantané depuis le MCP Coros
  strava-snapshot.mjs      écrit l'instantané depuis data/strava-raw.json
  mock-coros-mcp.mjs       faux serveur Coros pour les tests
_ds/                       design system Modernist (source de vérité visuelle)
```

## Reste à faire

- Les vignettes vidéo de la bibliothèque PPG sont des placeholders.
- Les directions calendrier `1b` (grille de charge mensuelle) et `1c` (carnet,
  un jour à la fois) du design ne sont pas implémentées : `1a` est le prototype
  navigable, `1b`/`1c` sont deux pistes à trancher.
- Le ressenti post-séance (RPE, réalisation, douleur et note) est conservé dans
  le compte. Un RPE très élevé, une séance partielle ou une douleur adapte de
  façon prudente la prochaine séance exigeante et affiche l'avant/après. Ce
  retour n'est pas encore renvoyé vers Coros.
