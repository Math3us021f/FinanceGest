-- Rode no SQL Editor do Supabase.
create table public.lancamentos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  descricao text not null,
  valor numeric(10, 2) not null check (valor > 0),
  tipo text not null check (tipo in ('receita', 'despesa')),
  categoria text not null,
  metodo_pagamento text default 'Pix',
  data date not null default current_date,
  criado_em timestamp with time zone default timezone('utc'::text, now()) not null
);

create index on public.lancamentos (user_id, data desc);

alter table public.lancamentos enable row level security;

-- Restritiva sozinha não concede acesso: precisa de ao menos uma policy permissiva.
create policy "Dono acessa seus lancamentos"
  on public.lancamentos
  as permissive
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Exige 2FA (aal2) em toda operação.
create policy "Exige 2FA ativo"
  on public.lancamentos
  as restrictive
  for all
  to authenticated
  using (auth.uid() = user_id and (select auth.jwt()->>'aal') = 'aal2')
  with check (auth.uid() = user_id and (select auth.jwt()->>'aal') = 'aal2');
