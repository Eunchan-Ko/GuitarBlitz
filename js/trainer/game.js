/* ===================================================================
   게임 흐름 — 모드 전환, 출제, 타이머, 정답/오답 판정
   DOM 은 UI 모듈을 통해서만 다루고, 랭킹 제출은 관여하지 않습니다.
   판이 끝나면 onSessionEnd 콜백으로 결과만 넘깁니다.
   =================================================================== */

const Game = {
    onSessionEnd: null,   // (result) => void. main.js 가 주입

    /* --- 설정 ----------------------------------------------------- */
    setGameMode(mode) {
        gameState.mode = mode;
        UI.setGameModeButtons(mode);
    },

    setInputMode(mode) {
        gameState.inputMode = mode;
        UI.setInputModeButtons(mode);
    },

    toggleStringSelect(stringNum) {
        // 랭크전은 6줄 전체가 고정입니다.
        if (gameState.mode === 'rank') return;

        const idx = gameState.activeStrings.indexOf(stringNum);

        if (idx > -1) {
            if (gameState.activeStrings.length <= 1) {
                alert("최소 1개 이상의 기타 줄을 선택해야 합니다.");
                return;
            }
            gameState.activeStrings.splice(idx, 1);
            UI.setStringButtonActive(stringNum, false);
        } else {
            gameState.activeStrings.push(stringNum);
            UI.setStringButtonActive(stringNum, true);
        }
    },

    /* --- 훈련 시작 / 정지 / 일시정지 -------------------------------- */
    start() {
        const isRank = gameState.mode === 'rank';

        if (isRank) {
            // 랭킹 비교가 성립하도록 조건을 강제로 맞춥니다.
            gameState.activeStrings = [...RANK_CONFIG.activeStrings];
            gameState.maxFret = RANK_CONFIG.maxFret;
            gameState.timeLimit = RANK_CONFIG.questionSeconds;
        } else {
            gameState.maxFret = UI.readFretRange();
            gameState.timeLimit = UI.readTimeLimit();
        }

        gameState.isTraining = true;
        gameState.isPaused = false;
        gameState.isTransitioning = false;
        gameState.totalAttempts = 0;
        gameState.successCount = 0;
        gameState.combo = 0;
        gameState.maxCombo = 0;
        gameState.score = 0;
        gameState.questionRemainingRatio = 1;

        if (gameState.inputMode === 'mic' && !audioState.isMicActive) {
            PitchEngine.start();
        }

        UI.hideResultModal();

        // 랭크전에서는 일시정지로 시계를 멈출 수 없게 버튼을 숨깁니다.
        UI.showTrainerPanel({ showPause: !isRank });
        UI.setSessionBoxVisible(isRank);
        UI.setScorePoints(0);
        UI.setScore(0, 100);

        Fretboard.render({
            maxFret: gameState.maxFret,
            showNoteNames: this._shouldShowNoteNames(),
            onFretClick: (stringNum, fret) => this.handleFretClick(stringNum, fret)
        });

        if (isRank) this._startSessionTimer();
        this.nextQuestion();
    },

    /**
     * 화면 지판에 음이름을 표시할지 결정합니다.
     * 지판에 답이 적혀 있으면 위치를 외우는 게 아니라 읽게 되므로,
     *   · 랭크전 : 입력 방식과 무관하게 항상 가림
     *   · 연습 모드 + 터치 : 클릭할 자리가 곧 정답표가 되므로 가림
     *   · 연습 모드 + 마이크 : 실물 기타를 보며 연주하는 참고용이므로 표시
     */
    _shouldShowNoteNames() {
        if (gameState.mode === 'rank') return false;
        return gameState.inputMode !== 'touch';
    },

    /** 사용자가 중간에 그만둔 경우. 랭크전이라면 기록은 버립니다. */
    stop() {
        gameState.isTraining = false;
        gameState.isPaused = false;
        this._clearTimers();
        UI.showSetupPanel();
    },

    togglePause() {
        gameState.isPaused = !gameState.isPaused;
        UI.setPauseButton(gameState.isPaused);

        if (gameState.isPaused) {
            if (gameState.timerId) clearInterval(gameState.timerId);
        } else {
            this._startTimer();
        }
    },

    /* --- 출제 ------------------------------------------------------ */
    nextQuestion() {
        if (!gameState.isTraining) return;

        const stringNum = gameState.activeStrings[Math.floor(Math.random() * gameState.activeStrings.length)];
        const fret = Math.floor(Math.random() * gameState.maxFret) + 1;

        const stringConfig = STRINGS_CONFIG.find(s => s.number === stringNum);
        const pitch = stringConfig.openPitch + fret;

        gameState.currentTarget = {
            stringNum: stringNum,
            fret: fret,
            note: NOTE_NAMES[pitch % 12],
            pitch: pitch,
            targetHz: stringConfig.openHz * Math.pow(2, fret / 12)
        };

        UI.setQuestion(stringNum, gameState.currentTarget.note);

        // 이전 문제의 연주 잔향이 새 문제 판정에 섞이지 않도록 잠시 판정을 잠급니다.
        resetDetection();
        setTimeout(() => {
            gameState.isTransitioning = false;
        }, JUDGE_CONFIG.transitionLockMs);

        this._startTimer();
    },

    /*
     * 타이머는 tick 횟수가 아니라 경과한 실제 시각으로 남은 시간을 계산합니다.
     * 브라우저는 백그라운드 탭의 setInterval 을 1초 이상으로 throttle 하는데,
     * tick 을 세면 그만큼 판이 길어지고 속도 보너스도 실제보다 후하게 붙습니다.
     * 랭크전은 모두가 같은 60초를 써야 성립하므로 벽시계를 기준으로 둡니다.
     */
    _startTimer() {
        if (gameState.timerId) clearInterval(gameState.timerId);

        gameState.questionRemainingRatio = 1;
        UI.setTimerBar(100);

        if (gameState.timeLimit <= 0) return;

        const totalMs = gameState.timeLimit * 1000;
        const startedAt = performance.now();

        gameState.timerId = setInterval(() => {
            // 일시정지 중에는 인터벌이 이미 해제되지만, 경계 상황을 위해 한 번 더 막습니다.
            if (gameState.isPaused) return;

            const elapsed = performance.now() - startedAt;
            gameState.questionRemainingRatio = Math.max(0, 1 - elapsed / totalMs);
            UI.setTimerBar(gameState.questionRemainingRatio * 100);

            if (elapsed >= totalMs) {
                clearInterval(gameState.timerId);
                this.handleFailure("시간 초과!");
            }
        }, JUDGE_CONFIG.timerTickMs);
    },

    _startSessionTimer() {
        const total = RANK_CONFIG.sessionSeconds;
        const startedAt = performance.now();

        gameState.sessionRemaining = total;
        UI.setSessionTimer(total, 1);

        gameState.sessionTimerId = setInterval(() => {
            const elapsed = (performance.now() - startedAt) / 1000;
            gameState.sessionRemaining = Math.max(0, total - elapsed);
            UI.setSessionTimer(gameState.sessionRemaining, gameState.sessionRemaining / total);

            if (gameState.sessionRemaining <= 0) this._endSession();
        }, JUDGE_CONFIG.timerTickMs);
    },

    _clearTimers() {
        [['timerId', clearInterval], ['sessionTimerId', clearInterval], ['nextQuestionTimerId', clearTimeout]]
            .forEach(([key, clear]) => {
                if (gameState[key]) {
                    clear(gameState[key]);
                    gameState[key] = null;
                }
            });
    },

    /** 랭크전 제한시간 소진. 결과를 만들어 콜백으로 넘깁니다. */
    _endSession() {
        gameState.isTraining = false;
        this._clearTimers();

        const result = {
            score: gameState.score,
            correctCount: gameState.successCount,
            totalCount: gameState.totalAttempts,
            maxCombo: gameState.maxCombo,
            accuracy: gameState.totalAttempts > 0
                ? Math.round((gameState.successCount / gameState.totalAttempts) * 100)
                : 0
        };

        UI.showSetupPanel();
        if (this.onSessionEnd) this.onSessionEnd(result);
    },

    /* --- 판정 ------------------------------------------------------ */
    handleSuccess() {
        if (gameState.isTransitioning) return;
        gameState.isTransitioning = true;

        if (gameState.timerId) clearInterval(gameState.timerId);

        gameState.totalAttempts++;
        gameState.successCount++;
        gameState.combo++;
        gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);

        const gained = Score.forQuestion(gameState.questionRemainingRatio, gameState.combo);
        gameState.score += gained;

        AudioEngine.playResultChime(true);

        const t = gameState.currentTarget;
        const comboTag = gameState.combo >= 2 ? ` ${gameState.combo}콤보 x${Score.comboMultiplier(gameState.combo).toFixed(1)}` : '';
        UI.showFeedback(true, `🎯 정답! ${t.stringNum}번줄 ${t.fret}프렛 (${t.note})  +${gained}${comboTag}`);

        UI.setScorePoints(gameState.score);
        this._updateScore();
        this._scheduleNextQuestion(JUDGE_CONFIG.successDelayMs);
    },

    handleFailure(reason = "오답입니다") {
        if (gameState.isTransitioning) return;
        gameState.isTransitioning = true;

        if (gameState.timerId) clearInterval(gameState.timerId);

        gameState.totalAttempts++;
        gameState.combo = 0;
        AudioEngine.playResultChime(false);

        const t = gameState.currentTarget;
        UI.showFeedback(false, `❌ ${reason} 정답: ${t.stringNum}번줄 ${t.fret}프렛 (${t.note})`);

        this._updateScore();
        this._scheduleNextQuestion(JUDGE_CONFIG.failureDelayMs);
    },

    _scheduleNextQuestion(delayMs) {
        gameState.nextQuestionTimerId = setTimeout(() => this.nextQuestion(), delayMs);
    },

    _updateScore() {
        const accuracy = gameState.totalAttempts > 0
            ? Math.round((gameState.successCount / gameState.totalAttempts) * 100)
            : 100;
        UI.setScore(gameState.combo, accuracy);
    },

    /* --- 입력: 터치/클릭 ------------------------------------------- */
    handleFretClick(stringNum, fret) {
        if (!gameState.isTraining || gameState.isPaused) return;
        if (gameState.inputMode !== 'touch') return;

        const stringConfig = STRINGS_CONFIG.find(s => s.number === stringNum);
        AudioEngine.playGuitarNote(stringConfig.openHz * Math.pow(2, fret / 12));

        const target = gameState.currentTarget;
        if (stringNum === target.stringNum && fret === target.fret) {
            this.handleSuccess();
            return;
        }

        // 지판에 음이름이 가려져 있으므로, 방금 짚은 자리가 무슨 음이었는지 알려줍니다.
        const playedNote = NOTE_NAMES[(stringConfig.openPitch + fret) % 12];
        this.handleFailure(`짚은 곳은 ${stringNum}번줄 ${fret}프렛 '${playedNote}'!`);
    },

    /* --- 입력: 마이크 ---------------------------------------------- */
    handleDetectedNote(noteInfo) {
        if (!gameState.isTraining || gameState.isPaused) return;
        if (gameState.isTransitioning) return;

        const target = gameState.currentTarget;
        if (!target) return;

        // 마이크는 줄을 구분할 수 없고 음고만 판별합니다 (6번줄 10F D = 5번줄 5F D).
        // 따라서 목표 음이름이 들리면 올바른 위치를 짚은 것으로 신뢰합니다.
        if (noteInfo.noteName === target.note) {
            detectState.wrongNoteCount = 0;
            detectState.lastWrongNote = null;

            if (detectState.lastDetectedNote === target.note) {
                detectState.stableNoteCount++;
            } else {
                detectState.stableNoteCount = 1;
                detectState.lastDetectedNote = target.note;
            }

            if (detectState.stableNoteCount >= JUDGE_CONFIG.stableFramesToPass) {
                resetDetection();
                this.handleSuccess();
            }
            return;
        }

        // 목표와 다른 음이 안정적으로 들리면, 무슨 음을 냈는지 알려주고 오답 처리
        detectState.stableNoteCount = 0;

        if (detectState.lastWrongNote === noteInfo.noteName) {
            detectState.wrongNoteCount++;
        } else {
            detectState.wrongNoteCount = 1;
            detectState.lastWrongNote = noteInfo.noteName;
        }

        if (detectState.wrongNoteCount >= JUDGE_CONFIG.wrongFramesToFail) {
            const playedWrongNote = noteInfo.noteName;
            resetDetection();
            this.handleFailure(`잘못된 음 연주! (내가 낸 소리: '${playedWrongNote}')`);
        }
    }
};
