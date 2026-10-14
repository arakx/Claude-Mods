import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionMeasureInput } from 'claude-code'

import type { Etat, Limite, Mesure, Phase, Tache } from '../types'

// La Jauge dessine toute la bande au-dessus de la zone de saisie, dans une seule grille :
// une ligne par tâche (le Fil), puis la ligne des jauges, avec le Relais au bout.

const mesure = atom({ plugin: 'la-jauge', key: 'mesure' } as const, null)
const now = atom({ plugin: 'la-jauge', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'la-jauge', key: 'isHidden' } as const, false)
const isFilHidden = atom({ plugin: 'la-jauge', key: 'isFilHidden' } as const, false)
const isOpen = atom({ plugin: 'la-jauge', key: 'isOpen' } as const, false)
const demo = atom({ plugin: 'la-jauge', key: 'demo' } as const, null)
const phase = atom({ plugin: 'la-jauge', key: 'phase' } as const, 'repos')
const fichierRelais = atom({ plugin: 'la-jauge', key: 'fichier' } as const, '')
const taches = atom({ plugin: 'la-jauge', key: 'taches' } as const, [])

// Couleurs système d'Apple
export const TEINTES = { vert: '#34C759', jaune: '#FFCC00', orange: '#FF9500', rouge: '#FF3B30', violet: '#AF52DE' }
const PISTE = '#8E8E93'

// ── La grille, en pourcentage de la largeur : les deux lignes tombent exactement l'une sous l'autre ──
//    Fil   : [ titre ··························· ][ barre ································ ][ temps  %  ✕ ]
//    Jauge : [ Contexte ][ barre ][ Limite 5 h ][ barre ][ 7 jours ][ barre ][ Passer le relais → ]
export const GRILLE = { etiquette: 10, barre: 16, droite: 22 }
const LARGEUR_TITRE = 2 * GRILLE.etiquette + GRILLE.barre // sous Contexte, sa barre et Limite 5 h
const LARGEUR_FIL = 2 * GRILLE.barre + GRILLE.etiquette // de la barre Limite 5 h au bout de la barre 7 jours
const pc = (n: number) => `${n}%`

// ── Le Fil : une ligne par tâche, dans ce chat et dans les autres ──

export const OUTIL = 'mcp__la-jauge__progression'

// Sans signe de vie depuis une minute, une tâche en cours est considérée interrompue (chat fermé)
const INACTIF_MS = 60_000
// Une tâche finie reste affichée une heure, sauf si on la ferme avant
const GARDE_MS = 60 * 60_000
const LIGNES_MAX = 4
const HISTORIQUE_MAX = 8
const TITRE_MAX = 34

const CONSIGNE = [
  'La bande au-dessus de la zone de saisie (mod « La Jauge ») affiche la progression de ton travail.',
  `Quand une demande demande plusieurs étapes (plus de deux ou trois actions), appelle d'abord l'outil ${OUTIL}`,
  "avec `total` (le nombre d'étapes de ton plan) et `actuelle` (l'intitulé court de la première étape),",
  "puis rappelle-le après chaque étape terminée avec `faites` et `actuelle` (l'étape suivante).",
  'Intitulés courts, moins de 40 caractères. Inutile pour une simple question ou une réponse courte.',
  "Le plan s'affiche dans la bande : ne le recopie pas dans ta réponse.",
  'Écris en français les descriptions de tes commandes : elles s’affichent comme actions en cours.',
].join(' ')

// Les messages que l'app glisse dans une demande (<system-reminder>…) ne font pas partie du titre
export const texteDe = (texte: string): string =>
  texte
    .replace(/<([a-z][\w-]*)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export const titreDe = (texte: string, max = TITRE_MAX): string => {
  // Toujours une majuscule en tête, même si la demande commence en minuscule
  const brut = texteDe(texte)
  const ligne = brut.charAt(0).toLocaleUpperCase('fr') + brut.slice(1)

  return ligne.length > max ? `${ligne.slice(0, max - 1).trimEnd()}…` : ligne
}

export const duree = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) {
    return `${s}s`
  }
  const m = Math.floor(s / 60)
  if (m < 60) {
    return `${m}m ${String(s % 60).padStart(2, '0')}s`
  }

  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

