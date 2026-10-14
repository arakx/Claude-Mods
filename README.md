# Claude-Mods

Mes mods pour [Claude Code](https://claude.com/claude-code).

## Installation

Dans Claude Code, depuis un terminal :

```
/plugin install <nom-du-mod> --marketplace arakx/Claude-Mods
```

La première fois, Claude Code demande d'ajouter le dépôt : répondre `y`, puis choisir la portée (utilisateur par défaut).

## Mods

### Le Fil (`fil`)

Une ligne par tâche au-dessus de la zone de saisie, du lancement jusqu'au ✓ :

```
● Un plan en 5 étapes pour…            [━━━━━━━━━━──────── 29s ]  3/5 · Lit le code        40%
✓ Analyse du Radar · autre chat         [━━━━━━━━━━━━━━━━ ✓ 1m 52s]  12 actions          100%  ✕
```

- **Progression réelle** : au début d'une tâche, Claude annonce son plan (nombre d'étapes) et coche chaque étape ; sans plan, la barre est animée et affiche l'action en cours.
- **Multi-chat** : les tâches des autres chats ouverts apparaissent aussi, avec la mention « autre chat ».
- **Fin de tâche** : ✓ vert, temps total, et une notification (un message dans l'app de bureau). La ligne reste jusqu'à ce qu'on la ferme avec ✕, ou une heure.
- Une tâche dont le chat a été fermé en cours de route passe en ⏸ interrompue.

Commande : `/fil` pour afficher ou masquer.

```
/plugin install fil --marketplace arakx/Claude-Mods
```

### La Jauge (`la-jauge`)

Une bande au-dessus de la zone de saisie, avec une jauge en capsule pour chaque mesure (aux couleurs système de macOS) :

```
Contexte ━━━━━━━━──   Limite 5 h ━━────────   7 jours ━─────────                 ▸
```

Un clic sur un libellé ou sur le triangle `▸` affiche les valeurs sous chaque jauge :

```
Contexte ━━━━━━━━──   Limite 5 h ━━────────   7 jours ━─────────   Session       ▾
42% 84k/200k          31% ↻ 2 h 05            12% ↻ 3 j 3 h        1.23 $
```

- **Contexte** : remplissage de la fenêtre de contexte — vert jusqu'à 30 %, jaune jusqu'à 40 %, orange jusqu'à 50 %, rouge au-delà.
- **Limite 5 h** et **7 jours** : consommation de l'abonnement et temps avant réinitialisation (↻) — orange à 70 %, rouge à 90 %.
- **Session** : coût de la session.

Sur l'app de bureau, les jauges sont des capsules arrondies ; dans un terminal, une fine ligne de couleur.

Commandes :
- `/jauge` : afficher ou masquer la bande.
- `/jauge-demo` : faire défiler toutes les couleurs avec des valeurs fictives pendant 12 secondes.

Les limites 5 h et 7 jours n'apparaissent qu'avec un abonnement Claude, après la première réponse de la session.

```
/plugin install la-jauge --marketplace arakx/Claude-Mods
```
