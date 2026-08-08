/* ===================================================================
   오디오 출력 엔진 — AudioContext 수명 관리 + 효과음 합성
   (마이크 입력은 pitch.js 가 담당합니다)
   =================================================================== */

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
