-- ============================================================
-- JPA Scoreboard - Supabase セットアップ SQL
-- ============================================================
-- このファイルを Supabase プロジェクトの SQL Editor で実行してください。
-- https://app.supabase.com のプロジェクト > SQL Editor > New query
-- ============================================================

-- 1. user_data テーブルの作成
create table if not exists public.user_data (
  id uuid references auth.users(id) on delete cascade primary key,
  match_history jsonb not null default '[]'::jsonb,
  player_dict jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Row Level Security (RLS) を有効化
alter table public.user_data enable row level security;

-- 3. RLS ポリシー: 自分のデータのみ参照・作成・更新可能
create policy "ユーザーは自分のデータのみ参照できる"
  on public.user_data
  for select
  using (auth.uid() = id);

create policy "ユーザーは自分のデータのみ作成できる"
  on public.user_data
  for insert
  with check (auth.uid() = id);

create policy "ユーザーは自分のデータのみ更新できる"
  on public.user_data
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- セットアップ後の確認事項
-- ============================================================
-- 1. Supabase ダッシュボード > Authentication > Settings にて
--    「Enable email confirmations」を OFF にしてください。
--    これにより、登録直後にすぐログインできるようになります。
--
-- 2. jpa-score.html の以下の箇所を実際の値に置き換えてください:
--    const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';
--    const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
--
--    これらの値は Supabase プロジェクト > Settings > API で確認できます。
--    anon (public) key はフロントエンドに公開して問題ありません。
--    RLS ポリシーにより、各ユーザーは自分のデータにのみアクセスできます。
-- ============================================================