// Ce que Claude est en train de faire, en clair
export const actionDe = (outil: string, entree: Record<string, unknown>): string => {
  const fichier = (cle: string) => String(entree[cle] ?? '').split(/[\\/]/).pop() ?? ''
  switch (outil) {
    case 'Read':
      return `Lit ${fichier('file_path')}`
    case 'Edit':
    case 'Write':
      return `Modifie ${fichier('file_path')}`
    case 'NotebookEdit':
      return `Modifie ${fichier('notebook_path')}`
    case 'Bash':
    case 'PowerShell':
      return typeof entree.description === 'string' ? entree.description : 'Lance une commande'
    case 'Grep':
    case 'Glob':
      return 'Cherche dans les fichiers'
    case 'WebFetch':
    case 'WebSearch':
      return 'Cherche sur le web'
    case 'Agent':
      return 'Lance un agent'
    default:
      return outil.startsWith('mcp__') ? (outil.split('__').pop() ?? outil) : outil
  }
}

// De 0 à 100, ou undefined sans plan : la barre est alors indéterminée
export const avancement = (t: Tache): number | undefined => {
  if (t.etat === 'termine') {
    return 100
  }
  if (!t.total) {
    return undefined
  }

  return Math.round((Math.min(t.faites ?? 0, t.total) / t.total) * 100)
}

export const etatVu = (t: Tache, maintenant: number): Etat =>
  t.etat === 'en_cours' && maintenant - t.vu > INACTIF_MS ? 'interrompu' : t.etat

export const visible = (t: Tache, maintenant: number): boolean =>
  !t.masquee && maintenant - (t.fin ?? t.vu) <= GARDE_MS

const TEINTE_ETAT: Record<Etat, string> = {
  en_cours: TEINTES.violet,
  termine: TEINTES.vert,
  interrompu: TEINTES.orange,
  erreur: TEINTES.rouge,
}

// Ajoute une action à l'historique affiché sous la barre une fois dépliée
export const avecAction = (t: Tache, action: string): Tache => {
  const h = t.historique ?? []
  if (!action || h[h.length - 1] === action) {
    return t
  }

  return { ...t, historique: [...h, action].slice(-HISTORIQUE_MAX) }
}

// Ce chat, sa tâche, et ce qu'on a déjà lu des autres chats
const S = {
  moi: '',
  dossier: '',
  courante: undefined as Tache | undefined,
  lus: new Map<string, { mtime: number; tache: Tache }>(),
  dernierPublie: '',
}

const fichierTache = (session: string) => `${S.dossier}/${session}.json`

async function ecrire($: EngineInterface, t: Tache) {
  if (!S.dossier) {
    return
  }
  try {
    await $.fs.write(fichierTache(t.session), JSON.stringify(t))
  } catch {
    // la tâche de ce chat reste visible ici même si le fichier partagé est inaccessible
  }
}

// Rassemble la tâche de ce chat et celles des autres chats, et ne réécrit l'état que s'il a changé
async function rafraichir($: EngineInterface, maintenant: number) {
  if (S.dossier) {
    try {
      const entrees = await $.fs.list(S.dossier)
      for (const f of entrees) {
        const session = f.name.replace(/\.json$/, '')
        if (!f.name.endsWith('.json') || session === S.moi || S.lus.get(session)?.mtime === f.mtimeMs) {
          continue
        }
        try {
          const t = JSON.parse(String(await $.fs.read(fichierTache(session)))) as Tache
          const avant = S.lus.get(session)?.tache
          S.lus.set(session, { mtime: f.mtimeMs, tache: t })
          if (avant?.etat === 'en_cours' && avant.debut === t.debut && t.etat === 'termine' && !t.masquee) {
            $.ui.toast(`✓ ${t.titre} — terminé dans un autre chat (${duree((t.fin ?? maintenant) - t.debut)})`)
          }
        } catch {
          // fichier en cours d'écriture : relu au prochain passage
        }
      }
    } catch {
      // dossier pas encore créé
    }
  }
  const autres = [...S.lus.values()].map(l => l.tache).sort((a, b) => b.debut - a.debut)
  const liste = [...(S.courante ? [S.courante] : []), ...autres].filter(t => visible(t, maintenant))
  const json = JSON.stringify(liste)
  if (json !== S.dernierPublie) {
    S.dernierPublie = json
    await update($, taches, () => liste)
  }
}

