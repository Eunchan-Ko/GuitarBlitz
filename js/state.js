/* ===================================================================
   런타임 상태 — 게임 진행 / 오디오 장치 / 피치 감지 누적값
   상태는 여기서만 선언하고, 변경은 각 엔진에서 수행합니다.
   =================================================================== */

const gameState = {
    // 사용자 설정
    inputMode: 'mic',                  // 'mic' | 'touch'
    activeStrings: [1, 2, 3, 4, 5, 6],
    maxFret: 12,
    timeLimit: 3,                      // 초. 0 이면 무제한

    // 진행 플래그
    isTraining: false,
    isPaused: false,
    isTransitioning: false,            // 중복 판정 방지 잠금

    // 누적 통계
    totalAttempts: 0,
    successCount: 0,
    combo: 0,

    // 현재 문제 { stringNum, fret, note, pitch, targetHz }
    currentTarget: null,

    // 타이머 핸들
    timerId: null,
    nextQuestionTimerId: null
};

// Web Audio 장치 및 마이크 설정
const audioState = {
    ctx: null,
    analyser: null,
    micStream: null,
    gainNode: null,
    gain: AUDIO_CONFIG.defaultGain,
    threshold: AUDIO_CONFIG.defaultThreshold,
    isMicActive: false,
    animFrameId: null
};

// 프레임 간 누적되는 피치 판정 카운터
const detectState = {
    stableNoteCount: 0,
    wrongNoteCount: 0,
    lastDetectedNote: null,
    lastWrongNote: null
};

// 문제 전환 시 이전 연주의 잔향이 다음 판정에 섞이지 않도록 초기화
function resetDetection() {
    detectState.stableNoteCount = 0;
    detectState.wrongNoteCount = 0;
    detectState.lastDetectedNote = null;
    detectState.lastWrongNote = null;
}
