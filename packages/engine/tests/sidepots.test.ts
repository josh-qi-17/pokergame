import { describe, expect, it } from 'vitest';
import { calculateSidePots } from '../src/sidepots.js';

describe('calculateSidePots', () => {
  it('无边池：2人相等投入', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 100, folded: false },
      { playerId: 'B', contributed: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(200);
    expect(pots[0]!.eligiblePlayerIds).toContain('A');
    expect(pots[0]!.eligiblePlayerIds).toContain('B');
  });

  it('A全压100，B全压300，C跟注300 -> 主池300（三人），边池400（BC）', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 100, folded: false },
      { playerId: 'B', contributed: 300, folded: false },
      { playerId: 'C', contributed: 300, folded: false },
    ]);
    expect(pots).toHaveLength(2);

    const mainPot = pots.find(p => p.eligiblePlayerIds.length === 3);
    expect(mainPot).toBeDefined();
    expect(mainPot!.amount).toBe(300);

    const sidePot = pots.find(p => p.eligiblePlayerIds.length === 2);
    expect(sidePot).toBeDefined();
    expect(sidePot!.amount).toBe(400);
    expect(sidePot!.eligiblePlayerIds).toContain('B');
    expect(sidePot!.eligiblePlayerIds).toContain('C');
  });

  it('有玩家弃牌', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 200, folded: true },
      { playerId: 'B', contributed: 200, folded: false },
      { playerId: 'C', contributed: 200, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(600);
    expect(pots[0]!.eligiblePlayerIds).not.toContain('A');
  });

  it('三人不同全压金额', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 50, folded: false },
      { playerId: 'B', contributed: 150, folded: false },
      { playerId: 'C', contributed: 300, folded: false },
    ]);
    expect(pots).toHaveLength(3);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(500);
  });

  it('空输入返回空数组', () => {
    expect(calculateSidePots([])).toHaveLength(0);
  });

  it('单人返回单个锅', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 100, folded: false },
    ]);
    expect(pots).toHaveLength(1);
    expect(pots[0]!.amount).toBe(100);
  });

  it('全员弃牌：底池仍然计算', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 100, folded: true },
      { playerId: 'B', contributed: 100, folded: true },
    ]);
    expect(pots[0]!.amount).toBe(200);
  });

  it('多玩家部分all-in', () => {
    const pots = calculateSidePots([
      { playerId: 'A', contributed: 100, folded: false },
      { playerId: 'B', contributed: 100, folded: false },
      { playerId: 'C', contributed: 50, folded: false },
      { playerId: 'D', contributed: 100, folded: false },
    ]);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    expect(total).toBe(350);
  });

  it('总底池金额正确', () => {
    const contributions = [
      { playerId: 'A', contributed: 200, folded: false },
      { playerId: 'B', contributed: 100, folded: false },
      { playerId: 'C', contributed: 300, folded: true },
    ];
    const pots = calculateSidePots(contributions);
    const total = pots.reduce((s, p) => s + p.amount, 0);
    const expected = contributions.reduce((s, p) => s + p.contributed, 0);
    expect(total).toBe(expected);
  });
});
