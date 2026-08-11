/* ===================================================================
   메트로놈 엔진 — 소리 스케줄링과 템포 계산만 담당합니다 (DOM 미접근).
   화면 갱신은 onBeat / onChange 콜백으로 바깥에 넘깁니다.

   타이밍은 setInterval 이 아니라 AudioContext 시계 기준으로 예약합니다.
   setInterval 은 탭 전환이나 GC 로 수십 ms 씩 밀리는데, 메트로놈에서는
   그 정도 흔들림이 바로 들리기 때문입니다.
   =================================================================== */

const PRESETS_STORAGE_KEY = 'guitarblitz.metronomePresets';
const SONGS_STORAGE_KEY = 'guitarblitz.metronomeSongs';
const SETLIST_STORAGE_KEY = 'guitarblitz.metronomeSetlist';
const VISUAL_QUEUE_LIMIT = 64;
const BEAT_STATE_ORDER = ['normal', 'accent', 'mute'];

// 보이스 카운트용 숫자 음성. 박 수 상한(설정 카드의 met-beats)이 7 이라 7개면 충분합니다.
const VOICE_SAMPLE_URLS = Array.from({ length: 7 }, (_, i) => `./assets/audio/count-${i + 1}.wav`);

// 구간 안내 음성. 흔히 쓰는 이름은 미리 녹음한 샘플로 읽고,
// 여기 없는 이름(사용자가 직접 붙인 이름)만 브라우저 음성 합성으로 넘깁니다.
const SECTION_SAMPLE_ALIASES = {
    'intro': 'intro', '인트로': 'intro',
    'verse': 'verse', '벌스': 'verse', '절': 'verse',
    'chorus': 'chorus', '코러스': 'chorus', '후렴': 'chorus',
    'bridge': 'bridge', '브릿지': 'bridge', '브리지': 'bridge',
    'outro': 'outro', '아웃트로': 'outro', '아웃로': 'outro',
    'solo': 'solo', '솔로': 'solo',
    'interlude': 'interlude', '간주': 'interlude',
    'prechorus': 'prechorus', '프리코러스': 'prechorus',
    'tag': 'tag', '태그': 'tag'
};
const SECTION_SAMPLE_KEYS = [...new Set(Object.values(SECTION_SAMPLE_ALIASES))];

// 합성 음성 폴백에서 고를 목소리. 브라우저마다 목록이 달라 이름 힌트로 걸러냅니다.
// 구간 이름에 한글이 있으면 ko, 없으면 en 을 씁니다 (녹음 샘플이 영어 발음이라 결이 맞습니다).
const VOICE_HINTS = {
    ko: ['SunHi', 'Heami', 'Yuna', 'Google 한국의'],
    en: ['Zira', 'Jenny', 'Aria', 'Michelle', 'Google US English']
};

