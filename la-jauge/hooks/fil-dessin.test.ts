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
  test(`une tâche avance de la demande à 100 %, ses actions sous la barre (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.prompt.submit({ text: 'Fais-moi un plan en 5 étapes pour analyser le dossier tools' } as never)
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })
    // Le titre est coupé pour tenir dans sa case
    expect(await vue.find({ text: /^Fais-moi un plan.*…$/ })).toBeDefined()

    await $.tool.call({ tool: 'mcp__la-jauge__progression', total: 5, actuelle: 'Liste les fichiers' } as never)
    await $.tool.call({ tool: 'mcp__la-jauge__progression', faites: 2, actuelle: 'Lit le code' } as never)
    expect(await vue.find({ text: /40%/ })).toBeDefined()
    // Repliée : pas d'actions ; dépliée : l'étape en cours et les étapes cochées sous la barre
    expect(await vue.find({ text: /3\/5 · Lit le code/ })).toBeUndefined()
    await vue.press({ key: 'ouvrir-Contexte' })
    expect(await vue.find({ text: /3\/5 · Lit le code.*✓ Liste les fichiers/ })).toBeDefined()

    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never)
    expect(await vue.find({ text: /100%/ })).toBeDefined()
    expect(await vue.find({ key: 'fermer-' })).toBeDefined()

    await vue.press({ key: 'fermer-' })
    expect(await vue.find({ text: /Fais-moi un plan/ })).toBeUndefined()
    // La ligne des jauges reste
    expect(await vue.find({ text: /Contexte/ })).toBeDefined()
  })

  test(`les sous-agents s'affichent sous la tâche, qui attend leur retour (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('tool.call', () => ({ result: 'ok' }))
    let n = 0
    on('agent.spawn', () => ({ model: 'haiku', agentId: `agent-${++n}` }) as never)
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.prompt.submit({ text: 'Analyse le code mort' } as never)
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })
    await $.tool.call({ tool: 'mcp__la-jauge__progression', total: 5, faites: 1, actuelle: 'Explore' } as never)
    const lancer = (description: string) =>
      $.agent.spawn({ prompt: description, description, subagentType: 'Explore', background: true } as never)
    await lancer('Cherche les fonctions inutilisées')
    await lancer('Cherche les fichiers orphelins')
    expect(await vue.find({ text: /Cherche les fonctions/ })).toBeDefined()
    expect(await vue.find({ text: /Cherche les fichiers/ })).toBeDefined()

    // L'action d'un agent s'affiche sur sa ligne
    await $.tool.call({ tool: 'Grep', pattern: 'x', agentId: 'agent-1' } as never)
    expect(await vue.find({ text: /Cherche dans les fichiers/ })).toBeDefined()

    const fin = (agentId?: string) =>
      $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't', agentId } as never)

    // Un agent finit (sa ligne part), puis Claude rend la main en attendant l'autre : pas terminé
    await fin('agent-1')
    expect(await vue.find({ text: /Cherche les fonctions/ })).toBeUndefined()
    await fin()
    expect(await vue.find({ text: /20%/ })).toBeDefined()
    expect(await vue.find({ text: /100%/ })).toBeUndefined()

    // Le second revient, Claude reprend et conclut : terminé
    await fin('agent-2')
    expect(await vue.find({ text: /Cherche les fichiers/ })).toBeUndefined()
    await $.turn.start({ text: '', turnId: 't2' } as never)
    await fin()
    expect(await vue.find({ text: /100%/ })).toBeDefined()
  })

  test(`une tâche close reprend quand Claude repart sans nouveau message (${surface})`, async ($, on) => {
    mock.clock(on, { now: Date.parse('2026-10-14T10:00:00Z') })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    on('turn.start', ($, e) => ({ turnId: e.turnId }))
    on('turn.complete', () => ({ text: '' }))
    on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
    await $.prompt.submit({ text: 'Analyse le code mort' } as never)
    const vue = await $.ui.mount({ plugin: 'la-jauge', surface, component: 'AbovePrompt', props: PROPS })
    await $.turn.complete({ reason: 'answer', answer: 'ok', durationMs: 1, isAborted: false, turnId: 't' } as never)
    expect(await vue.find({ text: /100%/ })).toBeDefined()
    await $.turn.start({ text: '', turnId: 't2' } as never)
    expect(await vue.find({ text: /100%/ })).toBeUndefined()
  })
}
