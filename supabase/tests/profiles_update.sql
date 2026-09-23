-- Executar como postgres após as migrações. Nenhum dado de teste persiste.
begin;
set local plpgsql.check_asserts = on;
insert into public.unidades(id,slug,nome) values ('c2000000-0000-4000-8000-000000000001','teste-profiles-update','Unidade fictícia');
insert into auth.users(id,email,raw_user_meta_data) values
 ('c1000000-0000-4000-8000-000000000001','vis-update@example.invalid','{}'),
 ('c1000000-0000-4000-8000-000000000002','admin-update@example.invalid','{}');
update public.profiles set role='visualizador', unidade_id='c2000000-0000-4000-8000-000000000001' where id='c1000000-0000-4000-8000-000000000001';
update public.profiles set role='admin', ativo=true where id='c1000000-0000-4000-8000-000000000002';

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000001"}';
do $$ declare n int; begin
  update public.profiles set nome='Novo nome' where id=auth.uid(); get diagnostics n = row_count;
  assert n = 1, 'usuário edita o próprio nome';
  begin update public.profiles set role='admin' where id=auth.uid(); assert false, 'não se promove';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set unidade_id=null where id=auth.uid(); assert false, 'não troca unidade';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set ativo=false where id=auth.uid(); assert false, 'não muda ativo';
  exception when insufficient_privilege then null; end;
  update public.profiles set nome='x' where id='c1000000-0000-4000-8000-000000000002'; get diagnostics n = row_count;
  assert n = 0, 'não edita outro perfil';
end $$;

-- Regressão: admin trocando papel dava "infinite recursion detected in policy".
set local request.jwt.claims = '{"role":"authenticated","sub":"c1000000-0000-4000-8000-000000000002"}';
do $$ declare n int; begin
  update public.profiles set role='coordenador' where id='c1000000-0000-4000-8000-000000000001'; get diagnostics n = row_count;
  assert n = 1, 'admin atualiza papel';
end $$;
reset role;
rollback;
