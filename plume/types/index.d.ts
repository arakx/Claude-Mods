// repos : le bouton attend ; travail : Claude réécrit ; fait : la version propre est dans le champ
export type Phase = 'repos' | 'travail' | 'fait'

declare module 'claude-code' {
  interface PluginState {
    plume: { phase: Phase; original: string; isHidden: boolean }
  }
}
