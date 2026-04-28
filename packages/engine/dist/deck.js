import { randomBytes } from 'node:crypto';
const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ rank, suit });
        }
    }
    return deck;
}
export function shuffle(deck, rng) {
    const result = [...deck];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = result[i];
        result[i] = result[j];
        result[j] = tmp;
    }
    return result;
}
export function cryptoRng() {
    return () => {
        const buf = randomBytes(4);
        return buf.readUInt32BE(0) / 0x100000000;
    };
}
//# sourceMappingURL=deck.js.map