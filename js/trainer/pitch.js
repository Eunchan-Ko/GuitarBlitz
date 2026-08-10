/* ===================================================================
   피치 감지 엔진 — 마이크 캡처 + Auto-correlation 기반 음정 추정
   DOM 을 직접 건드리지 않고, 아래 두 콜백으로 바깥에 결과를 넘깁니다.
     PitchEngine.onFrame(noteInfo)   : 매 프레임 감지 결과
     PitchEngine.onStateChange(bool) : 마이크 on/off 전환
   =================================================================== */

const PitchEngine = {
    onFrame: null,
    onStateChange: null,

    async toggleMic() {
        if (audioState.isMicActive) {
            this.stop();
            return;
        }
        await this.start();
    },

    async start() {
        if (audioState.isMicActive) return;

        try {
            const ctx = AudioEngine.context();

            // 기타 신호가 왜곡되지 않도록 브라우저 전처리를 모두 끕니다.
            audioState.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const source = ctx.createMediaStreamSource(audioState.micStream);

            audioState.gainNode = ctx.createGain();
            audioState.gainNode.gain.value = audioState.gain;

            audioState.analyser = ctx.createAnalyser();
            audioState.analyser.fftSize = AUDIO_CONFIG.fftSize;

            source.connect(audioState.gainNode);
            audioState.gainNode.connect(audioState.analyser);

            audioState.isMicActive = true;
            if (this.onStateChange) this.onStateChange(true);

            this._loop();
        } catch (err) {
            alert("마이크 접근 권한이 거부되었거나 지원되지 않는 브라우저입니다: " + err.message);
            console.error(err);
        }
    },

    stop() {
        if (audioState.micStream) {
            audioState.micStream.getTracks().forEach(track => track.stop());
            audioState.micStream = null;
        }
        if (audioState.animFrameId) {
            cancelAnimationFrame(audioState.animFrameId);
            audioState.animFrameId = null;
        }
        audioState.isMicActive = false;
        if (this.onStateChange) this.onStateChange(false);
    },

    setGain(value) {
        audioState.gain = parseFloat(value);
        if (audioState.gainNode) {
            audioState.gainNode.gain.value = audioState.gain;
        }
        return audioState.gain;
    },

    setThreshold(value) {
        audioState.threshold = parseFloat(value);
        return audioState.threshold;
    },

    _loop() {
        const buffer = new Float32Array(AUDIO_CONFIG.fftSize);

        const update = () => {
            if (!audioState.isMicActive || !audioState.analyser) return;

            audioState.analyser.getFloatTimeDomainData(buffer);
            const noteInfo = autoCorrelate(buffer, audioState.ctx.sampleRate);

            if (this.onFrame) this.onFrame(noteInfo);

            audioState.animFrameId = requestAnimationFrame(update);
        };

        update();
    }
};

/**
 * 자기상관(Auto-correlation)으로 기본 주파수를 추정합니다.
 * @returns {{rms: number, noteName: string|null, freq: number}}
 *          rms 는 항상 유효하며, 무음이거나 감지 범위를 벗어나면 noteName 이 null 입니다.
 */
function autoCorrelate(buf, sampleRate) {
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
        const val = buf[i];
        rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);

    // 문턱값 미만은 무음 처리 (게이지 표시는 계속되도록 rms 는 돌려줍니다)
    if (rms < audioState.threshold) {
        return { rms: rms, noteName: null, freq: 0 };
    }

    // 신호가 충분히 큰 구간만 잘라내 계산량과 잡음을 줄입니다.
    let r1 = 0, r2 = SIZE - 1;
    const trimThreshold = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < trimThreshold) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < trimThreshold) { r2 = SIZE - i; break; }
    }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c = new Float32Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }

    // 첫 골짜기를 지난 뒤의 최대 피크가 기본 주기(T0)
    let d = 0;
    while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxval) {
            maxval = c[i];
            maxpos = i;
        }
    }
    let T0 = maxpos;

    // 포물선 보간으로 샘플 단위보다 정밀하게 피크 위치를 보정
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    const freq = sampleRate / T0;
    if (freq < AUDIO_CONFIG.minHz || freq > AUDIO_CONFIG.maxHz) {
        return { rms: rms, noteName: null, freq: 0 };
    }

    // A4=440Hz 기준 MIDI 노트 번호로 환산 후 음이름 추출
    const noteNum = 12 * (Math.log(freq / 440) / Math.log(2)) + 69;
    const noteName = NOTE_NAMES[Math.round(noteNum) % 12];

    return { rms: rms, noteName: noteName, freq: freq };
}
