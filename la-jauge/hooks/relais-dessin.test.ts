import { expect, mock, test } from 'claude-code/testing'

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 140,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`le lien du relais suit le seuil de 60 % (${surface})`, async ($, on) => {
    const horloge = mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.command.run({ command: 'jauge-demo', args: '' })
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })
    // Démo : contexte à 20 %, puis 35 %, puis 45 %, puis 60 %
    expect(await vue.find({ text: /Passer le relais/ })).toBeUndefined()
    await horloge.advance(3000)
    expect(await vue.find({ text: /Passer le relais/ })).toBeUndefined()
    await horloge.advance(3000)
    expect(await vue.find({ text: /Passer le relais/ })).toBeUndefined()
    await horloge.advance(3000)
    expect(await vue.find({ text: /Passer le relais/ })).toBeDefined()
  })

  test(`le relais vide la conversation et prépare la reprise (${surface})`, async ($, on) => {
    const horloge = mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    const envoyes: string[] = []
    const remplis: string[] = []
    let vide = false
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    on('session.root', () => ({ value: 'C:/projet' }))
    on('session.id', () => ({ value: 'session-1' }))
    on('prompt.submit', ($, e) => (envoyes.push(e.text), { text: e.text }))
    on('turn.complete', () => ({ text: '' }))
    on('fs.exists', () => ({ value: true }))
    on('command.run', { command: 'clear' }, () => ((vide = true), { text: '' }))
    on('prompt.fill', ($, e) => (remplis.push(e.text), { isFilled: true }))

    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })
    await $.command.run({ command: 'relais', args: '' })
    await horloge.advance(100)
    expect(envoyes[0]).toContain('`C:/projet/relais.md`')
    expect(await vue.find({ text: /Passation en cours/ })).toBeDefined()

    await $.turn.complete({ reason: 'answer', answer: 'Passation prête.', durationMs: 1, isAborted: false, turnId: 't' } as never)
    await horloge.advance(500)
    expect(vide).toBe(true)
    expect(remplis[0]).toContain("Lis d'abord la passation : C:/projet/relais.md.")
    expect(await vue.find({ text: /Entrée ↵/ })).toBeDefined()

    await vue.press({ key: 'relais-ok' })
    expect(await vue.find({ text: /Entrée ↵/ })).toBeUndefined()
  })
}
