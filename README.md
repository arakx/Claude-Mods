# Claude-Mods

Mes mods pour [Claude Code](https://claude.com/claude-code).

## Installation

Dans Claude Code, depuis un terminal :

```
/plugin install la-jauge --marketplace arakx/Claude-Mods
/plugin install plume --marketplace arakx/Claude-Mods
```

La première fois, Claude Code demande d'ajouter le dépôt : répondre `y`, puis choisir la portée (utilisateur par défaut).

## La Jauge (`la-jauge`)

Une bande au-dessus de la zone de saisie, en une seule grille alignée, aux couleurs système de macOS :

```
Fais-moi un plan en 5 étapes…            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   1m 47s        40%
Contexte  ━━━━━━━━━━   Limite 5 h  ━━━━━━━━━━   7 jours  ━━━━━━━━━━          Passer le relais →
```

Un clic sur un libellé, un titre ou une valeur déplie toute la bande :

```
Fais-moi un plan en 5 étapes…            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   1m 47s        40%
                                         3/5 · Lit le code  ·  ✓ Liste les fichiers  ·  …
Contexte  ━━━━━━━━━━   Limite 5 h  ━━━━━━━━━━   7 jours  ━━━━━━━━━━          Passer le relais →
42% 84k/200k           31% ↻ 2 h 05             12% ↻ 3 j 3 h                     Session 1.23 $
```

### Le Fil : la progression des tâches

- Une ligne par tâche en cours, **dans ce chat et dans les autres chats ouverts** (« · autre chat »). Sa barre s'étend de la barre « Limite 5 h » au bout de la barre « 7 jours ».
- **Progression réelle** : au début d'une tâche, Claude annonce son plan (nombre d'étapes) et coche chaque étape ; sans plan, un segment glisse le long de la barre.
- **Sous-agents** : chaque agent lancé par la tâche a sa ligne en retrait (« ↳ »), avec sa dernière action et son temps ; elle disparaît quand il a fini. La tâche reste en cours tant que des agents travaillent encore.
- Dépliée, la ligne montre sous la barre l'étape en cours, les étapes cochées et les dernières actions.
- Barre violette en cours, verte une fois finie ; à la fin, une notification (un message dans l'app de bureau). La ligne reste jusqu'à ce qu'on la ferme avec ✕, ou une heure.
- Une tâche dont le chat a été fermé en cours de route passe en orange, « Interrompu ».

### Les jauges

- **Contexte** : remplissage de la fenêtre de contexte — vert jusqu'à 30 %, jaune jusqu'à 40 %, orange jusqu'à 50 %, rouge au-delà.
- **Limite 5 h** et **7 jours** : consommation de l'abonnement et temps avant réinitialisation (↻) — orange à 70 %, rouge à 90 %. Avec un abonnement Claude ; barres vides jusqu'à la première réponse de la session.
- **Session** : coût de la session.

### Le Relais : une passation, puis une conversation neuve

1. À partir de **60 %** de contexte, **Passer le relais →** apparaît au bout de la ligne des jauges (ou à tout moment avec `/relais`).
2. Claude écrit la passation dans **`relais.md`**, à la racine du projet (écrasée à chaque relais) : `STATUT : CONTINUER` ou `ATTENDRE`, puis Objectif, Contraintes permanentes, Fait, Reste à faire, Points d'attention.
3. La conversation est vidée et le message de reprise est déjà dans le champ : il suffit d'appuyer sur Entrée. Claude lit `relais.md` et reprend là où il en était.

### Commandes

- `/jauge` : afficher ou masquer la bande.
- `/fil` : afficher ou masquer les lignes des tâches.
- `/relais` : passer le relais à tout moment.
- `/jauge-demo` : faire défiler toutes les couleurs avec des valeurs fictives pendant 12 secondes.

Sur l'app de bureau, les barres sont des capsules arrondies ; dans un terminal, une fine ligne de couleur.

## Plume (`plume`)

Une ligne sous la bande, au-dessus du champ : **✎ Améliorer le prompt**.

1. Tape ou dicte ta demande comme elle vient, en vrac.
2. Clique sur **✎ Améliorer le prompt** : Claude la remet au propre (idées dans l'ordre, répétitions retirées, rien d'inventé, même langue) et la version propre **remplace le brouillon dans le champ**.
3. Relis, puis Entrée. **↶ Revenir à l'original** remet le texte de départ ; **Annuler** arrête la mise au propre en cours.

- `/plume` : afficher ou masquer la ligne.

La réécriture passe par le modèle Sonnet, avec le compte de la session.
