/* ===================================================================
   UI 레이어 — DOM 읽기/쓰기는 전부 여기로 모읍니다.
   게임 상태(gameState)를 참조하지 않는 순수 표현 계층이므로,
   화면을 바꿀 때 다른 파일을 건드릴 필요가 없습니다.
   =================================================================== */

const UI = (() => {
    const cache = {};

    // getElementById 캐시. 모든 대상은 index.html 에 정적으로 존재합니다.
    function $(id) {
        if (!cache[id]) cache[id] = document.getElementById(id);
        return cache[id];
    }

    // 선택/비선택 상태에서 공통으로 쓰는 Tailwind 클래스 묶음
    const MODE_BTN_ON = "p-3.5 rounded-xl border border-amber-500 bg-amber-500/10 text-amber-400 flex items-center gap-3 transition font-medium text-xs text-left";
    const MODE_BTN_OFF = "p-3.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 flex items-center gap-3 transition font-medium text-xs text-left";
    const STRING_BTN_ON = "flex-1 py-2 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs border border-amber-400 shadow";
    const STRING_BTN_OFF = "flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 font-bold text-xs border border-zinc-700";
    const BADGE_ON = "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40";
    const BADGE_OFF = "px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700";

    return {
        $,

        /* --- 패널 전환 ------------------------------------------------ */
        showTrainerPanel() {
            $('setup-panel').classList.add('hidden');
            $('trainer-panel').classList.remove('hidden');
            $('trainer-panel').classList.add('flex');
            $('btn-pause').classList.remove('hidden');
            $('btn-stop-header').classList.remove('hidden');
        },

        showSetupPanel() {
            $('setup-panel').classList.remove('hidden');
            $('trainer-panel').classList.add('hidden');
            $('trainer-panel').classList.remove('flex');
            $('btn-pause').classList.add('hidden');
            $('btn-stop-header').classList.add('hidden');
        },

        setPauseButton(isPaused) {
            $('pause-text').innerText = isPaused ? "재개하기" : "일시정지";
            $('pause-icon').className = isPaused
                ? "fa-solid fa-play text-amber-400"
                : "fa-solid fa-pause text-amber-400";
        },

        /* --- 설정 패널 ------------------------------------------------ */
        setInputModeButtons(mode) {
            const isMic = mode === 'mic';
            $('mode-btn-mic').className = isMic ? MODE_BTN_ON : MODE_BTN_OFF;
            $('mode-btn-touch').className = isMic ? MODE_BTN_OFF : MODE_BTN_ON;
        },

        setStringButtonActive(stringNum, active) {
            $(`str-btn-${stringNum}`).className = active ? STRING_BTN_ON : STRING_BTN_OFF;
        },

        readFretRange() {
            return parseInt($('fret-range-select').value, 10);
        },

        readTimeLimit() {
            return parseInt($('timer-limit-select').value, 10);
        },

        setGainLabel(gain) {
            $('gain-val-label').innerText = `x${gain.toFixed(1)} (증폭)`;
        },

        setThresholdLabel(threshold) {
            $('thres-val-label').innerText = `(${threshold.toFixed(3)})`;
            // 게이지 바 위 기준선을 문턱값 위치로 이동
            const percent = Math.min(100, (threshold / AUDIO_CONFIG.meterFullScaleRms) * 100);
            $('threshold-line').style.left = `${percent}%`;
        },

        /* --- 마이크 상태 표시 ----------------------------------------- */
        setMicToggleState(active) {
            $('mic-toggle-text').innerText = active ? "마이크 수음 끄기" : "마이크 수음 테스트 켜기";
            $('precheck-badge').innerText = active ? "수음 중..." : "대기 중";
            $('precheck-badge').className = active ? BADGE_ON : BADGE_OFF;

            const hint = $('mic-status-hint');
            if (hint) hint.innerText = active ? "🎙️ 실물 기타 소리 감지 중" : "🎙️ 마이크 꺼짐";

            if (!active) {
                this.setMicMeter(0);
                this.clearDetectedNote();
            }
        },

        setMicMeter(percent) {
            $('vol-bar-fill').style.width = `${percent}%`;
            $('vol-text-val').innerText = `${percent}%`;
        },

        setDetectedNote(noteName, freq) {
            const hz = `${freq.toFixed(1)} Hz`;
            $('precheck-note-name').innerText = noteName;
            $('precheck-freq').innerText = hz;

            // 훈련 패널의 실시간 표시기 (설정 화면에서는 존재하지만 숨김 상태)
            const liveNote = $('trainer-live-note');
            const liveFreq = $('trainer-live-freq');
            if (liveNote) liveNote.innerText = noteName;
            if (liveFreq) liveFreq.innerText = hz;
        },

        clearDetectedNote() {
            $('precheck-note-name').innerText = '--';
            $('precheck-freq').innerText = '0.0 Hz';

            const liveNote = $('trainer-live-note');
            const liveFreq = $('trainer-live-freq');
            if (liveNote) liveNote.innerText = '--';
            if (liveFreq) liveFreq.innerText = '0.0 Hz';
        },

        /* --- 훈련 진행 표시 ------------------------------------------- */
        setQuestion(stringNum, noteName) {
            $('target-note-display').innerText = noteName;
            $('target-prompt-text').innerHTML =
                `<span class="text-amber-400 font-bold">${stringNum}번 줄</span>의 <span class="text-amber-400">${noteName}</span> 음을 연주하세요!`;
        },

        setTimerBar(percent) {
            $('timer-bar').style.width = `${percent}%`;
        },

        setScore(combo, accuracyPercent) {
            $('score-combo').innerText = combo;
            $('score-accuracy').innerText = `${accuracyPercent}%`;
        },

        showFeedback(isSuccess, message) {
            const fb = $('feedback-bar');
            fb.classList.remove(
                'hidden',
                'bg-emerald-500/20', 'text-emerald-400', 'border-emerald-500/40',
                'bg-rose-500/20', 'text-rose-400', 'border-rose-500/40'
            );

            if (isSuccess) {
                fb.classList.add('bg-emerald-500/20', 'text-emerald-400', 'border', 'border-emerald-500/40');
            } else {
                fb.classList.add('bg-rose-500/20', 'text-rose-400', 'border', 'border-rose-500/40');
            }
            fb.innerText = message;
        }
    };
})();
