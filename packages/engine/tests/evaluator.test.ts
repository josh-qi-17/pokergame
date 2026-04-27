import { describe, expect, it } from 'vitest';
import { compareHands, evaluateHand } from '../src/evaluator.js';
import type { Card } from '@poker/shared';

function c(rank: number, suit: string): Card {
  return { rank: rank as Card['rank'], suit: suit as Card['suit'] };
}

describe('evaluateHand', () => {
  it('皇家同花顺', () => {
    const cards = [c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('royalFlush');
  });

  it('同花顺', () => {
    const cards = [c(9, 's'), c(8, 's'), c(7, 's'), c(6, 's'), c(5, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('straightFlush');
    expect(result.tiebreakers[0]).toBe(9);
  });

  it('轮子同花顺 A-2-3-4-5', () => {
    const cards = [c(14, 's'), c(2, 's'), c(3, 's'), c(4, 's'), c(5, 's'), c(7, 'h'), c(9, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('straightFlush');
    expect(result.tiebreakers[0]).toBe(5);
  });

  it('四条', () => {
    const cards = [c(8, 's'), c(8, 'h'), c(8, 'd'), c(8, 'c'), c(5, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('fourOfAKind');
    expect(result.tiebreakers[0]).toBe(8);
  });

  it('葫芦', () => {
    const cards = [c(7, 's'), c(7, 'h'), c(7, 'd'), c(4, 'c'), c(4, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('fullHouse');
    expect(result.tiebreakers[0]).toBe(7);
    expect(result.tiebreakers[1]).toBe(4);
  });

  it('同花', () => {
    const cards = [c(14, 'h'), c(10, 'h'), c(8, 'h'), c(6, 'h'), c(3, 'h'), c(2, 's'), c(5, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('flush');
  });

  it('顺子', () => {
    const cards = [c(9, 's'), c(8, 'h'), c(7, 'd'), c(6, 'c'), c(5, 's'), c(2, 'h'), c(14, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('straight');
    expect(result.tiebreakers[0]).toBe(9);
  });

  it('轮子顺子 A-2-3-4-5', () => {
    const cards = [c(14, 's'), c(2, 'h'), c(3, 'd'), c(4, 'c'), c(5, 's'), c(9, 'h'), c(10, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('straight');
    expect(result.tiebreakers[0]).toBe(5);
  });

  it('三条', () => {
    const cards = [c(6, 's'), c(6, 'h'), c(6, 'd'), c(10, 'c'), c(4, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('threeOfAKind');
    expect(result.tiebreakers[0]).toBe(6);
  });

  it('两对', () => {
    const cards = [c(9, 's'), c(9, 'h'), c(5, 'd'), c(5, 'c'), c(14, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('twoPair');
    expect(result.tiebreakers[0]).toBe(9);
    expect(result.tiebreakers[1]).toBe(5);
    expect(result.tiebreakers[2]).toBe(14);
  });

  it('一对', () => {
    const cards = [c(4, 's'), c(4, 'h'), c(10, 'd'), c(8, 'c'), c(6, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('pair');
    expect(result.tiebreakers[0]).toBe(4);
  });

  it('高牌', () => {
    const cards = [c(14, 's'), c(10, 'h'), c(8, 'd'), c(6, 'c'), c(4, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('highCard');
    expect(result.tiebreakers[0]).toBe(14);
  });

  it('5张牌评估', () => {
    const cards = [c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's')];
    const result = evaluateHand(cards);
    expect(result.category).toBe('royalFlush');
  });

  it('bestFive包含5张牌', () => {
    const cards = [c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's'), c(2, 'h'), c(3, 'd')];
    const result = evaluateHand(cards);
    expect(result.bestFive).toHaveLength(5);
  });
});

describe('compareHands', () => {
  it('同花顺 > 普通顺子', () => {
    const straightFlush = evaluateHand([c(9, 's'), c(8, 's'), c(7, 's'), c(6, 's'), c(5, 's')]);
    const straight = evaluateHand([c(9, 'h'), c(8, 's'), c(7, 'd'), c(6, 'c'), c(5, 'h')]);
    expect(compareHands(straightFlush, straight)).toBe(1);
  });

  it('四条 > 葫芦', () => {
    const four = evaluateHand([c(8, 's'), c(8, 'h'), c(8, 'd'), c(8, 'c'), c(5, 's')]);
    const full = evaluateHand([c(7, 's'), c(7, 'h'), c(7, 'd'), c(4, 'c'), c(4, 's')]);
    expect(compareHands(four, full)).toBe(1);
  });

  it('踢脚比较：一对相同时比踢脚', () => {
    const pairAce = evaluateHand([c(4, 's'), c(4, 'h'), c(14, 'd'), c(8, 'c'), c(6, 's')]);
    const pairKing = evaluateHand([c(4, 's'), c(4, 'h'), c(13, 'd'), c(8, 'c'), c(6, 's')]);
    expect(compareHands(pairAce, pairKing)).toBe(1);
  });

  it('两对踢脚比较', () => {
    const twoPairA = evaluateHand([c(9, 's'), c(9, 'h'), c(5, 'd'), c(5, 'c'), c(14, 's')]);
    const twoPairB = evaluateHand([c(9, 's'), c(9, 'h'), c(5, 'd'), c(5, 'c'), c(13, 's')]);
    expect(compareHands(twoPairA, twoPairB)).toBe(1);
  });

  it('完全相同的牌型返回0', () => {
    const a = evaluateHand([c(14, 's'), c(13, 'h'), c(12, 'd'), c(11, 'c'), c(10, 's')]);
    const b = evaluateHand([c(14, 'h'), c(13, 'd'), c(12, 'c'), c(11, 's'), c(10, 'h')]);
    expect(compareHands(a, b)).toBe(0);
  });

  it('轮子顺子 < 普通顺子2-6', () => {
    const wheel = evaluateHand([c(14, 's'), c(2, 'h'), c(3, 'd'), c(4, 'c'), c(5, 's')]);
    const low = evaluateHand([c(2, 's'), c(3, 'h'), c(4, 'd'), c(5, 'c'), c(6, 's')]);
    expect(compareHands(wheel, low)).toBe(-1);
  });

  it('皇家同花顺 > 同花顺', () => {
    const royal = evaluateHand([c(14, 's'), c(13, 's'), c(12, 's'), c(11, 's'), c(10, 's')]);
    const sf = evaluateHand([c(9, 's'), c(8, 's'), c(7, 's'), c(6, 's'), c(5, 's')]);
    expect(compareHands(royal, sf)).toBe(1);
  });

  it('三条踢脚比较', () => {
    const triA = evaluateHand([c(6, 's'), c(6, 'h'), c(6, 'd'), c(14, 'c'), c(2, 's')]);
    const triB = evaluateHand([c(6, 's'), c(6, 'h'), c(6, 'd'), c(13, 'c'), c(2, 's')]);
    expect(compareHands(triA, triB)).toBe(1);
  });
});
