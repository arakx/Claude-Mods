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
  // Fermée avec ✕ : plus affichée dans aucun chat
  masquee?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    fil: { taches: Tache[]; now: number; isHidden: boolean }
  }
}
