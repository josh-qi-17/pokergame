import { calculateSidePots } from './sidepots.js';
const STREET_ORDER = ['preflop', 'flop', 'turn', 'river', 'showdown'];
function nextStreet(s) {
    const idx = STREET_ORDER.indexOf(s);
    return STREET_ORDER[idx + 1] ?? 'showdown';
}
function activeNonAllIn(state) {
    return state.players.filter(p => p.status === 'active');
}
function getMaxBet(state) {
    return Math.max(...state.players.map(p => p.currentStreetBet));
}
export function legalActions(state, playerId) {
    if (state.isFinished)
        return [];
    const player = state.players[state.currentPlayerIndex];
    if (!player || player.playerId !== playerId)
        return [];
    if (player.status !== 'active')
        return [];
    const maxBet = getMaxBet(state);
    const toCall = maxBet - player.currentStreetBet;
    const actions = [];
    actions.push({ type: 'fold' });
    if (toCall === 0) {
        actions.push({ type: 'check' });
    }
    else if (toCall >= player.chips) {
        actions.push({ type: 'allin', minAmount: player.chips, maxAmount: player.chips });
    }
    else {
        actions.push({ type: 'call', minAmount: toCall, maxAmount: toCall });
    }
    const minRaiseTotal = maxBet + state.minRaise;
    const minRaiseAdditional = minRaiseTotal - player.currentStreetBet;
    if (player.chips > toCall) {
        if (minRaiseAdditional < player.chips) {
            actions.push({
                type: 'raise',
                minAmount: minRaiseAdditional,
                maxAmount: player.chips,
            });
        }
        actions.push({ type: 'allin', minAmount: player.chips, maxAmount: player.chips });
    }
    return actions;
}
export function applyAction(state, playerId, action) {
    const playerIdx = state.players.findIndex(p => p.playerId === playerId);
    if (playerIdx === -1)
        throw new Error('Player not found');
    if (playerIdx !== state.currentPlayerIndex)
        throw new Error('Not your turn');
    const player = state.players[playerIdx];
    const newPlayers = state.players.map(p => ({ ...p }));
    const newPlayer = newPlayers[playerIdx];
    const maxBet = getMaxBet(state);
    const toCall = maxBet - player.currentStreetBet;
    const newActions = [...state.actions];
    switch (action.type) {
        case 'fold': {
            newPlayer.status = 'folded';
            newActions.push({ playerId, type: 'fold', street: state.street });
            return advanceTurn({
                ...state,
                players: newPlayers,
                actions: newActions,
                // fold/call/check 不改变 lastRaiserActedVoluntarily
            });
        }
        case 'check': {
            if (toCall !== 0)
                throw new Error('Cannot check when there is a bet');
            newActions.push({ playerId, type: 'check', street: state.street });
            return advanceTurn({
                ...state,
                players: newPlayers,
                actions: newActions,
            });
        }
        case 'call': {
            const callAmount = Math.min(toCall, newPlayer.chips);
            newPlayer.chips -= callAmount;
            newPlayer.currentStreetBet += callAmount;
            newPlayer.totalContributed += callAmount;
            if (newPlayer.chips === 0)
                newPlayer.status = 'allin';
            newActions.push({ playerId, type: 'call', amount: callAmount, street: state.street });
            return advanceTurn({
                ...state,
                players: newPlayers,
                actions: newActions,
            });
        }
        case 'raise': {
            if (action.amount === undefined)
                throw new Error('Raise amount required');
            const raiseTotal = action.amount;
            const newTotalBet = player.currentStreetBet + raiseTotal;
            const raiseIncrement = newTotalBet - maxBet;
            if (raiseIncrement < state.minRaise)
                throw new Error(`Raise too small, min raise increment: ${state.minRaise}`);
            newPlayer.chips -= raiseTotal;
            newPlayer.currentStreetBet += raiseTotal;
            newPlayer.totalContributed += raiseTotal;
            if (newPlayer.chips === 0)
                newPlayer.status = 'allin';
            newActions.push({ playerId, type: 'raise', amount: raiseTotal, street: state.street });
            // 主动加注：更新 lastRaiser，标记已主动行动
            return advanceTurn({
                ...state,
                players: newPlayers,
                lastRaiserIndex: playerIdx,
                lastRaiseAmount: raiseIncrement,
                minRaise: raiseIncrement,
                lastRaiserActedVoluntarily: true,
                actions: newActions,
            });
        }
        case 'allin': {
            const allInAmount = newPlayer.chips;
            newPlayer.chips = 0;
            newPlayer.currentStreetBet += allInAmount;
            newPlayer.totalContributed += allInAmount;
            newPlayer.status = 'allin';
            const newTotalBet = player.currentStreetBet + allInAmount;
            newActions.push({ playerId, type: 'allin', amount: allInAmount, street: state.street });
            if (newTotalBet > maxBet) {
                const raiseIncrement = newTotalBet - maxBet;
                if (raiseIncrement >= state.minRaise) {
                    // 有效加注型全下：行动轮重置
                    return advanceTurn({
                        ...state,
                        players: newPlayers,
                        lastRaiserIndex: playerIdx,
                        lastRaiseAmount: raiseIncrement,
                        minRaise: raiseIncrement,
                        lastRaiserActedVoluntarily: true,
                        actions: newActions,
                    });
                }
            }
            // 跟注型全下：不更新 lastRaiser
            return advanceTurn({
                ...state,
                players: newPlayers,
                actions: newActions,
            });
        }
    }
}
function advanceTurn(state) {
    const nonFolded = state.players.filter(p => p.status !== 'folded' && p.status !== 'sitout');
    if (nonFolded.length === 1) {
        return collectPots({ ...state, isFinished: true });
    }
    if (isStreetComplete(state)) {
        return advanceStreet(state);
    }
    const nextIdx = findNextActivePlayer(state);
    if (nextIdx === -1) {
        return advanceStreet(state);
    }
    return { ...state, currentPlayerIndex: nextIdx };
}
function isStreetComplete(state) {
    const canAct = activeNonAllIn(state);
    if (canAct.length === 0)
        return true;
    const maxBet = getMaxBet(state);
    const allMatchedOrAllin = state.players
        .filter(p => p.status !== 'folded' && p.status !== 'sitout')
        .every(p => p.status === 'allin' || p.currentStreetBet === maxBet);
    if (!allMatchedOrAllin)
        return false;
    if (state.lastRaiserIndex < 0)
        return true;
    const currentIdx = state.currentPlayerIndex;
    if (!state.lastRaiserActedVoluntarily) {
        // 大盲 option 场景：仅当大盲（lastRaiser）本人刚行动才完成
        return currentIdx === state.lastRaiserIndex;
    }
    // 主动加注后：当下一位行动者是加注者时，说明行动已绕一圈，本轮结束
    const nextIdx = findNextActivePlayer(state);
    return nextIdx === state.lastRaiserIndex || nextIdx === -1;
}
function findNextActivePlayer(state) {
    const start = (state.currentPlayerIndex + 1) % state.players.length;
    return findNextActivePlayerFrom(state, start - 1);
}
function findNextActivePlayerFrom(state, fromIdx) {
    const n = state.players.length;
    for (let i = 1; i <= n; i++) {
        const idx = (fromIdx + i) % n;
        const p = state.players[idx];
        if (p.status === 'active')
            return idx;
    }
    return -1;
}
function advanceStreet(state) {
    const nonFolded = state.players.filter(p => p.status !== 'folded');
    const updatedPlayers = state.players.map(p => ({
        ...p,
        currentStreetBet: 0,
    }));
    const newPots = calculateSidePots(state.players.map(p => ({
        playerId: p.playerId,
        contributed: p.totalContributed,
        folded: p.status === 'folded',
    })));
    if (nonFolded.length <= 1 || state.street === 'river') {
        return collectPots({
            ...state,
            players: updatedPlayers,
            pots: newPots,
            isFinished: true,
        });
    }
    const allAllin = nonFolded.every(p => p.status === 'allin');
    const newStreet = nextStreet(state.street);
    let newDeck = [...state.deck];
    let newBoard = [...state.board];
    if (newStreet === 'flop') {
        newBoard = [...newBoard, ...newDeck.splice(0, 3)];
    }
    else if (newStreet === 'turn' || newStreet === 'river') {
        newBoard = [...newBoard, newDeck.shift()];
    }
    if (allAllin && newStreet !== 'showdown') {
        return advanceStreet({
            ...state,
            players: updatedPlayers,
            pots: newPots,
            street: newStreet,
            board: newBoard,
            deck: newDeck,
            lastRaiserIndex: -1,
            lastRaiseAmount: 0,
            minRaise: state.bigBlind,
            lastRaiserActedVoluntarily: false,
        });
    }
    if (newStreet === 'showdown') {
        return collectPots({
            ...state,
            players: updatedPlayers,
            pots: newPots,
            street: 'showdown',
            board: newBoard,
            deck: newDeck,
            isFinished: true,
        });
    }
    const newCurrentIdx = findFirstActiveAfterDealer(updatedPlayers, state.dealerSeat);
    return {
        ...state,
        players: updatedPlayers,
        pots: newPots,
        street: newStreet,
        board: newBoard,
        deck: newDeck,
        currentPlayerIndex: newCurrentIdx,
        lastRaiserIndex: -1,
        lastRaiseAmount: 0,
        // 新一条街最小下注 = 大盲，而非 0（修复 Bug 1）
        minRaise: state.bigBlind,
        lastRaiserActedVoluntarily: false,
    };
}
function findFirstActiveAfterDealer(players, dealerSeat) {
    const n = players.length;
    for (let i = 1; i <= n; i++) {
        const idx = players.findIndex(p => p.seatIndex === (dealerSeat + i) % 9);
        if (idx >= 0 && players[idx].status === 'active')
            return idx;
    }
    return players.findIndex(p => p.status === 'active');
}
function collectPots(state) {
    return {
        ...state,
        isFinished: true,
        street: state.board.length >= 5 ? 'showdown' : state.street,
    };
}
export function createHandState(handNumber, players, deck, dealerSeat, smallBlind, bigBlind, startTime) {
    const seatedPlayers = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
    const n = seatedPlayers.length;
    const dealerIdx = seatedPlayers.findIndex(p => p.seatIndex === dealerSeat);
    const sbIdx = (dealerIdx + 1) % n;
    const bbIdx = (dealerIdx + 2) % n;
    const sbPlayer = seatedPlayers[sbIdx];
    const bbPlayer = seatedPlayers[bbIdx];
    const handPlayers = seatedPlayers.map(p => ({
        playerId: p.playerId,
        seatIndex: p.seatIndex,
        chips: p.chips,
        currentStreetBet: 0,
        totalContributed: 0,
        status: 'active',
        holeCards: null,
    }));
    // Post blinds
    const sbBet = Math.min(smallBlind, handPlayers[sbIdx].chips);
    handPlayers[sbIdx].chips -= sbBet;
    handPlayers[sbIdx].currentStreetBet = sbBet;
    handPlayers[sbIdx].totalContributed = sbBet;
    if (handPlayers[sbIdx].chips === 0)
        handPlayers[sbIdx].status = 'allin';
    const bbBet = Math.min(bigBlind, handPlayers[bbIdx].chips);
    handPlayers[bbIdx].chips -= bbBet;
    handPlayers[bbIdx].currentStreetBet = bbBet;
    handPlayers[bbIdx].totalContributed = bbBet;
    if (handPlayers[bbIdx].chips === 0)
        handPlayers[bbIdx].status = 'allin';
    // Deal hole cards
    let deckCopy = [...deck];
    for (const p of handPlayers) {
        const c1 = deckCopy.shift();
        const c2 = deckCopy.shift();
        p.holeCards = [c1, c2];
    }
    const firstToAct = (bbIdx + 1) % n;
    return {
        handNumber,
        street: 'preflop',
        players: handPlayers,
        board: [],
        deck: deckCopy,
        dealerSeat,
        sbSeat: sbPlayer.seatIndex,
        bbSeat: bbPlayer.seatIndex,
        currentPlayerIndex: firstToAct,
        lastRaiserIndex: bbIdx,
        lastRaiseAmount: bigBlind,
        minRaise: bigBlind,
        bigBlind,
        lastRaiserActedVoluntarily: false, // 大盲尚未主动行动
        pots: [],
        actions: [
            { playerId: sbPlayer.playerId, type: 'raise', amount: sbBet, street: 'preflop' },
            { playerId: bbPlayer.playerId, type: 'raise', amount: bbBet, street: 'preflop' },
        ],
        isFinished: false,
        startTime,
    };
}
//# sourceMappingURL=handState.js.map