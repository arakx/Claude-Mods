import { expect, test } from 'claude-code/testing'

import type { Tache } from '../types'
import { actionDe, avancement, capsule, duree, etatVu, titreDe, visible } from './register'

const base: Tache = { session: 's', titre: 'T', debut: 0, vu: 0, etat: 'en_cours', actions: 0 }

test('le titre reprend le début de la demande', async () => {
  expect(titreDe('  Fais-moi   un plan ')).toBe('Fais-moi un plan')
  expect(titreDe('Un plan en 5 étapes pour analyser le dossier tools', 24)).toBe('Un plan en 5 étapes pou…')
})

test('la durée se lit en clair', async () => {
  expect(duree(29_000)).toBe('29s')
  expect(duree(112_000)).toBe('1m 52s')
  expect(duree(3_725_000)).toBe('1h 02m')
})

test("l'action en cours se décrit sans plan", async () => {
  expect(actionDe('Read', { file_path: 'C:/a/register.tsx' })).toBe('Lit register.tsx')
  expect(actionDe('Edit', { file_path: ['C:', 'a', 'b.ts'].join(String.fromCharCode(92)) })).toBe('Modifie b.ts')
  expect(actionDe('Bash', { description: 'Lance les tests' })).toBe('Lance les tests')
  expect(actionDe('Grep', {})).toBe('Cherche dans les fichiers')
})

test("l'avancement suit le plan", async () => {
  expect(avancement(base)).toBe(undefined)
  expect(avancement({ ...base, total: 5, faites: 2 })).toBe(40)
  expect(avancement({ ...base, etat: 'termine' })).toBe(100)
})

test('un chat muet depuis une minute est interrompu', async () => {
  expect(etatVu({ ...base, vu: 0 }, 30_000)).toBe('en_cours')
  expect(etatVu({ ...base, vu: 0 }, 61_000)).toBe('interrompu')
  expect(etatVu({ ...base, etat: 'termine', vu: 0 }, 61_000)).toBe('termine')
})

test('une tâche finie ou fermée disparaît', async () => {
  expect(visible({ ...base, etat: 'termine', fin: 0 }, 59 * 60_000)).toBe(true)
  expect(visible({ ...base, etat: 'termine', fin: 0 }, 61 * 60_000)).toBe(false)
  expect(visible({ ...base, masquee: true }, 0)).toBe(false)
})

test("la capsule est fine et suit l'avancement", async () => {
  const svg = capsule({ percent: 40, teinte: '#AF52DE', phase: 0 })
  expect(svg).toContain('height="8"')
  expect(svg).toContain('width="72"')
  expect(svg).toContain('#AF52DE')
  expect(capsule({ teinte: '#AF52DE', phase: 0 })).toContain('x="-63"')
})
