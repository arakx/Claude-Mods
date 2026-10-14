export type Limite = { kind: string; percentUsed: number; resetsAt?: string }

export type Mesure = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limites: Limite[]
  costUsd?: number
}

// Relais — repos : rien en cours ; redaction : Claude écrit la passation ; pret : conversation vidée, reprise dans le champ
export type Phase = 'repos' | 'redaction' | 'pret'

// Fil — une tâche par chat, partagée entre les chats par un fichier dans ~/.claude/fil
export type Etat = 'en_cours' | 'termine' | 'interrompu' | 'erreur'

export type Tache = {
  session: string
  titre: string
  debut: number
  fin?: number
  // Dernier signe de vie de la session, pour repérer un chat fermé en pleine tâche
  vu: number
  etat: Etat
  total?: number
  faites?: number
  actuelle?: string
  actions: number
  // Dernières actions et étapes cochées, affichées sous la barre une fois dépliée
  historique?: string[]
  // Fermée avec ✕ : plus affichée dans aucun chat
  masquee?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'la-jauge': {
      mesure: Mesure | null
      now: number
      isHidden: boolean
      isFilHidden: boolean
      isOpen: boolean
      demo: number | null
      phase: Phase
      fichier: string
      taches: Tache[]
    }
  }
}
