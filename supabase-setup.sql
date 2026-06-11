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

-- 4. プレイヤー名の一意性チェック関数（名前変更時に使用）
create or replace function public.check_email_available(player_email text)
returns boolean
language sql
security definer
set search_path = auth, public
as $$
  select not exists (
    select 1 from auth.users where email = player_email
  );
$$;

grant execute on function public.check_email_available(text) to authenticated;

-- 5. 全ユーザーのデータでプレイヤー名を一括変更する関数
create or replace function public.rename_player_in_all_histories(old_name text, new_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  updated_history jsonb;
  updated_dict jsonb;
  i integer;
  match_item jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  for rec in select id, match_history, player_dict from public.user_data loop
    -- match_history 内の名前を更新
    updated_history := '[]'::jsonb;
    for i in 0..jsonb_array_length(rec.match_history) - 1 loop
      match_item := rec.match_history->i;
      if match_item->'p1'->>'name' = old_name then
        match_item := jsonb_set(match_item, '{p1,name}', to_jsonb(new_name));
      end if;
      if match_item->'p2'->>'name' = old_name then
        match_item := jsonb_set(match_item, '{p2,name}', to_jsonb(new_name));
      end if;
      updated_history := updated_history || jsonb_build_array(match_item);
    end loop;

    -- player_dict のキー名を更新
    if rec.player_dict ? old_name then
      updated_dict := (rec.player_dict - old_name) || jsonb_build_object(new_name, rec.player_dict->old_name);
    else
      updated_dict := rec.player_dict;
    end if;

    update public.user_data
    set match_history = updated_history, player_dict = updated_dict
    where id = rec.id;
  end loop;
end;
$$;

grant execute on function public.rename_player_in_all_histories(text, text) to authenticated;

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
