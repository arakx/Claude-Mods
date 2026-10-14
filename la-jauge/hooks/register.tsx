import { atom, read, update } from 'claude-code'
import type { Register, SessionMeasureInput } from 'claude-code'

import type { Limite, Mesure } from '../types'

const mesure = atom({ plugin: 'la-jauge', key: 'mesure' } as const, null)
const now = atom({ plugin: 'la-jauge', key: 'now' } as const, 0)
const isHidden = atom({ plugin: 'la-jauge', key: 'isHidden' } as const, false)
const isOpen = atom({ plugin: 'la-jauge', key: 'isOpen' } as const, false)
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

// Couleurs système d'Apple
export const TEINTES = { vert: '#34C759', jaune: '#FFCC00', orange: '#FF9500', rouge: '#FF3B30' }

const borne = (percent: number) => Math.max(0, Math.min(100, percent))

// Terminal : nombre de traits pleins et vides
export const barre = (percent: number, largeur = 12): [number, number] => {
  const plein = Math.round((borne(percent) / 100) * largeur)

  return [plein, largeur - plein]
}

// Bureau : capsule arrondie, piste grise translucide, remplissage en dégradé avec un reflet
export const capsule = (percent: number, teinte: string, largeur = 120, hauteur = 8): string => {
  const r = hauteur / 2
  const p = borne(percent)
  const rempli = p === 0 ? 0 : Math.max(hauteur, (p / 100) * largeur)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${teinte}" stop-opacity="0.75"/>` +
    `<stop offset="1" stop-color="${teinte}"/>` +
    `</linearGradient>` +
    `<clipPath id="c"><rect width="${largeur}" height="${hauteur}" rx="${r}"/></clipPath>` +
    `</defs>` +
    `<g clip-path="url(#c)">` +
    `<rect width="${largeur}" height="${hauteur}" fill="#8E8E93" fill-opacity="0.22"/>` +
    `<rect width="${rempli}" height="${hauteur}" rx="${r}" fill="url(#g)"/>` +
    `<rect width="${rempli}" height="${r}" rx="${r / 2}" fill="#FFFFFF" fill-opacity="0.22"/>` +
    `</g>` +
    `</svg>`
  )
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
    const ouvert = await read($, isOpen)
    const table = $.ui.resolve(e)
    const { Box, Button, Text } = table
    const Svg = e.surface !== 'terminal' && 'Svg' in table ? table.Svg : undefined

    const jauge = (percent: number, teinte: string) => {
      if (Svg) {
        return <Svg source={capsule(percent, teinte, 100)} alt={`${percent} %`} width={100} height={8} />
      }
      const [plein, vide] = barre(percent, 10)

      return (
        <Text>
          <Text color={teinte}>{'━'.repeat(plein)}</Text>
          <Text dimColor>{'━'.repeat(vide)}</Text>
        </Text>
      )
    }

    // Un clic sur un libellé ou sur le triangle ouvre ou ferme les valeurs
    const basculer = () => update($, isOpen, o => !o)

    // Une colonne par mesure : le nom et la barre, puis la valeur dessous quand la flèche est ouverte
    const colonne = (nom: string, percent: number | undefined, teinte: string, detail: string | undefined) => (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Button key={`ouvrir-${nom}`} label={nom} plain dimColor onPress={basculer} />
          {jauge(percent ?? 0, teinte)}
        </Box>
        {ouvert && (
          // Même bouton discret que le libellé : même marge, donc même alignement
          <Button key={`valeur-${nom}`} plain onPress={basculer}>
            {percent === undefined ? (
              <Text dimColor>—</Text>
            ) : (
              <Text color={teinte} bold>
                {percent}%
              </Text>
            )}
            {detail !== undefined && <Text dimColor> {detail}</Text>}
          </Button>
        )}
      </Box>
    )

    const ctx = m.contextPercent
    const limites = [...m.limites].sort((a, b) => ordre(a) - ordre(b))

    return (
      <Box flexDirection="row" alignItems="flex-start" columnGap={3}>
        <Box flexDirection="row" alignItems="flex-start" columnGap={3} flexGrow={1}>
          {colonne(
            'Contexte',
            ctx,
            couleurContexte(ctx ?? 0),
            `${tokensCourts(m.contextTokens ?? 0)}/${tokensCourts(m.contextWindow)}`,
          )}
          {limites.map(l => {
            const reste = avantReset(l.resetsAt, maintenant)

            return colonne(
              NOMS[l.kind] ?? l.kind,
              l.percentUsed,
              couleur(l.percentUsed),
              reste === undefined ? undefined : `↻ ${reste}`,
            )
          })}
          {ouvert && m.costUsd !== undefined && (
            <Box flexDirection="column">
              <Button key="ouvrir-Session" label="Session" plain dimColor onPress={basculer} />
              <Button key="valeur-Session" plain onPress={basculer}>
                <Text bold>{m.costUsd.toFixed(2)} $</Text>
              </Button>
            </Box>
          )}
        </Box>
        {/* La flèche, calée à droite sur la ligne des barres */}
        <Box flexDirection="row" alignItems="center">
          <Button
            key="details"
            // Triangle d'affichage du Finder de macOS : pointe à droite fermé, vers le bas ouvert
            label={ouvert ? '▾' : '▸'}
            plain
            dimColor
            onPress={basculer}
          />
        </Box>
      </Box>
    )
  })
}

const ordre = (l: Limite) => (l.kind === 'five_hour' ? 0 : l.kind === 'seven_day' ? 1 : 2)
