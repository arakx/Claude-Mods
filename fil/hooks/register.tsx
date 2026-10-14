import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Etat, Tache } from '../types'

const taches = atom({ plugin: 'fil', key: 'taches' } as const, [])
const now = atom({ plugin: 'fil', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'fil', key: 'isHidden' } as const, false)

export const OUTIL = 'mcp__fil__progression'

// Couleurs système d'Apple
export const TEINTES = { violet: '#AF52DE', vert: '#34C759', orange: '#FF9500', rouge: '#FF3B30' }

// Sans signe de vie depuis une minute, une tâche en cours est considérée interrompue (chat fermé)
const INACTIF_MS = 60_000
// Une tâche finie reste affichée une heure, sauf si on la ferme avant
const GARDE_MS = 60 * 60_000
const LIGNES_MAX = 4

const CONSIGNE = [
  "Le mod « Le Fil » affiche la progression de ton travail au-dessus de la zone de saisie.",
  `Quand une demande demande plusieurs étapes (plus de deux ou trois actions), appelle d'abord l'outil ${OUTIL}`,
  "avec `total` (le nombre d'étapes de ton plan) et `actuelle` (l'intitulé court de la première étape),",
  'puis rappelle-le après chaque étape terminée avec `faites` et `actuelle` (l\'étape suivante).',
  'Intitulés courts, moins de 40 caractères. Inutile pour une simple question ou une réponse courte.',
  'Le plan s\'affiche dans Le Fil : ne le recopie pas dans ta réponse.',
].join(' ')

export const titreDe = (texte: string, max = 32): string => {
  const ligne = texte.replace(/\s+/g, ' ').trim()

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

// Ce que Claude est en train de faire, quand il n'a pas annoncé de plan
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

// Capsule façon macOS, du même format que celles de La Jauge : fine, dégradé et reflet
export const capsule = (o: { percent?: number; teinte: string; phase: number; largeur?: number }): string => {
  const largeur = o.largeur ?? 180
  const h = 8
  const r = h / 2
  // Sans plan, un segment glisse le long de la piste, une case par seconde
  const seg = Math.round(largeur * 0.35)
  const [x, w] =
    o.percent === undefined
      ? [Math.round(((o.phase % 12) / 12) * (largeur + seg)) - seg, seg]
      : [0, o.percent === 0 ? 0 : Math.max(h, Math.round((o.percent / 100) * largeur))]

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${h}" viewBox="0 0 ${largeur} ${h}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${o.teinte}" stop-opacity="0.75"/><stop offset="1" stop-color="${o.teinte}"/>` +
    `</linearGradient>` +
    `<clipPath id="c"><rect width="${largeur}" height="${h}" rx="${r}"/></clipPath>` +
    `</defs>` +
    `<g clip-path="url(#c)">` +
    `<rect width="${largeur}" height="${h}" fill="#8E8E93" fill-opacity="0.22"/>` +
    `<rect x="${x}" width="${w}" height="${h}" rx="${r}" fill="url(#g)"/>` +
    `<rect x="${x}" width="${w}" height="${r}" rx="${r / 2}" fill="#FFFFFF" fill-opacity="0.22"/>` +
    `</g>` +
    `</svg>`
  )
}

const SIGNES: Record<Etat, [string, string]> = {
  en_cours: ['●', TEINTES.violet],
  termine: ['✓', TEINTES.vert],
  interrompu: ['⏸', TEINTES.orange],
  erreur: ['✕', TEINTES.rouge],
}

// Ce chat, sa tâche, et ce qu'on a déjà lu des autres chats
const S = {
  moi: '',
  dossier: '',
  courante: undefined as Tache | undefined,
  lus: new Map<string, { mtime: number; tache: Tache }>(),
  dernierPublie: '',
}

const fichier = (session: string) => `${S.dossier}/${session}.json`

