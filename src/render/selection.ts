// what the player has clicked: an empty build pad or a turret
export type Selection = { kind: "pad"; index: number } | { kind: "tower"; id: number } | { kind: "base"; index: number } | null;
