/* ===================================================================
   점수 계산 — 상태를 읽지 않는 순수 함수 모음
   =================================================================== */

const Score = {
    /**
     * 콤보 배율. 1콤보 = 1.0배에서 시작해 콤보당 comboStep 씩 오르고 상한에서 멈춥니다.
     */
    comboMultiplier(combo) {
        const raw = 1 + SCORE_CONFIG.comboStep * Math.max(0, combo - 1);
        return Math.min(SCORE_CONFIG.comboMultiplierMax, raw);
    },

    /**
     * 문제 하나를 맞혔을 때 얻는 점수.
     * @param {number} remainingRatio 문제 제한시간 중 남은 비율 (0~1). 무제한이면 1.
     * @param {number} combo          이번 정답을 포함한 콤보 수
     */
    forQuestion(remainingRatio, combo) {
        const speedBonus = Math.round(SCORE_CONFIG.speedBonusMax * clamp01(remainingRatio));
        return Math.round((SCORE_CONFIG.basePoints + speedBonus) * this.comboMultiplier(combo));
    }
};

function clamp01(v) {
    if (!isFinite(v)) return 0;
    return Math.min(1, Math.max(0, v));
}
