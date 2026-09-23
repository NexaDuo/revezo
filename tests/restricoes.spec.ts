import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, FAKE_UNIT_ID, autenticarComoCoordenador, responderPagina } from './supabase-mock';

/** Tabela mockada que aceita POST e devolve o que foi gravado nas leituras seguintes. */
async function tabela(page: Page, nome: string, linhas: any[], gravados: any[] = []) {
  await page.route(`**/rest/v1/${nome}*`, async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const corpo = [].concat(req.postDataJSON());
      gravados.push(...corpo);
      const novas = corpo.map((r: any, i: number) => ({ ...r, id: `${nome}-${linhas.length + i}` }));
      linhas.push(...novas);
      return route.fulfill({ status: 201, json: novas });
    }
    return responderPagina(route, linhas);
  });
  return gravados;
}

const pessoa = (nome_curto: string, ordem: number) => ({
  id: `p-${ordem}`, unidade_id: FAKE_UNIT_ID, nome: `Pessoa Fictícia ${nome_curto}`, nome_curto,
  categoria: 'enf', turno_base: 'manha', ativo: true, isento_acoes: false, custo_extra: 0, ordem,
});

test('duplas proibidas e colocações fixas são cadastradas pelo modal', async ({ page }) => {
  test.skip(!HAS_ENV, 'Requisições PostgREST exigem configuração; são todas interceptadas.');
  await autenticarComoCoordenador(page);
  await tabela(page, 'equipe', [pessoa('Ana F', 1), pessoa('Bia F', 2)]);
  await tabela(page, 'sitios', [{ id: 's-1', unidade_id: FAKE_UNIT_ID, nome: 'Sala Fictícia', categoria_permitida: 'ambos', ordem: 1 }]);
  const proibicoes = await tabela(page, 'proibicoes', []);
  const duplas = await tabela(page, 'duplas_proibidas', []);
  const fixas = await tabela(page, 'colocacoes_fixas', []);
  await page.goto('/regras');

  const secaoDuplas = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Duplas proibidas/ }) });
  await secaoDuplas.getByRole('button', { name: 'Novo', exact: true }).click();
  let modal = page.getByRole('dialog', { name: 'Novo — Duplas proibidas' });
  await modal.getByLabel('Pessoa', { exact: true }).selectOption('Ana F');
  await modal.getByLabel('Não junto com', { exact: true }).selectOption('Ana F');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal.getByRole('alert')).toHaveText('Escolha duas pessoas diferentes.');
  expect(duplas).toHaveLength(0);

  await modal.getByLabel('Não junto com', { exact: true }).selectOption('Bia F');
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(duplas).toEqual([{ pessoa_a: 'Ana F', pessoa_b: 'Bia F', motivo: null, unidade_id: FAKE_UNIT_ID }]);
  await expect(secaoDuplas.getByRole('cell', { name: 'Bia F', exact: true })).toBeVisible();

  const secaoFixas = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Colocações fixas/ }) });
  await secaoFixas.getByRole('button', { name: 'Novo', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Novo — Colocações fixas' });
  await modal.getByLabel('Pessoa', { exact: true }).selectOption('Bia F');
  await modal.getByLabel('Dia', { exact: true }).selectOption({ label: 'Quarta' });
  await modal.getByLabel('Colocação', { exact: true }).selectOption({ label: 'Fica fora das Ações' });
  await modal.getByLabel('Depende do dia de plantão').check();
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(fixas).toEqual([{
    pessoa_curto: 'Bia F', dia: 2, turno: 'manha', tipo: 'fora_do', sitio_id: null,
    descricao: null, depende_de_plantao: true, unidade_id: FAKE_UNIT_ID,
  }]);
  await expect(secaoFixas.getByRole('cell', { name: 'Fora das Ações' })).toBeVisible();

  // Fica num sítio: o formulário mostra o NOME e grava o ID (FK), para que
  // renomear o sítio não deixe a colocação órfã.
  await secaoFixas.getByRole('button', { name: 'Novo', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Novo — Colocações fixas' });
  await modal.getByLabel('Pessoa', { exact: true }).selectOption('Ana F');
  await modal.getByLabel('Sítio (quando fica num sítio)').selectOption({ label: 'Sala Fictícia' });
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(fixas[1]).toMatchObject({ pessoa_curto: 'Ana F', tipo: 'fixa_sitio', sitio_id: 's-1' });
  expect(fixas[1]).not.toHaveProperty('sitio_nome');
  await expect(secaoFixas.getByRole('cell', { name: 'Sala Fictícia' })).toBeVisible();

  const secaoProib = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Proibições por sítio/ }) });
  await secaoProib.getByRole('button', { name: 'Novo', exact: true }).click();
  modal = page.getByRole('dialog', { name: 'Novo — Proibições por sítio' });
  await modal.getByLabel('Pessoa', { exact: true }).selectOption('Bia F');
  await modal.getByLabel('Sítio', { exact: true }).selectOption({ label: 'Sala Fictícia' });
  await modal.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(proibicoes).toEqual([{ pessoa_curto: 'Bia F', sitio_id: 's-1', motivo: null, unidade_id: FAKE_UNIT_ID }]);
  await expect(secaoProib.getByRole('cell', { name: 'Sala Fictícia' })).toBeVisible();
});

test('sem equipe cadastrada o formulário de restrição avisa na tela', async ({ page }) => {
  test.skip(HAS_ENV, 'Modo demonstração: a equipe da unidade começa vazia.');
  await page.goto('/regras');
  const secao = page.locator('section').filter({ has: page.getByRole('heading', { name: /^Proibições por sítio/ }) });
  await secao.getByRole('button', { name: 'Novo', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Cadastre a equipe da unidade antes de criar restrições.');
});
