import { describe, expect, it } from 'vitest';
import { createDeck, shuffle } from '../src/deck.js';
import { applyAction, createHandState, legalActions } from '../src/handState.js';

function createTestState(chipAmounts: number[] = [1000, 1000], smallBlind = 10, bigBlind = 20) {
  const players = chipAmounts.map((chips, i) => ({
    playerId: `P${i + 1}`,
    seatIndex: i,
    chips,
  }));

  const deck = shuffle(createDeck(), Math.random.bind(Math));

  return createHandState(
    1,
    players,
    deck,
    0,
    smallBlind,
    bigBlind,
    Date.now(),
  );
}

describe('createHandState', () => {
  it('初始化正确：盲注已下', () => {
    const state = createTestState();
    const sb = state.players.find(p => p.seatIndex === state.sbSeat % state.players.length);
    const bb = state.players.find(p => p.seatIndex === state.bbSeat % state.players.length);
    expect(sb?.currentStreetBet).toBe(10);
    expect(bb?.currentStreetBet).toBe(20);
  });

  it('每人有2张底牌', () => {
    const state = createTestState();
    for (const p of state.players) {
      expect(p.holeCards).toHaveLength(2);
    }
  });

  it('初始街为preflop', () => {
    const state = createTestState();
    expect(state.street).toBe('preflop');
  });

  it('最小加注为大盲值', () => {
    const state = createTestState();
    expect(state.minRaise).toBe(20);
  });
});

describe('legalActions', () => {
  it('大盲之后第一个行动者可以fold/call/raise/allin', () => {
    const state = createTestState([1000, 1000]);
    const current = state.players[state.currentPlayerIndex]!;
    const actions = legalActions(state, current.playerId);
    const types = actions.map(a => a.type);
    expect(types).toContain('fold');
    expect(types).toContain('call');
    expect(types).toContain('raise');
  });

  it('非当前玩家无合法行动', () => {
    const state = createTestState();
    const notCurrent = state.players[(state.currentPlayerIndex + 1) % state.players.length]!;
    const actions = legalActions(state, notCurrent.playerId);
    expect(actions).toHaveLength(0);
  });

  it('当没有下注时可以check', () => {
    const state = createTestState([1000, 1000]);
    let s = state;
    const p1 = s.players[s.currentPlayerIndex]!;
    s = applyAction(s, p1.playerId, { type: 'call' });
    // After call, we might be in next street or BB can check
    const current = s.players[s.currentPlayerIndex]!;
    const actions = legalActions(s, current.playerId);
    const types = actions.map(a => a.type);
    expect(types).toContain('check');
  });
});

describe('applyAction - fold', () => {
  it('弃牌后玩家状态变为folded', () => {
    const state = createTestState();
    const current = state.players[state.currentPlayerIndex]!;
    const newState = applyAction(state, current.playerId, { type: 'fold' });
    const player = newState.players.find(p => p.playerId === current.playerId)!;
    expect(player.status).toBe('folded');
  });

  it('只剩1人时手牌结束', () => {
    const state = createTestState([1000, 1000]);
    const current = state.players[state.currentPlayerIndex]!;
    const newState = applyAction(state, current.playerId, { type: 'fold' });
    expect(newState.isFinished).toBe(true);
  });
});

describe('applyAction - raise', () => {
  it('加注少于最小加注应抛出错误', () => {
    const state = createTestState([1000, 1000]);
    const current = state.players[state.currentPlayerIndex]!;
    expect(() => applyAction(state, current.playerId, { type: 'raise', amount: 1 }))
      .toThrow();
  });

  it('有效加注减少筹码并更新下注', () => {
    const state = createTestState([1000, 1000]);
    const current = state.players[state.currentPlayerIndex]!;
    const chipsBeforeRaise = current.chips;
    const raiseAmount = 40;
    const newState = applyAction(state, current.playerId, { type: 'raise', amount: raiseAmount });
    const player = newState.players.find(p => p.playerId === current.playerId)!;
    expect(player.chips).toBe(chipsBeforeRaise - raiseAmount);
  });
});

describe('applyAction - allin', () => {
  it('all-in后玩家状态变为allin', () => {
    const state = createTestState([100, 1000]);
    const current = state.players[state.currentPlayerIndex]!;
    const newState = applyAction(state, current.playerId, { type: 'allin' });
    const player = newState.players.find(p => p.playerId === current.playerId)!;
    expect(player.status).toBe('allin');
    expect(player.chips).toBe(0);
  });
});

describe('街推进', () => {
  it('2人完整走完preflop进入flop', () => {
    let state = createTestState([1000, 1000]);
    const p1 = state.players[state.currentPlayerIndex]!;
    state = applyAction(state, p1.playerId, { type: 'call' });
    const p2 = state.players[state.currentPlayerIndex]!;
    state = applyAction(state, p2.playerId, { type: 'check' });
    expect(state.street).toBe('flop');
    expect(state.board).toHaveLength(3);
  });

  it('全员all-in后自动发完公共牌直到摊牌', () => {
    let state = createTestState([100, 100]);
    const p1 = state.players[state.currentPlayerIndex]!;
    state = applyAction(state, p1.playerId, { type: 'allin' });
    if (!state.isFinished) {
      const p2 = state.players[state.currentPlayerIndex]!;
      state = applyAction(state, p2.playerId, { type: 'allin' });
    }
    expect(state.isFinished).toBe(true);
    expect(state.board.length).toBeGreaterThanOrEqual(3);
  });
});

describe('3人游戏', () => {
  it('3人可以正常初始化', () => {
    const state = createTestState([1000, 1000, 1000]);
    expect(state.players).toHaveLength(3);
    expect(state.isFinished).toBe(false);
  });
});
