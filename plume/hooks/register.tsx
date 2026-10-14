import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Phase } from '../types'

// ── Plume : un bouton au-dessus du champ qui remet la demande au propre avant l'envoi ──

export const VIOLET = '#AF52DE'
export const VERT = '#34C759'
export const MODELE = 'sonnet'

const phase = atom({ plugin: 'plume', key: 'phase' } as const, 'repos' as Phase)
const original = atom({ plugin: 'plume', key: 'original' } as const, '')
const isHidden = atom({ plugin: 'plume', key: 'isHidden' } as const, false)

export const CONSIGNE = [
  "Tu remets au propre une demande qu'une personne s'apprête à envoyer à Claude Code, un assistant qui travaille dans son projet.",
  'La demande a souvent été dictée à l\'oral ou tapée vite : idées dans le désordre, répétitions, hésitations, consignes de fin glissées au début.',
  '',
  'Réécris-la pour qu\'elle soit claire et facile à suivre :',
  '- garde exactement ce que la personne veut : n\'invente aucun objectif, aucun fichier, aucune contrainte ;',
  '- remets les idées dans un ordre logique : le contexte, puis ce qu\'il faut faire, étape par étape si besoin, puis le résultat attendu ;',
  '- retire les répétitions et les hésitations, garde chaque détail utile (noms, chiffres, chemins, exemples) ;',
  '- ajoute au besoin une ou deux consignes de bon sens qui aident Claude à bien faire (s\'appuyer sur ce qu\'il trouve, expliquer son raisonnement, demander s\'il manque une information) ;',
  '- garde la langue de la personne et son tutoiement ou vouvoiement ;',
  '- reste concis : pas plus long que nécessaire.',
  '',
  'Réponds uniquement avec la demande réécrite, sans titre, sans guillemets, sans commentaire avant ou après.',
].join('\n')

export const demande = (brouillon: string) =>
  `Voici la demande à remettre au propre :\n\n<demande>\n${brouillon}\n</demande>`

// Retire d'éventuels guillemets ou balises que le modèle aurait laissés autour
export const nettoyer = (texte: string) =>
  texte
    .trim()
    .replace(/^<demande>\s*/, '')
    .replace(/\s*<\/demande>$/, '')
    .replace(/^```[a-z]*\n([\s\S]*)\n```$/, '$1')
    .trim()

let arret: AbortController | undefined

const ameliorer = async ($: EngineInterface) => {
  if ((await read($, phase)) === 'travail') {
    return
  }
  const { text } = await $.prompt.read()
  const brouillon = text.trim()
  if (!brouillon) {
    $.ui.toast("Écris ou dicte d'abord ta demande dans le champ")

    return
  }
  await update($, original, () => text)
  await update($, phase, () => 'travail')
  arret = new AbortController()
  const r = await $.model.complete(
    { model: MODELE, system: CONSIGNE, prompt: demande(brouillon), maxTokens: 4096, timeoutMs: 90000 },
    { signal: arret.signal },
  )
  if ((await read($, phase)) !== 'travail') {
    return // annulé entre-temps
  }
  const propre = r.isAnswered ? nettoyer(r.text) : ''
  if (!propre) {
    $.ui.toast(r.isAnswered || r.reason !== 'aborted' ? "Plume n'a pas pu améliorer le prompt" : 'Plume : trop long, réessaie')
    await update($, phase, () => 'repos')

    return
  }
  await $.prompt.fill({ text: propre, mode: 'replace' })
  await update($, phase, () => 'fait')
}

const annuler = async ($: EngineInterface) => {
  arret?.abort()
  await update($, phase, () => 'repos')
}

const revenir = async ($: EngineInterface) => {
  await $.prompt.fill({ text: await read($, original), mode: 'replace' })
  await update($, phase, () => 'repos')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'plume', description: 'Afficher ou masquer le bouton « Améliorer le prompt »' })

    return next(e)
  })

  on('command.run', { command: 'plume' }, async $ => {
    const cache = !(await read($, isHidden))
    await update($, isHidden, () => cache)

    return { text: cache ? 'Plume masquée. /plume pour la réafficher.' : 'Plume affichée.' }
  })

  // Une fois la demande envoyée, le bouton revient à son état de départ
  on('prompt.submit', async ($, e, next) => {
    if ((await read($, phase)) === 'fait') {
      await update($, phase, () => 'repos')
    }

    return next(e)
  })

  // Plume se place sous ce que dessinent les autres mods (La Jauge…)
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const dessous = await next(e)
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return dessous
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const ph = await read($, phase)

    const ligne =
      ph === 'travail' ? (
        <Box flexDirection="row">
          <Text color={VIOLET}>✎ </Text>
          <Text dimColor>Mise au propre… </Text>
          <Button key="plume-annuler" plain dimColor label="Annuler" onPress={() => annuler($)} />
        </Box>
      ) : ph === 'fait' ? (
        <Box flexDirection="row">
          <Text color={VERT}>✓ </Text>
          <Text dimColor>Prompt amélioré · </Text>
          <Button key="plume-revenir" plain dimColor label="↶ Revenir à l'original" onPress={() => revenir($)} />
        </Box>
      ) : (
        <Box flexDirection="row">
          <Button key="plume" plain onPress={() => ameliorer($)}>
            <Text color={VIOLET}>✎ </Text>
            <Text dimColor>Améliorer le prompt</Text>
          </Button>
        </Box>
      )

    return (
      <Box flexDirection="column">
        {dessous}
        {ligne}
      </Box>
    )
  })
}
