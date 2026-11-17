# FinanceGest

Gestor financeiro pessoal: HTML/CSS/JS puro + Supabase (Auth com TOTP + RLS). Sem build.

## Setup
1. Crie um projeto no Supabase e rode `supabase.sql` no SQL Editor.
2. Em **Authentication > Providers**, deixe Email ligado e **desative "Allow new users to sign up"** (app pessoal). Em **Authentication > MFA**, confirme que TOTP está habilitado.
3. Crie seu usuário em **Authentication > Users > Add user** (marque auto-confirm).
4. Copie `.env.example` para `.env`, preencha a Project URL e a publishable/anon key e rode `.\gerar-config.ps1` (gera `js/config.js`; ambos são ignorados pelo Git).
5. Em **Authentication > URL Configuration**, coloque a URL do GitHub Pages em *Site URL*.
6. Deploy: no GitHub, em **Settings > Secrets and variables > Actions**, crie os secrets `SUPABASE_URL` e `SUPABASE_ANON_KEY`; em **Settings > Pages > Source**, escolha **GitHub Actions**. Cada push na `main` publica via `.github/workflows/deploy.yml`.
7. Teste local: `python -m http.server 3000` (módulos ES não funcionam via `file://`).

## Teste de aceite
Com a sessão `aal1` (só senha), `select * from lancamentos` via API retorna zero linhas; após o código TOTP (`aal2`), retorna os dados.
