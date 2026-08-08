# ⚡ GuitarBlitz (기타블리츠)

"지판을 계산하지 마라, 손가락이 먼저 반응하게 하라!"
실시간 마이크 수음(Pitch Detection) 기반 일렉기타 지판 반사신경 아케이드 트레이너 🎸

## 📌 깃허브 한 줄 소개 (GitHub About Description)
### ⚡ 3초 안에 지판을 짚어라! 실시간 마이크 수음(Pitch Detection) 기반 일렉기타 지판 반사신경 아케이드 트레이너 🎸


## 💡 왜 GuitarBlitz인가요? (개발 배경)

기타를 연주할 때 "5프렛 규칙"이나 "옥타브 모양" 같은 상대적 위치 규칙에 의존하기 시작하면, 계산 속도는 빠를지 몰라도 순간적으로 특정 프렛을 딱 짚는 동물적 반사 신경을 기르기 어렵습니다.

GuitarBlitz는 상대적 계산을 물리적으로 불가능하게 만들어 지판 암기의 매너리즘을 깨뜨립니다:

- ⏱️ 3초 타임 어택: 다른 줄에서 프렛을 세어볼 시간을 주지 않습니다.
- 🎲 무작위 퀘스트: 옥타브 패턴을 예측할 수 없도록 무작위 줄과 음이 제시됩니다.
- 🎙️ 실물 기타 마이크 수음: 앰프 없이 튕기는 생기타 소리도 실시간 피치 감지 엔진이 정밀하게 인지합니다.
## ✨ 주요 기능 (Key Features)
- 🎙️ 실시간 마이크 수음 (Web Audio Pitch Detection)
Auto-correlation 알고리즘 기반 정밀 피치 감지.
동일 주파수(Hz) 유연 정답 처리 (예: 6번줄 10F D = 5번줄 5F D 모두 인식).
- 🔊 생기타 전용 소프트웨어 증폭 (Gain Boost & Threshold)
앰프 연결 없는 생기타 울림도 최적화 수음할 수 있는 Gain Boost(x1 ~ x20) 및 노이즈 문턱값 조절 기능.
- 🔍 사전 수음 테스트 (Pre-Check Panel)
게임 시작 전 생기타 소리가 정상 입력되는지 시각적 게이지와 음이름 표시기로 사전 검증.
- ❌ 실수 음 실시간 피드백
오답을 연주했을 때 내가 방금 연주한 소리가 무슨 음(F# 등)이었는지 즉시 알려주는 연주 모니터링.
- ⚙️ 커스텀 트레이닝 옵션
    1. 훈련 줄 범위 선택 (1~6번줄)
    2. 프렛 제한 (1~7F / 1~12F / 1~15F)
    3. 타이머 설정 (2초 / 3초 / 5초 / 무제한)
- 🚀 사용 방법 (Quick Start)

    1. 별도의 설치 과정 없이 웹 브라우저에서 바로 실행할 수 있습니다.
저장소를 클론합니다:

        ```git clone https://github.com/Eunchan-Ko/GuitarBlitz.git```


    2. index.html 파일을 웹 브라우저(Chrome, Edge, Safari 등)로 실행합니다.
    3. [사전 마이크 수음 테스트]를 켜고 생기타를 튕겨 게인 및 민감도를 조절합니다.
    4. [지판 반사신경 훈련 시작하기]를 눌러 3초 안에 지판을 스나이핑하세요!
## 🛠️ 기술 스택 (Tech Stack)
#### Frontend: Vanilla HTML5, JavaScript (ES6+)
#### Styling: Tailwind CSS (CDN), FontAwesome Icons
#### Audio Engine: Web Audio API (AudioContext, AnalyserNode, GainNode)
## 📄 라이선스 (License)
#### This project is licensed under the MIT License - see the LICENSE file for details.

## 플레이

👉 **https://eunchan-ko.github.io/GuitarBlitz/**

## 로컬에서 실행

`index.html` 파일을 브라우저로 열면 끝입니다. 별도 빌드 과정이 없습니다. 

간단한 로컬 서버로 띄우고 싶다면:

```bash
python -m http.server 8000
```

이후 http://localhost:8000 접속.

## 🏆 랭크전 / 연습 모드

| | 랭크전 | 연습 모드 |
|---|---|---|
| 한 판 길이 | 60초 고정 | 무제한 (직접 정지) |
| 설정 | 6줄 전체 · 1~12프렛 · 문제당 3초 **고정** | 자유롭게 변경 |
| 일시정지 | 불가 (시계를 멈출 수 없음) | 가능 |

랭크전 설정을 잠가둔 이유는 단순합니다. 1~7프렛 초급 설정으로 돌린 기록과 12프렛 전체 기록을 같은 표에 올리면 순위가 의미를 잃기 때문입니다.

**점수 계산**

```
문제당 점수 = (100 + 속도보너스) × 콤보배율
  속도보너스 = 제한시간 중 남긴 비율 × 50      (즉답 50점, 시간 다 쓰면 0점)
  콤보배율   = 1.0 + (콤보-1) × 0.1, 최대 2.0  (11콤보에서 상한)
```

오답이나 시간 초과에 콤보가 끊깁니다. 값은 `js/config.js` 의 `SCORE_CONFIG` 에서 조정합니다.

## 구조

빌드 도구 없이 브라우저가 그대로 읽는 정적 파일 구성입니다.

```
index.html          마크업 (이벤트 핸들러 없음)
css/style.css       Tailwind 로 표현 못 하는 커스텀 스타일

js/config.js        음이름·튜닝·판정·점수 파라미터 등 모든 상수
js/state.js         게임 / 오디오 / 피치 감지 런타임 상태

js/ui.js            DOM 읽기·쓰기 전담 (게임 상태를 참조하지 않음)
js/audio.js         AudioContext 관리 + 효과음 합성
js/pitch.js         마이크 캡처 + Auto-correlation 피치 감지 (DOM 미접근)
js/fretboard.js     지판 렌더러
js/score.js         점수 계산 (순수 함수)
js/game.js          모드 전환 / 출제 / 타이머 / 정답·오답 판정

js/main.js          진입점, DOM 이벤트 바인딩
```

설계 원칙 세 가지입니다.

- **UI 모듈은 게임 상태를 읽지 않고, 엔진은 DOM 을 만지지 않습니다.** `pitch.js` 는 콜백으로만 바깥과 통신합니다
- **HTML 에 `onclick` 이 없습니다.** 모든 이벤트는 `main.js` 에서 등록합니다
- **조정 가능한 값은 전부 `js/config.js`** 에 모여 있습니다

기타 참고사항:

- 스크립트는 `index.html` 하단에서 정해진 순서대로 로드됩니다 (`config` → `state` → 엔진 → `game` → `main`)
- ES 모듈을 쓰지 않으므로 `index.html` 을 더블클릭해 `file://` 로 열어도 동작합니다
- Tailwind CSS, FontAwesome, Google Fonts 는 CDN 에서 로드
- 배포 직후 변경이 반영되지 않으면 브라우저가 이전 JS 를 캐시한 경우입니다. 강력 새로고침(`Ctrl`+`Shift`+`R`)으로 확인하세요

