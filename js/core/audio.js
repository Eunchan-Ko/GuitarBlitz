/* ===================================================================
   오디오 출력 엔진 — AudioContext 수명 관리 + 효과음 합성
   (마이크 입력은 pitch.js 가 담당합니다)
   =================================================================== */

// 선두 무음을 찾는 기준. 이 진폭을 처음 넘는 지점부터 소리로 봅니다.
const SILENCE_THRESHOLD = 0.01;
// 임계값을 넘는 지점에서 바로 자르면 0 이 아닌 값에서 시작해 딱 소리가 날 수 있어
// 아주 조금 앞에서 시작합니다.
const SILENCE_GUARD_SEC = 0.008;

const AudioEngine = {
    // 브라우저 자동재생 정책 때문에 최초 사용자 제스처 이후에야 resume 됩니다.
    context() {
        if (!audioState.ctx) {
            audioState.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioState.ctx.state === 'suspended') {
            audioState.ctx.resume();
        }
        return audioState.ctx;
    },

    // 터치 모드에서 프렛을 눌렀을 때 나는 기타 유사음
    playGuitarNote(freq) {
        try {
            const ctx = this.context();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, ctx.currentTime);

            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.0);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 1.0);
        } catch (e) {
            console.error(e);
        }
    },

    /**
     * 오디오 파일 하나를 받아 재생 준비 상태로 만듭니다.
     * offset 은 선두 무음 길이(초)로, source.start(time, offset) 에 넘기면
     * 파일 앞의 무음 패딩만큼 소리가 늦게 나는 것을 막을 수 있습니다.
     * (SAPI 로 만든 음성 파일은 앞뒤에 무음이 붙어 있습니다)
     * @returns {Promise<{buffer: AudioBuffer, offset: number}>}
     */
    async loadSample(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} 응답 ${res.status}`);

        const buffer = await this.context().decodeAudioData(await res.arrayBuffer());
        return { buffer, offset: leadingSilenceSec(buffer) };
    },

    // 정답/오답 알림음
    playResultChime(isSuccess) {
        try {
            const ctx = this.context();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = isSuccess ? 'sine' : 'sawtooth';
            osc.frequency.setValueAtTime(isSuccess ? 523.25 : 180, ctx.currentTime);
            if (isSuccess) {
                // 정답일 때만 C5 → E5 로 살짝 올려 상승감을 줍니다.
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
            }

            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            console.error(e);
        }
    }
};

/** 첫 소리가 나기까지의 시간(초). 파일 전체가 무음이면 0 을 돌려줍니다. */
function leadingSilenceSec(buffer) {
    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > SILENCE_THRESHOLD) {
            return Math.max(0, i / buffer.sampleRate - SILENCE_GUARD_SEC);
        }
    }
    return 0;
}
