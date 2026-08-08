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

    const DOT_BASE = 'rounded-full transition-all duration-75';
    const TOGGLE_ON = 'px-3 py-2 rounded-lg text-xs font-bold border border-amber-500 bg-amber-500/10 text-amber-400 transition';
    const TOGGLE_OFF = 'px-3 py-2 rounded-lg text-xs font-bold border border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600 transition';

    return {
        init() {
            Metronome.onChange = () => this.render();
            Metronome.onBeat = (beat) => this.flashBeat(beat);

            bindTransport();
            bindSlideControl();
            bindSettings();
            bindTap();
            bindPresets();
            bindKeyboard();

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

            $('met-accent').className = Metronome.accentFirst ? TOGGLE_ON : TOGGLE_OFF;
            $('met-accent-state').innerText = Metronome.accentFirst ? '켬' : '끔';

            this.renderBeatDots();
        },

        renderBeatDots() {
            const wrap = $('met-beat-dots');
            wrap.innerHTML = '';

            for (let i = 0; i < Metronome.beatsPerMeasure; i++) {
                const dot = document.createElement('div');
                dot.className = `${DOT_BASE} ${i === 0 ? 'w-4 h-4' : 'w-3 h-3'} bg-zinc-700`;
                dot.dataset.beat = i;
                wrap.appendChild(dot);
            }
        },

        flashBeat({ beat, isBeat, isDownbeat }) {
            if (!isBeat) return;   // 쪼갠 박에서는 점을 움직이지 않습니다.

            const dots = $('met-beat-dots').children;
            for (let i = 0; i < dots.length; i++) {
                const active = i === beat;
                const size = i === 0 ? 'w-4 h-4' : 'w-3 h-3';
                let color = 'bg-zinc-700';
                if (active) color = isDownbeat ? 'bg-amber-400 scale-150' : 'bg-emerald-400 scale-125';
                dots[i].className = `${DOT_BASE} ${size} ${color}`;
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
                    Metronome.setBeatsPerMeasure(preset.beatsPerMeasure);
                    Metronome.setSubdivision(preset.subdivision || 1);
                    $('met-beats').value = String(preset.beatsPerMeasure);
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

    /* --- 재생 / 미세 조정 -------------------------------------------- */
    function bindTransport() {
        $('met-toggle').addEventListener('click', () => Metronome.toggle());
        $('met-minus').addEventListener('click', () => Metronome.nudgeBpm(-1));
        $('met-plus').addEventListener('click', () => Metronome.nudgeBpm(1));
        $('met-minus-10').addEventListener('click', () => Metronome.nudgeBpm(-10));
        $('met-plus-10').addEventListener('click', () => Metronome.nudgeBpm(10));
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

    /* --- 박자표 / 쪼갬 / 강박 / 볼륨 --------------------------------- */
    function bindSettings() {
        $('met-beats').addEventListener('change', (e) => {
            Metronome.setBeatsPerMeasure(parseInt(e.target.value, 10));
        });

        $('met-subdivision').addEventListener('change', (e) => {
            Metronome.setSubdivision(parseInt(e.target.value, 10));
        });

        $('met-accent').addEventListener('click', () => {
            Metronome.setAccent(!Metronome.accentFirst);
        });

        $('met-volume').addEventListener('input', (e) => {
            Metronome.setVolume(e.target.value);
            $('met-volume-label').innerText = `${Math.round(Metronome.volume * 100)}%`;
        });
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
