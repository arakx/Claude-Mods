import { expect, test } from 'claude-code/testing'

import {
  DEMO,
  TEINTES,
  avantReset,
  barre,
  capsule,
  couleur,
  couleurContexte,
  mesureDemo,
  toMesure,
} from './register'

test('la ligne du terminal suit le pourcentage', async () => {
  expect(barre(0)).toEqual([0, 12])
  expect(barre(50)).toEqual([6, 6])
  expect(barre(100)).toEqual([12, 0])
  expect(barre(150)).toEqual([12, 0])
})

test('la capsule se remplit selon le pourcentage', async () => {
  expect(capsule(0, TEINTES.vert)).toContain('<rect width="0"')
  expect(capsule(50, TEINTES.vert)).toContain('<rect width="60"')
  expect(capsule(100, TEINTES.rouge)).toContain('<rect width="120"')
  expect(capsule(1, TEINTES.vert)).toContain('<rect width="8"')
  expect(capsule(42, TEINTES.orange)).toContain(TEINTES.orange)
})

test('les limites passent au orange puis au rouge', async () => {
  expect(couleur(30)).toBe(TEINTES.vert)
  expect(couleur(75)).toBe(TEINTES.orange)
  expect(couleur(95)).toBe(TEINTES.rouge)
})

test('le contexte a ses propres paliers', async () => {
  expect(couleurContexte(30)).toBe(TEINTES.vert)
  expect(couleurContexte(31)).toBe(TEINTES.jaune)
  expect(couleurContexte(40)).toBe(TEINTES.jaune)
  expect(couleurContexte(41)).toBe(TEINTES.orange)
  expect(couleurContexte(50)).toBe(TEINTES.orange)
  expect(couleurContexte(51)).toBe(TEINTES.rouge)
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
  expect(couleurs).toEqual([TEINTES.vert, TEINTES.jaune, TEINTES.orange, TEINTES.rouge])
})
