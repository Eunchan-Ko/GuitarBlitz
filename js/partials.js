/* ===================================================================
   partial 로더 — index.html 은 레이아웃 뼈대만 남기고, 뷰 마크업은
   html/ 아래 파일을 fetch 해서 data-partial 컨테이너에 주입합니다.

   앱 초기화(main.js)는 반드시 PartialsReady 이후에 실행해야 합니다.
   file:// 로 직접 열면 fetch 가 CORS 로 차단되므로 로컬 서버가
   필요합니다 (README 의 실행 방법 참고).
   =================================================================== */

const PartialsReady = Promise.all(
    Array.from(document.querySelectorAll('[data-partial]')).map(async (el) => {
        const url = el.getAttribute('data-partial');
        const res = await fetch(url);
        if (!res.ok) throw new Error(`partial 로드 실패: ${url} (${res.status})`);
        el.innerHTML = await res.text();
    })
).catch((err) => {
    document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:14px;background:#7f1d1d;color:#fecaca;font-size:13px;text-align:center;">' +
        '화면 파일을 불러오지 못했습니다. file:// 이 아닌 로컬 서버로 실행했는지 확인하세요. (README 참고)</div>');
    throw err;
});
