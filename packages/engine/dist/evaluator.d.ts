import type { Card, HandCategory } from '@poker/shared';
export interface HandResult {
    category: HandCategory;
    tiebreakers: number[];
    bestFive: Card[];
    description: string;
}
export declare function evaluateHand(cards: Card[]): HandResult;
export declare function compareHands(a: HandResult, b: HandResult): -1 | 0 | 1;
//# sourceMappingURL=evaluator.d.ts.map