async function ecrire($: EngineInterface, t: Tache) {
  if (!S.dossier) {
    return
  }
  try {
    await $.fs.write(fichier(t.session), JSON.stringify(t))
  } catch {
    // le Fil de ce chat reste visible ici même si le fichier partagé est inaccessible
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
          const t = JSON.parse(String(await $.fs.read(fichier(session)))) as Tache
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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    S.moi = await $.session.id()
    const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
    S.dossier = home ? `${home.replace(/\\/g, '/')}/.claude/fil` : ''
    await $.command.register({ name: 'fil', description: 'Afficher ou masquer Le Fil (progression des tâches)' })
    await $.tool.register({
      name: 'progression',
      description:
        "Met à jour la barre de progression du Fil pour la tâche en cours : au début, `total` (nombre d'étapes du plan) et `actuelle` (première étape) ; après chaque étape, `faites` et `actuelle` (étape suivante).",
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
    const t = await $.clock.now()
    await update($, now, () => t)
    $.clock.every(1000, () => {
      void (async () => {
        const maintenant = await $.clock.now()
        await update($, now, () => maintenant)
        // Signe de vie toutes les 10 secondes pendant une tâche
        if (S.courante?.etat === 'en_cours' && maintenant - S.courante.vu > 10_000) {
          S.courante = { ...S.courante, vu: maintenant }
          await ecrire($, S.courante)
        }
        await rafraichir($, maintenant)
      })()
    })

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)

    return { sections: [...r.sections, { id: 'fil', text: CONSIGNE, scope: 'session' }] }
  })

  on('prompt.submit', async ($, e, next) => {
    const texte = e.text.trim()
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
    S.courante = {
      ...S.courante,
      vu: t,
      total: entree.total ?? S.courante.total,
      faites: entree.faites ?? S.courante.faites ?? 0,
      actuelle: entree.actuelle ?? S.courante.actuelle,
      titre: entree.titre ? titreDe(entree.titre) : S.courante.titre,
    }
    await publier($)

    return { result: 'ok' }
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== OUTIL && S.courante?.etat === 'en_cours') {
      S.courante = {
        ...S.courante,
        actions: S.courante.actions + 1,
        actuelle: S.courante.total ? S.courante.actuelle : actionDe(e.tool, e as unknown as Record<string, unknown>),
      }
      await publier($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
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
        const envoi = await $.ui.notify(texte, { title: 'Le Fil' }).catch(() => undefined)
        // Sur l'app de bureau la notification système passe par l'app : on affiche aussi un toast
        if (!envoi?.isSent) {
          $.ui.toast(texte)
        }
      }
    }

    return next(e)
  })

  on('command.run', { command: 'fil' }, async $ => {
    const cache = await update($, isHidden, h => !h)

    return { text: cache ? 'Le Fil est masqué.' : 'Le Fil est affiché.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const dessous = await next(e)
    const liste = await read($, taches)
    if (e.props.hasSurvey || liste.length === 0 || (await read($, isHidden))) {
      return dessous
    }
    const maintenant = (await read($, now)) || (await $.clock.now())
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined

    const fermer = (t: Tache) => async () => {
      const masquee = { ...t, masquee: true }
      if (t.session === S.moi) {
        S.courante = undefined
      } else {
        S.lus.set(t.session, { mtime: S.lus.get(t.session)?.mtime ?? 0, tache: masquee })
      }
      await ecrire($, masquee)
      await rafraichir($, maintenant)
    }

    const ligne = (t: Tache) => {
      const etat = etatVu(t, maintenant)
      const [signe, teinte] = SIGNES[etat]
      const p = avancement({ ...t, etat })
      const temps = duree((t.fin ?? maintenant) - t.debut)
      const pastille = etat === 'termine' ? `✓ ${temps}` : temps
      const etape =
        etat === 'interrompu'
          ? 'Interrompu'
          : etat === 'erreur'
            ? 'Erreur'
            : t.total && etat === 'en_cours'
              ? `${Math.min((t.faites ?? 0) + 1, t.total)}/${t.total}${t.actuelle ? ` · ${t.actuelle}` : ''}`
              : (t.actuelle ?? (etat === 'termine' ? `${t.actions} actions` : 'Démarre…'))
      const phase = Math.floor((maintenant - t.debut) / 1000)

      return (
        <Box key={`tache-${t.session}`} flexDirection="row" alignItems="center" columnGap={1}>
          <Text color={teinte}>{signe}</Text>
          <Box width={30} flexShrink={0}>
            <Text wrap="truncate-end">
              <Text bold>{t.titre}</Text>
              {t.session !== S.moi && <Text dimColor> · autre chat</Text>}
            </Text>
          </Box>
          {Svg ? (
            <Svg
              source={capsule({ percent: p, teinte, phase })}
              alt={`${t.titre} : ${p === undefined ? 'en cours' : `${p} %`}, ${temps}`}
              width={180}
              height={8}
            />
          ) : (
            <Text>
              <Text color={teinte}>{'━'.repeat(Math.round(((p ?? (phase % 2) * 50) / 100) * 16))}</Text>
              <Text dimColor>{'━'.repeat(16 - Math.round(((p ?? (phase % 2) * 50) / 100) * 16))}</Text>
            </Text>
          )}
          <Text color={teinte} bold>
            {pastille}
          </Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {etape}
            </Text>
          </Box>
          {p !== undefined && (
            <Text color={teinte} bold>
              {p}%
            </Text>
          )}
          {etat !== 'en_cours' && (
            <Button key={`fermer-${t.session}`} label="✕" plain dimColor onPress={fermer(t)} />
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {liste.slice(0, LIGNES_MAX).map(ligne)}
        {dessous}
      </Box>
    )
  })
}
