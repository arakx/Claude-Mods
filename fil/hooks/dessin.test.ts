import { expect, mock, test } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: true,
  maxRows: 6,
  bodyColumns: 140,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`une tâche avance de la demande au ✓ (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.complete', () => ({ text: '' }))
    // Sous le Fil, la bande vide que dessinerait le moteur (ou La Jauge)
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.prompt.submit({ text: 'Fais-moi un plan en 5 étapes pour analyser le dossier' } as never)
    const vue = await $.ui.mount({ plugin: 'fil', surface, component: 'AbovePrompt', props: PROPS })
    expect(await vue.find({ text: /Fais-moi un plan/ })).toBeDefined()

    await $.tool.call({ tool: 'mcp__fil__progression', total: 5, actuelle: 'Liste les fichiers' } as never)
    expect(await vue.find({ text: /1\/5 · Liste les fichiers/ })).toBeDefined()

    await $.tool.call({ tool: 'mcp__fil__progression', faites: 2, actuelle: 'Lit le code' } as never)
    expect(await vue.find({ text: /40%/ })).toBeDefined()

    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never)
    expect(await vue.find({ text: /100%/ })).toBeDefined()
    expect(await vue.find({ key: 'fermer-' })).toBeDefined()

    await vue.press({ key: 'fermer-' })
    expect(await vue.find({ text: /Fais-moi un plan/ })).toBeUndefined()
  })
}
