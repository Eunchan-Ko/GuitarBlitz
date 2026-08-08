/* ===================================================================
   진입점 — DOM 이벤트를 각 모듈에 연결하고 백엔드를 초기화합니다.
   HTML 에는 onclick 을 두지 않으므로, 새 버튼을 붙일 때는 여기만 봅니다.
   =================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    let lastResult = null;          // 방금 끝난 랭크전 결과
    let afterNickname = null;       // 닉네임 등록 후 이어서 할 일
    let availabilityTimer = null;   // 닉네임 중복검사 디바운스

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
    Game.onSessionEnd = (result) => {
        lastResult = result;
        UI.showResultModal(result, {
            canSubmit: result.totalCount > 0,
            statusMessage: Leaderboard.isGlobal()
                ? ''
                : '아직 서버가 연결되지 않아 기록은 이 브라우저에만 저장됩니다.'
        });
    };

    /* --- 상단 탭 ---------------------------------------------------- */
    UI.$('tab-trainer').addEventListener('click', () => UI.setActiveTab('trainer'));

    UI.$('tab-metronome').addEventListener('click', () => {
        // 훈련 중에 탭을 옮기면 화면이 사라진 채로 타이머만 도니 정리하고 넘어갑니다.
        if (gameState.isTraining) Game.stop();
        UI.setActiveTab('metronome');
    });

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
    UI.$('btn-submit-score').addEventListener('click', () => {
        if (!Player.has()) {
            // 닉네임은 여기서 처음 물어봅니다. 등록이 끝나면 그대로 제출로 이어집니다.
            openNicknameModal(submitLastResult);
            return;
        }
        submitLastResult();
    });

    UI.$('btn-close-result').addEventListener('click', () => UI.hideResultModal());

    UI.$('btn-retry').addEventListener('click', () => {
        UI.hideResultModal();
        Game.start();
    });

    /* --- 닉네임 모달 ------------------------------------------------ */
    UI.$('btn-change-nickname').addEventListener('click', () => openNicknameModal(null));
    UI.$('btn-nickname-cancel').addEventListener('click', () => closeNicknameModal());
    UI.$('btn-nickname-save').addEventListener('click', () => saveNickname());

    UI.$('nickname-input').addEventListener('input', (e) => {
        const raw = e.target.value;
        clearTimeout(availabilityTimer);

        const check = Player.validate(raw);
        if (!check.ok) {
            UI.setNicknameFeedback(raw.trim() ? check.message : '', false);
            return;
        }

        UI.setNicknameFeedback('확인 중...', null);
        availabilityTimer = setTimeout(async () => {
            const res = await Player.isAvailable(raw);
            UI.setNicknameFeedback(res.message, res.available);
        }, 350);
    });

    UI.$('nickname-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveNickname();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeNicknameModal();
        UI.hideResultModal();
    });

    /* --- 랭킹 ------------------------------------------------------- */
    UI.$('btn-refresh-leaderboard').addEventListener('click', () => refreshLeaderboard());

    /* --- 최초 사용자 제스처에 AudioContext 를 깨웁니다 --------------- */
    window.addEventListener('click', () => AudioEngine.context(), { once: true });

    /* --- 초기화 ----------------------------------------------------- */
    UI.setActiveTab('trainer');
    Game.setGameMode('rank');
    UI.setInputModeButtons(gameState.inputMode);
    MetronomeUI.init();
    bootstrapBackend();

    /* =============================================================== */

    // 백엔드 준비는 비동기입니다. 실패하더라도 게임은 그대로 플레이할 수 있습니다.
    async function bootstrapBackend() {
        UI.setLeaderboardStatus('불러오는 중...');

        await Backend.init();
        await Player.init();

        UI.setNicknameDisplay(Player.nickname);
        UI.setLeaderboardScope(Leaderboard.isGlobal());
        refreshLeaderboard();
    }

    async function refreshLeaderboard() {
        UI.setLeaderboardStatus('불러오는 중...');

        const res = await Leaderboard.top();
        if (!res.ok) {
            UI.setLeaderboardStatus(res.message);
            return;
        }

        UI.renderLeaderboard(res.rows);
        UI.setLeaderboardStatus(
            Leaderboard.isGlobal() ? '' : 'Supabase 미설정 — 이 브라우저에 저장된 기록입니다.'
        );
    }

    function openNicknameModal(continuation) {
        afterNickname = continuation;
        UI.showNicknameModal(Player.nickname);
    }

    function closeNicknameModal() {
        afterNickname = null;
        clearTimeout(availabilityTimer);
        UI.hideNicknameModal();
    }

    async function saveNickname() {
        const res = await Player.save(UI.$('nickname-input').value);
        if (!res.ok) {
            UI.setNicknameFeedback(res.message, false);
            return;
        }

        UI.setNicknameDisplay(Player.nickname);
        UI.hideNicknameModal();

        const next = afterNickname;
        afterNickname = null;
        if (next) next();

        refreshLeaderboard();
    }

    async function submitLastResult() {
        if (!lastResult) return;

        UI.setSubmitButtonState(false, '등록 중...');
        const res = await Leaderboard.submit(lastResult);

        if (!res.ok) {
            UI.setSubmitButtonState(true, '다시 시도');
            UI.setResultStatus(res.message);
            return;
        }

        UI.hideSubmitButton();
        UI.setResultStatus(
            Leaderboard.isGlobal() ? '랭킹에 등록되었습니다!' : '이 브라우저 기록에 저장되었습니다.'
        );
        refreshLeaderboard();
    }
});
