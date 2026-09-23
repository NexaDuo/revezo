-- Executar como postgres após as migrações. Nenhum dado de teste persiste.
-- Usuários: 001 coordenador da pública (A); 002 visualizador da privada (B);
-- 003 novo via Google; 004 novo via senha; 005 admin.
begin;
insert into public.unidades(id,slug,nome,publica) values
 ('a1000000-0000-4000-8000-000000000001','teste-publica-convites','Pública fictícia',true),
 ('a1000000-0000-4000-8000-000000000002','teste-privada-convites','Privada fictícia',false);
insert into public.equipe(unidade_id,nome,nome_curto,categoria,turno_base) values
 ('a1000000-0000-4000-8000-000000000001','Pessoa pública fictícia','PUB','enf','manha'),
 ('a1000000-0000-4000-8000-000000000002','Pessoa privada fictícia','PRI','enf','manha');
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('b1000000-0000-4000-8000-000000000001','coord-convites@example.invalid','{}',now()),
 ('b1000000-0000-4000-8000-000000000002','outra-convites@example.invalid','{}',now()),
 ('b1000000-0000-4000-8000-000000000005','admin-convites@example.invalid','{}',now());
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-001','b1000000-0000-4000-8000-000000000001','{"email":"coord-convites@example.invalid","email_verified":true}','google'),
 ('g-002','b1000000-0000-4000-8000-000000000002','{"email":"outra-convites@example.invalid","email_verified":true}','google'),
 ('g-005','b1000000-0000-4000-8000-000000000005','{"email":"admin-convites@example.invalid","email_verified":true}','google');
update public.profiles set role='coordenador', unidade_id='a1000000-0000-4000-8000-000000000001'
 where id='b1000000-0000-4000-8000-000000000001';
update public.profiles set role='visualizador', unidade_id='a1000000-0000-4000-8000-000000000002'
 where id='b1000000-0000-4000-8000-000000000002';
update public.profiles set role='admin', unidade_id=null
 where id='b1000000-0000-4000-8000-000000000005';
insert into public.convites(email,unidade_id,role,convidado_por,aceito_em) values
 ('ja-aceito@example.invalid','a1000000-0000-4000-8000-000000000001','visualizador',
  'b1000000-0000-4000-8000-000000000001',now());

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
 assert (select count(*) from public.equipe where nome_curto='PUB' and unidade_id='a1000000-0000-4000-8000-000000000001') = 1, 'anon deve ler equipe pública';
 assert (select count(*) from public.equipe where unidade_id='a1000000-0000-4000-8000-000000000002') = 0, 'anon não pode ler equipe privada';
 assert (select count(*) from public.unidades where id='a1000000-0000-4000-8000-000000000002') = 0, 'anon não lê unidade privada';
 begin
  assert (select count(*) from public.profiles) = 0, 'anon não lê perfis';
 exception when insufficient_privilege then null;
 end;
 begin
  perform 1 from public.convites;
  assert false, 'anon não lê convites';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.equipe(unidade_id,nome,nome_curto,categoria,turno_base)
   values ('a1000000-0000-4000-8000-000000000001','Intruso','X','tec','manha');
  assert false, 'anon não pode inserir';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

-- Visualizador não cria nem apaga convite.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000002"}';
do $$
declare afetadas integer;
begin
 begin
  insert into public.convites(email,unidade_id,role,convidado_por) values
   ('visualizador-convida@example.invalid','a1000000-0000-4000-8000-000000000002','visualizador',auth.uid());
  assert false, 'visualizador não convida';
 exception when insufficient_privilege then null;
 end;
 delete from public.convites;
 get diagnostics afetadas = row_count;
 assert afetadas = 0, 'visualizador não apaga convite';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000001"}';
