import { describe, expect, it } from 'vitest';
import { createDeck, cryptoRng, shuffle } from '../src/deck.js';

describe('createDeck', () => {
  it('生成52张牌', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
  });

  it('四种花色各13张', () => {
    const deck = createDeck();
    for (const suit of ['s', 'h', 'd', 'c']) {
      const count = deck.filter(c => c.suit === suit).length;
      expect(count).toBe(13);
    }
  });

  it('无重复牌', () => {
    const deck = createDeck();
    const unique = new Set(deck.map(c => `${c.rank}${c.suit}`));
    expect(unique.size).toBe(52);
  });

  it('包含所有点数2-14', () => {
    const deck = createDeck();
    for (let r = 2; r <= 14; r++) {
      const count = deck.filter(c => c.rank === r).length;
      expect(count).toBe(4);
    }
  });
});

describe('cryptoRng', () => {
  it('返回0到1之间的浮点数', () => {
    const rng = cryptoRng();
    for (let i = 0; i < 10; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('使用cryptoRng可以成功洗牌', () => {
    const deck = createDeck();
    const rng = cryptoRng();
    const shuffled = shuffle(deck, rng);
    expect(shuffled).toHaveLength(52);
  });
});

describe('shuffle', () => {
  it('洗牌后仍然是52张', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, Math.random.bind(Math));
    expect(shuffled).toHaveLength(52);
  });

  it('洗牌不改变原始牌组', () => {
    const deck = createDeck();
    const original = [...deck];
    shuffle(deck, Math.random.bind(Math));
    expect(deck).toEqual(original);
  });

  it('使用相同rng种子产生相同结果（可重现）', () => {
    const deck = createDeck();
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };
    const shuffled1 = shuffle([...deck], rng);

    seed = 42;
    const shuffled2 = shuffle([...deck], rng);
    expect(shuffled1).toEqual(shuffled2);
  });
});
