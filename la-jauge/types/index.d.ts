export type Limite = { kind: string; percentUsed: number; resetsAt?: string }

export type Mesure = {
  contextPercent?: number
  contextTokens?: number
  contextWindow: number
  limites: Limite[]
  costUsd?: number
}

declare module 'claude-code' {
  interface PluginState {
    'la-jauge': { mesure: Mesure | null; now: number; isHidden: boolean; demo: number | null }
  }
}
