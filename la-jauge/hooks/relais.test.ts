import { expect, test } from 'claude-code/testing'

import { consigne, relaisVisible, reprise } from './register'

test('le relais apparaît à partir de 60 %', async () => {
  expect(relaisVisible(undefined, 'repos')).toBe(false)
  expect(relaisVisible(59, 'repos')).toBe(false)
  expect(relaisVisible(60, 'repos')).toBe(true)
  expect(relaisVisible(undefined, 'redaction')).toBe(true)
  expect(relaisVisible(undefined, 'pret')).toBe(true)
})

test('la consigne décrit la passation attendue', async () => {
  const c = consigne({ chemin: 'C:/p/relais.md', date: '2026-10-14 12:00', origine: 'le bouton', resume: 'abc' })
  expect(c).toContain('`C:/p/relais.md`')
  expect(c).toContain('STATUT : CONTINUER')
  expect(c).toContain('STATUT : ATTENDRE')
  expect(c).toContain('claude --resume abc')
  for (const section of ['## Objectif', '## Contraintes permanentes', '## Fait', '## Reste à faire']) {
    expect(c).toContain(section)
  }
})

test('le message de reprise pointe vers la passation', async () => {
  const r = reprise('C:/p/relais.md')
  expect(r).toContain('Lis d\'abord la passation : C:/p/relais.md.')
  expect(r).toContain('CONTINUER')
  expect(r).toContain('ATTENDRE')
})