async function publier($: EngineInterface) {
  if (S.courante) {
    await ecrire($, S.courante)
  }
  await rafraichir($, await $.clock.now())
}

async function fermerTache($: EngineInterface, t: Tache) {
  const masquee = { ...t, masquee: true }
  if (t.session === S.moi) {
    S.courante = undefined
  } else {
    S.lus.set(t.session, { mtime: S.lus.get(t.session)?.mtime ?? 0, tache: masquee })
  }
  await ecrire($, masquee)
  await rafraichir($, await $.clock.now())
}

// ── Le Relais : passation dans relais.md, conversation vidée, reprise préparée ──

// À partir de ce remplissage du contexte, « Passer le relais » apparaît au bout de la ligne
export const SEUIL = 60

export const relaisVisible = (p: number | undefined, ph: Phase): boolean =>
  ph !== 'repos' || (p !== undefined && p >= SEUIL)

export const consigne = (o: { chemin: string; date: string; origine: string; resume: string }): string =>
  [
    'Passe le relais : le contexte de cette conversation se remplit, elle va être vidée et une conversation neuve reprendra le travail.',
    `Écris (en écrasant l'ancien s'il existe) le fichier de passation \`${o.chemin}\`, pour que la nouvelle conversation reprenne sans rien perdre : elle n'aura que ce fichier.`,
    '',
    'Format exact :',
    '',
    'STATUT : CONTINUER  ← si tu étais en plein travail et peux le poursuivre sans moi',
    'STATUT : ATTENDRE   ← si tu attendais une réponse, une validation ou une décision de ma part',
    `<!-- Relais · ${o.date} · demandé par ${o.origine} · conversation d'origine : claude --resume ${o.resume} -->`,
    '',
    '## Objectif',
    '## Contraintes permanentes  (mes préférences et règles données pendant la conversation)',
    '## Fait  (avec fichiers, chemins, versions, décisions prises)',
    "## Reste à faire  (prochaines étapes, dans l'ordre)",
    "## Points d'attention  (pièges, choses à vérifier)",
    '',
    'La première ligne est uniquement la ligne STATUT choisie. Sois complet et précis.',
    "Ne fais rien d'autre, puis réponds seulement « Passation prête. »",
  ].join('\n')

export const reprise = (chemin: string): string =>
  'Reprends le travail de la conversation précédente, vidée parce que son contexte se remplissait. ' +
  `Lis d'abord la passation : ${chemin}. ` +
  'Si sa première ligne dit CONTINUER, reprends à « Reste à faire » sans refaire ce qui est fait ; ' +
  'si elle dit ATTENDRE, dis en une phrase où on en est et attends ma réponse.'

// Lance la passation : Claude écrit relais.md à la racine du projet
async function lancer($: EngineInterface, origine: string) {
  if ((await read($, phase)) === 'redaction') {
    return
  }
  const racine = (await $.session.root()).replace(/\\/g, '/')
  const chemin = `${racine}/relais.md`
  const date = new Date(await $.clock.now()).toISOString().slice(0, 16).replace('T', ' ')
  const resume = await $.session.id()
  await update($, fichierRelais, () => chemin)
  await update($, phase, () => 'redaction')
  // Envoyé juste après, hors de la commande ou du clic qui l'a demandé
  const texte = consigne({ chemin, date, origine, resume })
  $.clock.after(50, () => {
    void $.prompt.submit({ text: texte })
  })
}

// Une fois la passation écrite : conversation vidée, puis message de reprise dans le champ
async function vider($: EngineInterface) {
  const chemin = await read($, fichierRelais)
  let estEcrit = true
  try {
    estEcrit = await $.fs.exists(chemin)
  } catch {
    // impossible de vérifier : on fait confiance à la réponse de Claude
  }
  if (!estEcrit) {
    await update($, phase, () => 'repos')
    $.ui.toast('Relais : la passation n’a pas été écrite, la conversation est conservée.')

    return
  }
  await $.command.run({ command: 'clear', args: '' })
  // Contexte vidé : la jauge repart à zéro jusqu'à la prochaine mesure
  await update($, mesure, m => (m ? { ...m, contextPercent: undefined, contextTokens: undefined } : m))
  await $.prompt.fill({ text: reprise(chemin) })
  await update($, phase, () => 'pret')
}