do $$
declare afetadas integer;
begin
 assert (select count(*) from public.profiles where id='b1000000-0000-4000-8000-000000000001') = 1, 'coordenador lê próprio perfil';
 assert (select count(*) from public.profiles where id='b1000000-0000-4000-8000-000000000002') = 0, 'coordenador não lê perfil de outra unidade';
 assert (select count(*) from public.escalas_semanais where unidade_id='a1000000-0000-4000-8000-000000000002') = 0, 'coordenador não lê escala de outra unidade';
 assert (select count(*) from public.disponibilidade_semanal where unidade_id='a1000000-0000-4000-8000-000000000002') = 0, 'coordenador não lê disponibilidade de outra unidade';
 begin
  insert into public.convites(email,unidade_id,role,convidado_por) values
   ('admin-proibido@example.invalid','a1000000-0000-4000-8000-000000000001','admin',auth.uid());
  assert false, 'coordenador não convida admin';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.convites(email,unidade_id,role,convidado_por) values
   ('unidade-proibida@example.invalid','a1000000-0000-4000-8000-000000000002','visualizador',auth.uid());
  assert false, 'coordenador não convida para outra unidade';
 exception when insufficient_privilege then null;
 end;
 begin
  insert into public.convites(email,unidade_id,role,convidado_por,aceito_em,aceito_por) values
   ('aceite-forjado@example.invalid','a1000000-0000-4000-8000-000000000001','visualizador',auth.uid(),now(),auth.uid());
  assert false, 'coordenador não pode forjar aceite';
 exception when insufficient_privilege then null;
 end;
 delete from public.convites where email='ja-aceito@example.invalid';
 get diagnostics afetadas = row_count;
 assert afetadas = 0, 'coordenador não apaga convite já aceito';
 insert into public.convites(email,unidade_id,role,convidado_por) values
   ('novo-convites@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador',auth.uid()),
   ('senha-convites@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador',auth.uid()),
   ('outra-convites@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador',auth.uid()),
   ('admin-convites@example.invalid','a1000000-0000-4000-8000-000000000001','visualizador',auth.uid());
 update public.convites set aceito_em=now() where email='novo-convites@example.invalid';
 get diagnostics afetadas = row_count;
 assert afetadas = 0, 'coordenador não pode atualizar aceito_em';
 update public.equipe set nome='Alterado' where unidade_id='a1000000-0000-4000-8000-000000000002';
 get diagnostics afetadas = row_count;
 assert afetadas = 0, 'UPDATE em outra unidade deve afetar zero linhas';
 delete from public.equipe where unidade_id='a1000000-0000-4000-8000-000000000002';
 get diagnostics afetadas = row_count;
 assert afetadas = 0, 'DELETE em outra unidade deve afetar zero linhas';
end $$;
reset role;

-- Novos usuários: o trigger não aplica convite; o aceite é da RPC no login.
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('b1000000-0000-4000-8000-000000000003','Novo-Convites@example.invalid','{}',now()),
 ('b1000000-0000-4000-8000-000000000004','senha-convites@example.invalid','{}',now());
insert into auth.identities(provider_id,user_id,identity_data,provider) values
 ('g-003','b1000000-0000-4000-8000-000000000003','{"email":"Novo-Convites@example.invalid","email_verified":true}','google'),
 ('b1000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000004','{"email":"senha-convites@example.invalid","email_verified":true}','email');
do $$
begin
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000003'
   and role='visualizador' and unidade_id is null), 'trigger não aplica convite';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000003"}';
select public.aceitar_convite();
select public.aceitar_convite(); -- idempotente
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000004"}';
select public.aceitar_convite();
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000002","email":"falso@example.invalid"}';
select public.aceitar_convite();
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000005"}';
select public.aceitar_convite();
reset role;
do $$
begin
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000003'
   and role='coordenador' and unidade_id='a1000000-0000-4000-8000-000000000001'), 'Google sem unidade aceita convite';
 assert exists (select 1 from public.convites where email='novo-convites@example.invalid'
   and aceito_por='b1000000-0000-4000-8000-000000000003' and aceito_em is not null), 'RPC marca aceite';
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000004'
   and role='visualizador' and unidade_id is null), 'cadastro por senha não herda convite';
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000002'
   and role='visualizador' and unidade_id='a1000000-0000-4000-8000-000000000002'), 'convite de coordenador não tira ninguém de outra unidade';
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000005'
   and role='admin'), 'convite nunca rebaixa admin';
 assert (select count(*) from public.convites where email in
   ('senha-convites@example.invalid','outra-convites@example.invalid','admin-convites@example.invalid')
   and aceito_em is null) = 3, 'convites recusados seguem pendentes';
 assert not has_function_privilege('anon','public.aceitar_convite()','execute'), 'anon não executa RPC';
end $$;

-- Convite emitido por admin pode mover usuário de unidade.
delete from public.convites where email='outra-convites@example.invalid';
insert into public.convites(email,unidade_id,role,convidado_por) values
 ('outra-convites@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador','b1000000-0000-4000-8000-000000000005');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000002"}';
select public.aceitar_convite();
reset role;
do $$
begin
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000002'
   and role='coordenador' and unidade_id='a1000000-0000-4000-8000-000000000001'), 'convite de admin move usuário';
end $$;
rollback;
