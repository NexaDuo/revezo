-- Presença por prerrogativa de função.
--
-- Antes: canal público `system-presence:global`. Todo usuário logado, de
-- qualquer unidade, recebia o UUID e o horário online de todos.
--
-- Agora: canal PRIVADO por unidade, com tópico `presence:unidade:<uuid>`.
-- O Realtime autoriza o join se a pessoa tiver leitura OU escrita no tópico:
--   * escrita (track): todo perfil ativo, só no tópico da própria unidade.
--     É assim que a pessoa aparece online para a coordenação;
--   * leitura (receber quem está online): coordenador da própria unidade e
--     admin (qualquer unidade). Usuário comum anuncia presença, mas não vê ninguém.
-- Nesta tabela o Realtime não grava mensagens: ele roda a query de
-- autorização e desfaz.

begin;

create policy "presenca: perfil ativo anuncia na propria unidade"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo
      and p.unidade_id is not null
      and (select realtime.topic()) = 'presence:unidade:' || p.unidade_id::text
  )
);

create policy "presenca: coordenacao da unidade e admin recebem"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and (
    (select public.is_admin())
    and (select realtime.topic()) like 'presence:unidade:%'
    or
    (select public.is_coordenador())
    and (select realtime.topic()) = 'presence:unidade:' || (select public.minha_unidade())::text
  )
);

commit;
