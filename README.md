# JPA Scoreboard

GitHub Pages × Supabase で動く麻雀スコア管理アプリです。  
**一度だけ** 以下の手順を行えば、以降は `main` ブランチへ push するだけで自動デプロイされます。

---

## 初回セットアップ（3ステップ）

### 1. Supabase プロジェクトを作成・設定

1. [app.supabase.com](https://app.supabase.com) でプロジェクトを作成
2. **SQL Editor** を開き、`supabase-setup.sql` の内容をそのまま実行
3. **Authentication → Settings → Email Auth** で  
   「Enable email confirmations」を **OFF** に変更して保存
4. **Settings → API** から以下の値をコピー  
   - `Project URL` → `SUPABASE_URL`  
   - `anon / public` キー → `SUPABASE_ANON_KEY`

### 2. GitHub Secrets に登録

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で 2 つ登録：

| Name | Value |
|------|-------|
| `SUPABASE_URL` | 手順 1 でコピーした Project URL |
| `SUPABASE_ANON_KEY` | 手順 1 でコピーした anon key |

### 3. GitHub Pages を有効化

リポジトリの **Settings → Pages** で  
**Source** を `GitHub Actions` に変更して保存。

---

## デプロイ

`main` への push ごとに自動でデプロイされます。  
手動実行は **Actions → Deploy to GitHub Pages → Run workflow** から可能です。

公開 URL: `https://<your-username>.github.io/<repo-name>/`
