-- ===================================================================
-- GuitarBlitz — Supabase 스키마
--
-- 적용 방법: Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 실행.
-- 사전 조건: Authentication > Sign In / Providers 에서 "Anonymous sign-ins" 활성화.
--
-- 설계 요약
--   · 브라우저마다 익명 계정(auth.users)이 하나 발급되고, 세션은 localStorage 에 남습니다.
--   · profiles 가 그 계정에 닉네임을 1:1 로 묶습니다. 그래서 재방문 시 다시 묻지 않습니다.
--   · 닉네임 중복은 애플리케이션이 아니라 아래 유니크 인덱스가 보장합니다.
--   · 익명 사용자도 role 은 authenticated 입니다 (anon 이 아닙니다).
-- ===================================================================


-- ------------------------------------------------------------------
-- 1. profiles : 익명 계정 ↔ 닉네임
-- ------------------------------------------------------------------
create table if not exists public.profiles (
    id         uuid primary key references auth.users (id) on delete cascade,
    nickname   text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 대소문자와 앞뒤 공백을 무시한 중복 방지.
-- 이것이 없으면 '기타왕', '기타왕 ', 'GuitarKing' / 'guitarking' 이 모두 공존합니다.
create unique index if not exists profiles_nickname_key
    on public.profiles (lower(trim(nickname)));

alter table public.profiles enable row level security;

-- 랭킹에 닉네임을 표시해야 하므로 읽기는 전체 공개.
drop policy if exists "profiles readable by everyone" on public.profiles;
create policy "profiles readable by everyone"
    on public.profiles for select
    using (true);

-- 쓰기는 본인 행만. 이것 때문에 남이 내 닉네임을 바꿀 수 없습니다.
drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
    on public.profiles for insert
    with check (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
    on public.profiles for update
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- delete 정책은 일부러 만들지 않습니다 → 아무도 삭제할 수 없습니다.


-- ------------------------------------------------------------------
-- 2. scores : 랭크전 1판의 결과
-- ------------------------------------------------------------------
create table if not exists public.scores (
    id            bigint generated always as identity primary key,
    user_id       uuid not null references public.profiles (id) on delete cascade,
    score         integer not null,
    correct_count integer not null,
    total_count   integer not null,
    max_combo     integer not null,
    created_at    timestamptz not null default now(),

    -- 점수는 클라이언트가 계산해 보내므로 위조를 완전히 막을 수는 없습니다.
    -- 아래는 터무니없는 값만 걸러내는 최소한의 상식 검사입니다.
    -- 60초 랭크전의 이론적 상한은 대략 25,000점 수준입니다.
    constraint scores_sane check (
        score between 0 and 100000
        and correct_count >= 0
        and total_count >= correct_count
        and max_combo between 0 and total_count
    )
);

create index if not exists scores_user_best_idx
    on public.scores (user_id, score desc);

alter table public.scores enable row level security;

drop policy if exists "scores readable by everyone" on public.scores;
create policy "scores readable by everyone"
    on public.scores for select
    using (true);

drop policy if exists "insert own scores" on public.scores;
create policy "insert own scores"
    on public.scores for insert
    with check (auth.uid() = user_id);

-- update / delete 정책 없음 → 한번 올린 기록은 수정·삭제 불가.


-- ------------------------------------------------------------------
-- 3. leaderboard : 사용자별 최고 기록 1건씩만 남긴 뷰
--    security_invoker = on 이라 위 RLS 정책이 그대로 적용됩니다.
-- ------------------------------------------------------------------
drop view if exists public.leaderboard;
create view public.leaderboard with (security_invoker = on) as
select distinct on (s.user_id)
    s.user_id,
    p.nickname,
    s.score,
    s.correct_count,
    s.total_count,
    s.max_combo,
    s.created_at
from public.scores s
join public.profiles p on p.id = s.user_id
order by s.user_id, s.score desc, s.created_at asc;

grant select on public.leaderboard to anon, authenticated;
