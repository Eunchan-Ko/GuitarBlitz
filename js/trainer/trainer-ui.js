/* ===================================================================
   지판 트레이너 화면 전용 UI — 설정 패널 / 마이크 표시 / 훈련 진행 /
   결과 모달 / 랭킹 표. js/core/ui.js 가 만든 UI 네임스페이스에
   Object.assign 으로 덧붙이므로 호출부는 전부 UI.xxx 그대로입니다.
   로드 순서: core/ui.js 다음이어야 합니다 (index.html 참고).
   =================================================================== */

Object.assign(UI, (() => {
    const $ = UI.$;

    // 선택/비선택 상태에서 공통으로 쓰는 Tailwind 클래스 묶음
    const MODE_BTN_ON = "p-3.5 rounded-xl border border-amber-500 bg-amber-500/10 text-amber-400 flex items-center gap-3 transition font-medium text-xs text-left";
    const MODE_BTN_OFF = "p-3.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 flex items-center gap-3 transition font-medium text-xs text-left";
    const STRING_BTN_ON = "flex-1 py-2 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs border border-amber-400 shadow";
    const STRING_BTN_OFF = "flex-1 py-2 rounded-lg bg-zinc-800 text-zinc-400 font-bold text-xs border border-zinc-700";
    const BADGE_ON = "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40";
    const BADGE_OFF = "px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700";

    return {
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
        },

        /* --- 게임 모드 (랭크전 / 연습) --------------------------------- */
        setGameModeButtons(mode) {
            const isRank = mode === 'rank';
            $('game-mode-rank').className = isRank ? MODE_BTN_ON : MODE_BTN_OFF;
            $('game-mode-practice').className = isRank ? MODE_BTN_OFF : MODE_BTN_ON;

            // 랭크전은 모두 같은 조건이어야 비교가 되므로 설정을 잠급니다.
            $('rank-fixed-notice').classList.toggle('hidden', !isRank);
            $('practice-settings').classList.toggle('opacity-40', isRank);
            $('practice-settings').classList.toggle('pointer-events-none', isRank);

            $('fret-range-select').disabled = isRank;
            $('timer-limit-select').disabled = isRank;

            $('btn-start-label').innerText = isRank
                ? `${RANK_CONFIG.sessionSeconds}초 랭크전 시작하기`
                : '연습 모드 시작하기';
        },

        /* --- 랭크전 세션 타이머 / 점수 --------------------------------- */
        setSessionBoxVisible(visible) {
            $('session-box').classList.toggle('hidden', !visible);
            $('session-box').classList.toggle('flex', visible);
        },

        setSessionTimer(remainingSeconds, ratio) {
            $('session-remaining').innerText = Math.max(0, Math.ceil(remainingSeconds));
            $('session-bar').style.width = `${Math.max(0, Math.min(100, ratio * 100))}%`;
        },

        setScorePoints(points) {
            $('score-points').innerText = points.toLocaleString();
        },

        /* --- 결과 모달 -------------------------------------------------- */
        showResultModal(result, options) {
            $('result-score').innerText = result.score.toLocaleString();
            $('result-correct').innerText = `${result.correctCount} / ${result.totalCount}`;
            $('result-combo').innerText = result.maxCombo;
            $('result-accuracy').innerText = `${result.accuracy}%`;

            $('result-status').innerText = options.statusMessage || '';
            $('btn-submit-score').classList.toggle('hidden', !options.canSubmit);
            $('btn-submit-score').disabled = false;
            $('btn-submit-score').innerText = '랭킹에 등록하기';

            $('result-modal').classList.remove('hidden');
            $('result-modal').classList.add('flex');
        },

        hideResultModal() {
            $('result-modal').classList.add('hidden');
            $('result-modal').classList.remove('flex');
        },

        setResultStatus(message) {
            $('result-status').innerText = message;
        },

        setSubmitButtonState(enabled, label) {
            $('btn-submit-score').disabled = !enabled;
            $('btn-submit-score').innerText = label;
        },

        hideSubmitButton() {
            $('btn-submit-score').classList.add('hidden');
        },

        /* --- 랭킹 표 ---------------------------------------------------- */
        setLeaderboardScope(isGlobal) {
            const badge = $('leaderboard-scope');
            badge.innerText = isGlobal ? '전체 랭킹' : '이 브라우저 기록';
            badge.className = isGlobal ? BADGE_ON : BADGE_OFF;
        },

        renderLeaderboard(rows) {
            const body = $('leaderboard-body');
            body.innerHTML = '';

            if (!rows.length) {
                const empty = document.createElement('div');
                empty.className = 'py-8 text-center text-xs text-zinc-500';
                empty.innerText = '아직 등록된 기록이 없습니다. 첫 주자가 되어보세요!';
                body.appendChild(empty);
                return;
            }

            rows.forEach((row, idx) => {
                const rank = idx + 1;
                const line = document.createElement('div');
                line.className = 'grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg text-xs '
                    + (rank <= 3 ? 'bg-amber-500/5 border border-amber-500/20' : 'border border-transparent');

                const isMine = Player.nickname && row.nickname === Player.nickname;

                line.innerHTML = `
                    <div class="col-span-2 font-black ${rank <= 3 ? 'text-amber-400' : 'text-zinc-500'}">${rankLabel(rank)}</div>
                    <div class="col-span-5 font-bold truncate ${isMine ? 'text-emerald-400' : 'text-zinc-200'}">${escapeHtml(row.nickname)}${isMine ? ' <span class="text-[10px] font-normal">(나)</span>' : ''}</div>
                    <div class="col-span-3 text-right font-mono font-bold text-zinc-100">${row.score.toLocaleString()}</div>
                    <div class="col-span-2 text-right font-mono text-zinc-500">${row.maxCombo}콤보</div>
                `;
                body.appendChild(line);
            });
        },

        setLeaderboardStatus(message) {
            $('leaderboard-status').innerText = message;
        }
    };

    function rankLabel(rank) {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `${rank}`;
    }

    // 닉네임은 다른 사용자가 입력한 값이므로 반드시 이스케이프합니다.
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }
})());
