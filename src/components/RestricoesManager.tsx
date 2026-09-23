import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkContext } from '../context/WorkContext';
import {
  getEquipes, getSitios,
  addProibicao, updateProibicao, deleteProibicao,
  addDuplaProibida, updateDuplaProibida, deleteDuplaProibida,
  addColocacaoFixa, updateColocacaoFixa, deleteColocacaoFixa,
} from '../lib/db';
import { listarPagina } from '../lib/paginacao';
import { DataTable } from './DataTable';
import { RecordForm } from './RecordForm';

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const TURNOS: [string, string][] = [['manha', 'Manhã'], ['tarde', 'Tarde']];
const TIPOS: [string, string][] = [['fixa_sitio', 'Fica neste sítio'], ['fora_do', 'Fica fora das Ações']];
const SELECIONE: [string, string] = ['', 'Selecione'];

/** Restrições que o solver lê por unidade (`loadConfig.ts`): quem não pode
 *  entrar em qual sítio, quem não trabalha junto e quem tem lugar fixo.
 *  Nome próprio aqui é dado da unidade, nunca código. */
export function RestricoesManager() {
  const { unidadeId, podeGravar, isLoading } = useWorkContext();
  const client = useQueryClient();
  const habilitado = !isLoading && !!unidadeId;

  // Opções dos formulários. As chaves começam por ['equipe', unidade] e
  // ['sitios', unidade] para que editar a Equipe ou os Sítios as invalide.
  const equipe = useQuery({ queryKey: ['equipe', unidadeId, 'opcoes'], queryFn: () => getEquipes(unidadeId), enabled: habilitado });
  const sitios = useQuery({ queryKey: ['sitios', unidadeId, 'opcoes'], queryFn: () => getSitios(unidadeId), enabled: habilitado });
  const pessoas: [string, string][] = (equipe.data ?? []).map((p: any) => [p.nome_curto, p.nome_curto]);
  const nomesSitios: [string, string][] = (sitios.data ?? []).map((s: any) => [s.nome, s.nome]);
  const semOpcoes = equipe.isError || sitios.isError
    ? 'Não foi possível carregar a equipe e os sítios desta unidade para montar o formulário.'
    : equipe.data && !equipe.data.length ? 'Cadastre a equipe da unidade antes de criar restrições.' : null;

  const invalidar = (tabela: string) => client.invalidateQueries({ queryKey: [tabela, unidadeId] });
  const exigir = (valor: unknown, campo: string) => {
    if (valor === '' || valor == null) throw new Error(`Informe ${campo}.`);
  };
  const aviso = semOpcoes && <p role="alert" className="rounded-md border-l-4 border-marca-rigida bg-white px-3 py-2 text-sm text-red-900">{semOpcoes}</p>;

  return (
    <div className="space-y-12">
      <DataTable<any>
        titulo="Proibições por sítio"
        descricao="Quem nunca entra em determinado sítio. O solver respeita enquanto a regra Proibições por sítio estiver ligada."
        queryKey={['proibicoes', unidadeId]} enabled={habilitado} podeEditar={podeGravar}
        fetchPage={f => listarPagina('proibicoes', unidadeId, { ...f, ordem: 'pessoa_curto' })}
        getRowId={r => r.id}
        columns={[
          { key: 'pessoa_curto', header: 'Pessoa', searchable: true },
          { key: 'sitio_nome', header: 'Sítio', searchable: true },
          { key: 'motivo', header: 'Motivo', render: r => r.motivo || '—' },
        ]}
        renderForm={(r, fechar) => <>
          {aviso}
          <RecordForm
            inicial={r ?? { pessoa_curto: '', sitio_nome: '', motivo: '' }} fechar={fechar}
            fields={[
              { key: 'pessoa_curto', label: 'Pessoa', options: [SELECIONE, ...pessoas] },
              { key: 'sitio_nome', label: 'Sítio', options: [SELECIONE, ...nomesSitios] },
              { key: 'motivo', label: 'Motivo' },
            ]}
            salvar={async d => {
              exigir(d.pessoa_curto, 'a pessoa'); exigir(d.sitio_nome, 'o sítio');
              const payload = { pessoa_curto: d.pessoa_curto, sitio_nome: d.sitio_nome, motivo: d.motivo?.trim() || null };
              if (r) await updateProibicao(r.id, payload, unidadeId); else await addProibicao(payload, unidadeId);
              await invalidar('proibicoes');
            }}
            excluir={r ? async () => { await deleteProibicao(r.id, unidadeId); await invalidar('proibicoes'); } : undefined}
          />
        </>}
      />

      <DataTable<any>
        titulo="Duplas proibidas"
        descricao="Duas pessoas que não devem ficar no mesmo sítio e turno."
        queryKey={['duplas_proibidas', unidadeId]} enabled={habilitado} podeEditar={podeGravar}
        fetchPage={f => listarPagina('duplas_proibidas', unidadeId, { ...f, ordem: 'pessoa_a' })}
        getRowId={r => r.id}
        columns={[
          { key: 'pessoa_a', header: 'Pessoa', searchable: true },
          { key: 'pessoa_b', header: 'Não junto com', searchable: true },
          { key: 'motivo', header: 'Motivo', render: r => r.motivo || '—' },
        ]}
        renderForm={(r, fechar) => <>
          {aviso}
          <RecordForm
            inicial={r ?? { pessoa_a: '', pessoa_b: '', motivo: '' }} fechar={fechar}
            fields={[
              { key: 'pessoa_a', label: 'Pessoa', options: [SELECIONE, ...pessoas] },
              { key: 'pessoa_b', label: 'Não junto com', options: [SELECIONE, ...pessoas] },
              { key: 'motivo', label: 'Motivo' },
            ]}
            salvar={async d => {
              exigir(d.pessoa_a, 'a pessoa'); exigir(d.pessoa_b, 'com quem ela não pode ficar');
              if (d.pessoa_a === d.pessoa_b) throw new Error('Escolha duas pessoas diferentes.');
              const payload = { pessoa_a: d.pessoa_a, pessoa_b: d.pessoa_b, motivo: d.motivo?.trim() || null };
              if (r) await updateDuplaProibida(r.id, payload, unidadeId); else await addDuplaProibida(payload, unidadeId);
              await invalidar('duplas_proibidas');
            }}
            excluir={r ? async () => { await deleteDuplaProibida(r.id, unidadeId); await invalidar('duplas_proibidas'); } : undefined}
          />
        </>}
      />

      <DataTable<any>
        titulo="Colocações fixas"
        descricao="Lugar garantido num dia e turno. Marque quando a colocação depende do dia de plantão da pessoa: se o plantão mudar, ela precisa ser revista."
        queryKey={['colocacoes_fixas', unidadeId]} enabled={habilitado} podeEditar={podeGravar}
        fetchPage={f => listarPagina('colocacoes_fixas', unidadeId, { ...f, ordem: 'dia' })}
        getRowId={r => r.id}
        columns={[
          { key: 'pessoa_curto', header: 'Pessoa', searchable: true },
          { key: 'dia', header: 'Dia', render: r => DIAS_SEMANA[r.dia] ?? r.dia },
          { key: 'turno', header: 'Turno', render: r => r.turno === 'manha' ? 'Manhã' : 'Tarde' },
          { key: 'tipo', header: 'Colocação', render: r => r.tipo === 'fora_do' ? 'Fora das Ações' : r.sitio_nome },
          { key: 'descricao', header: 'Descrição', searchable: true, render: r => r.descricao || '—' },
          { key: 'depende_de_plantao', header: 'Depende do plantão', render: r => r.depende_de_plantao ? 'Sim' : 'Não' },
        ]}
        renderForm={(r, fechar) => <>
          {aviso}
          <RecordForm
            inicial={r ? { ...r, dia: String(r.dia) } : { pessoa_curto: '', dia: '0', turno: 'manha', tipo: 'fixa_sitio', sitio_nome: '', descricao: '', depende_de_plantao: false }}
            fechar={fechar}
            fields={[
              { key: 'pessoa_curto', label: 'Pessoa', options: [SELECIONE, ...pessoas] },
              { key: 'dia', label: 'Dia', options: DIAS_SEMANA.map((d, i) => [String(i), d]) },
              { key: 'turno', label: 'Turno', options: TURNOS },
              { key: 'tipo', label: 'Colocação', options: TIPOS },
              { key: 'sitio_nome', label: 'Sítio (quando fica num sítio)', options: [SELECIONE, ...nomesSitios] },
              { key: 'descricao', label: 'Descrição' },
              { key: 'depende_de_plantao', label: 'Depende do dia de plantão', type: 'checkbox' },
            ]}
            salvar={async d => {
              exigir(d.pessoa_curto, 'a pessoa');
              if (d.tipo === 'fixa_sitio') exigir(d.sitio_nome, 'o sítio');
              const payload = {
                pessoa_curto: d.pessoa_curto, dia: Number(d.dia), turno: d.turno, tipo: d.tipo,
                // A coluna é obrigatória; "fora das Ações" não usa sítio.
                sitio_nome: d.tipo === 'fixa_sitio' ? d.sitio_nome : '',
                descricao: d.descricao?.trim() || null, depende_de_plantao: !!d.depende_de_plantao,
              };
              if (r) await updateColocacaoFixa(r.id, payload, unidadeId); else await addColocacaoFixa(payload, unidadeId);
              await invalidar('colocacoes_fixas');
            }}
            excluir={r ? async () => { await deleteColocacaoFixa(r.id, unidadeId); await invalidar('colocacoes_fixas'); } : undefined}
          />
        </>}
      />
    </div>
  );
}
