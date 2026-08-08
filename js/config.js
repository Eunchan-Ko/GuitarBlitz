/* ===================================================================
   전역 상수 — 음이름, 표준 튜닝, 엔진 기본값
   여기 값만 바꾸면 게임 전체 동작이 따라옵니다.
   =================================================================== */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 표준 튜닝(EADGBE). openPitch 는 MIDI 노트 번호, openHz 는 개방현 주파수.
// 배열 순서 = 화면 지판의 위에서 아래 순서 (1번줄 High E → 6번줄 Low E)
const STRINGS_CONFIG = [
    { number: 1, name: "E4", openPitch: 64, openHz: 329.63 },
    { number: 2, name: "B3", openPitch: 59, openHz: 246.94 },
    { number: 3, name: "G3", openPitch: 55, openHz: 196.00 },
    { number: 4, name: "D3", openPitch: 50, openHz: 146.83 },
    { number: 5, name: "A2", openPitch: 45, openHz: 110.00 },
    { number: 6, name: "E2", openPitch: 40, openHz: 82.41 }
];

// 마이크 수음 / 피치 감지 파라미터
const AUDIO_CONFIG = {
    fftSize: 2048,
    defaultGain: 5.0,          // 생기타 기준 소프트웨어 증폭 배율
    defaultThreshold: 0.015,   // 이 RMS 미만은 무음으로 간주
    minHz: 60,                 // 6번줄 E2(82Hz) 아래 노이즈 컷
    maxHz: 1000,               // 1번줄 15F(약 784Hz) 위 하모닉스 컷
    meterFullScaleRms: 0.1     // 볼륨 게이지·문턱값 마커 100% 기준 RMS
};

// 정답/오답 판정 규칙
const JUDGE_CONFIG = {
    stableFramesToPass: 2,     // 목표 음이 연속 N프레임 잡히면 정답
    wrongFramesToFail: 3,      // 같은 오답 음이 연속 N프레임 잡히면 오답
    successDelayMs: 600,       // 정답 피드백 노출 후 다음 문제까지
    failureDelayMs: 1200,      // 오답 피드백 노출 후 다음 문제까지
    transitionLockMs: 400,     // 문제 전환 직후 잔향 오인식 방지 잠금
    timerTickMs: 100           // 타이머 바 갱신 주기
};

// 지판 렌더링 레이아웃 (px 단위)
const FRETBOARD_CONFIG = {
    stringTopOffset: 28,       // 1번줄 y 위치
    stringGap: 30,             // 줄 간격
    inlayFrets: [3, 5, 7, 9, 12]
};
