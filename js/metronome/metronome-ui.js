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

    // 곡 모드. 곡 목록만 localStorage 에 남고, 아래 상태는 세션 동안만 유지합니다.
    // 구간 안내 단계는 엔진(Metronome.sectionGuide)이 들고 있습니다 — 소리를 내는 쪽이라서.
    let songMode = false;
    let songIdx = 0;         // met-song-select 에서 고른 곡
    let editIdx = -1;        // 모달에서 편집 중인 곡 (-1 = 새 곡)
    let editSections = [];   // 저장 전까지의 임시 구간 목록

    // 곡 모드 하위 모드: 'section' = 저장 곡 하나를 고름 | 'setlist' = 셋리스트 순서대로 넘김
    let songSubMode = 'section';
    let setlistIdx = 0;      // met-setlist-select 에서 고른 위치
    let editEntries = [];    // 저장 전까지의 임시 셋리스트 (곡 이름 배열)

    // 박 진행 인디케이터 상태 (테마와 무관하게 공유합니다)
    let beatDir = 1;         // 이번 박의 진행 방향 (+1: 왼→오, -1: 오→왼). 박마다 뒤집습니다.
    let beatAnchor = 0;      // 이번 박이 울리는 시각 (AudioContext 시계)
    let beatDur = 0.6;       // 한 박 길이(초)
    let indicatorRafId = null;
    let popTimer = null;
    let indicatorTheme = 'sweep';

    const INDICATOR_STORAGE_KEY = 'guitarblitz.metronomeIndicator';
    const SOUND_STORAGE_KEY = 'guitarblitz.metronomeSound';
    const SOUND_MODES = ['click', 'voice'];
    const NEEDLE_SWING_DEG = 28;
    const BEATS_MIN = 2;     // 설정 카드의 met-beats 옵션 범위와 같아야 합니다.
    const BEATS_MAX = 7;
    const SECTION_MAX_MEASURES = 99;

    const BEAT_STATE_LABEL = { accent: '강조', normal: '보통', mute: '음소거' };

    // 구간 안내 버튼의 3단계 표시. 순환 순서는 엔진의 SECTION_GUIDE_LEVELS 를 따릅니다.
    const GUIDE_LOOK = {
        count: { icon: 'fa-solid fa-bullhorn', label: '이름 + 카운트' },
        name: { icon: 'fa-solid fa-comment', label: '이름만' },
        off: { icon: 'fa-solid fa-volume-xmark', label: '끔' }
    };

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
            Metronome.onSectionChange = () => renderSongStatus();
            Metronome.onSongEnd = () => setSongMessage('곡을 끝까지 재생했습니다.');

            indicatorTheme = loadIndicatorTheme();
            restoreSoundMode();

            bindTransport();
            bindSlideControl();
            bindBpmSteps();
            bindSettings();
            bindTap();
            bindPresets();
            bindSong();
            bindSetlist();
            bindKeyboard();

            renderThemeButtons();
            applyIndicatorTheme();
            renderGuideButton();

            this.render();
            this.renderPresets();
            renderSongSelect();
            renderSetlistSelect();
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
            if (Metronome.isPlaying) {
                startIndicatorLoop();
            } else {
                stopIndicatorLoop();
                cancelAnnounce();   // 정지(곡 끝 포함)하면 남은 구간 안내를 끊습니다
            }

            renderSongStatus();
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

        flashBeat({ beat, isBeat, isDownbeat, time }) {
            if (!isBeat) return;   // 쪼갠 박에서는 점을 움직이지 않습니다.

            // 마디 번호는 마디가 실제로 들리기 시작할 때만 갱신합니다
            // (엔진은 마디의 마지막 박을 예약하는 시점에 이미 다음 마디로 넘어가 있습니다).
            if (isDownbeat) renderSongStatus();

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

    /* --- 사운드 종류 (클릭 / 보이스 카운트) --------------------------- */

    /** 저장된 선택만 되살립니다. 파일은 첫 사용 시점(선택 변경 / 재생)에 받습니다. */
    function restoreSoundMode() {
        let saved = 'click';
        try {
            const raw = localStorage.getItem(SOUND_STORAGE_KEY);
            if (SOUND_MODES.includes(raw)) saved = raw;
        } catch (e) { /* 저장소 접근 불가 */ }

        Metronome.setSoundMode(saved);
        $('met-sound').value = saved;
    }

    /**
     * 보이스 샘플을 준비하고 상태 문구를 갱신합니다.
     * 이미 받아둔 경우 promise 가 즉시 풀려 "로드 중" 이 화면에 남지 않습니다.
     */
    function requestVoices() {
        setSoundMessage('음성 로드 중...');

        Metronome.ensureVoices().then(ok => {
            // 문구는 한 줄(모바일 154px)에 들어가야 합니다 — 길어지면 아래 즐겨찾기를 밀어냅니다.
            setSoundMessage(ok ? '' : '음성 로드 실패 · 클릭으로 전환');
            // 실패하면 엔진이 클릭으로 되돌리므로 select 도 따라갑니다.
            $('met-sound').value = Metronome.soundMode;
        });
    }

    function setSoundMessage(message) {
        $('met-sound-msg').innerText = message;
    }

    /* --- 재생 -------------------------------------------------------- */
    function bindTransport() {
        $('met-toggle').addEventListener('click', () => {
            // 여기가 샘플을 받을 첫 사용자 제스처입니다. 가이드 카운트도 같은 숫자 샘플을 쓰므로,
            // 카운트인 마디부터 제때 들리도록 미리 받아둡니다 (조용히 — 사운드 선택과 무관하므로).
            if (!Metronome.isPlaying) {
                if (Metronome.soundMode === 'voice') requestVoices();
                else if (Metronome.song && Metronome.sectionGuide === 'count') Metronome.ensureVoices();
            }
            Metronome.toggle();
        });
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

        // 비트 점 행은 카드 안(=드래그 표면)에 있습니다. 점이나 ±를 누르다 손끝이
        // 몇 px 흔들려도 BPM 이 바뀌지 않게 여기서는 드래그를 시작하지 않습니다.
        // pointerdown 만 막으므로 click(점 순환 / 박 수 조절)은 그대로 동작합니다.
        $('met-beat-row').addEventListener('pointerdown', (e) => e.stopPropagation());
    }

    /**
     * BPM 숫자 옆 ±1 화살표. 한 번 누르면 1, 누르고 있으면 400ms 뒤부터 80ms 간격으로 반복합니다.
     * 첫 1은 pointerdown 에서 바로 반영하고(손끝 반응), 뒤따라오는 click 은 건너뜁니다.
     * click 경로를 남겨 두는 이유는 키보드(Enter/Space)로도 눌러야 하기 때문입니다.
     */
    function bindBpmSteps() {
        [['met-bpm-minus', -1], ['met-bpm-plus', 1]].forEach(([id, delta]) => {
            const btn = $(id);
            let holdTimer = null;
            let repeatTimer = null;
            let byPointer = false;

            btn.addEventListener('pointerdown', () => {
                byPointer = true;
                Metronome.nudgeBpm(delta);
                holdTimer = setTimeout(() => {
                    repeatTimer = setInterval(() => Metronome.nudgeBpm(delta), 80);
                }, 400);
            });

            btn.addEventListener('click', () => {
                if (!byPointer) Metronome.nudgeBpm(delta);
                byPointer = false;
            });

            const release = () => {
                clearTimeout(holdTimer);
                clearInterval(repeatTimer);
            };
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, release));
        });
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

        $('met-sound').addEventListener('change', (e) => {
            const mode = e.target.value;
            Metronome.setSoundMode(mode);

            try {
                localStorage.setItem(SOUND_STORAGE_KEY, Metronome.soundMode);
            } catch (err) {
                console.warn('[Metronome] 사운드 설정 저장에 실패했습니다.', err);
            }

            if (mode === 'voice') requestVoices();
            else setSoundMessage('');
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

    /* --- 곡 모드 ------------------------------------------------------ */
    function bindSong() {
        $('met-song-toggle').addEventListener('click', () => setSongMode(!songMode));

        $('met-song-select').addEventListener('change', (e) => {
            songIdx = parseInt(e.target.value, 10) || 0;
            applySelectedSong();
        });

        $('met-song-loop').addEventListener('click', () => {
            Metronome.setSongLoop(!Metronome.songLoop);
            $('met-song-loop').setAttribute('aria-pressed', String(Metronome.songLoop));
        });

        // 비트 점과 같은 탭 순환입니다 (아이콘 하나로 3단계 — 한 화면 폭 예산 0).
        $('met-song-announce').addEventListener('click', () => {
            const next = (SECTION_GUIDE_LEVELS.indexOf(Metronome.sectionGuide) + 1) % SECTION_GUIDE_LEVELS.length;
            Metronome.setSectionGuide(SECTION_GUIDE_LEVELS[next]);
            renderGuideButton();

            if (Metronome.sectionGuide === 'off') cancelAnnounce();
        });

        $('met-song-countin').addEventListener('click', () => {
            Metronome.setSongCountIn(!Metronome.songCountIn);
            $('met-song-countin').setAttribute('aria-pressed', String(Metronome.songCountIn));
        });

        $('met-song-new').addEventListener('click', () => openSongModal(-1));
        $('met-song-edit').addEventListener('click', () => openSongModal(songIdx));

        $('met-song-delete').addEventListener('click', () => {
            const list = Metronome.songs.list();
            if (!list.length) return;

            const removed = list[songIdx].name;
            Metronome.songs.remove(songIdx);
            songIdx = 0;
            renderSongSelect();
            applySelectedSong();
            setSongMessage(`"${removed}" 을 삭제했습니다.`);
        });

        $('met-song-add-section').addEventListener('click', () => {
            editSections.push({ name: '', measures: 4, bpm: null, beatsPerMeasure: null });
            renderSections();
        });

        $('met-song-save').addEventListener('click', saveSong);
        $('met-song-cancel').addEventListener('click', closeSongModal);
    }

    /** 프리셋 블록과 곡 블록은 같은 자리를 번갈아 씁니다 (한 화면 높이 예산 공유). */
    function setSongMode(on) {
        songMode = on;

        $('met-preset-block').classList.toggle('hidden', on);
        $('met-song-block').classList.toggle('hidden', !on);
        $('btn-met-save-preset').classList.toggle('hidden', on);
        $('met-song-mode').classList.toggle('hidden', !on);
        $('met-song-toggle').setAttribute('aria-pressed', String(on));
        $('met-right-title').innerText = on ? '곡 모드' : '즐겨찾는 템포';
        $('met-right-icon').className = on
            ? 'fa-solid fa-list-ol text-amber-400'
            : 'fa-solid fa-star text-amber-400';

        // getVoices() 는 첫 호출 뒤에야 비동기로 채워집니다. 사용자 정의 구간 이름을
        // 합성 음성으로 읽을 때 목소리를 고를 수 있도록 곡 모드에 들어올 때 미리 깨워둡니다.
        if (on && window.speechSynthesis) speechSynthesis.getVoices();

        // 지금 하위 모드가 가리키는 곡으로 다시 맞춥니다 (연주 모드면 끊긴 참조 표시도 갱신).
        if (on) setSongSubMode(songSubMode);
        else applySelectedSong();
    }

    /**
     * 지금 모드가 가리키는 곡을 엔진에 겁니다 — 구간 모드는 met-song-select 의 곡,
     * 연주 모드는 셋리스트에서 고른 곡. 두 모드 모두 같은 구간 시퀀스로 재생됩니다.
     * 걸 곡이 없거나(곡 모드 OFF / 저장된 곡 없음 / 참조 끊김) 하면 곡을 떼어
     * 기존 메트로놈 동작으로 돌아갑니다 (재생 중이었다면 그 템포로 계속 울립니다).
     */
    function applySelectedSong() {
        const song = songMode ? currentSong() : null;

        if (!song) {
            Metronome.clearSong();
            return;
        }

        Metronome.setSong(song);
        // 연주 모드에서는 고르는 즉시 화면 템포까지 맞춥니다 (라이브에서 다음 곡을 눈으로 확인).
        // 구간 모드는 기존처럼 시작할 때 첫 구간이 걸립니다.
        if (songSubMode === 'setlist') applyFirstSection(song);
    }

    /** 지금 모드가 가리키는 곡. 없으면 null. */
    function currentSong() {
        const list = Metronome.songs.list();

        if (songSubMode !== 'setlist') return list[Math.min(songIdx, list.length - 1)] || null;

        const name = Metronome.setlist.list()[setlistIdx];
        return list.find(song => song.name === name) || null;
    }

    /** 첫 구간의 템포·박자를 미리 걸어 둡니다. 비어 있는 값은 지금 설정을 유지합니다. */
    function applyFirstSection(song) {
        const first = song.sections[0];
        if (!first) return;

        if (first.bpm) Metronome.setBpm(first.bpm);
        if (first.beatsPerMeasure) setBeats(first.beatsPerMeasure);
    }

    function renderSongSelect() {
        const select = $('met-song-select');
        const list = Metronome.songs.list();
        select.innerHTML = '';

        list.forEach((song, i) => select.appendChild(new Option(song.name, String(i))));

        if (!list.length) {
            select.appendChild(new Option('저장된 곡 없음', ''));
        } else {
            songIdx = Math.min(songIdx, list.length - 1);
            select.value = String(songIdx);
        }

        select.disabled = !list.length;
        $('met-song-edit').disabled = !list.length;
        $('met-song-delete').disabled = !list.length;
    }

    /** 인디케이터 박스 좌상단의 "구간 · 마디/전체" 오버레이. */
    function renderSongStatus() {
        const status = Metronome.isPlaying ? Metronome.songStatus() : null;

        $('met-song-status').classList.toggle('hidden', !status);
        if (status) {
            $('met-song-status').innerText = status.countIn
                ? '준비...'
                : `${status.name} · ${status.measure}/${status.measures}`;
        }
    }

    /**
     * 구간 안내 버튼. 값이 3개라 aria-pressed 로는 표현할 수 없어 상태를 라벨에 담고,
     * 켜짐/꺼짐만 색으로 보입니다 (단계 구분은 아이콘).
     */
    function renderGuideButton() {
        const btn = $('met-song-announce');
        const { icon, label } = GUIDE_LOOK[Metronome.sectionGuide];

        btn.firstElementChild.className = icon;
        btn.title = `구간 안내: ${label}`;
        btn.setAttribute('aria-label', `구간 안내: ${label} — 탭하여 변경`);
        btn.classList.toggle('met-song-on', Metronome.sectionGuide !== 'off');
    }

    function cancelAnnounce() {
        if (window.speechSynthesis) speechSynthesis.cancel();
    }

    function setSongMessage(message) {
        $('met-song-msg').innerText = message;
    }

    /* --- 곡 편집 모달 -------------------------------------------------- */
    /** @param {number} index 편집할 곡. -1 이면 현재 템포로 채운 새 곡. */
    function openSongModal(index) {
        const song = index >= 0 ? Metronome.songs.list()[index] : null;

        editIdx = song ? index : -1;
        editSections = song
            ? song.sections.map(section => ({ ...section }))
            : [{ name: '인트로', measures: 4, bpm: Metronome.bpm, beatsPerMeasure: Metronome.beatsPerMeasure }];

        $('met-song-name').value = song ? song.name : '';
        setModalMessage('');
        renderSections();

        $('met-song-modal').classList.remove('hidden');
        $('met-song-modal').classList.add('flex');
        $('met-song-name').focus();
    }

    function closeSongModal() {
        $('met-song-modal').classList.add('hidden');
        $('met-song-modal').classList.remove('flex');
    }

    /** 구간 행을 그립니다. 입력은 editSections 에 그때그때 쓰고, 검증은 저장할 때 합니다. */
    function renderSections() {
        const wrap = $('met-song-sections');
        wrap.innerHTML = '';

        editSections.forEach((section, i) => {
            const row = document.createElement('div');
            row.className = 'met-song-row';

            const name = document.createElement('input');
            name.type = 'text';
            name.maxLength = 12;
            name.value = section.name || '';
            name.placeholder = `${i + 1}구간`;
            name.setAttribute('aria-label', `${i + 1}번째 구간 이름`);
            name.addEventListener('input', () => { section.name = name.value; });

            const measures = numberField(section.measures, 1, SECTION_MAX_MEASURES, '마디 수', '',
                (value) => { section.measures = value; });

            // 비워두면 직전 구간의 값을 그대로 씁니다 — placeholder 로 그 뜻을 보입니다.
            const bpm = numberField(section.bpm, METRONOME_CONFIG.minBpm, METRONOME_CONFIG.maxBpm, 'BPM (비우면 유지)', '유지',
                (value) => { section.bpm = value; });

            const beats = beatsSelect(section.beatsPerMeasure, (value) => { section.beatsPerMeasure = value; });

            const tools = document.createElement('div');
            tools.className = 'flex items-center justify-end';
            tools.appendChild(iconButton('▲', '위로 이동', () => moveRow(editSections, i, -1) && renderSections()));
            tools.appendChild(iconButton('▼', '아래로 이동', () => moveRow(editSections, i, 1) && renderSections()));

            const del = iconButton('✕', '구간 삭제', () => {
                editSections.splice(i, 1);
                renderSections();
            });
            del.classList.add('met-song-del');
            tools.appendChild(del);

            [name, measures, bpm, beats, tools].forEach(el => row.appendChild(el));
            wrap.appendChild(row);
        });
    }

    /**
     * "유지"(빈 값) + 2~7박 select. 구간 행과 셋리스트 행이 같이 씁니다.
     * @param {number|null} value 현재 값. 비어 있으면 "유지"
     * @param {(value:number|null)=>void} onChange
     */
    function beatsSelect(value, onChange) {
        const el = document.createElement('select');
        el.setAttribute('aria-label', '박 수 (비우면 유지)');
        el.appendChild(new Option('유지', ''));

        for (let b = BEATS_MIN; b <= BEATS_MAX; b++) {
            el.appendChild(new Option(`${b}박`, String(b)));
        }

        el.value = value ? String(value) : '';
        el.addEventListener('change', () => onChange(el.value ? parseInt(el.value, 10) : null));
        return el;
    }

    /** 빈 칸을 null 로 넘기는 숫자 입력. 범위는 저장할 때 다시 자릅니다. */
    function numberField(value, min, max, label, placeholder, onInput) {
        const el = document.createElement('input');
        el.type = 'number';
        el.min = String(min);
        el.max = String(max);
        el.value = value == null ? '' : String(value);
        el.placeholder = placeholder;
        el.setAttribute('aria-label', label);
        el.addEventListener('input', () => {
            onInput(el.value === '' ? null : parseInt(el.value, 10));
        });
        return el;
    }

    function iconButton(glyph, label, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'met-song-move';
        btn.innerText = glyph;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * 배열에서 항목을 한 칸 옮깁니다 (구간 목록과 셋리스트가 같이 씁니다).
     * @returns {boolean} 옮겼는지 — 끝에서 더 못 가면 false 라 다시 그리지 않습니다.
     */
    function moveRow(list, from, delta) {
        const to = from + delta;
        if (to < 0 || to >= list.length) return false;

        const swap = list[to];
        list[to] = list[from];
        list[from] = swap;
        return true;
    }

    function saveSong() {
        const name = $('met-song-name').value.trim();

        if (!name) return setModalMessage('곡 이름을 입력하세요.');
        if (!editSections.length) return setModalMessage('구간을 하나 이상 추가하세요.');

        const song = {
            name,
            sections: editSections.map((section, i) => ({
                name: (section.name || '').trim() || `${i + 1}구간`,
                measures: Math.max(1, Math.min(SECTION_MAX_MEASURES, Math.round(section.measures) || 1)),
                // null = 직전 구간 설정 유지
                bpm: section.bpm ? clampBpm(Math.round(section.bpm)) : null,
                beatsPerMeasure: section.beatsPerMeasure
                    ? Math.max(BEATS_MIN, Math.min(BEATS_MAX, Math.round(section.beatsPerMeasure)))
                    : null
            }))
        };

        const res = editIdx >= 0
            ? Metronome.songs.update(editIdx, song)
            : Metronome.songs.add(song);

        if (!res.ok) return setModalMessage(res.message);

        if (editIdx < 0) songIdx = Metronome.songs.list().length - 1;

        closeSongModal();
        renderSongSelect();
        applySelectedSong();
        setSongMessage(`"${song.name}" 을 저장했습니다.`);
    }

    function setModalMessage(message) {
        $('met-song-modal-msg').innerText = message;
    }

    /* --- 연주 모드 (셋리스트) ------------------------------------------ */
    function bindSetlist() {
        $('met-song-mode-section').addEventListener('click', () => setSongSubMode('section'));
        $('met-song-mode-setlist').addEventListener('click', () => setSongSubMode('setlist'));

        $('met-setlist-select').addEventListener('change', (e) => {
            setlistIdx = parseInt(e.target.value, 10) || 0;
            applySetlistEntry();
        });

        $('met-setlist-prev').addEventListener('click', () => stepSetlist(-1));
        $('met-setlist-next').addEventListener('click', () => stepSetlist(1));

        $('met-setlist-edit').addEventListener('click', openSetlistModal);
        $('met-setlist-add').addEventListener('click', addEditEntry);
        $('met-setlist-save').addEventListener('click', saveSetlist);
        $('met-setlist-cancel').addEventListener('click', closeSetlistModal);
    }

    /** 구간 모드와 연주 모드는 같은 자리를 번갈아 씁니다 (한 화면 높이 예산 공유). */
    function setSongSubMode(mode) {
        songSubMode = mode === 'setlist' ? 'setlist' : 'section';
        const setlist = songSubMode === 'setlist';

        $('met-song-section-row').classList.toggle('hidden', setlist);
        $('met-setlist-row').classList.toggle('hidden', !setlist);
        $('met-song-mode-section').setAttribute('aria-pressed', String(!setlist));
        $('met-song-mode-setlist').setAttribute('aria-pressed', String(setlist));

        // 두 모드 모두 곡을 걸어 재생하므로, 지금 모드가 가리키는 곡으로 갈아끼웁니다.
        // 연주 모드로 들어올 때 다시 그리는 이유: 그동안 구간 모드에서 곡을 지웠거나
        // 이름을 바꿨으면 셋리스트 참조가 끊겨 "(없음)" 표시가 필요합니다.
        if (setlist) {
            renderSetlistSelect();
            applySetlistEntry();
        } else {
            applySelectedSong();
            setSongMessage('');
        }
    }

    function renderSetlistSelect() {
        const select = $('met-setlist-select');
        const names = Metronome.setlist.list();
        const songs = Metronome.songs.list();
        select.innerHTML = '';

        names.forEach((name, i) => select.appendChild(
            new Option(songs.some(song => song.name === name) ? name : `${name} (없음)`, String(i))
        ));

        if (!names.length) {
            select.appendChild(new Option('셋리스트가 비어 있음', ''));
        } else {
            setlistIdx = Math.min(setlistIdx, names.length - 1);
            select.value = String(setlistIdx);
        }

        select.disabled = !names.length;
        // 편집 버튼은 항상 살려 둡니다 — 빈 셋리스트를 채우는 유일한 입구입니다.
        ['met-setlist-prev', 'met-setlist-next'].forEach(id => { $(id).disabled = !names.length; });
    }

    /** 고른 셋리스트 항목의 곡을 겁니다. 참조가 끊긴 이름이면 안내만 남깁니다. */
    function applySetlistEntry() {
        applySelectedSong();

        const name = Metronome.setlist.list()[setlistIdx];
        setSongMessage(!name || Metronome.song ? '' : `"${name}" 은 저장된 곡에 없습니다.`);
    }

    /** 이전/다음 곡. 리스트 끝에서는 반대쪽 끝으로 순환합니다. */
    function stepSetlist(delta) {
        const length = Metronome.setlist.list().length;
        if (!length) return;

        setlistIdx = (setlistIdx + delta + length) % length;
        $('met-setlist-select').value = String(setlistIdx);
        applySetlistEntry();
    }

    /* --- 셋리스트 편집 모달 -------------------------------------------- */
    function openSetlistModal() {
        editEntries = Metronome.setlist.list().slice();

        setSetlistMessage(Metronome.songs.list().length ? '' : '먼저 구간 모드에서 곡을 만들어주세요.');
        renderSetlistRows();

        $('met-setlist-modal').classList.remove('hidden');
        $('met-setlist-modal').classList.add('flex');
    }

    function closeSetlistModal() {
        $('met-setlist-modal').classList.add('hidden');
        $('met-setlist-modal').classList.remove('flex');
    }

    function addEditEntry() {
        const songs = Metronome.songs.list();

        if (!songs.length) return setSetlistMessage('먼저 구간 모드에서 곡을 만들어주세요.');
        if (editEntries.length >= METRONOME_CONFIG.maxSetlist) {
            return setSetlistMessage(`셋리스트는 최대 ${METRONOME_CONFIG.maxSetlist}곡까지 저장됩니다.`);
        }

        editEntries.push(songs[0].name);
        renderSetlistRows();
    }

    /** 곡 행을 그립니다. 고른 값은 editEntries 에 그때그때 쓰고, 저장할 때 통째로 씁니다. */
    function renderSetlistRows() {
        const wrap = $('met-setlist-rows');
        const songs = Metronome.songs.list();
        wrap.innerHTML = '';

        $('met-setlist-add').disabled = !songs.length;

        if (!editEntries.length) {
            const empty = document.createElement('p');
            empty.className = 'text-[11px] text-zinc-500 py-2';
            empty.innerText = songs.length
                ? '아래 "곡 추가" 로 연주할 순서를 만드세요.'
                : '저장된 곡이 없습니다. 구간 모드에서 곡을 먼저 만들어주세요.';
            wrap.appendChild(empty);
            return;
        }

        editEntries.forEach((name, i) => {
            const row = document.createElement('div');
            row.className = 'met-song-row met-setlist-row';

            const pick = document.createElement('select');
            pick.setAttribute('aria-label', `${i + 1}번째 곡`);
            songs.forEach(song => pick.appendChild(new Option(song.name, song.name)));

            // 지워진 곡을 가리키는 항목도 그대로 남겨 둡니다 (모르는 사이에 다른 곡으로 바뀌면 안 되므로).
            if (!songs.some(song => song.name === name)) pick.appendChild(new Option(`${name} (없음)`, name));

            pick.value = name;
            pick.addEventListener('change', () => { editEntries[i] = pick.value; });

            const tools = document.createElement('div');
            tools.className = 'flex items-center justify-end';
            tools.appendChild(iconButton('▲', '위로 이동', () => moveRow(editEntries, i, -1) && renderSetlistRows()));
            tools.appendChild(iconButton('▼', '아래로 이동', () => moveRow(editEntries, i, 1) && renderSetlistRows()));

            const del = iconButton('✕', '셋리스트에서 빼기', () => {
                editEntries.splice(i, 1);
                renderSetlistRows();
            });
            del.classList.add('met-song-del');
            tools.appendChild(del);

            [pick, tools].forEach(el => row.appendChild(el));
            wrap.appendChild(row);
        });
    }

    /** 빈 셋리스트도 그대로 저장합니다 (전부 빼는 경우). 상한은 _write 가 한 번 더 자릅니다. */
    function saveSetlist() {
        Metronome.setlist._write(editEntries);

        closeSetlistModal();
        renderSetlistSelect();
        applySetlistEntry();
        setSongMessage(`셋리스트 ${Metronome.setlist.list().length}곡을 저장했습니다.`);
    }

    function setSetlistMessage(message) {
        $('met-setlist-modal-msg').innerText = message;
    }

    /* --- 키보드 단축키 ------------------------------------------------ */
    function bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            // 메트로놈 탭이 열려 있고, 입력 요소에 포커스가 없을 때만 반응합니다.
            if ($('view-metronome').classList.contains('hidden')) return;
            // 편집 모달이 열려 있으면 Space 가 재생을 토글해 편집을 방해합니다.
            if (['met-song-modal', 'met-setlist-modal'].some(id => !$(id).classList.contains('hidden'))) return;

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
