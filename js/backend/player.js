/* ===================================================================
   플레이어 신원 — 닉네임 등록/변경
   한 번 등록하면 이 브라우저에서는 다시 묻지 않고, [닉네임 변경] 을
   눌렀을 때만 바뀝니다.
     · supabase 모드: 익명 세션(auth.uid)에 profiles 행을 묶습니다.
     · local 모드   : localStorage 에만 저장합니다 (중복 검사 없음).
   =================================================================== */

const NICKNAME_STORAGE_KEY = 'guitarblitz.nickname';

const NICKNAME_RULES = {
    minLength: 2,
    maxLength: 12,
    // 한글·영문·숫자와 _ - 만 허용. 공백은 앞뒤로 잘라낸 뒤 금지합니다.
    pattern: /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9_-]+$/
};

const Player = {
    nickname: null,

    async init() {
        this.nickname = readStoredNickname();

        // 서버에 등록된 닉네임이 있으면 그쪽을 정본으로 삼습니다.
        // (같은 브라우저에서 localStorage 만 지워진 경우 복구됨)
        if (Backend.mode === 'supabase') {
            const remote = await this._fetchRemoteNickname();
            if (remote) {
                this.nickname = remote;
                writeStoredNickname(remote);
            }
        }
        return this.nickname;
    },

    has() {
        return Boolean(this.nickname);
    },

    /** 형식 검사. 서버 왕복 없이 즉시 판정합니다. */
    validate(raw) {
        const name = (raw || '').trim();

        if (name.length < NICKNAME_RULES.minLength) {
            return { ok: false, message: `${NICKNAME_RULES.minLength}자 이상 입력해주세요.` };
        }
        if (name.length > NICKNAME_RULES.maxLength) {
            return { ok: false, message: `${NICKNAME_RULES.maxLength}자 이하로 입력해주세요.` };
        }
        if (!NICKNAME_RULES.pattern.test(name)) {
            return { ok: false, message: '한글, 영문, 숫자와 _ - 만 사용할 수 있습니다.' };
        }
        return { ok: true, value: name };
    },

    /**
     * 중복 여부를 미리 확인합니다. 어디까지나 입력 중 안내용이고,
     * 실제 보장은 DB 의 유니크 인덱스가 합니다 (save 에서 처리).
     */
    async isAvailable(raw) {
        const check = this.validate(raw);
        if (!check.ok) return { available: false, message: check.message };

        if (Backend.mode !== 'supabase') {
            return { available: true, message: '사용 가능합니다. (이 브라우저에만 저장됩니다)' };
        }

        const { data, error } = await Backend.client
            .from('profiles')
            .select('id')
            .ilike('nickname', check.value)
            .maybeSingle();

        if (error) {
            return { available: true, message: '중복 확인에 실패했습니다. 등록 시 다시 검사합니다.' };
        }
        if (data && data.id !== Backend.userId) {
            return { available: false, message: '이미 사용 중인 닉네임입니다.' };
        }
        return { available: true, message: '사용 가능한 닉네임입니다.' };
    },

    /** 닉네임을 확정 저장합니다. 중복은 여기서 최종 판정됩니다. */
    async save(raw) {
        const check = this.validate(raw);
        if (!check.ok) return { ok: false, message: check.message };

        if (Backend.mode !== 'supabase') {
            this.nickname = check.value;
            writeStoredNickname(check.value);
            return { ok: true, nickname: check.value };
        }

        const { error } = await Backend.client
            .from('profiles')
            .upsert({ id: Backend.userId, nickname: check.value }, { onConflict: 'id' });

        if (error) {
            // 23505 = unique_violation. 유니크 인덱스가 잡아낸 실제 중복입니다.
            if (error.code === '23505') {
                return { ok: false, message: '이미 사용 중인 닉네임입니다.' };
            }
            return { ok: false, message: `등록에 실패했습니다: ${error.message}` };
        }

        this.nickname = check.value;
        writeStoredNickname(check.value);
        return { ok: true, nickname: check.value };
    },

    async _fetchRemoteNickname() {
        const { data, error } = await Backend.client
            .from('profiles')
            .select('nickname')
            .eq('id', Backend.userId)
            .maybeSingle();

        if (error || !data) return null;
        return data.nickname;
    }
};

function readStoredNickname() {
    try {
        return localStorage.getItem(NICKNAME_STORAGE_KEY) || null;
    } catch (e) {
        // 시크릿 모드 등에서 localStorage 가 막힐 수 있습니다.
        return null;
    }
}

function writeStoredNickname(nickname) {
    try {
        localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
    } catch (e) {
        console.warn('[Player] 닉네임을 브라우저에 저장하지 못했습니다.', e);
    }
}
