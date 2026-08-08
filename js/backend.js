/* ===================================================================
   백엔드 부트스트랩 — Supabase 설정 여부를 판정하고 클라이언트를 준비합니다.
   설정이 없으면 SDK 를 아예 내려받지 않고 로컬 모드로 동작합니다.
   =================================================================== */

const SUPABASE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const Backend = {
    mode: 'local',   // 'local' | 'supabase'
    client: null,
    userId: null,
    lastError: null,

    isConfigured() {
        return Boolean(BACKEND_CONFIG.supabaseUrl && BACKEND_CONFIG.supabaseAnonKey);
    },

    /**
     * 설정이 있으면 SDK 를 로드하고 익명 세션을 확보합니다.
     * 어떤 단계에서든 실패하면 조용히 로컬 모드로 떨어집니다 —
     * 랭킹 때문에 게임 자체가 막히면 안 되기 때문입니다.
     */
    async init() {
        if (!this.isConfigured()) {
            this.mode = 'local';
            return this.mode;
        }

        try {
            await loadScript(SUPABASE_SDK_URL);

            this.client = window.supabase.createClient(
                BACKEND_CONFIG.supabaseUrl,
                BACKEND_CONFIG.supabaseAnonKey,
                { auth: { persistSession: true, autoRefreshToken: true } }
            );

            // 익명 세션은 localStorage 에 보관되므로, 같은 브라우저로 다시 오면
            // 로그인 절차 없이 그대로 복구됩니다.
            const { data: existing } = await this.client.auth.getSession();
            let session = existing.session;

            if (!session) {
                const { data, error } = await this.client.auth.signInAnonymously();
                if (error) throw error;
                session = data.session;
            }

            this.userId = session.user.id;
            this.mode = 'supabase';
        } catch (err) {
            console.warn('[Backend] Supabase 초기화 실패 — 로컬 랭킹으로 전환합니다.', err);
            this.lastError = err;
            this.client = null;
            this.userId = null;
            this.mode = 'local';
        }

        return this.mode;
    }
};

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.onload = resolve;
        tag.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
        document.head.appendChild(tag);
    });
}