// ── Les jauges ──

// Étapes de /jauge-demo : contexte, limite 5 h, 7 jours
export const DEMO: [number, number, number][] = [
  [20, 40, 10],
  [35, 72, 20],
  [45, 80, 50],
  [60, 95, 92],
]

export const mesureDemo = (etape: number, maintenant: number): Mesure => {
  const [ctx, h5, j7] = DEMO[etape]
  const dans = (min: number) => new Date(maintenant + min * 60000).toISOString()

  return {
    contextPercent: ctx,
    contextTokens: ctx * 2000,
    contextWindow: 200000,
    limites: [
      { kind: 'five_hour', percentUsed: h5, resetsAt: dans(125) },
      { kind: 'seven_day', percentUsed: j7, resetsAt: dans(3 * 1440 + 180) },
    ],
    costUsd: 1.23,
  }
}

// Avant la première mesure : barres vides, pas de valeurs
const VIDE: Mesure = { contextWindow: 0, limites: [] }

export const toMesure = (e: Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>): Mesure => ({
  contextPercent: e.context.percent,
  contextTokens: e.context.tokens,
  contextWindow: e.context.window,
  limites: e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
  costUsd: e.cost?.usd,
})

const borne = (percent: number) => Math.max(0, Math.min(100, percent))

// Terminal : nombre de traits pleins et vides
export const barre = (percent: number, largeur = 12): [number, number] => {
  const plein = Math.round((borne(percent) / 100) * largeur)

  return [plein, largeur - plein]
}

// Bureau : la barre s'étire sur toute sa case. Le milieu est étiré, les deux bouts arrondis restent fixes.
const LONGUEUR = 1000

// Où commence et où finit le remplissage, sur 0…1000 ; sans pourcentage, un segment glisse
export const remplissage = (percent: number | undefined, pas = 0): [number, number] => {
  if (percent === undefined) {
    const seg = LONGUEUR * 0.35
    const x = ((pas % 12) / 12) * (LONGUEUR + seg) - seg

    return [Math.round(Math.max(0, x)), Math.round(Math.min(LONGUEUR, x + seg))]
  }

  return [0, Math.round((borne(percent) / 100) * LONGUEUR)]
}

export const piste = (percent: number | undefined, teinte: string, pas = 0): string => {
  const [x0, x1] = remplissage(percent, pas)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LONGUEUR}" height="8" viewBox="0 0 ${LONGUEUR} 8" preserveAspectRatio="none">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${teinte}" stop-opacity="0.75"/><stop offset="1" stop-color="${teinte}"/>` +
    `</linearGradient></defs>` +
    `<rect width="${LONGUEUR}" height="8" fill="${PISTE}" fill-opacity="0.22"/>` +
    `<rect x="${x0}" width="${x1 - x0}" height="8" fill="url(#g)"/>` +
    `<rect x="${x0}" width="${x1 - x0}" height="4" fill="#FFFFFF" fill-opacity="0.18"/>` +
    `</svg>`
  )
}

// Bout arrondi de la barre : coloré quand le remplissage le touche, gris sinon
export const bout = (cote: 'gauche' | 'droite', teinte: string | undefined): string => {
  const d = cote === 'gauche' ? 'M4 0 A4 4 0 0 0 4 8 Z' : 'M0 0 A4 4 0 0 1 0 8 Z'
  const fill = teinte ? `fill="${teinte}" fill-opacity="${cote === 'gauche' ? 0.75 : 1}"` : `fill="${PISTE}" fill-opacity="0.22"`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="8" viewBox="0 0 4 8"><path d="${d}" ${fill}/></svg>`
}

export const couleur = (percent: number) =>
  percent >= 90 ? TEINTES.rouge : percent >= 70 ? TEINTES.orange : TEINTES.vert

// Paliers propres au contexte : vert, jaune, orange, rouge
export const couleurContexte = (percent: number) =>
  percent <= 30 ? TEINTES.vert : percent <= 40 ? TEINTES.jaune : percent <= 50 ? TEINTES.orange : TEINTES.rouge

