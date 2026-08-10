/* ===================================================================
   메트로놈 화면 — 이 뷰의 DOM 은 전부 여기서만 다룹니다.
   엔진(Metronome)은 화면을 모르고, 이 파일은 소리를 모릅니다.
   =================================================================== */

const MetronomeUI = (() => {
    const $ = (id) => document.getElementById(id);

    let dragging = false;
    let lastPointerX = 0;
    let dragAccum = 0;       // 1 BPM 미만의 이동량을 모아두는 버퍼
    let tapResetTimer = null;

    // 박 진행 인디케이터 상태 (테마와 무관하게 공유합니다)
    let beatDir = 1;         // 이번 박의 진행 방향 (+1: 왼→오, -1: 오→왼). 박마다 뒤집습니다.
    let beatAnchor = 0;      // 이번 박이 울리는 시각 (AudioContext 시계)
    let beatDur = 0.6;       // 한 박 길이(초)
    let indicatorRafId = null;
    let popTimer = null;
    let indicatorTheme = 'sweep';

    const INDICATOR_STORAGE_KEY = 'guitarblitz.metronomeIndicator';
    const NEEDLE_SWING_DEG = 28;
    const BEATS_MIN = 2;     // 설정 카드의 met-beats 옵션 범위와 같아야 합니다.
    const BEATS_MAX = 7;

    const BEAT_STATE_LABEL = { accent: '강조', normal: '보통', mute: '음소거' };

    // 테마별 판(hidden 으로 접는 대상), 움직이는 요소(met-pop 을 붙이는 대상), 버튼 라벨.
    const THEMES = {
        sweep: { pane: 'met-sweep', el: 'met-sweep-bar', label: '스윕' },
        pendulum: { pane: 'met-pendulum', el: 'met-needle', label: '진자' },
        pulse: { pane: 'met-pulse', el: 'met-pulse-dot', label: '펄스' }
    };

    // THEMES[name] 로 검사하면 'constructor' 같은 상속 키가 통과하므로 이름 목록으로 봅니다.
    const THEME_NAMES = Object.keys(THEMES);

    // 진행률(0~1)을 활성 테마의 그림으로 옮기는 함수. rAF 루프가 이 중 하나만 호출합니다.
    const RENDER_THEME = {
        sweep(progress) {
            // 방향이 박마다 뒤집히므로 트랙의 양 끝을 왕복합니다.
            // 0~1 만 넘기고 캡 폭 보정은 CSS(--met-cap)가 합니다.
            const t = beatDir > 0 ? progress : 1 - progress;
            $('met-sweep-bar').style.setProperty('--met-sweep-t', t.toFixed(4));
        },
        pendulum(progress) {
            const angle = beatDir * NEEDLE_SWING_DEG * (progress * 2 - 1);
            $('met-needle').style.transform = `translateX(-50%) rotate(${angle.toFixed(2)}deg)`;
        },
        pulse(progress) {
            $('met-pulse-dot').style.transform = `translate(-50%, -50%) scale(${(0.6 + progress * 0.4).toFixed(3)})`;
        }
    };

    return {
        init() {
            Metronome.onChange = () => this.render();
            Metronome.onBeat = (beat) => this.flashBeat(beat);

            indicatorTheme = loadIndicatorTheme();

            bindTransport();
            bindSlideControl();
            bindSettings();
            bindTap();
            bindPresets();
            bindKeyboard();

            renderThemeButtons();
            applyIndicatorTheme();

            this.render();
            this.renderPresets();
        },

        render() {
            $('met-bpm').innerText = Metronome.bpm;
            $('met-tempo-name').innerText = tempoName(Metronome.bpm);

            const range = METRONOME_CONFIG.maxBpm - METRONOME_CONFIG.minBpm;
            const ratio = (Metronome.bpm - METRONOME_CONFIG.minBpm) / range;
            $('met-range-fill').style.width = `${ratio * 100}%`;

            $('met-toggle-icon').className = Metronome.isPlaying
                ? 'fa-solid fa-stop text-lg'
                : 'fa-solid fa-play text-lg';
            $('met-toggle-text').innerText = Metronome.isPlaying ? '정지' : '시작';

            // render() 는 onChange 마다 불리므로 여기서 인디케이터 루프를 붙였다 뗍니다.
            if (Metronome.isPlaying) startIndicatorLoop();
            else stopIndicatorLoop();

            this.renderBeatDots();
        },

        renderBeatDots() {
            const wrap = $('met-beat-dots');
            wrap.innerHTML = '';

            for (let i = 0; i < Metronome.beatsPerMeasure; i++) {
                const state = Metronome.beatStates[i] || 'normal';

                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = `met-dot met-dot-${state}`;
                dot.dataset.beat = i;
                dot.setAttribute('aria-label', `${i + 1}박: ${BEAT_STATE_LABEL[state]} — 탭하여 변경`);
                dot.addEventListener('click', () => Metronome.cycleBeatState(i));
                wrap.appendChild(dot);
            }
        },

        flashBeat({ beat, isBeat, time }) {
            if (!isBeat) return;   // 쪼갠 박에서는 점을 움직이지 않습니다.

            // 강조 여부는 박 상태에서 직접 읽습니다 (음소거된 첫 박이 빛나면 안 되므로).
            stepIndicator(time, Metronome.beatStates[beat] === 'accent');

            const dots = $('met-beat-dots').children;
            for (let i = 0; i < dots.length; i++) {
                dots[i].classList.toggle('met-dot-active', i === beat);
            }
        },

        renderPresets() {
            const wrap = $('met-presets');
            const list = Metronome.presets.list();
            wrap.innerHTML = '';

            if (!list.length) {
                const empty = document.createElement('p');
                empty.className = 'text-[11px] text-zinc-500 py-2';
                empty.innerText = '자주 쓰는 템포를 저장해두면 한 번에 불러올 수 있습니다.';
                wrap.appendChild(empty);
                return;
            }

            list.forEach(preset => {
                const chip = document.createElement('div');
                chip.className = 'flex items-center gap-1 bg-zinc-800 border border-zinc-700 hover:border-amber-500/50 rounded-lg pl-3 pr-1.5 py-1.5 transition';

                const apply = document.createElement('button');
                apply.className = 'text-xs font-bold text-zinc-100 hover:text-amber-400 transition';
                apply.innerText = `${preset.bpm} · ${preset.beatsPerMeasure}/4`;
                apply.addEventListener('click', () => {
                    Metronome.setBpm(preset.bpm);
                    setBeats(preset.beatsPerMeasure);
                    Metronome.setSubdivision(preset.subdivision || 1);
                    $('met-subdivision').value = String(preset.subdivision || 1);
                    setPresetMessage(`${preset.bpm} BPM 을 불러왔습니다.`);
                });

                const del = document.createElement('button');
                del.className = 'w-5 h-5 flex items-center justify-center text-[10px] text-zinc-500 hover:text-rose-400 transition';
                del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                del.title = '삭제';
                del.addEventListener('click', () => {
                    Metronome.presets.remove(preset.bpm, preset.beatsPerMeasure);
                    this.renderPresets();
                });

                chip.appendChild(apply);
                chip.appendChild(del);
                wrap.appendChild(chip);
            });
        },

        setTapHint(text) {
            $('met-tap-hint').innerText = text;
        }
    };

    /* --- 박 진행 인디케이터 ------------------------------------------- */

    /** 박이 울린 시점을 기준점으로 잡고 진행 방향을 뒤집습니다. */
    function stepIndicator(time, isAccent) {
        beatAnchor = time;
        beatDur = 60 / Metronome.bpm;
        beatDir = -beatDir;

        // met-beat-accent 는 다음 박까지 유지(펄스 색), met-pop 은 120ms 만 붙입니다(번짐).
        const el = $(THEMES[indicatorTheme].el);
        el.classList.toggle('met-beat-accent', isAccent);
        el.classList.add('met-pop');
        clearTimeout(popTimer);
        popTimer = setTimeout(() => el.classList.remove('met-pop'), 120);
    }

    function startIndicatorLoop() {
        if (indicatorRafId) return;

        // 엔진이 AudioContext 시계로 소리를 예약하므로 진행률도 같은 시계로 재야
        // 그림과 소리가 어긋나지 않습니다. performance.now() 를 섞으면 안 됩니다.
        const ctx = AudioEngine.context();
        beatAnchor = ctx.currentTime;

        const draw = () => {
            if (!Metronome.isPlaying) { indicatorRafId = null; return; }

            // 백그라운드 탭에서 rAF 가 멈췄다 돌아오면 progress 가 1로 클램프되어
            // 그림이 한쪽 끝에 잠깐 머물다가 다음 박에서 자연히 제자리를 찾습니다.
            const progress = Math.max(0, Math.min(1, (ctx.currentTime - beatAnchor) / beatDur));
            RENDER_THEME[indicatorTheme](progress);

            indicatorRafId = requestAnimationFrame(draw);
        };

        indicatorRafId = requestAnimationFrame(draw);
    }

    function stopIndicatorLoop() {
        if (indicatorRafId) {
            cancelAnimationFrame(indicatorRafId);
            indicatorRafId = null;
        }
        clearTimeout(popTimer);
        resetIndicators();
    }

    /** 세 테마를 모두 휴지 상태로 돌립니다 (정지 / 테마 전환). */
    function resetIndicators() {
        Object.values(THEMES).forEach(({ el }) => {
            $(el).classList.remove('met-pop', 'met-beat-accent');
        });

        $('met-sweep-bar').style.setProperty('--met-sweep-t', '0.5');
        $('met-needle').style.transform = 'translateX(-50%) rotate(0deg)';
        $('met-pulse-dot').style.transform = 'translate(-50%, -50%) scale(0.6)';
    }

    /* --- 인디케이터 테마 (스윕 / 진자 / 펄스) ------------------------- */
    function loadIndicatorTheme() {
        try {
            const saved = localStorage.getItem(INDICATOR_STORAGE_KEY);
            return THEME_NAMES.includes(saved) ? saved : 'sweep';
        } catch (e) {
            return 'sweep';
        }
    }

    function renderThemeButtons() {
        const wrap = $('met-indicator-theme');
        wrap.innerHTML = '';

        Object.entries(THEMES).forEach(([name, { label }]) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'met-theme-btn';
            btn.dataset.theme = name;
            btn.innerText = label;
            btn.setAttribute('aria-label', `박 진행 표시를 ${label} 스타일로`);
            btn.addEventListener('click', () => setIndicatorTheme(name));
            wrap.appendChild(btn);
        });
    }

    function setIndicatorTheme(name) {
        if (!THEME_NAMES.includes(name)) return;
        indicatorTheme = name;

        try {
            localStorage.setItem(INDICATOR_STORAGE_KEY, name);
        } catch (e) {
            console.warn('[Metronome] 인디케이터 설정 저장에 실패했습니다.', e);
        }
        applyIndicatorTheme();
    }

    /** 활성 테마만 보이게 하고 나머지는 접습니다. */
    function applyIndicatorTheme() {
        Object.entries(THEMES).forEach(([name, { pane }]) => {
            $(pane).classList.toggle('hidden', name !== indicatorTheme);
        });

        Array.from($('met-indicator-theme').children).forEach(btn => {
            btn.setAttribute('aria-pressed', String(btn.dataset.theme === indicatorTheme));
        });

        resetIndicators();
    }

    /* --- 재생 -------------------------------------------------------- */
    function bindTransport() {
        $('met-toggle').addEventListener('click', () => Metronome.toggle());
    }

    /* --- 좌우 슬라이드로 템포 조절 ----------------------------------- */
    function bindSlideControl() {
        const track = $('met-slide-track');

        track.addEventListener('pointerdown', (e) => {
            dragging = true;
            lastPointerX = e.clientX;
            dragAccum = 0;
            // 패널 밖으로 커서가 나가도 드래그가 이어지도록 포인터를 붙잡습니다.
            try { track.setPointerCapture(e.pointerId); } catch (err) { /* 캡처 불가 환경 */ }
            track.classList.add('cursor-grabbing');
        });

        track.addEventListener('pointermove', (e) => {
            if (!dragging) return;

            dragAccum += (e.clientX - lastPointerX) * METRONOME_CONFIG.bpmPerPixel;
            lastPointerX = e.clientX;

            // 1 BPM 이 쌓였을 때만 반영하고 나머지는 버퍼에 남깁니다.
            const whole = Math.trunc(dragAccum);
            if (whole !== 0) {
                Metronome.nudgeBpm(whole);
                dragAccum -= whole;
            }
        });

        const endDrag = (e) => {
            if (!dragging) return;
            dragging = false;
            try { track.releasePointerCapture(e.pointerId); } catch (err) { /* 이미 해제됨 */ }
            track.classList.remove('cursor-grabbing');
        };

        track.addEventListener('pointerup', endDrag);
        track.addEventListener('pointercancel', endDrag);
    }

    /* --- 박자표 / 쪼갬 / 볼륨 ---------------------------------------- */
    function bindSettings() {
        $('met-beats').addEventListener('change', (e) => {
            setBeats(parseInt(e.target.value, 10));
        });

        // 비트 점 옆 인라인 조절 — 설정 카드의 select 와 서로 동기화됩니다.
        $('met-beats-minus').addEventListener('click', () => setBeats(Metronome.beatsPerMeasure - 1));
        $('met-beats-plus').addEventListener('click', () => setBeats(Metronome.beatsPerMeasure + 1));

        $('met-subdivision').addEventListener('change', (e) => {
            Metronome.setSubdivision(parseInt(e.target.value, 10));
        });

        $('met-volume').addEventListener('input', (e) => {
            Metronome.setVolume(e.target.value);
            $('met-volume-label').innerText = `${Math.round(Metronome.volume * 100)}%`;
        });
    }

    /** 박 수를 select 범위(2~7)로 자르고 select 값도 같이 맞춥니다. */
    function setBeats(count) {
        const next = Math.max(BEATS_MIN, Math.min(BEATS_MAX, count));
        Metronome.setBeatsPerMeasure(next);
        $('met-beats').value = String(next);
    }

    /* --- 탭 템포 ------------------------------------------------------ */
    function bindTap() {
        $('met-tap').addEventListener('click', () => {
            const { bpm, samples } = Metronome.tap();

            MetronomeUI.setTapHint(
                samples < METRONOME_CONFIG.tapMinSamples
                    ? '한 번 더 두드려주세요...'
                    : `${samples}회 평균 → ${bpm} BPM`
            );

            // 두드리기를 멈추면 안내를 초기 상태로 되돌립니다.
            clearTimeout(tapResetTimer);
            tapResetTimer = setTimeout(() => {
                Metronome.resetTap();
                MetronomeUI.setTapHint('박자에 맞춰 4번 이상 두드리세요');
            }, METRONOME_CONFIG.tapTimeoutMs);
        });
    }

    /* --- 즐겨찾기 ----------------------------------------------------- */
    function bindPresets() {
        $('btn-met-save-preset').addEventListener('click', () => {
            const res = Metronome.presets.add({
                bpm: Metronome.bpm,
                beatsPerMeasure: Metronome.beatsPerMeasure,
                subdivision: Metronome.subdivision
            });

            if (!res.ok) {
                setPresetMessage(res.message);
                return;
            }
            MetronomeUI.renderPresets();
            setPresetMessage(`${Metronome.bpm} BPM 을 저장했습니다.`);
        });
    }

    function setPresetMessage(message) {
        $('met-preset-msg').innerText = message;
    }

    /* --- 키보드 단축키 ------------------------------------------------ */
    function bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            // 메트로놈 탭이 열려 있고, 입력 요소에 포커스가 없을 때만 반응합니다.
            if ($('view-metronome').classList.contains('hidden')) return;

            const tag = (document.activeElement && document.activeElement.tagName) || '';
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;

            const step = e.shiftKey ? 10 : 1;

            switch (e.key) {
                case 'ArrowRight': Metronome.nudgeBpm(step); e.preventDefault(); break;
                case 'ArrowLeft': Metronome.nudgeBpm(-step); e.preventDefault(); break;
                case ' ': Metronome.toggle(); e.preventDefault(); break;
                case 't':
                case 'T': $('met-tap').click(); e.preventDefault(); break;
            }
        });
    }
})();
