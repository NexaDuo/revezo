import { test, expect } from '@playwright/test';
import { montarConfig, type LinhasUnidade } from '../src/lib/montarConfig';
import { generateSchedule } from '../src/lib/solver';
import { HAS_ENV, autenticarComoCoordenador, mockarUnidade, responderPagina } from './supabase-mock';

const base = (): LinhasUnidade => ({
  equipe: ['Aurora Estelar', 'Ciro Cometa', 'Lira Boreal', 'Nilo Solar'].map((nome, i) => ({
    id: `p-${i}`, nome, nome_curto: nome, ativo: true, ordem: i,
    categoria: i % 2 ? 'tec' : 'enf', turno_base: 'ambos', fixo_sitio_id: null,
    isento_acoes: false, custo_extra: 0,
  })),
  sitios: [
    { id: 's-1', ordem: 1, nome: 'Consulta', nome_tarde: null, categoria_permitida: 'enf', opcional: false, prioridade_dupla: null },
    { id: 's-2', ordem: 2, nome: 'Curativo', nome_tarde: null, categoria_permitida: 'tec', opcional: false, prioridade_dupla: null },
    { id: 's-3', ordem: 3, nome: 'Ações', nome_tarde: null, categoria_permitida: 'ambos', opcional: false, prioridade_dupla: null },
  ],
  regras: [],
  proibicoes: [{ id: 'pr-1', pessoa_id: 'p-0', sitio_id: 's-1' }],
  duplas: [{ id: 'dp-1', pessoa_a_id: 'p-0', pessoa_b_id: 'p-1' }],
  fixas: [{ id: 'cf-1', pessoa_id: 'p-0', sitio_id: 's-3', dia: 0, turno: 'manha', tipo: 'fixa_sitio' }],
});

// Lógica pura: mesma cobertura com e sem .env.
test('renomear pessoa preserva fixa, proibição e dupla pelo id', () => {
  const linhas = base();
  expect(montarConfig(linhas).config.fixas[0].p).toBe('Aurora Estelar');
  linhas.equipe[0].nome_curto = 'Aurora Nova';
  const { config, avisos } = montarConfig(linhas);
  expect(avisos).toEqual([]);
  expect(config.fixas[0].p).toBe('Aurora Nova');
  expect(config.proibicoes).toEqual([{ pessoa: 'Aurora Nova', sitio: 'Consulta' }]);
  expect(config.duplasProibidas).toEqual([['Aurora Nova', 'Ciro Cometa']]);
  const resultado = generateSchedule({ ...config, disp: {} });
  expect(resultado.escala.manha['Ações'][0]).toContain('Aurora Nova');
  for (const turno of ['manha', 'tarde'] as const)
    for (const dia of resultado.escala[turno]['Consulta']) expect(dia).not.toContain('Aurora Nova');
});

for (const estado of ['inativa', 'inexistente']) {
  test(`pessoa ${estado}: todas as regras avisam e são ignoradas`, () => {
    const linhas = base();
    linhas.fixas.push({ pessoa_id: 'p-0', dia: 1, turno: 'tarde', tipo: 'fora_do' });
    if (estado === 'inativa') linhas.equipe[0].ativo = false;
    else linhas.equipe.shift();
    const { config, avisos } = montarConfig(linhas);
    expect(avisos).toHaveLength(4);
    expect(avisos.join(' ')).toContain(estado === 'inativa' ? 'pessoa inativa (Aurora Estelar)' : 'pessoa não encontrada');
    expect(avisos.join(' ')).not.toMatch(/p-0|undefined/);
    expect(config.fixas).toEqual([]);
    expect(config.fixasNaoAcoes).toEqual([]);
    expect(config.proibicoes).toEqual([]);
    expect(config.duplasProibidas).toEqual([]);
  });
}

function segundaAtualISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('renomear em Equipe mantém regras, busca pelo nome novo e geração da grade', async ({ page }) => {
  test.skip(!HAS_ENV, 'Sessão mockada exige configuração Supabase.');
  await autenticarComoCoordenador(page);
  const linhas = base();
  await mockarUnidade(page, {
    ...linhas, colocacoesFixas: linhas.fixas, duplasProibidas: linhas.duplas,
    disponiveis: { data_inicio: segundaAtualISO(), dias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] },
  });
  await page.route('**/rest/v1/equipe*', async route => {
    if (route.request().method() === 'PATCH') {
      const id = new URL(route.request().url()).searchParams.get('id')?.slice(3);
      const pessoa = linhas.equipe.find(p => p.id === id)!;
      Object.assign(pessoa, route.request().postDataJSON());
      return route.fulfill({ json: [{ id }] });
    }
    return responderPagina(route, linhas.equipe);
  });
  await page.goto('/equipe');
  await page.getByRole('row').filter({ hasText: 'Aurora Estelar' }).getByRole('button').click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Nome curto', { exact: true }).fill('Aurora Nova');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(linhas.equipe[0].nome_curto).toBe('Aurora Nova');
  await page.goto('/regras');
  const proibicoes = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Proibições por sítio/ }) });
  await proibicoes.getByRole('textbox', { name: 'Buscar Proibições por sítio' }).fill('Aurora Nova');
  await expect(proibicoes.getByRole('cell', { name: 'Aurora Nova', exact: true })).toBeVisible();
  await proibicoes.getByRole('textbox', { name: 'Buscar Proibições por sítio' }).fill('Aurora Estelar');
  await expect(proibicoes.getByRole('cell', { name: 'Aurora Nova', exact: true })).toHaveCount(0);
  const erros: string[] = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(`/hospital-teste/${segundaAtualISO()}`);
  await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
  await expect(page.getByTestId('indicador-score')).toContainText(/Score: \d+/);
  const acoes = page.getByRole('table').first().getByRole('row').filter({ has: page.getByRole('cell', { name: 'Ações', exact: true }) });
  await expect(acoes.getByRole('cell').nth(1)).toContainText('Aurora Nova');
  expect(erros).toEqual([]);
});

test('exclusão de pessoa em uso explica como resolver', async ({ page }) => {
  test.skip(!HAS_ENV, 'Sessão mockada exige configuração Supabase.');
  await autenticarComoCoordenador(page);
  const linhas = base();
  await page.route('**/rest/v1/equipe*', route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 409, json: { code: '23503', message: 'FK' } })
    : responderPagina(route, linhas.equipe));
  await page.goto('/equipe');
  await page.getByRole('row').filter({ hasText: 'Aurora Estelar' }).getByRole('button').click();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Pessoa em uso em regras; remova as regras antes de excluir ou desative a pessoa.');
});

test('grade avisa disponibilidade com nome antigo e pessoa sem linha', async ({ page }) => {
  test.skip(!HAS_ENV, 'Sessão mockada exige configuração Supabase.');
  await autenticarComoCoordenador(page);
  const linhas = base();
  linhas.equipe[0].nome_curto = 'Aurora Nova';
  await mockarUnidade(page, {
    ...linhas, colocacoesFixas: linhas.fixas,
    disponiveis: { data_inicio: segundaAtualISO(), dias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] },
    dadosDisponibilidade: Object.fromEntries(base().equipe.map(p => [p.nome_curto, Array(5).fill('OK')])),
  });
  await page.goto(`/hospital-teste/${segundaAtualISO()}`);
  await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Disponibilidade com nomes fora da equipe ativa: Aurora Estelar' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Pessoas da equipe sem linha de disponibilidade: Aurora Nova' })).toBeVisible();
});
