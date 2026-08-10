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


    2. 로컬 서버로 띄운 뒤 브라우저(Chrome, Edge, Safari 등)로 접속합니다. (아래 [로컬에서 실행](#로컬에서-실행) 참고)
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

별도 빌드 과정은 없지만, 뷰 마크업(`html/` 디렉터리)을 `fetch`로 불러오기 때문에
**로컬 서버가 필요합니다**. `index.html`을 `file://`로 직접 열면 CORS 정책 때문에 화면이 뜨지 않습니다.

```bash
python -m http.server 8000
```

이후 http://localhost:8000 접속. (VS Code Live Server 등 아무 정적 서버나 가능)

## 🏆 랭크전 / 연습 모드

| | 랭크전 | 연습 모드 |
|---|---|---|
| 한 판 길이 | 60초 고정 | 무제한 (직접 정지) |
| 설정 | 6줄 전체 · 1~12프렛 · 문제당 3초 **고정** | 자유롭게 변경 |
| 지판 음이름 | 항상 가림 (입력 방식 무관) | 터치는 가림 / 마이크는 표시 |
| 일시정지 | 불가 (시계를 멈출 수 없음) | 가능 |
| 랭킹 등록 | 가능 | 불가 |

랭크전 설정을 잠가둔 이유는 단순합니다. 1~7프렛 초급 설정으로 돌린 기록과 12프렛 전체 기록을 같은 표에 올리면 순위가 의미를 잃기 때문입니다.

**점수 계산**

```
문제당 점수 = (100 + 속도보너스) × 콤보배율
  속도보너스 = 제한시간 중 남긴 비율 × 50      (즉답 50점, 시간 다 쓰면 0점)
  콤보배율   = 1.0 + (콤보-1) × 0.1, 최대 2.0  (11콤보에서 상한)
```

오답이나 시간 초과에 콤보가 끊깁니다. 값은 `js/core/config.js` 의 `SCORE_CONFIG` 에서 조정합니다.

**지판 음이름 가리기**

화면에 답이 적혀 있으면 지판을 외우는 게 아니라 읽게 됩니다. 그래서 음이름을 표시하는 경우는 하나뿐입니다.

| 모드 | 입력 방식 | 음이름 |
|---|---|---|
| 랭크전 | 마이크 | 가림 |
| 랭크전 | 터치 | 가림 |
| 연습 | 터치 | 가림 |
| 연습 | 마이크 | **표시** — 실물 기타를 보며 연주할 때의 참고용 |

가려진 상태에서는 프렛에 짚을 자리만 점으로 표시되고, 틀리면 방금 짚은(또는 연주한) 자리가 무슨 음이었는지 알려줍니다.

```
❌ 짚은 곳은 3번줄 1프렛 'G#'!  정답: 3번줄 12프렛 (G)
```

판단 로직은 `js/trainer/game.js` 의 `Game._shouldShowNoteNames()` 한 곳에 있습니다.

## 🥁 메트로놈

상단 탭에서 전환합니다.

- **좌우 드래그로 템포 조절** — BPM 패널 어디서나 끌면 됩니다 (모바일 터치 포함). `←` `→` 키, `Shift`+방향키(±10), ±1/±10 버튼도 지원
- **탭 템포** — 곡의 박에 맞춰 두드리면 최근 간격의 이동 평균으로 BPM 이 따라옵니다. 재생 중에 두드리면 그 시점을 첫 박으로 삼아 박자가 재정렬됩니다
- **즐겨찾는 템포** — 자주 쓰는 BPM·박자를 저장해두고 한 번에 불러오기 (localStorage, 최대 8개)
- **박자표** 2/4 ~ 7/8, **박 쪼개기** 4분·8분·셋잇단·16분, **첫 박 강조**, 볼륨
- 마디 안 위치를 보여주는 비트 인디케이터
- 단축키: `Space` 시작/정지, `T` 탭

타이밍은 `setInterval` 이 아니라 **AudioContext 시계에 미리 예약**하는 방식입니다. `setInterval` 은 탭 전환이나 GC 로 수십 ms 씩 밀리는데, 메트로놈에서는 그 정도 흔들림이 바로 들립니다.

> ⚠️ 마이크 모드로 훈련하면서 메트로놈을 켜면, 클릭음이 마이크에 잡혀 오답으로 판정될 수 있습니다. 연습 시에는 이어폰을 쓰거나 터치 모드를 사용하세요.

## 🗄️ 랭킹 서버 연결 (Supabase)

설정하지 않아도 게임은 전부 동작합니다. 이 경우 랭킹은 **그 브라우저의 localStorage 에만** 저장됩니다.

전체 랭킹을 쓰려면:

1. [supabase.com](https://supabase.com) 에서 프로젝트 생성 (무료 티어)
2. **Authentication > Sign In / Providers** 에서 **Anonymous sign-ins** 활성화
3. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 을 붙여넣고 실행
4. **Project Settings > API** 의 값을 `js/backend/backend-config.js` 에 입력

```js
const BACKEND_CONFIG = {
    supabaseUrl: 'https://xxxxx.supabase.co',
    supabaseAnonKey: 'eyJhbG...'
};
```

anon key 는 공개되도록 설계된 값이라 코드에 넣어도 됩니다. **단, 3번의 RLS 정책을 반드시 함께 적용해야 합니다.** 정책 없이 키만 노출하면 누구나 랭킹을 조작할 수 있습니다.

**알아둘 점**

- 닉네임은 브라우저에 발급된 익명 계정에 묶입니다. 브라우저 데이터를 지우거나 다른 기기에서 접속하면 새 계정이 되고, **원래 쓰던 닉네임은 본인도 되찾을 수 없습니다.** 비밀번호 없는 닉네임의 구조적 한계입니다
- 점수는 브라우저에서 계산해 전송하므로 위조를 완전히 막을 수 없습니다. 스키마의 `scores_sane` 제약은 터무니없는 값만 걸러내는 최소한의 방어입니다
- 무료 프로젝트는 일정 기간 요청이 없으면 자동 일시정지될 수 있습니다. 현재 정책은 대시보드에서 확인하세요

## 구조

빌드 도구 없이 브라우저가 그대로 읽는 정적 파일 구성입니다.

```
index.html                        레이아웃 뼈대 (헤더/탭/컨테이너/스크립트 로드)
supabase/schema.sql               랭킹 테이블 + RLS 정책

html/view-trainer.html            지판 트레이너 뷰 마크업 (partial)
html/view-metronome.html          메트로놈 뷰 마크업 (partial)
html/modals.html                  결과/닉네임 모달 마크업 (partial)

css/base.css                      공통 스타일 (전역 규칙만)
css/trainer.css                   지판 트레이너 뷰 전용 스타일
css/metronome.css                 메트로놈 뷰 전용 스타일

js/core/partials.js               html/ partial 을 fetch 해 주입하는 로더
js/core/config.js                 음이름·튜닝·판정·점수·메트로놈 파라미터 등 모든 상수
js/core/state.js                  게임 / 오디오 / 피치 감지 런타임 상태
js/core/audio.js                  AudioContext 관리 + 효과음 합성
js/core/ui.js                     UI 셸 (탭/패널 전환, 닉네임 표시·모달)

js/trainer/trainer-ui.js          트레이너 화면의 DOM 읽기·쓰기 전담 (UI 확장)
js/trainer/pitch.js               마이크 캡처 + Auto-correlation 피치 감지 (DOM 미접근)
js/trainer/fretboard.js           지판 렌더러
js/trainer/score.js               점수 계산 (순수 함수)
js/trainer/game.js                모드 전환 / 출제 / 타이머 / 정답·오답 판정

js/metronome/metronome.js         메트로놈 엔진 (DOM 미접근)
js/metronome/metronome-ui.js      메트로놈 화면의 DOM 전담

js/backend/backend-config.js      Supabase 접속 정보 (비워두면 로컬 모드)
js/backend/backend.js             Supabase 클라이언트 부트스트랩 (실패 시 로컬 모드로 폴백)
js/backend/player.js              닉네임 등록·변경·중복 확인
js/backend/leaderboard.js         랭킹 제출·조회 (Supabase / localStorage 어댑터)

js/main.js                        진입점, DOM 이벤트 바인딩 (조립 루트)
```

설계 원칙 세 가지입니다.

- **UI 모듈은 게임 상태를 읽지 않고, 엔진은 DOM 을 만지지 않습니다.** `pitch.js` 와 `metronome.js` 는 콜백으로만 바깥과 통신합니다
- **HTML 에 `onclick` 이 없습니다.** 모든 이벤트는 `main.js`(트레이너)와 `metronome-ui.js`(메트로놈)에서 등록합니다
- **조정 가능한 값은 전부 `js/core/config.js`** 에 모여 있습니다

기타 참고사항:

- 스크립트는 `index.html` 하단에서 정해진 순서대로 로드됩니다 (`partials` → `core` → 뷰별 모듈 → `backend` → `main`). `js/trainer/trainer-ui.js` 는 `js/core/ui.js` 의 `UI` 네임스페이스를 확장하므로 반드시 그 뒤에 로드해야 합니다
- 뷰 마크업을 `fetch` 로 불러오므로 `file://` 로는 열 수 없고 로컬 서버가 필요합니다 (위 [로컬에서 실행](#로컬에서-실행) 참고)
- Tailwind CSS, FontAwesome, Google Fonts 는 CDN 에서 로드
- 배포 직후 변경이 반영되지 않으면 브라우저가 이전 JS 를 캐시한 경우입니다. 강력 새로고침(`Ctrl`+`Shift`+`R`)으로 확인하세요

