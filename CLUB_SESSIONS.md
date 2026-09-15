# Séances du club

Ce fichier permet de proposer simplement les prochaines séances du club.
Le planning contient **une seule séance club par semaine**.
Une contribution doit contenir au minimum une date, un nom et le contenu des
efforts. Les durées d’effort et de récupération sont exprimées en secondes pour
éviter toute ambiguïté.

## Proposer une séance

Copier ce modèle à la fin du fichier, puis remplacer les valeurs :

```markdown
### 2026-10-06 — Nom de la séance

- Échauffement : 20 min
- Retour au calme : 10 min
- Contenu :
  - 5 × 30 s, récupération 30 s
  - 5 × 45 s, récupération 45 s
- Note : facultative
```

Règles de contribution :

- utiliser une date au format `AAAA-MM-JJ` ;
- créer un seul titre de niveau 3 par séance ;
- indiquer chaque effort et sa récupération ;
- utiliser `1 ×` pour une pyramide ou un bloc effectué une seule fois ;
- écrire `récupération 0 s` pour le dernier effort sans récupération ;
- ne jamais ajouter de donnée personnelle ou de secret.

## Calendrier

### 2026-09-15 — 2′/3′/4′/5′/4′/3′/2′, récupération 1′

- Échauffement : 20 min
- Retour au calme : 10 min
- Contenu :
  - 1 × 120 s, récupération 60 s
  - 1 × 180 s, récupération 60 s
  - 1 × 240 s, récupération 60 s
  - 1 × 300 s, récupération 60 s
  - 1 × 240 s, récupération 60 s
  - 1 × 180 s, récupération 60 s
  - 1 × 120 s, récupération 60 s

### 2026-09-22 — 5 × 30″/30″, 5 × 45″/45″, 5 × 1′/1′, 5 × 1′30″/1′

- Échauffement : 20 min
- Retour au calme : 10 min
- Contenu :
  - 5 × 30 s, récupération 30 s
  - 5 × 45 s, récupération 45 s
  - 5 × 60 s, récupération 60 s
  - 5 × 90 s, récupération 60 s

## Publication dans l’application

Après validation d’une contribution, reporter la séance dans
`data/club-sessions.json`. Ce JSON reste la source lue par le moteur de
planification ; ce Markdown est l’interface de contribution humaine.
