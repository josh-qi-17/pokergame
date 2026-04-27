import type { Card, HandCategory } from '@poker/shared';

export interface HandResult {
  category: HandCategory;
  tiebreakers: number[];
  bestFive: Card[];
  description: string;
}

const CATEGORY_RANK: Record<HandCategory, number> = {
  highCard: 1,
  pair: 2,
  twoPair: 3,
  threeOfAKind: 4,
  straight: 5,
  flush: 6,
  fullHouse: 7,
  fourOfAKind: 8,
  straightFlush: 9,
  royalFlush: 10,
};

const CATEGORY_NAMES: Record<HandCategory, string> = {
  highCard: '高牌',
  pair: '一对',
  twoPair: '两对',
  threeOfAKind: '三条',
  straight: '顺子',
  flush: '同花',
  fullHouse: '葫芦',
  fourOfAKind: '四条',
  straightFlush: '同花顺',
  royalFlush: '皇家同花顺',
};

function getCombinations(cards: Card[], k: number): Card[][] {
  if (k === 0) return [[]];
  if (cards.length < k) return [];
  const [first, ...rest] = cards;
  if (!first) return [];
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function getStraightHighCard(ranks: number[]): number | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);

  for (let i = 0; i <= unique.length - 5; i++) {
    const top = unique[i];
    if (top === undefined) continue;
    const seq = [top, top - 1, top - 2, top - 3, top - 4];
    if (seq.every(r => unique.includes(r))) {
      return top;
    }
  }

  // Wheel: A-2-3-4-5
  if (unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) {
    return 5;
  }

  return null;
}

function getStraightCards(cards: Card[]): Card[] | null {
  const sortedDesc = [...cards].sort((a, b) => b.rank - a.rank);
  const uniqueRanks = [...new Set(sortedDesc.map(c => c.rank))];

  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    const top = uniqueRanks[i];
    if (top === undefined) continue;
    const seq: number[] = [top, top - 1, top - 2, top - 3, top - 4];
    if (seq.every(r => uniqueRanks.includes(r as never))) {
      const result: Card[] = [];
      for (const r of seq) {
        const card = sortedDesc.find(c => c.rank === r);
        if (card) result.push(card);
      }
      return result;
    }
  }

  // Wheel
  const ranks = cards.map(c => c.rank);
  if ([14, 2, 3, 4, 5].every(r => ranks.includes(r as never))) {
    const result: Card[] = [];
    for (const r of [5, 4, 3, 2]) {
      const card = cards.find(c => c.rank === r);
      if (card) result.push(card);
    }
    const ace = cards.find(c => c.rank === 14);
    if (ace) result.push(ace);
    return result;
  }

  return null;
}

function catName(cat: HandCategory): string {
  return CATEGORY_NAMES[cat];
}

