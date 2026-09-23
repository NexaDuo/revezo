import { test, expect } from '@playwright/test';
import { dadosParaIds, dadosParaNomes } from '../src/lib/dispIds';
import { HAS_ENV, autenticarComoCoordenador, mockarUnidade } from './supabase-mock';

const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const ID_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const equipeRefs = [{ id: ID_A, nome_curto: 'Aurora Nova' }, { id: ID_B, nome_curto: 'Ciro Cometa' }];
const S = ['OK', 'F', 'OK', 'OK', 'OK'];

// Lógica pura: mesma cobertura com e sem .env.
test('grava por id, lê pelo nome atual e tolera grade legada', () => {
  expect(dadosParaIds({ 'Aurora Nova': S, 'Fora da Equipe': S }, equipeRefs))
    .toEqual({ [ID_A]: S, 'Fora da Equipe': S });
  // legado (nome) e novo (id) convivem; id sem pessoa fica visível, não some
  const orfao = 'aaaaaaaa-0000-4000-8000-00000000dead';
  expect(dadosParaNomes({ [ID_A]: S, 'Ciro Cometa': S, [orfao]: S }, equipeRefs))
    .toEqual({ 'Aurora Nova': S, 'Ciro Cometa': S, [orfao]: S });
  // nome ambíguo na unidade: não chuta
  const dup = [...equipeRefs, { id: 'aaaaaaaa-0000-4000-8000-000000000003', nome_curto: 'Ciro Cometa' }];
  expect(dadosParaIds({ 'Ciro Cometa': S }, dup)).toEqual({ 'Ciro Cometa': S });
});

function segundaAtualISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('pessoa renomeada continua ligada à disponibilidade salva por id', async ({ page }) => {
  test.skip(!HAS_ENV, 'Sessão mockada exige configuração Supabase.');
  await autenticarComoCoordenador(page);
  const pessoa = (id: string, nome: string, categoria: string) => ({
    id, nome, nome_curto: nome, ativo: true, ordem: 0, categoria, turno_base: 'ambos',
    fixo_sitio_id: null, isento_acoes: false, custo_extra: 0,
  });
  await mockarUnidade(page, {
    // nome_curto mudou depois que a semana foi salva por id
    equipe: [pessoa(ID_A, 'Aurora Nova', 'enf'), pessoa(ID_B, 'Ciro Cometa', 'tec')],
    sitios: [
      { id: 's-1', ordem: 1, nome: 'Consulta', nome_tarde: null, categoria_permitida: 'ambos', opcional: false, prioridade_dupla: null },
    ],
    disponiveis: { data_inicio: segundaAtualISO(), dias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] },
    dadosDisponibilidade: { [ID_A]: ['F', 'F', 'F', 'F', 'F'], [ID_B]: Array(5).fill('OK') },
  });
  await page.goto(`/hospital-teste/${segundaAtualISO()}`);
  await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
  await expect(page.getByTestId('indicador-score')).toContainText(/Score: \d+/);
  await expect(page.getByRole('listitem').filter({ hasText: 'fora da equipe' })).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'sem linha de disponibilidade' })).toHaveCount(0);
  // Aurora está de folga a semana toda: a folga veio pelo id, então ela não entra
  await expect(page.getByRole('table').first()).not.toContainText('Aurora Nova');
  await expect(page.getByRole('table').first()).toContainText('Ciro Cometa');
});
