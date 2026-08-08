/* ===================================================================
   진입점 — DOM 이벤트를 각 모듈에 연결합니다.
   HTML 에는 onclick 을 두지 않으므로, 새 버튼을 붙일 때는 여기만 봅니다.
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    /* --- 피치 엔진 → UI / 게임 연결 --------------------------------- */
    PitchEngine.onStateChange = (active) => UI.setMicToggleState(active);

    PitchEngine.onFrame = (noteInfo) => {
        const volPercent = Math.min(100, Math.round((noteInfo.rms / AUDIO_CONFIG.meterFullScaleRms) * 100));
        UI.setMicMeter(volPercent);

        if (!noteInfo.noteName) return;

        UI.setDetectedNote(noteInfo.noteName, noteInfo.freq);
        Game.handleDetectedNote(noteInfo);
    };

    /* --- 판 종료 → 결과 모달 ---------------------------------------- */
    Game.onSessionEnd = (result) => UI.showResultModal(result);

    /* --- 설정 패널 -------------------------------------------------- */
    UI.$('game-mode-rank').addEventListener('click', () => Game.setGameMode('rank'));
    UI.$('game-mode-practice').addEventListener('click', () => Game.setGameMode('practice'));

    UI.$('mode-btn-mic').addEventListener('click', () => Game.setInputMode('mic'));
    UI.$('mode-btn-touch').addEventListener('click', () => Game.setInputMode('touch'));

    STRINGS_CONFIG.forEach(({ number }) => {
        UI.$(`str-btn-${number}`).addEventListener('click', () => Game.toggleStringSelect(number));
    });

    UI.$('btn-start').addEventListener('click', () => Game.start());

    /* --- 마이크 사전 테스트 ----------------------------------------- */
    UI.$('btn-toggle-mic').addEventListener('click', () => PitchEngine.toggleMic());

    UI.$('gain-slider').addEventListener('input', (e) => {
        UI.setGainLabel(PitchEngine.setGain(e.target.value));
    });

    UI.$('thres-slider').addEventListener('input', (e) => {
        UI.setThresholdLabel(PitchEngine.setThreshold(e.target.value));
    });

    /* --- 훈련 중 컨트롤 --------------------------------------------- */
    UI.$('btn-pause').addEventListener('click', () => Game.togglePause());
    UI.$('btn-stop-header').addEventListener('click', () => Game.stop());
    UI.$('btn-stop-trainer').addEventListener('click', () => Game.stop());

    /* --- 결과 모달 -------------------------------------------------- */
    UI.$('btn-close-result').addEventListener('click', () => UI.hideResultModal());

    UI.$('btn-retry').addEventListener('click', () => {
        UI.hideResultModal();
        Game.start();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') UI.hideResultModal();
    });

    /* --- 최초 사용자 제스처에 AudioContext 를 깨웁니다 --------------- */
    window.addEventListener('click', () => AudioEngine.context(), { once: true });

    /* --- 초기화 ----------------------------------------------------- */
    Game.setGameMode('rank');
    UI.setInputModeButtons(gameState.inputMode);
});
