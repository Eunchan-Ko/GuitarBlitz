/* ===================================================================
   지판 렌더러 — #fretboard 안에 줄/프렛/클릭 노드를 그립니다.
   게임 상태를 참조하지 않고 인자만으로 그리므로, 연습 모드나
   코드 표시 같은 화면을 추가할 때 그대로 재사용할 수 있습니다.
   =================================================================== */

const Fretboard = {
    /**
     * @param {{maxFret: number, onFretClick: (stringNum: number, fret: number) => void}} options
     */
    render({ maxFret, onFretClick }) {
        const board = document.getElementById('fretboard');
        board.innerHTML = '';

        // 마지막 프렛 오른쪽에 여백이 남도록 0.5칸을 더해 폭을 나눕니다.
        const fretWidthPct = 100 / (maxFret + 0.5);

        this._renderFretWires(board, maxFret, fretWidthPct);

        STRINGS_CONFIG.forEach((stringConfig, idx) => {
            const topPos = FRETBOARD_CONFIG.stringTopOffset + idx * FRETBOARD_CONFIG.stringGap;
            this._renderString(board, stringConfig, topPos);
            this._renderFretButtons(board, stringConfig, topPos, maxFret, fretWidthPct, onFretClick);
        });
    },

    _renderFretWires(board, maxFret, fretWidthPct) {
        for (let f = 0; f <= maxFret; f++) {
            const fretWire = document.createElement('div');
            fretWire.className = 'fret-wire';
            fretWire.style.left = `${(f + 0.5) * fretWidthPct}%`;
            board.appendChild(fretWire);

            if (f > 0) {
                const numLabel = document.createElement('div');
                numLabel.className = 'absolute top-0 text-[10px] font-bold text-zinc-500 transform -translate-x-1/2';
                numLabel.style.left = `${f * fretWidthPct}%`;
                numLabel.innerText = f;
                board.appendChild(numLabel);
            }

            if (FRETBOARD_CONFIG.inlayFrets.includes(f)) {
                const dot = document.createElement('div');
                dot.className = 'fret-marker-dot absolute top-1/2 transform -translate-x-1/2 -translate-y-1/2';
                dot.style.left = `${f * fretWidthPct}%`;
                board.appendChild(dot);
            }
        }
    },

    _renderString(board, stringConfig, topPos) {
        const stringLine = document.createElement('div');
        stringLine.className = 'string-line';
        stringLine.style.top = `${topPos}px`;
        // 저음현일수록 굵게
        stringLine.style.height = `${1.2 + (6 - stringConfig.number) * 0.5}px`;
        board.appendChild(stringLine);

        const stringLabel = document.createElement('div');
        stringLabel.className = 'absolute left-0 text-[10px] font-bold bg-zinc-800 text-amber-400 px-1.5 py-0.5 rounded border border-zinc-700 transform -translate-y-1/2 z-20';
        stringLabel.style.top = `${topPos}px`;
        stringLabel.innerText = `${stringConfig.number}줄`;
        board.appendChild(stringLabel);
    },

    _renderFretButtons(board, stringConfig, topPos, maxFret, fretWidthPct, onFretClick) {
        for (let f = 1; f <= maxFret; f++) {
            const fretBtn = document.createElement('button');
            fretBtn.className = 'fret-target-btn absolute w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700 hover:border-amber-400 flex items-center justify-center text-[10px] font-bold text-zinc-300 transform -translate-x-1/2 -translate-y-1/2 z-20 shadow';
            fretBtn.style.left = `${f * fretWidthPct}%`;
            fretBtn.style.top = `${topPos}px`;

            fretBtn.setAttribute('data-string', stringConfig.number);
            fretBtn.setAttribute('data-fret', f);
            fretBtn.innerText = NOTE_NAMES[(stringConfig.openPitch + f) % 12];

            fretBtn.onclick = () => onFretClick(stringConfig.number, f);
            board.appendChild(fretBtn);
        }
    }
};