export const avantReset = (resetsAt: string | undefined, maintenant: number): string | undefined => {
  if (!resetsAt) {
    return undefined
  }
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - maintenant) / 60000))
  if (Number.isNaN(minutes)) {
    return undefined
  }
  const jours = Math.floor(minutes / 1440)
  const heures = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (jours > 0) {
    return `${jours} j ${heures} h`
  }
  if (heures > 0) {
    return `${heures} h ${String(mins).padStart(2, '0')}`
  }

  return `${mins} min`
}

const tokensCourts = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

const limiteDe = (m: Mesure, kind: string): Limite | undefined => m.limites.find(l => l.kind === kind)

export const register: Register = on => {
  let minuterie: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'jauge', description: 'Afficher ou masquer La Jauge' })
    await $.command.register({ name: 'fil', description: 'Afficher ou masquer les tâches en cours dans La Jauge' })
    await $.command.register({
      name: 'jauge-demo',
      description: 'Montrer toutes les couleurs de La Jauge avec des valeurs fictives',
    })
    await $.command.register({
      name: 'relais',
      description: 'Passer le relais : passation dans relais.md, conversation vidée, reprise préparée',
    })
    await $.tool.register({
      name: 'progression',
      description:
        "Met à jour la barre de progression de la tâche en cours : au début, `total` (nombre d'étapes du plan) et `actuelle` (première étape) ; après chaque étape, `faites` et `actuelle` (étape suivante).",
      isDeferred: false,
      inputSchema: {
        type: 'object',
        properties: {
          total: { type: 'integer', minimum: 1, maximum: 50, description: "Nombre d'étapes du plan" },
          faites: { type: 'integer', minimum: 0, description: "Nombre d'étapes terminées" },
          actuelle: { type: 'string', description: "Intitulé court de l'étape en cours" },
          titre: { type: 'string', description: 'Titre court de la tâche (facultatif)' },
        },
      },
    })
    await update($, demo, () => null)

    // Le Fil : dossier partagé entre les chats, et tâche de ce chat relue après un rechargement
    S.moi = await $.session.id()
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    S.dossier = home ? `${home.replace(/\\/g, '/')}/.claude/fil` : ''
    try {
      const t = JSON.parse(String(await $.fs.read(fichierTache(S.moi)))) as Tache
      if (t.session === S.moi && !t.masquee) {
        S.courante = t
      }
    } catch {
      // pas encore de tâche dans ce chat
    }

    const t = await $.clock.now()
    await update($, now, () => t)
    // Chaque seconde : le temps avance, signe de vie de la tâche, lecture des autres chats
    $.clock.every(1000, () => {
      void (async () => {
        const maintenant = await $.clock.now()
        await update($, now, () => maintenant)
        if (S.courante?.etat === 'en_cours' && maintenant - S.courante.vu > 10_000) {
          S.courante = { ...S.courante, vu: maintenant }
          await ecrire($, S.courante)
        }
        await rafraichir($, maintenant)
      })()
    })
    const demarre = await next(e)
    // Au tout début d'une session les chiffres peuvent manquer : la bande s'affiche vide
    try {
      const usage = await $.session.usage()
      await update($, mesure, () => toMesure(usage))
    } catch {
      // rien à faire : on attend session.measure
    }

    return demarre
  })

  on('session.measure', async ($, e, next) => {
    await update($, mesure, () => toMesure(e))

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)

    return { sections: [...r.sections, { id: 'fil', text: CONSIGNE, scope: 'session' }] }
  })

  on('prompt.submit', async ($, e, next) => {
    // Dès que la reprise est envoyée, le Relais se fait oublier
    if ((await read($, phase)) === 'pret') {
      await update($, phase, () => 'repos')
    }
    const texte = texteDe(e.text)
    if (texte && !texte.startsWith('/') && S.courante?.etat !== 'en_cours') {
      const t = await $.clock.now()
      S.courante = { session: S.moi, titre: titreDe(texte), debut: t, vu: t, etat: 'en_cours', actions: 0 }
      await publier($)
    }

    return next(e)
  })

  on('tool.call', { tool: OUTIL }, async ($, e) => {
    const entree = e as unknown as { total?: number; faites?: number; actuelle?: string; titre?: string }
    const t = await $.clock.now()
    S.courante ??= { session: S.moi, titre: 'Tâche', debut: t, vu: t, etat: 'en_cours', actions: 0 }
    const avant = S.courante
    let suivante: Tache = {
      ...avant,
      vu: t,
      total: entree.total ?? avant.total,
      faites: entree.faites ?? avant.faites ?? 0,
      actuelle: entree.actuelle ?? avant.actuelle,
      titre: entree.titre ? titreDe(entree.titre) : avant.titre,
    }
    // Une étape vient d'être cochée : elle rejoint l'historique
    if ((suivante.faites ?? 0) > (avant.faites ?? 0) && avant.actuelle) {
      suivante = avecAction(suivante, `✓ ${avant.actuelle}`)
    }
    S.courante = suivante
    await publier($)

    return { result: 'ok' }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== OUTIL && S.courante?.etat === 'en_cours') {
      const action = actionDe(e.tool, e as unknown as Record<string, unknown>)
      S.courante = avecAction(
        { ...S.courante, actions: S.courante.actions + 1, actuelle: S.courante.total ? S.courante.actuelle : action },
        action,
      )
      await publier($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    // Fil : la tâche de ce chat est terminée
    if (S.courante?.etat === 'en_cours') {
      const t = await $.clock.now()
      const etat: Etat = e.reason === 'answer' ? 'termine' : e.reason === 'aborted' ? 'interrompu' : 'erreur'
      S.courante = {
        ...S.courante,
        etat,
        fin: t,
        vu: t,
        faites: etat === 'termine' && S.courante.total ? S.courante.total : S.courante.faites,
        actuelle: etat === 'termine' ? undefined : S.courante.actuelle,
      }
      await publier($)
      if (etat === 'termine') {
        const texte = `✓ ${S.courante.titre} — terminé en ${duree(t - S.courante.debut)}`
        const envoi = await $.ui.notify(texte, { title: 'La Jauge' }).catch(() => undefined)
        // Sur l'app de bureau la notification système passe par l'app : on affiche aussi un toast
        if (!envoi?.isSent) {
          $.ui.toast(texte)
        }
      }
    }
    // Relais : la passation est écrite, on vide la conversation une fois le tour fini
    if ((await read($, phase)) === 'redaction') {
      if (e.reason === 'answer') {
        $.clock.after(300, () => {
          void vider($)
        })
      } else {
        await update($, phase, () => 'repos')
      }
    }

    return r
  })

  on('command.run', { command: 'jauge' }, async $ => {
    const hidden = await update($, isHidden, h => !h)

    return { text: hidden ? 'La Jauge est masquée.' : 'La Jauge est affichée.' }
  })

  on('command.run', { command: 'fil' }, async $ => {
    const cache = await update($, isFilHidden, h => !h)

    return { text: cache ? 'Les tâches sont masquées.' : 'Les tâches sont affichées.' }
  })

  on('command.run', { command: 'jauge-demo' }, async $ => {
    minuterie?.cancel()
    await update($, isHidden, () => false)
    await update($, demo, () => 0)
    minuterie = $.clock.every(3000, () => {
      void update($, demo, etape => (etape === null || etape + 1 >= DEMO.length ? null : etape + 1)).then(
        etape => {
          if (etape === null) {
            minuterie?.cancel()
          }
        },
      )
    })

    return { text: 'Démo : les couleurs défilent pendant 12 secondes, puis La Jauge revient aux vraies valeurs.' }
  })

  on('command.run', { command: 'relais' }, async $ => {
    if ((await read($, phase)) === 'redaction') {
      return { text: 'Relais : la passation est déjà en cours.' }
    }
    await lancer($, 'la commande /relais')

    return { text: 'Relais : Claude écrit la passation…' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }
    const etape = await read($, demo)
    const maintenant = (await read($, now)) || (await $.clock.now())
    const m = etape === null ? ((await read($, mesure)) ?? VIDE) : mesureDemo(etape, maintenant)
    const liste = (await read($, isFilHidden)) ? [] : (await read($, taches)).slice(0, LIGNES_MAX)
    const ouvert = await read($, isOpen)
    const ph = await read($, phase)
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined
    const colonnes = e.props.bodyColumns || 100

    // Un clic sur un libellé, un titre ou une valeur déplie ou replie toute la bande
    const basculer = () => update($, isOpen, o => !o)

    // Une barre qui remplit toute sa case : `part` est la largeur de la case en % de la ligne
    const jauge = (percent: number | undefined, teinte: string, part: number, pas = 0) => {
      if (Svg) {
        const [x0, x1] = remplissage(percent, pas)

        return (
          <Box flexDirection="row" alignItems="center" flexGrow={1}>
            <Svg source={bout('gauche', x0 === 0 && x1 > 0 ? teinte : undefined)} alt=" " width={4} height={8} />
            <Box flexGrow={1}>
              <Svg source={piste(percent, teinte, pas)} alt={percent === undefined ? 'en cours' : `${percent} %`} height={8} />
            </Box>
            <Svg source={bout('droite', x1 >= LONGUEUR ? teinte : undefined)} alt=" " width={4} height={8} />
          </Box>
        )
      }
      const n = Math.max(4, Math.floor((part / 100) * colonnes) - 2)
      const [x0, x1] = remplissage(percent, pas).map(x => Math.round((x / LONGUEUR) * n))

      return (
        <Text>
          <Text dimColor>{'━'.repeat(x0)}</Text>
          <Text color={teinte}>{'━'.repeat(x1 - x0)}</Text>
          <Text dimColor>{'━'.repeat(n - x1)}</Text>
        </Text>
      )
    }

    // Une case de la grille ; le libellé et la valeur sont des boutons discrets, donc tous alignés à gauche pareil
    const caseG = (part: number, contenu: unknown, cle?: string) => (
      <Box key={cle} width={pc(part)} flexShrink={0} flexDirection="row" alignItems="center" paddingRight={1}>
        {contenu as never}
      </Box>
    )
    const libelle = (nom: string) => <Button key={`ouvrir-${nom}`} label={nom} plain dimColor onPress={basculer} />
    const valeur = (cle: string, percent: number | undefined, teinte: string, detail?: string) => (
      <Button key={`valeur-${cle}`} plain onPress={basculer}>
        {percent === undefined ? (
          <Text dimColor>—</Text>
        ) : (
          <Text color={teinte} bold>
            {percent}%
          </Text>
        )}
        {detail !== undefined && <Text dimColor> {detail}</Text>}
      </Button>
    )

    // ── Lignes du Fil ──
    const ligneTache = (t: Tache) => {
      const etat = etatVu(t, maintenant)
      const teinte = TEINTE_ETAT[etat]
      const p = avancement({ ...t, etat })
      const temps = duree((t.fin ?? maintenant) - t.debut)
      const pas = Math.floor((maintenant - t.debut) / 1000)
      const autre = t.session !== S.moi
      const titreMax = Math.min(TITRE_MAX, Math.floor((LARGEUR_TITRE / 100) * colonnes) - (autre ? 14 : 4))
      const titre = titreDe(t.titre, Math.max(8, titreMax))
      const fin =
        etat === 'interrompu' ? 'Interrompu' : etat === 'erreur' ? 'Erreur' : p !== undefined ? `${p}%` : ''
      const etapes =
        t.total && etat === 'en_cours'
          ? `${Math.min((t.faites ?? 0) + 1, t.total)}/${t.total}${t.actuelle ? ` · ${t.actuelle}` : ''}`
          : undefined
      const actions = [...(etapes ? [etapes] : []), ...[...(t.historique ?? [])].reverse()]

      return (
        <Box key={`tache-${t.session}`} flexDirection="column">
          <Box flexDirection="row" alignItems="center">
            {caseG(
              LARGEUR_TITRE,
              <Button key={`ouvrir-tache-${t.session}`} plain onPress={basculer}>
                <Text bold>{titre}</Text>
                {autre && <Text dimColor> · autre chat</Text>}
              </Button>,
            )}
            {caseG(LARGEUR_FIL, jauge(p, teinte, LARGEUR_FIL, pas))}
            <Box width={pc(GRILLE.droite)} flexDirection="row" alignItems="center" columnGap={1}>
              <Text color={teinte} bold>
                {temps}
              </Text>
              <Box flexGrow={1} />
              {fin !== '' && (
                <Text color={teinte} bold>
                  {fin}
                </Text>
              )}
              {etat !== 'en_cours' && (
                <Button key={`fermer-${t.session}`} label="✕" plain dimColor onPress={() => fermerTache($, t)} />
              )}
            </Box>
          </Box>
          {ouvert && (
            <Box flexDirection="row">
              <Box width={pc(LARGEUR_TITRE)} flexShrink={0} />
              <Box width={pc(LARGEUR_FIL + GRILLE.droite)} flexShrink={1}>
                <Button key={`actions-${t.session}`} plain onPress={basculer}>
                  <Text dimColor wrap="truncate-end">
                    {actions.length > 0 ? actions.join('  ·  ') : `${t.actions} actions`}
                  </Text>
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    // ── Ligne des jauges ──
    const ctx = m.contextPercent
    const h5 = limiteDe(m, 'five_hour')
    const j7 = limiteDe(m, 'seven_day')
    const reste = (l: Limite | undefined) => {
      const r = avantReset(l?.resetsAt, maintenant)

      return r === undefined ? undefined : `↻ ${r}`
    }
    const relais = relaisVisible(ctx, ph) ? (
      ph === 'repos' ? (
        <Button key="relais" plain onPress={() => lancer($, 'le bouton')}>
          <Text color={TEINTES.orange} bold>
            Passer le relais →
          </Text>
        </Button>
      ) : ph === 'redaction' ? (
        <Text dimColor>Passation en cours…</Text>
      ) : (
        <Button key="relais-ok" plain onPress={() => update($, phase, () => 'repos')}>
          <Text color={TEINTES.vert}>✓ </Text>
          <Text dimColor>Reprise dans le champ : </Text>
          <Text bold>Entrée ↵</Text>
        </Button>
      )
    ) : null

    const ligneJauges = (
      <Box key="jauges" flexDirection="column">
        <Box flexDirection="row" alignItems="center">
          {caseG(GRILLE.etiquette, libelle('Contexte'))}
          {caseG(GRILLE.barre, jauge(ctx ?? 0, couleurContexte(ctx ?? 0), GRILLE.barre))}
          {caseG(GRILLE.etiquette, libelle('Limite 5 h'))}
          {caseG(GRILLE.barre, jauge(h5?.percentUsed ?? 0, couleur(h5?.percentUsed ?? 0), GRILLE.barre))}
          {caseG(GRILLE.etiquette, libelle('7 jours'))}
          {caseG(GRILLE.barre, jauge(j7?.percentUsed ?? 0, couleur(j7?.percentUsed ?? 0), GRILLE.barre))}
          <Box width={pc(GRILLE.droite)} flexDirection="row" justifyContent="flex-end">
            {relais}
          </Box>
        </Box>
        {ouvert && (
          <Box flexDirection="row" alignItems="center">
            {caseG(
              GRILLE.etiquette + GRILLE.barre,
              valeur(
                'Contexte',
                ctx,
                couleurContexte(ctx ?? 0),
                m.contextWindow > 0 ? `${tokensCourts(m.contextTokens ?? 0)}/${tokensCourts(m.contextWindow)}` : undefined,
              ),
            )}
            {caseG(GRILLE.etiquette + GRILLE.barre, valeur('Limite 5 h', h5?.percentUsed, couleur(h5?.percentUsed ?? 0), reste(h5)))}
            {caseG(GRILLE.etiquette + GRILLE.barre, valeur('7 jours', j7?.percentUsed, couleur(j7?.percentUsed ?? 0), reste(j7)))}
            <Box width={pc(GRILLE.droite)} flexDirection="row" justifyContent="flex-end">
              {m.costUsd !== undefined && (
                <Button key="valeur-Session" plain onPress={basculer}>
                  <Text dimColor>Session </Text>
                  <Text bold>{m.costUsd.toFixed(2)} $</Text>
                </Button>
              )}
            </Box>
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {liste.map(ligneTache)}
        {ligneJauges}
      </Box>
    )
  })
}
