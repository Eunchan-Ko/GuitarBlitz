/* ===================================================================
   랭킹 저장소 — 랭크전 결과 제출과 상위 기록 조회
   Backend.mode 에 따라 Supabase / localStorage 로 갈라집니다.
   호출부(game.js, main.js)는 어느 쪽인지 알 필요가 없습니다.
   =================================================================== */

const LOCAL_SCORES_KEY = 'guitarblitz.localScores';
const LEADERBOARD_LIMIT = 20;

const Leaderboard = {
    /**
     * @param {{score:number, correctCount:number, totalCount:number, maxCombo:number}} result
     */
    async submit(result) {
        if (!Player.has()) {
            return { ok: false, message: '닉네임을 먼저 등록해주세요.' };
        }

        if (Backend.mode !== 'supabase') {
            saveLocalScore({ nickname: Player.nickname, ...result, createdAt: new Date().toISOString() });
            return { ok: true };
        }

        const { error } = await Backend.client.from('scores').insert({
            user_id: Backend.userId,
            score: result.score,
            correct_count: result.correctCount,
            total_count: result.totalCount,
            max_combo: result.maxCombo
        });

        if (error) {
            return { ok: false, message: `기록 등록에 실패했습니다: ${error.message}` };
        }
        return { ok: true };
    },

    /**
     * 개인 최고 기록 기준 상위 목록.
     * @returns {Promise<{ok:boolean, rows:Array, message?:string}>}
     */
    async top(limit = LEADERBOARD_LIMIT) {
        if (Backend.mode !== 'supabase') {
            return { ok: true, rows: readLocalTop(limit) };
        }

        // leaderboard 뷰가 user_id 별 최고점 1행씩만 남겨줍니다 (schema.sql 참조)
        const { data, error } = await Backend.client
            .from('leaderboard')
            .select('nickname, score, correct_count, total_count, max_combo, created_at')
            .order('score', { ascending: false })
            .limit(limit);

        if (error) {
            return { ok: false, rows: [], message: `랭킹을 불러오지 못했습니다: ${error.message}` };
        }

        return {
            ok: true,
            rows: data.map(r => ({
                nickname: r.nickname,
                score: r.score,
                correctCount: r.correct_count,
                totalCount: r.total_count,
                maxCombo: r.max_combo,
                createdAt: r.created_at
            }))
        };
    },

    /** 현재 저장소가 전역 랭킹인지, 이 브라우저 한정인지 */
    isGlobal() {
        return Backend.mode === 'supabase';
    }
};

/* --- localStorage 폴백 --------------------------------------------- */

function readLocalScores() {
    try {
        const raw = localStorage.getItem(LOCAL_SCORES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveLocalScore(entry) {
    try {
        const all = readLocalScores();
        all.push(entry);
        // 무한정 쌓이지 않도록 상위 100개만 남깁니다.
        all.sort((a, b) => b.score - a.score);
        localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(all.slice(0, 100)));
    } catch (e) {
        console.warn('[Leaderboard] 로컬 기록 저장에 실패했습니다.', e);
    }
}

// 로컬 모드에서도 닉네임당 최고 기록 1건만 노출해 화면 규칙을 맞춥니다.
function readLocalTop(limit) {
    const best = new Map();

    for (const entry of readLocalScores()) {
        const prev = best.get(entry.nickname);
        if (!prev || entry.score > prev.score) best.set(entry.nickname, entry);
    }

    return [...best.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
