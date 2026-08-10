/* ===================================================================
   메트로놈 엔진 — 소리 스케줄링과 템포 계산만 담당합니다 (DOM 미접근).
   화면 갱신은 onBeat / onChange 콜백으로 바깥에 넘깁니다.

   타이밍은 setInterval 이 아니라 AudioContext 시계 기준으로 예약합니다.
   setInterval 은 탭 전환이나 GC 로 수십 ms 씩 밀리는데, 메트로놈에서는
   그 정도 흔들림이 바로 들리기 때문입니다.
   =================================================================== */

const PRESETS_STORAGE_KEY = 'guitarblitz.metronomePresets';
const VISUAL_QUEUE_LIMIT = 64;

const Metronome = {
    bpm: METRONOME_CONFIG.defaultBpm,
    beatsPerMeasure: 4,
    subdivision: 1,        // 1=4분, 2=8분, 3=셋잇단, 4=16분
    accentFirst: true,
    volume: 0.7,
    isPlaying: false,

    onBeat: null,          // ({ beat, tick, isDownbeat, isBeat }) => void
    onChange: null,        // () => void  (bpm/박자 등이 바뀔 때)

    _nextNoteTime: 0,
    _tick: 0,              // 마디 안에서의 subdivision 인덱스
    _schedulerId: null,
    _visualQueue: [],
    _rafId: null,
    _taps: [],

    /* --- 설정 ------------------------------------------------------ */
    setBpm(value) {
        const next = clampBpm(Math.round(value));
        if (next === this.bpm) return this.bpm;
        this.bpm = next;
        this._emitChange();
        return this.bpm;
    },

    nudgeBpm(delta) {
        return this.setBpm(this.bpm + delta);
    },

    setBeatsPerMeasure(count) {
        this.beatsPerMeasure = Math.max(1, Math.min(12, Math.round(count)));
        this._tick = 0;
        this._emitChange();
    },

    setSubdivision(value) {
        this.subdivision = Math.max(1, Math.min(4, Math.round(value)));
        this._tick = 0;
        this._emitChange();
    },

    setAccent(enabled) {
        this.accentFirst = Boolean(enabled);
        this._emitChange();
    },

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, parseFloat(value)));
        this._emitChange();
    },

    /* --- 재생 ------------------------------------------------------ */
    toggle() {
        this.isPlaying ? this.stop() : this.start();
    },

    start() {
        if (this.isPlaying) return;

        const ctx = AudioEngine.context();
        this.isPlaying = true;
        this._tick = 0;
        this._visualQueue = [];
        // 첫 박이 잘리지 않도록 아주 짧은 여유를 둡니다.
        this._nextNoteTime = ctx.currentTime + 0.06;

        this._schedulerId = setInterval(() => this._schedule(), METRONOME_CONFIG.lookaheadMs);
        this._drawLoop();
        this._emitChange();
    },

    stop() {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        clearInterval(this._schedulerId);
        this._schedulerId = null;

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._visualQueue = [];
        this._emitChange();
    },

    /* --- 탭 템포 --------------------------------------------------- */
    /**
     * 두드린 간격의 이동 평균으로 BPM 을 갱신합니다.
     * 재생 중이라면 다음 박을 탭 시점 기준으로 다시 맞춰(위상 동기화),
     * 연주하면서 두드리는 대로 메트로놈이 따라오게 합니다.
     * @returns {{bpm:number, samples:number}}
     */
    tap() {
        const now = performance.now();
        const last = this._taps[this._taps.length - 1];

        // 한참 쉬었다가 다시 두드리면 이전 입력은 버립니다.
        if (last && now - last > METRONOME_CONFIG.tapTimeoutMs) {
            this._taps = [];
        }

        this._taps.push(now);
        if (this._taps.length > METRONOME_CONFIG.tapMaxSamples + 1) {
            this._taps.shift();
        }

        if (this._taps.length < METRONOME_CONFIG.tapMinSamples) {
            return { bpm: this.bpm, samples: this._taps.length };
        }

        const intervals = [];
        for (let i = 1; i < this._taps.length; i++) {
            intervals.push(this._taps[i] - this._taps[i - 1]);
        }
        const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;

        this.setBpm(60000 / avgMs);

        if (this.isPlaying) {
            // 탭한 지점을 마디 첫 박으로 삼고, 다음 박을 한 박 뒤에 배치합니다.
            const ctx = AudioEngine.context();
            this._tick = 0;
            this._visualQueue = [];
            this._nextNoteTime = ctx.currentTime + (avgMs / 1000);
        }

        return { bpm: this.bpm, samples: intervals.length };
    },

    resetTap() {
        this._taps = [];
    },

    /* --- 즐겨찾기 (localStorage) ----------------------------------- */
    presets: {
        list() {
            try {
                const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        },

        /** @returns {{ok:boolean, message?:string}} */
        add(entry) {
            const all = this.list();

            if (all.some(p => p.bpm === entry.bpm && p.beatsPerMeasure === entry.beatsPerMeasure)) {
                return { ok: false, message: '이미 저장된 설정입니다.' };
            }
            if (all.length >= METRONOME_CONFIG.maxPresets) {
                return { ok: false, message: `즐겨찾기는 최대 ${METRONOME_CONFIG.maxPresets}개까지 저장됩니다.` };
            }

            all.push(entry);
            all.sort((a, b) => a.bpm - b.bpm);
            this._write(all);
            return { ok: true };
        },

        remove(bpm, beatsPerMeasure) {
            this._write(this.list().filter(p => !(p.bpm === bpm && p.beatsPerMeasure === beatsPerMeasure)));
        },

        _write(list) {
            try {
                localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(list));
            } catch (e) {
                console.warn('[Metronome] 즐겨찾기 저장에 실패했습니다.', e);
            }
        }
    },

    /* --- 내부: 스케줄링 -------------------------------------------- */
    _schedule() {
        const ctx = AudioEngine.context();
        const horizon = ctx.currentTime + METRONOME_CONFIG.scheduleAheadSec;

        while (this._nextNoteTime < horizon) {
            this._scheduleClick(this._tick, this._nextNoteTime);
            this._visualQueue.push({ tick: this._tick, time: this._nextNoteTime });
            this._advance();
        }

        // 브라우저 탭이 백그라운드로 가면 rAF 가 멈춰 큐가 소비되지 않습니다.
        // 그대로 두면 계속 쌓이므로 오래된 항목은 버립니다.
        if (this._visualQueue.length > VISUAL_QUEUE_LIMIT) {
            this._visualQueue.splice(0, this._visualQueue.length - VISUAL_QUEUE_LIMIT);
        }
    },

    _advance() {
        const secondsPerBeat = 60 / this.bpm;
        this._nextNoteTime += secondsPerBeat / this.subdivision;

        const ticksPerMeasure = this.beatsPerMeasure * this.subdivision;
        this._tick = (this._tick + 1) % ticksPerMeasure;
    },

    _scheduleClick(tick, time) {
        const ctx = AudioEngine.context();
        const isBeat = tick % this.subdivision === 0;
        const isDownbeat = tick === 0 && this.accentFirst;

        // 강박 → 약박 → 쪼갠 박 순으로 높이와 크기를 낮춥니다.
        let freq = 800, gainValue = 0.25;
        if (isDownbeat) {
            freq = 1600; gainValue = 1.0;
        } else if (isBeat) {
            freq = 1100; gainValue = 0.6;
        }

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, time);

        // 클릭음이 뭉개지지 않도록 아주 짧게 감쇠시킵니다.
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(gainValue * this.volume, time + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(time);
        osc.stop(time + 0.06);
    },

    /** 예약된 소리가 실제로 울리는 시점에 맞춰 화면을 갱신합니다. */
    _drawLoop() {
        const ctx = AudioEngine.context();

        const draw = () => {
            if (!this.isPlaying) return;

            // 이미 지나간 항목이 여러 개면 가장 최근 것만 반영합니다.
            // (탭 복귀 직후 밀린 박이 한꺼번에 깜빡이는 것을 막습니다)
            let latest = null;
            while (this._visualQueue.length && this._visualQueue[0].time <= ctx.currentTime) {
                latest = this._visualQueue.shift();
            }

            if (latest && this.onBeat) {
                this.onBeat({
                    tick: latest.tick,
                    beat: Math.floor(latest.tick / this.subdivision),
                    isBeat: latest.tick % this.subdivision === 0,
                    isDownbeat: latest.tick === 0
                });
            }

            this._rafId = requestAnimationFrame(draw);
        };

        draw();
    },

    _emitChange() {
        if (this.onChange) this.onChange();
    }
};

function clampBpm(value) {
    if (!isFinite(value)) return METRONOME_CONFIG.defaultBpm;
    return Math.max(METRONOME_CONFIG.minBpm, Math.min(METRONOME_CONFIG.maxBpm, value));
}

/** 템포 구간 이름. 연습할 때 감을 잡는 용도입니다. */
function tempoName(bpm) {
    if (bpm < 60) return 'Largo';
    if (bpm < 76) return 'Adagio';
    if (bpm < 108) return 'Andante';
    if (bpm < 120) return 'Moderato';
    if (bpm < 156) return 'Allegro';
    if (bpm < 176) return 'Vivace';
    return 'Presto';
}
