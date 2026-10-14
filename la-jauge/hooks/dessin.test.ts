import { expect, mock, test } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 3,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 3 },
  view: {},
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`la flèche montre les valeurs sous les barres (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.command.run({ command: 'jauge-demo', args: '' } as never)
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })

    expect(await vue.find({ text: /Contexte/ })).toBeDefined()
    expect(await vue.find({ text: /7 jours/ })).toBeDefined()
    expect(await vue.find({ text: /20%/ })).toBeUndefined()
    if (surface === 'desktop') {
      expect((await vue.findAll({ type: 'Svg' })).length).toBe(3)
    }

    await vue.press({ key: 'details' })
    expect(await vue.find({ text: /20%/ })).toBeDefined()
    expect(await vue.find({ text: /40k\/200k/ })).toBeDefined()
    expect(await vue.find({ text: /↻ 2 h 05/ })).toBeDefined()
    expect(await vue.find({ text: /^Session$/ })).toBeDefined()
    expect(await vue.find({ text: /1\.23 \$/ })).toBeDefined()

    await vue.press({ key: 'details' })
    expect(await vue.find({ text: /20%/ })).toBeUndefined()
    expect(await vue.find({ text: /^Session$/ })).toBeUndefined()
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`un clic sur un libellé ouvre, un clic sur une valeur ferme (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.command.run({ command: 'jauge-demo', args: '' } as never)
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })

    await vue.press({ key: 'ouvrir-Limite 5 h' })
    expect(await vue.find({ text: /↻ 2 h 05/ })).toBeDefined()
    await vue.press({ key: 'valeur-Contexte' })
    expect(await vue.find({ text: /↻ 2 h 05/ })).toBeUndefined()
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`la bande s'affiche avant la première mesure (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })

    expect(await vue.find({ text: /Contexte/ })).toBeDefined()
    await vue.press({ key: 'details' })
    expect(await vue.find({ text: /—/ })).toBeDefined()
  })
}
