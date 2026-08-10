/* ===================================================================
   UI 셸 — 모든 뷰가 공유하는 헤더/탭/패널 전환과 닉네임 표시만 담습니다.
   지판 트레이너 화면 전용 메서드는 js/trainer/trainer-ui.js 가
   Object.assign 으로 같은 UI 네임스페이스에 덧붙입니다.
   (호출부는 전부 UI.xxx 그대로 — 파일만 뷰별로 나뉩니다)
   =================================================================== */

const UI = (() => {
    const cache = {};

    // getElementById 캐시. 대상은 index.html 뼈대 또는 주입된 partial 에 존재하며,
    // main.js 가 PartialsReady 이후에만 초기화하므로 캐시 시점은 항상 주입 뒤입니다.
    function $(id) {
        if (!cache[id]) cache[id] = document.getElementById(id);
        return cache[id];
    }

    const TAB_ON = "flex-1 py-2.5 rounded-lg text-xs font-bold transition bg-amber-500 text-zinc-950 shadow";
    const TAB_OFF = "flex-1 py-2.5 rounded-lg text-xs font-bold transition text-zinc-400 hover:text-zinc-200";

    return {
        $,

        /* --- 상단 탭 --------------------------------------------------- */
        setActiveTab(name) {
            const isTrainer = name === 'trainer';

            $('view-trainer').classList.toggle('hidden', !isTrainer);
            $('view-trainer').classList.toggle('flex', isTrainer);
            $('view-metronome').classList.toggle('hidden', isTrainer);
            $('view-metronome').classList.toggle('flex', !isTrainer);

            $('tab-trainer').className = isTrainer ? TAB_ON : TAB_OFF;
            $('tab-metronome').className = isTrainer ? TAB_OFF : TAB_ON;

            $('tab-trainer').innerHTML = '<i class="fa-solid fa-guitar mr-1.5"></i> 지판 트레이너';
            $('tab-metronome').innerHTML = '<i class="fa-solid fa-stopwatch mr-1.5"></i> 메트로놈';
        },

        /* --- 패널 전환 ------------------------------------------------ */
        showTrainerPanel({ showPause = true } = {}) {
            $('setup-panel').classList.add('hidden');
            $('leaderboard-panel').classList.add('hidden');
            $('trainer-panel').classList.remove('hidden');
            $('trainer-panel').classList.add('flex');
            $('btn-pause').classList.toggle('hidden', !showPause);
            $('btn-stop-header').classList.remove('hidden');
            // 훈련 중 탭 전환은 집중만 깨뜨리므로 탭 자체를 숨깁니다.
            $('top-tabs').classList.add('hidden');
        },

        showSetupPanel() {
            $('setup-panel').classList.remove('hidden');
            $('leaderboard-panel').classList.remove('hidden');
            $('trainer-panel').classList.add('hidden');
            $('trainer-panel').classList.remove('flex');
            $('btn-pause').classList.add('hidden');
            $('btn-stop-header').classList.add('hidden');
            $('top-tabs').classList.remove('hidden');
        },

        setPauseButton(isPaused) {
            $('pause-text').innerText = isPaused ? "재개하기" : "일시정지";
            $('pause-icon').className = isPaused
                ? "fa-solid fa-play text-amber-400"
                : "fa-solid fa-pause text-amber-400";
        },

        /* --- 닉네임 (헤더 표시 + 등록 모달) ----------------------------- */
        showNicknameModal(currentNickname) {
            $('nickname-input').value = currentNickname || '';
            this.setNicknameFeedback('', null);
            $('nickname-modal').classList.remove('hidden');
            $('nickname-modal').classList.add('flex');
            $('nickname-input').focus();
        },

        hideNicknameModal() {
            $('nickname-modal').classList.add('hidden');
            $('nickname-modal').classList.remove('flex');
        },

        setNicknameFeedback(message, ok) {
            const el = $('nickname-feedback');
            el.innerText = message;
            el.className = ok === null || message === ''
                ? 'text-[11px] mt-2 h-4 text-zinc-500'
                : `text-[11px] mt-2 h-4 font-medium ${ok ? 'text-emerald-400' : 'text-rose-400'}`;
        },

        setNicknameDisplay(nickname) {
            const box = $('player-box');
            if (!nickname) {
                box.classList.add('hidden');
                return;
            }
            box.classList.remove('hidden');
            $('player-nickname').innerText = nickname;
        }
    };
})();
