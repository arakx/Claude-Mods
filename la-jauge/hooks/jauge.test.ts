import { expect, test } from 'claude-code/testing'

import { DEMO, avantReset, barre, couleur, couleurContexte, mesureDemo, toMesure } from './register'

test('la barre suit le pourcentage', async () => {
  expect(barre(0)).toBe('░░░░░░░░░░')
  expect(barre(50)).toBe('█████░░░░░')
  expect(barre(100)).toBe('██████████')
  expect(barre(150)).toBe('██████████')
})

test('la couleur passe au orange puis au rouge', async () => {
  expect(couleur(30)).toBe('success')
  expect(couleur(75)).toBe('warning')
  expect(couleur(95)).toBe('error')
})

test('le contexte a ses propres paliers', async () => {
  expect(couleurContexte(30)).toBe('success')
  expect(couleurContexte(31)).toBe('#E5C100')
  expect(couleurContexte(40)).toBe('#E5C100')
  expect(couleurContexte(41)).toBe('#FF8C00')
  expect(couleurContexte(50)).toBe('#FF8C00')
  expect(couleurContexte(51)).toBe('error')
})

test('le temps avant réinitialisation se lit en clair', async () => {
  const t = Date.parse('2026-10-14T10:00:00Z')
  expect(avantReset('2026-10-14T10:45:00Z', t)).toBe('45 min')
  expect(avantReset('2026-10-14T12:05:00Z', t)).toBe('2 h 05')
  expect(avantReset('2026-10-17T13:00:00Z', t)).toBe('3 j 3 h')
  expect(avantReset(undefined, t)).toBe(undefined)
})

test('la mesure reprend contexte, limites et coût', async () => {
  const m = toMesure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 31.5, resetsAt: '2026-10-14T12:00:00Z' },
      { kind: 'seven_day', percentUsed: 12 },
    ],
    cost: { usd: 1.234 },
  })
  expect(m.contextPercent).toBe(42)
  expect(m.limites.length).toBe(2)
  expect(m.costUsd).toBe(1.234)
})

test('la démo passe par toutes les couleurs du contexte', async () => {
  const couleurs = DEMO.map((_, i) => couleurContexte(mesureDemo(i, 0).contextPercent ?? 0))
  expect(couleurs).toEqual(['success', '#E5C100', '#FF8C00', 'error'])
})
