-- Tabela de projetos (folhas salvas)
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Sem título',
  max_height_cm numeric not null default 100,
  data jsonb not null default '{}'::jsonb, -- images + pages serializados
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Usuários veem só seus projetos"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Usuários criam seus projetos"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Usuários atualizam seus projetos"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Usuários deletam seus projetos"
  on public.projects for delete
  using (auth.uid() = user_id);

-- Storage bucket para imagens dos projetos
insert into storage.buckets (id, name, public)
values ('gang-sheet-assets', 'gang-sheet-assets', false)
on conflict (id) do nothing;

create policy "Usuários leem seus arquivos"
  on storage.objects for select
  using (bucket_id = 'gang-sheet-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Usuários sobem seus arquivos"
  on storage.objects for insert
  with check (bucket_id = 'gang-sheet-assets' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Usuários deletam seus arquivos"
  on storage.objects for delete
  using (bucket_id = 'gang-sheet-assets' and (storage.foldername(name))[1] = auth.uid()::text);
