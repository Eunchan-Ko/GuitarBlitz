/* ===================================================================
   게임 흐름 — 설정 변경, 문제 출제, 타이머, 정답/오답 판정
   DOM 은 UI 모듈을 통해서만 다룹니다.
   =================================================================== */

const Game = {

    /* --- 설정 ----------------------------------------------------- */
    setInputMode(mode) {
        gameState.inputMode = mode;
        UI.setInputModeButtons(mode);
    },

    toggleStringSelect(stringNum) {
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
        gameState.maxFret = UI.readFretRange();
        gameState.timeLimit = UI.readTimeLimit();

        gameState.isTraining = true;
        gameState.isPaused = false;
        gameState.isTransitioning = false;
        gameState.totalAttempts = 0;
        gameState.successCount = 0;
        gameState.combo = 0;

        if (gameState.inputMode === 'mic' && !audioState.isMicActive) {
            PitchEngine.start();
        }

        UI.showTrainerPanel();

        Fretboard.render({
            maxFret: gameState.maxFret,
            onFretClick: (stringNum, fret) => this.handleFretClick(stringNum, fret)
        });

        this.nextQuestion();
    },

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

    _startTimer() {
        if (gameState.timerId) clearInterval(gameState.timerId);

        if (gameState.timeLimit <= 0) {
            UI.setTimerBar(100);
            return;
        }

        UI.setTimerBar(100);

        const totalSteps = (gameState.timeLimit * 1000) / JUDGE_CONFIG.timerTickMs;
        let currentStep = 0;

        gameState.timerId = setInterval(() => {
            if (gameState.isPaused) return;

            currentStep++;
            UI.setTimerBar(Math.max(0, 100 - (currentStep / totalSteps) * 100));

            if (currentStep >= totalSteps) {
                clearInterval(gameState.timerId);
                this.handleFailure("시간 초과!");
            }
        }, JUDGE_CONFIG.timerTickMs);
    },

    _clearTimers() {
        if (gameState.timerId) {
            clearInterval(gameState.timerId);
            gameState.timerId = null;
        }
        if (gameState.nextQuestionTimerId) {
            clearTimeout(gameState.nextQuestionTimerId);
            gameState.nextQuestionTimerId = null;
        }
    },

    /* --- 판정 ------------------------------------------------------ */
    handleSuccess() {
        if (gameState.isTransitioning) return;
        gameState.isTransitioning = true;

        if (gameState.timerId) clearInterval(gameState.timerId);

        gameState.totalAttempts++;
        gameState.successCount++;
        gameState.combo++;
        AudioEngine.playResultChime(true);

        const t = gameState.currentTarget;
        UI.showFeedback(true, `🎯 정답! ${t.stringNum}번줄 ${t.fret}프렛 (${t.note})`);
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
        } else {
            this.handleFailure(`잘못된 위치! (${stringNum}번줄 ${fret}F)`);
        }
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
