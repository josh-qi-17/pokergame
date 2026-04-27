export interface PlayerContribution {
    playerId: string;
    contributed: number;
    folded: boolean;
}
export interface Pot {
    amount: number;
    eligiblePlayerIds: string[];
}
export declare function calculateSidePots(contributions: PlayerContribution[]): Pot[];
//# sourceMappingURL=sidepots.d.ts.map