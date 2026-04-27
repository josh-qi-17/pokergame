export function calculateSidePots(contributions) {
    if (contributions.length === 0)
        return [];
    const sorted = [...contributions].sort((a, b) => a.contributed - b.contributed);
    const pots = [];
    let prevLevel = 0;
    for (let i = 0; i < sorted.length; i++) {
        const level = sorted[i].contributed;
        if (level <= prevLevel)
            continue;
        const increment = level - prevLevel;
        let potAmount = 0;
        const eligible = [];
        for (const player of contributions) {
            const effectiveContrib = Math.min(player.contributed, level) - prevLevel;
            if (effectiveContrib > 0) {
                potAmount += effectiveContrib;
            }
            if (!player.folded && player.contributed >= level) {
                eligible.push(player.playerId);
            }
        }
        if (potAmount > 0) {
            pots.push({ amount: potAmount, eligiblePlayerIds: eligible });
        }
        prevLevel = level;
        void increment;
    }
    return mergePots(pots);
}
function mergePots(pots) {
    const merged = [];
    for (const pot of pots) {
        const existing = merged.find(p => p.eligiblePlayerIds.length === pot.eligiblePlayerIds.length &&
            p.eligiblePlayerIds.every(id => pot.eligiblePlayerIds.includes(id)));
        if (existing) {
            existing.amount += pot.amount;
        }
        else {
            merged.push({ ...pot, eligiblePlayerIds: [...pot.eligiblePlayerIds] });
        }
    }
    return merged;
}
//# sourceMappingURL=sidepots.js.map