const Metronome = {
    bpm: METRONOME_CONFIG.defaultBpm,
    beatsPerMeasure: 4,
    subdivision: 1,        // 1=4분, 2=8분, 3=셋잇단, 4=16분

    // 박별 상태: 'accent'(강조) | 'normal'(보통) | 'mute'(음소거).
    // 기본값은 마디 첫 박만 강조 (기존 "첫 박 강조 켬" 과 같은 소리).
    beatStates: ['accent', 'normal', 'normal', 'normal'],

    volume: 0.7,
    soundMode: 'click',    // 'click'=클릭음 | 'voice'=박 번호를 읽어주는 음성
    isPlaying: false,

    // 곡 모드. { name, sections: [{ name, measures, bpm?, beatsPerMeasure? }] }
    // 섹션의 bpm / beatsPerMeasure 가 비어 있으면(null) 직전 설정을 그대로 씁니다.
    song: null,
    songLoop: false,
    songCountIn: true,     // 곡 시작 전 마중물 한 마디

    onBeat: null,          // ({ beat, tick, isDownbeat, isBeat, time }) => void
                           //   time = 그 박이 울리도록 예약된 AudioContext 시각(초)
    onChange: null,        // () => void  (bpm/박자 등이 바뀔 때)
    onSectionChange: null, // (index, section) => void  (곡의 구간이 넘어갈 때)
    onSectionUpcoming: null, // (nextIdx, nextSection, time) => void
                           //   구간이 시작하기 한 마디 전. time = 그 마디의 첫 박이 울리는 시각
    onSongEnd: null,       // () => void  (루프가 꺼진 곡을 끝까지 재생했을 때)

    _nextNoteTime: 0,
    _tick: 0,              // 마디 안에서의 subdivision 인덱스
    _schedulerId: null,
    _visualQueue: [],
    _rafId: null,
    _taps: [],
    _voices: null,         // [{buffer, offset}] — 보이스 모드를 처음 쓸 때 채웁니다
    _voiceLoading: null,   // 진행 중인 로드 Promise (중복 요청 방지)
    _sectionSamples: null, // { key: {buffer, offset} } — 첫 구간 안내 때 채웁니다
    _sectionLoading: null,
    _songSectionIdx: 0,    // 지금 연주 중인 섹션
    _songMeasure: 0,       // 그 섹션에서 지난 마디 수
    _countIn: false,       // 카운트인 마디를 예약하는 동안만 true

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
        // 이미 지정한 강조/음소거는 그대로 두고, 늘어난 박만 보통으로 채웁니다.
        this.beatStates = Array.from(
            { length: this.beatsPerMeasure },
            (_, i) => this.beatStates[i] || 'normal'
        );
        this._tick = 0;
        this._emitChange();
    },

    /** 비트 점을 탭할 때마다 보통 → 강조 → 음소거 순으로 돌립니다. */
    cycleBeatState(index) {
        if (index < 0 || index >= this.beatsPerMeasure) return;

        const current = BEAT_STATE_ORDER.indexOf(this.beatStates[index]);
        this.beatStates[index] = BEAT_STATE_ORDER[(current + 1) % BEAT_STATE_ORDER.length];
        this._emitChange();
    },

    setSubdivision(value) {
        this.subdivision = Math.max(1, Math.min(4, Math.round(value)));
        this._tick = 0;
        this._emitChange();
    },

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, parseFloat(value)));
        this._emitChange();
    },

    /** @param {'click'|'voice'} mode 알 수 없는 값은 클릭으로 봅니다. */
    setSoundMode(mode) {
        this.soundMode = mode === 'voice' ? 'voice' : 'click';
        this._emitChange();
    },

    /**
     * 음성 샘플 7개를 한 번만 받아둡니다. 파일이 없거나 디코드가 안 되면
     * 클릭 모드로 되돌립니다 (샘플 없이 보이스 모드로 두면 조용해지므로).
     * 사용자 제스처 안에서 부르세요 — AudioContext 를 여기서 처음 만듭니다.
     * @returns {Promise<boolean>} 보이스로 소리 낼 준비가 되었는지
     */
    ensureVoices() {
        if (this._voices) return Promise.resolve(true);

        this._voiceLoading = this._voiceLoading
            || Promise.all(VOICE_SAMPLE_URLS.map(url => AudioEngine.loadSample(url)));

        return this._voiceLoading.then(voices => {
            this._voices = voices;
            return true;
        }).catch(err => {
            console.warn('[Metronome] 음성 샘플을 불러오지 못했습니다.', err);
            this._voiceLoading = null;   // 다음에 다시 시도할 수 있게 비웁니다
            this.setSoundMode('click');
            return false;
        });
    },

    /* --- 곡 모드 --------------------------------------------------- */
    /** @param {object|null} song null 이면 곡 없이(기존 동작) 돌아갑니다. */
    setSong(song) {
        this.song = song && song.sections && song.sections.length ? song : null;
        this._songSectionIdx = 0;
        this._songMeasure = 0;
        // 재생 중에 곡을 바꾸면 새 곡의 첫 구간 설정을 바로 반영합니다.
        if (this.isPlaying && this.song) this._applySection(0);
        this._emitChange();
    },

    clearSong() {
        this.setSong(null);
    },

    setSongLoop(on) {
        this.songLoop = !!on;
        this._emitChange();
    },

    setSongCountIn(on) {
        this.songCountIn = !!on;
        this._emitChange();
    },

    /**
     * 화면에 뿌릴 현재 구간 정보. 곡이 없으면 null.
     * 예약 시점 기준이므로 마디가 실제로 들리기 시작할 때(다운비트) 읽어야 숫자가 맞습니다.
     * @returns {{countIn:true}|{name:string, measure:number, measures:number}|null}
     */
    songStatus() {
        if (!this.song) return null;
        if (this._countIn) return { countIn: true };

        const section = this.song.sections[this._songSectionIdx];
        if (!section) return null;

        return { name: section.name, measure: this._songMeasure + 1, measures: section.measures };
    },

    /**
     * 구간 안내 샘플 8개를 한 번만 받아둡니다. 실패하면 null 을 돌려주고
     * 부르는 쪽이 음성 합성으로 대신 읽습니다.
     * @returns {Promise<Object<string,{buffer:AudioBuffer, offset:number}>|null>}
     */
    ensureSectionSamples() {
        if (this._sectionSamples) return Promise.resolve(this._sectionSamples);

        this._sectionLoading = this._sectionLoading || Promise.all(
            SECTION_SAMPLE_KEYS.map(key => AudioEngine.loadSample(`./assets/audio/section-${key}.wav`))
        );

        return this._sectionLoading.then(list => {
            this._sectionSamples = {};
            SECTION_SAMPLE_KEYS.forEach((key, i) => { this._sectionSamples[key] = list[i]; });
            return this._sectionSamples;
        }).catch(err => {
            console.warn('[Metronome] 구간 안내 샘플을 불러오지 못했습니다.', err);
            this._sectionLoading = null;   // 다음에 다시 시도할 수 있게 비웁니다
            return null;
        });
    },

    /**
     * 구간 이름을 소리로 알립니다. 흔한 이름은 녹음 샘플, 그 밖은 음성 합성입니다.
     * @param {string} name 구간 이름
     * @param {number} [time] 샘플을 들려줄 AudioContext 시각 (지나갔거나 없으면 즉시)
     */
    speakSection(name, time) {
        const key = sectionSampleKey(name);
        if (!key) return speakFallback(name);

        this.ensureSectionSamples().then(samples => {
            const sample = samples && samples[key];
            if (!sample) return speakFallback(name);   // 로드 실패 — 합성으로 대신합니다

            // 첫 안내는 여기서 파일을 받으므로 예약 시각이 이미 지났을 수 있습니다.
            const ctx = AudioEngine.context();
            this._playSample(sample, Math.max(time || 0, ctx.currentTime), METRONOME_CONFIG.sectionAnnounceGain);
        });
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

        // 마중물 한 마디는 곡 모드에서만 칩니다 (곡 없이 재생하면 기존 동작 그대로).
        this._countIn = !!(this.song && this.songCountIn);

        // 곡은 항상 처음부터. 카운트인이면 첫 구간의 템포·박자만 미리 걸고,
        // onSectionChange(0) 는 카운트인이 끝날 때 나갑니다.
        if (this.song) {
            this._songSectionIdx = 0;
            this._songMeasure = 0;
            this._applySection(0);

            // 첫 구간은 앞에 예고할 마디가 없어 시작 순간에 알립니다.
            // 카운트인이 켜져 있으면 이 시각이 카운트인 마디의 첫 박이라 자연히 카운트인 중에 들립니다.
            if (this.onSectionUpcoming) {
                this.onSectionUpcoming(0, this.song.sections[0], this._nextNoteTime);
            }
            // 카운트인이 없으면 지금이 구간 0 의 첫 마디 시작이므로 예고 판단도 함께 합니다
            // (1마디짜리 구간이면 여기서 곧바로 다음 구간을 알립니다).
            if (!this._countIn) this._announceUpcoming(this._nextNoteTime);
        }

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

    /* --- 곡 목록 (localStorage) ------------------------------------ */
    songs: {
        list() {
            try {
                const raw = localStorage.getItem(SONGS_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        },

        /** @returns {{ok:boolean, message?:string}} */
        add(song) {
            const all = this.list();

            if (all.length >= METRONOME_CONFIG.maxSongs) {
                return { ok: false, message: `곡은 최대 ${METRONOME_CONFIG.maxSongs}개까지 저장됩니다.` };
            }

            all.push(song);
            this._write(all);
            return { ok: true };
        },

        /** @returns {{ok:boolean, message?:string}} */
        update(index, song) {
            const all = this.list();

            if (index < 0 || index >= all.length) {
                return { ok: false, message: '없는 곡입니다.' };
            }

            all[index] = song;
            this._write(all);
            return { ok: true };
        },

        remove(index) {
            const all = this.list();
            if (index < 0 || index >= all.length) return;

            all.splice(index, 1);
            this._write(all);
        },

        _write(list) {
            try {
                localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(list));
            } catch (e) {
                console.warn('[Metronome] 곡 저장에 실패했습니다.', e);
            }
        }
    },

    /* --- 셋리스트 (localStorage) ----------------------------------- */
    // 연주 모드용 송리스트. 항목 { title, bpm, beatsPerMeasure|null }
    // 구간(songs)과 달리 재생 시퀀스가 없고, 고른 곡의 템포·박자를 바로 걸어주기만 합니다.
    setlist: {
        list() {
            try {
                const raw = localStorage.getItem(SETLIST_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        },

        remove(index) {
            const all = this.list();
            if (index < 0 || index >= all.length) return;

            all.splice(index, 1);
            this._write(all);
        },

        _write(list) {
            try {
                localStorage.setItem(SETLIST_STORAGE_KEY, JSON.stringify(list.slice(0, METRONOME_CONFIG.maxSetlist)));
            } catch (e) {
                console.warn('[Metronome] 셋리스트 저장에 실패했습니다.', e);
            }
        }
    },

    /* --- 내부: 스케줄링 -------------------------------------------- */
    _schedule() {
        const ctx = AudioEngine.context();
        const horizon = ctx.currentTime + METRONOME_CONFIG.scheduleAheadSec;

        // isPlaying 을 같이 보는 이유: 곡이 끝나면 _advance() 안에서 stop() 이 불리는데,
        // 그때 즉시 빠져나오지 않으면 곡 뒤로 박을 계속 예약해 버립니다.
        while (this.isPlaying && this._nextNoteTime < horizon) {
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

        // 마디가 넘어간 순간(=_tick 이 0 으로 랩)에만 곡을 한 마디 진행시킵니다.
        if (this._tick !== 0 || !this.song) return;

        if (this._countIn) {
            // 카운트인 한 마디가 끝났습니다. 여기서부터 구간 0 의 마디 0 입니다.
            this._countIn = false;
            this._applySection(0);
            this._announceUpcoming(this._nextNoteTime);
        } else {
            this._advanceSong();
        }
    },

    /**
     * 섹션 길이를 채우면 다음 섹션으로 넘어갑니다. 마지막 섹션 뒤에는
     * 루프면 처음으로 돌아가고, 아니면 정지 + onSongEnd 입니다.
     *
     * 여기는 "직전 마디의 마지막 박을 예약한 직후" 입니다. 그 박은 아직 울리지 않았고
     * 예약은 lookahead(최대 0.12s) 앞서 이뤄지므로, 전환과 콜백은 새 구간의 첫 박보다
     * [마지막 한 박 + 최대 0.12s] 만큼 이릅니다. 소리(예약 시각)는 정확하고 화면 표시만
     * 그만큼 먼저 바뀌는데, 다음 구간을 미리 알려주는 쪽이 연주에 낫기도 해서 그대로 둡니다.
     * (음성 안내는 예약 시각을 그대로 넘기므로 마디 첫 박에 정확히 맞습니다 — _announceUpcoming.
     *  샘플이 없는 이름만 speechSynthesis 라 예약이 안 되고 이 시점에 바로 나갑니다.)
     */
    _advanceSong() {
        const sections = this.song.sections;
        const current = sections[this._songSectionIdx];
        this._songMeasure++;

        if (this._songMeasure >= (current ? current.measures : 1)) {
            this._songMeasure = 0;

            if (this._songSectionIdx + 1 < sections.length) {
                this._songSectionIdx++;
            } else if (this.songLoop) {
                this._songSectionIdx = 0;
            } else {
                this.stop();
                if (this.onSongEnd) this.onSongEnd();
                return;
            }

            this._applySection(this._songSectionIdx);
        }

        // 여기까지 오면 새 마디가 시작됩니다 — 마지막 마디면 다음 구간을 예고합니다.
        this._announceUpcoming(this._nextNoteTime);
    },

    /**
     * 지금 시작하는 마디가 현재 구간의 마지막 마디라면 다음 구간을 미리 알립니다.
     * 루프가 켜져 있으면 마지막 구간 뒤는 첫 구간이고, 루프가 꺼진 곡의 끝에는 알릴 것이 없습니다.
     * 구간이 1마디짜리면 그 마디의 시작이 곧 이전 구간 경계라 예고와 전환이 같은 순간에 겹치는데,
     * 어차피 한 마디보다 더 미리 알릴 방법이 없으므로 그대로 둡니다.
     * @param {number} time 이 마디의 첫 박이 울리는 AudioContext 시각
     */
    _announceUpcoming(time) {
        if (!this.onSectionUpcoming) return;

        const sections = this.song.sections;
        const current = sections[this._songSectionIdx];
        if (!current || this._songMeasure + 1 < current.measures) return;

        let nextIdx = this._songSectionIdx + 1;
        if (nextIdx >= sections.length) {
            if (!this.songLoop) return;
            nextIdx = 0;
        }

        this.onSectionUpcoming(nextIdx, sections[nextIdx], time);
    },

    /** 섹션의 템포/박자를 적용합니다. 비어 있는 값은 직전 설정을 유지합니다. */
    _applySection(index) {
        const section = this.song && this.song.sections[index];
        if (!section) return;

        if (section.bpm) this.setBpm(section.bpm);
        // setBeatsPerMeasure 는 _tick 을 0 으로 되돌리는데, 여기는 항상 마디 경계라 무해합니다.
        if (section.beatsPerMeasure) this.setBeatsPerMeasure(section.beatsPerMeasure);

        // 카운트인 중이면 템포·박자만 걸고, 구간 시작 알림은 카운트인이 끝날 때 보냅니다.
        if (this._countIn) return;

        if (this.onSectionChange) this.onSectionChange(index, section);
    },

    _scheduleClick(tick, time) {
        const beat = Math.floor(tick / this.subdivision);

        // 카운트인은 무조건 들려야 하므로 사용자의 박 편집(강조/음소거)을 무시하고
        // 표준 패턴(첫 박 강조 + 나머지 보통)으로 칩니다.
        const state = this._countIn
            ? (beat === 0 ? 'accent' : 'normal')
            : (this.beatStates[beat] || 'normal');

        // 음소거된 박은 쪼갠 박까지 통째로 건너뜁니다 (화면 표시는 그대로 진행).
        if (state === 'mute') return;

        const ctx = AudioEngine.context();
        const isBeat = tick % this.subdivision === 0;
        const isAccent = isBeat && state === 'accent';

        // 보이스 모드에서는 박 자리만 숫자 음성으로 바꾸고, 쪼갠 박은 클릭으로 둡니다.
        // 샘플이 없는 박(로드 전 / 8박 이상)은 아래 클릭으로 흘러갑니다.
        const voice = isBeat && this.soundMode === 'voice' && this._voices && this._voices[beat];
        if (voice) {
            // 강조 박은 조금 크게.
            this._playSample(voice, time, isAccent ? METRONOME_CONFIG.voiceAccentGain : 1);
            return;
        }

        // 강박 → 약박 → 쪼갠 박 순으로 높이와 크기를 낮춥니다.
        let freq = 800, gainValue = 0.25;
        if (isAccent) {
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

    /**
     * 샘플 하나를 볼륨 게인을 거쳐 예약합니다.
     * @param {{buffer:AudioBuffer, offset:number}} sample
     * @param {number} time 울릴 AudioContext 시각
     * @param {number} gainMul 볼륨 배율. 1 을 넘기면 찌그러지므로 상한을 둡니다.
     */
    _playSample(sample, time, gainMul) {
        const ctx = AudioEngine.context();
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();

        src.buffer = sample.buffer;
        gain.gain.setValueAtTime(Math.min(1, this.volume * gainMul), time);

        src.connect(gain);
        gain.connect(ctx.destination);

        // 파일 앞의 무음을 건너뛰어야 박에 맞춰 들립니다.
        src.start(time, sample.offset);
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
                    isDownbeat: latest.tick === 0,
                    // 화면 쪽에서 박 사이 진행률을 재려면 예약 시각이 필요합니다.
                    time: latest.time
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

/**
 * 구간 이름에 맞는 안내 샘플 키. 없으면 null (합성 음성으로 넘어갑니다).
 * 대소문자·공백·하이픈 차이는 무시하고, "Verse 1" 처럼 번호가 붙은 이름은 숫자를 떼고 한 번 더 봅니다.
 */
function sectionSampleKey(name) {
    const flat = String(name || '').trim().toLowerCase().replace(/[\s-]/g, '');
    const key = SECTION_SAMPLE_ALIASES[flat] || SECTION_SAMPLE_ALIASES[flat.replace(/\d/g, '')];

    // 'constructor' 같은 프로토타입 키가 새어 들어오지 않게 실제 샘플 이름인지 확인합니다.
    return SECTION_SAMPLE_KEYS.includes(key) ? key : null;
}

/** 샘플에 없는 이름을 브라우저 음성 합성으로 읽습니다. 합성기가 없으면 조용히 넘어갑니다. */
function speakFallback(text) {
    if (!text || !window.speechSynthesis) return;

    // 이름에 한글이 섞여 있으면 한국어 목소리로, 아니면 영어 목소리로 읽습니다.
    const lang = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(text) ? 'ko' : 'en';
    const voices = speechSynthesis.getVoices().filter(v => (v.lang || '').toLowerCase().startsWith(lang));
    const voice = voices.find(v => VOICE_HINTS[lang].some(hint => v.name.includes(hint))) || voices[0];

    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
    utterance.pitch = 1.15;
    utterance.rate = 1.25;

    speechSynthesis.cancel();   // 앞 구간 안내가 남아 있으면 밀어냅니다
    speechSynthesis.speak(utterance);
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
