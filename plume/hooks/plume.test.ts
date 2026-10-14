import { expect, test } from 'claude-code/testing'

import { nettoyer } from './register'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 4,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 4 },
  view: {},
}

test('le texte rendu est débarrassé des balises et guillemets de code', async () => {
  expect(nettoyer('  <demande>\nFais ceci.\n</demande> ')).toBe('Fais ceci.')
  expect(nettoyer('```\nFais cela.\n```')).toBe('Fais cela.')
  expect(nettoyer('Rien à retirer')).toBe('Rien à retirer')
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`le bouton remplace le brouillon par sa version propre, et on peut revenir (${surface})`, async ($, on) => {
    const remplis: string[] = []
    const demandes: string[] = []
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    on('prompt.read', () => ({ value: { text: 'euh fais moi un truc avec les vidéos en vrac', cursor: 0 } }))
    on('model.complete', ($, e) => {
      demandes.push(String(e.prompt))

      return { value: { isAnswered: true, text: 'Analyse mes dernières vidéos.', usage: {} } } as never
    })
    on('prompt.fill', ($, e) => (remplis.push(e.text), { isFilled: true, text: e.text }) as never)

    const vue = await $.ui.mount({ plugin: 'plume', surface, component: 'AbovePrompt', props: PROPS })
    expect(await vue.find({ text: /Améliorer le prompt/ })).toBeDefined()

    await vue.press({ key: 'plume' })
    expect(demandes[0]).toContain('euh fais moi un truc avec les vidéos en vrac')
    expect(remplis[0]).toBe('Analyse mes dernières vidéos.')
    expect(await vue.find({ text: /Prompt amélioré/ })).toBeDefined()

    await vue.press({ key: 'plume-revenir' })
    expect(remplis[1]).toBe('euh fais moi un truc avec les vidéos en vrac')
    expect(await vue.find({ text: /Améliorer le prompt/ })).toBeDefined()
  })

  test(`champ vide : rien n'est envoyé à Claude (${surface})`, async ($, on) => {
    let appels = 0
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    on('prompt.read', () => ({ value: { text: '   ', cursor: 0 } }))
    on('model.complete', () => ((appels += 1), { value: { isAnswered: true, text: 'x', usage: {} } }) as never)

    const vue = await $.ui.mount({ plugin: 'plume', surface, component: 'AbovePrompt', props: PROPS })
    await vue.press({ key: 'plume' })
    expect(appels).toBe(0)
    expect(await vue.find({ text: /Améliorer le prompt/ })).toBeDefined()
  })

  test(`/plume masque puis réaffiche le bouton (${surface})`, async ($, on) => {
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    const vue = await $.ui.mount({ plugin: 'plume', surface, component: 'AbovePrompt', props: PROPS })
    await $.command.run({ command: 'plume', args: '' })
    expect(await vue.find({ text: /Améliorer le prompt/ })).toBeUndefined()
    await $.command.run({ command: 'plume', args: '' })
    expect(await vue.find({ text: /Améliorer le prompt/ })).toBeDefined()
  })
}