function evaluate5(five: Card[]): HandResult {
  const ranks = five.map(c => c.rank).sort((a, b) => b - a);
  const suits = five.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const straightHigh = getStraightHighCard(ranks);
  const isStraight = straightHigh !== null;

  const rankCount = new Map<number, number>();
  for (const r of ranks) {
    rankCount.set(r, (rankCount.get(r) ?? 0) + 1);
  }

  const groups = [...rankCount.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (isFlush && isStraight) {
    const straightCards = getStraightCards(five)!;
    if (straightHigh === 14) {
      return {
        category: 'royalFlush',
        tiebreakers: [14],
        bestFive: straightCards,
        description: catName('royalFlush'),
      };
    }
    return {
      category: 'straightFlush',
      tiebreakers: [straightHigh],
      bestFive: straightCards,
      description: `${catName('straightFlush')} (${straightHigh}高)`,
    };
  }

  const g0 = groups[0];
  const g1 = groups[1];
  const g2 = groups[2];
  const g3 = groups[3];

  if (!g0) {
    const sorted = [...five].sort((a, b) => b.rank - a.rank);
    return {
      category: 'highCard',
      tiebreakers: sorted.map(c => c.rank),
      bestFive: sorted,
      description: `${catName('highCard')} (${sorted[0]?.rank ?? 0}高)`,
    };
  }

  if (g0[1] === 4) {
    const quadRank = g0[0];
    const kicker = g1?.[0] ?? 0;
    return {
      category: 'fourOfAKind',
      tiebreakers: [quadRank, kicker],
      bestFive: [...five].sort((a, b) => {
        if (a.rank === quadRank && b.rank !== quadRank) return -1;
        if (b.rank === quadRank && a.rank !== quadRank) return 1;
        return b.rank - a.rank;
      }),
      description: `${catName('fourOfAKind')} (${quadRank}s)`,
    };
  }

  if (g0[1] === 3 && g1 && g1[1] === 2) {
    return {
      category: 'fullHouse',
      tiebreakers: [g0[0], g1[0]],
      bestFive: five,
      description: `${catName('fullHouse')} (${g0[0]}带${g1[0]})`,
    };
  }

  if (isFlush) {
    const sorted = [...five].sort((a, b) => b.rank - a.rank);
    return {
      category: 'flush',
      tiebreakers: sorted.map(c => c.rank),
      bestFive: sorted,
      description: catName('flush'),
    };
  }

  if (isStraight) {
    const straightCards = getStraightCards(five)!;
    return {
      category: 'straight',
      tiebreakers: [straightHigh],
      bestFive: straightCards,
      description: `${catName('straight')} (${straightHigh}高)`,
    };
  }

  if (g0[1] === 3) {
    const triRank = g0[0];
    const kickers = [g1?.[0] ?? 0, g2?.[0] ?? 0].sort((a, b) => b - a);
    return {
      category: 'threeOfAKind',
      tiebreakers: [triRank, ...kickers],
      bestFive: five,
      description: `${catName('threeOfAKind')} (${triRank}s)`,
    };
  }

  if (g0[1] === 2 && g1 && g1[1] === 2) {
    const highPair = Math.max(g0[0], g1[0]);
    const lowPair = Math.min(g0[0], g1[0]);
    const kicker = g2?.[0] ?? 0;
    return {
      category: 'twoPair',
      tiebreakers: [highPair, lowPair, kicker],
      bestFive: five,
      description: `${catName('twoPair')} (${highPair}和${lowPair})`,
    };
  }

  if (g0[1] === 2) {
    const pairRank = g0[0];
    const kickers = [g1?.[0] ?? 0, g2?.[0] ?? 0, g3?.[0] ?? 0].sort((a, b) => b - a);
    return {
      category: 'pair',
      tiebreakers: [pairRank, ...kickers],
      bestFive: five,
      description: `${catName('pair')} (${pairRank}s)`,
    };
  }

  const sorted = [...five].sort((a, b) => b.rank - a.rank);
  return {
    category: 'highCard',
    tiebreakers: sorted.map(c => c.rank),
    bestFive: sorted,
    description: `${catName('highCard')} (${sorted[0]?.rank ?? 0}高)`,
  };
}

export function evaluateHand(cards: Card[]): HandResult {
  if (cards.length < 5) throw new Error('Need at least 5 cards');

  const combos = cards.length === 5 ? [cards] : getCombinations(cards, 5);
  let best: HandResult | null = null;

  for (const combo of combos) {
    const result = evaluate5(combo);
    if (!best || compareHandResults(result, best) > 0) {
      best = result;
    }
  }

  return best!;
}

function compareHandResults(a: HandResult, b: HandResult): -1 | 0 | 1 {
  const rankA = CATEGORY_RANK[a.category];
  const rankB = CATEGORY_RANK[b.category];

  if (rankA !== rankB) return rankA > rankB ? 1 : -1;

  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const ta = a.tiebreakers[i] ?? 0;
    const tb = b.tiebreakers[i] ?? 0;
    if (ta !== tb) return ta > tb ? 1 : -1;
  }

  return 0;
}

export function compareHands(a: HandResult, b: HandResult): -1 | 0 | 1 {
  return compareHandResults(a, b);
}
