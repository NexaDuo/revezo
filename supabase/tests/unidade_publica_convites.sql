-- Executar como postgres após as migrações. Nenhum dado de teste persiste.
begin;
insert into public.unidades(id,slug,nome,publica) values
 ('a1000000-0000-4000-8000-000000000001','teste-publica-convites','Pública fictícia',true),
 ('a1000000-0000-4000-8000-000000000002','teste-privada-convites','Privada fictícia',false);
insert into public.equipe(unidade_id,nome,nome_curto,categoria,turno_base) values
 ('a1000000-0000-4000-8000-000000000001','Pessoa pública fictícia','PUB','enf','manha'),
 ('a1000000-0000-4000-8000-000000000002','Pessoa privada fictícia','PRI','enf','manha');
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('b1000000-0000-4000-8000-000000000001','coord-convites@example.invalid','{}',now()),
 ('b1000000-0000-4000-8000-000000000002','outra-convites@example.invalid','{}',now());
update public.profiles set role='coordenador', unidade_id='a1000000-0000-4000-8000-000000000001'
 where id='b1000000-0000-4000-8000-000000000001';
update public.profiles set role='visualizador', unidade_id='a1000000-0000-4000-8000-000000000002'
 where id='b1000000-0000-4000-8000-000000000002';

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
 assert (select count(*) from public.equipe where nome_curto='PUB' and unidade_id='a1000000-0000-4000-8000-000000000001') = 1, 'anon deve ler equipe pública';
 assert (select count(*) from public.equipe where unidade_id='a1000000-0000-4000-8000-000000000002') = 0, 'anon não pode ler equipe privada';
 begin
  insert into public.equipe(unidade_id,nome,nome_curto,categoria,turno_base)
   values ('a1000000-0000-4000-8000-000000000001','Intruso','X','tec','manha');
  assert false, 'anon não pode inserir';
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000001"}';
do $$
declare afetadas integer;
begin
 assert (select count(*) from public.profiles where id='b1000000-0000-4000-8000-000000000001') = 1, 'coordenador lê próprio perfil';
 assert (select count(*) from public.profiles where id='b1000000-0000-4000-8000-000000000002') = 0, 'coordenador não lê perfil de outra unidade';
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
 insert into public.convites(email,unidade_id,role,convidado_por) values
   ('novo-convites@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador',auth.uid());
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

-- E-mail não confirmado (cadastro por senha) não herda convite.
insert into public.convites(email,unidade_id,role) values
 ('nao-confirmado@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador');
insert into auth.users(id,email,raw_user_meta_data) values
 ('b1000000-0000-4000-8000-000000000004','nao-confirmado@example.invalid','{}');
do $$
begin
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000004'
   and role='visualizador' and unidade_id is null), 'não confirmado não herda convite';
 assert exists (select 1 from public.convites where email='nao-confirmado@example.invalid'
   and aceito_em is null), 'convite segue pendente';
end $$;

-- O trigger precisa normalizar o e-mail e consumir exatamente o convite pendente.
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
 ('b1000000-0000-4000-8000-000000000003','Novo-Convites@example.invalid','{}',now());
do $$
begin
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000003'
   and role='coordenador' and unidade_id='a1000000-0000-4000-8000-000000000001'), 'trigger aplica convite';
 assert exists (select 1 from public.convites where email='novo-convites@example.invalid'
   and aceito_em is not null and aceito_por='b1000000-0000-4000-8000-000000000003'), 'trigger marca aceite';
end $$;

-- Convite posterior ao primeiro login: e-mail vem de auth.users, não do JWT.
insert into public.convites(email,unidade_id,role) values
 ('outra-convites@example.invalid','a1000000-0000-4000-8000-000000000001','coordenador');
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"b1000000-0000-4000-8000-000000000002","email":"falso@example.invalid"}';
select public.aceitar_convite();
select public.aceitar_convite(); -- idempotente
reset role;
do $$
begin
 assert exists (select 1 from public.profiles where id='b1000000-0000-4000-8000-000000000002'
   and role='coordenador' and unidade_id='a1000000-0000-4000-8000-000000000001'), 'RPC aplica convite de usuário existente';
 assert exists (select 1 from public.convites where email='outra-convites@example.invalid'
   and aceito_por='b1000000-0000-4000-8000-000000000002' and aceito_em is not null), 'RPC marca aceite';
 assert not has_function_privilege('anon','public.aceitar_convite()','execute'), 'anon não executa RPC';
end $$;
rollback;
