import { expect, test } from 'claude-code/testing'

import type { Tache } from '../types'
import { actionDe, avancement, avecAction, duree, etatVu, texteDe, titreDe, visible } from './register'

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


test("les messages de l'app ne deviennent pas des titres", async () => {
  expect(texteDe('<system-reminder>\nThe user started…\n</system-reminder>\n')).toBe('')
  expect(titreDe('<system-reminder>x</system-reminder> Fais le point sur le Relais')).toBe('Fais le point sur le Relais')
  expect(titreDe('Compare a < b et c > d')).toBe('Compare a < b et c > d')
})

test("l'historique garde les dernières actions, sans doublon", async () => {
  let t: Tache = { ...base }
  for (const a of ['Lit a', 'Lit a', 'Lit b', '', 'Lit c']) {
    t = avecAction(t, a)
  }
  expect(t.historique).toEqual(['Lit a', 'Lit b', 'Lit c'])
  for (let i = 0; i < 20; i++) {
    t = avecAction(t, `Action ${i}`)
  }
  expect(t.historique?.length).toBe(8)
  expect(t.historique?.[7]).toBe('Action 19')
})

test('le titre commence toujours par une majuscule', async () => {
  expect(titreDe('oui fusionne, garde 40%')).toBe('Oui fusionne, garde 40%')
  expect(titreDe('état du dépôt')).toBe('État du dépôt')
  expect(titreDe('/relais')).toBe('/relais')
})
