# GuitarBlitz

일렉기타 지판(fretboard) 반사신경 트레이너 — **FretVision**

브라우저만 있으면 바로 플레이할 수 있는 정적 웹 게임입니다. 설치나 서버가 필요 없습니다.

## 플레이

👉 **https://eunchan-ko.github.io/GuitarBlitz/**

## 로컬에서 실행

`index.html` 파일을 브라우저로 열면 끝입니다. 별도 빌드 과정이 없습니다.

간단한 로컬 서버로 띄우고 싶다면:

```bash
python -m http.server 8000
```

이후 http://localhost:8000 접속.

## 구조

- `index.html` — 게임 전체 (HTML / CSS / JS 단일 파일)
- Tailwind CSS, FontAwesome, Google Fonts는 CDN에서 로드

## 배포

`main` 브랜치에 푸시하면 GitHub Pages가 자동으로 갱신됩니다.
