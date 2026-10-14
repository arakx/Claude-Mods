import { atom, read, update } from 'claude-code'
import type { Register, SessionMeasureInput } from 'claude-code'

import type { Limite, Mesure } from '../types'

const mesure = atom({ plugin: 'la-jauge', key: 'mesure' } as const, null)
const now = atom({ plugin: 'la-jauge', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'la-jauge', key: 'isHidden' } as const, false)
const demo = atom({ plugin: 'la-jauge', key: 'demo' } as const, null)

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

const NOMS: Record<string, string> = {
  five_hour: 'Limite 5 h',
  seven_day: '7 jours',
  spend_limit: 'Budget',
}

export const toMesure = (e: Pick<SessionMeasureInput, 'context' | 'rateLimits' | 'cost'>): Mesure => ({
  contextPercent: e.context.percent,
  contextTokens: e.context.tokens,
  contextWindow: e.context.window,
  limites: e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })),
  costUsd: e.cost?.usd,
})

export const barre = (percent: number, largeur = 10): string => {
  const plein = Math.max(0, Math.min(largeur, Math.round((percent / 100) * largeur)))

  return '█'.repeat(plein) + '░'.repeat(largeur - plein)
}

export const couleur = (percent: number) =>
  percent >= 90 ? 'error' : percent >= 70 ? 'warning' : 'success'

// Paliers propres au contexte : vert, jaune, orange, rouge
export const couleurContexte = (percent: number) =>
  percent <= 30 ? 'success' : percent <= 40 ? '#E5C100' : percent <= 50 ? '#FF8C00' : 'error'

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

export const register: Register = on => {
  let minuterie: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jauge',
      description: 'Afficher ou masquer La Jauge (contexte, limites, coût)',
    })
    await $.command.register({
      name: 'jauge-demo',
      description: 'Montrer toutes les couleurs de La Jauge avec des valeurs fictives',
    })
    await update($, demo, () => null)
    const t = await $.clock.now()
    await update($, now, () => t)
    const usage = await $.session.usage()
    await update($, mesure, () => toMesure(usage))
    // Le compte à rebours avance même sans nouvelle réponse
    $.clock.every(60_000, () => {
      void $.clock.now().then(t2 => update($, now, () => t2))
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await update($, mesure, () => toMesure(e))
    const t = await $.clock.now()
    await update($, now, () => t)

    return next(e)
  })

  on('command.run', { command: 'jauge' }, async $ => {
    const hidden = await update($, isHidden, h => !h)

    return { text: hidden ? 'La Jauge est masquée.' : 'La Jauge est affichée.' }
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const etape = await read($, demo)
    const maintenant = (await read($, now)) || (await $.clock.now())
    const m = etape === null ? await read($, mesure) : mesureDemo(etape, maintenant)
    if (e.props.hasSurvey || m === null || (await read($, isHidden))) {
      return next(e)
    }
    const { Box, Text } = $.ui.resolve(e)

    const ctx = m.contextPercent
    const limites = [...m.limites].sort((a, b) => ordre(a) - ordre(b))

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Text>
          <Text dimColor>Contexte </Text>
          {ctx === undefined ? (
            <Text dimColor>— / {tokensCourts(m.contextWindow)}</Text>
          ) : (
            <Text color={couleurContexte(ctx)}>
              {barre(ctx)} {ctx}% ({tokensCourts(m.contextTokens ?? 0)}/{tokensCourts(m.contextWindow)})
            </Text>
          )}
        </Text>
        {limites.map(l => {
          const reste = avantReset(l.resetsAt, maintenant)

          return (
            <Text>
              <Text dimColor>{NOMS[l.kind] ?? l.kind} </Text>
              <Text color={couleur(l.percentUsed)}>{l.percentUsed}%</Text>
              {reste !== undefined && <Text dimColor> ↻ {reste}</Text>}
            </Text>
          )
        })}
        {m.costUsd !== undefined && (
          <Text>
            <Text dimColor>Session </Text>
            <Text>{m.costUsd.toFixed(2)} $</Text>
          </Text>
        )}
      </Box>
    )
  })
}

const ordre = (l: Limite) => (l.kind === 'five_hour' ? 0 : l.kind === 'seven_day' ? 1 : 2)
