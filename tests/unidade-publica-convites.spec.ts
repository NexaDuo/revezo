import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, FAKE_UNIT_ID, autenticarComoCoordenador } from './supabase-mock';
function segundaAtualISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PUBLIC_ID = '44444444-4444-4444-8444-444444444444';
const nomes = ['Aurora Estelar', 'Íris Lunar', 'Ciro Cometa', 'Nilo Solar', 'Lira Boreal', 'Orion Celeste', 'Zafira Nuvem', 'Téo Nebuloso'];
async function unidadePublica(page: Page) {
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [
    { id: PUBLIC_ID, slug: 'demonstracao', nome: 'Hospital Demonstração', publica: true },
  ] }));
  await page.route('**/rest/v1/equipe*', route => route.fulfill({ json: nomes.map((nome, i) => ({
    id: `pessoa-${i}`, unidade_id: PUBLIC_ID, nome, nome_curto: nome,
    categoria: i % 4 < 2 ? 'enf' : 'tec', turno_base: i < 4 ? 'manha' : 'tarde', ordem: i, ativo: true,
  })) }));
  await page.route('**/rest/v1/sitios*', route => route.fulfill({ json: [
    { ordem: 1, nome: 'Consulta demonstrativa', categoria_permitida: 'enf' },
    { ordem: 2, nome: 'Cuidados demonstrativos', categoria_permitida: 'tec' },
    { ordem: 3, nome: 'Ações educativas', categoria_permitida: 'ambos' },
  ] }));
  await page.route('**/rest/v1/disponibilidade_semanal*', route => {
    const semana = { data_inicio: segundaAtualISO(), data_fim: segundaAtualISO(),
      dias: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'],
      dados: Object.fromEntries(nomes.map(n => [n, ['OK', 'OK', 'OK', 'OK', 'OK']])) };
    return route.fulfill({ json: new URL(route.request().url()).searchParams.has('data_inicio') ? semana : [semana] });
  });
}

test.beforeEach(() => { test.skip(!HAS_ENV, 'Exige Supabase configurado; todas as chamadas são mockadas.'); });

test('visitante redireciona, gera, arrasta e imprime sem gravar', async ({ page }) => {
  await unidadePublica(page);
  const escritas: string[] = [];
  page.on('request', r => { if (r.url().includes('/rest/v1/') && r.method() !== 'GET') escritas.push(r.url()); });
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`/demonstracao/${segundaAtualISO()}/?$`));
  await expect(page.getByText('Visitante — somente leitura')).toBeVisible();
  await expect(page.getByText('Modo visitante: entre para salvar')).toBeVisible();
  await expect(page.getByRole('button', { name: /Importar Planilha/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
  await expect(page.getByTestId('indicador-score')).toContainText('Score: 0');
  await expect(page.getByRole('button', { name: 'Salvar e Publicar' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeEnabled();
  await expect(page.locator('[draggable="true"]').first()).toBeVisible();
  const origem = page.locator('[draggable="true"]').first();
  // O ajuste manual roda localmente; onde o nome cai depende das regras da
  // grade — o que importa aqui é que arrastar não grava nada no banco.
  await origem.dragTo(page.locator('tbody td').last());
  for (const tela of ['equipe', 'sitios', 'regras', 'disponibilidade']) {
    await page.goto(`/demonstracao/${segundaAtualISO()}/${tela}`);
    await expect(page.getByText('Modo visitante: entre para salvar')).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Novo|Salvar|Importar|Excluir)/ })).toHaveCount(0);
  }
  expect(escritas).toEqual([]);
});

test('unidade privada pede login explicitamente', async ({ page }) => {
  await unidadePublica(page);
  await page.goto(`/privada/${segundaAtualISO()}`);
  await expect(page.getByText('Esta unidade é privada — entre para acessar', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar para acessar' }).click();
  await expect(page.getByRole('button', { name: 'Continuar com o Google' })).toBeVisible();
});

test('coordenador cria convite normalizado e login aceita convite uma vez', async ({ page }) => {
  await autenticarComoCoordenador(page);
  let rpc = 0;
  await page.route('**/rest/v1/rpc/aceitar_convite', route => { rpc++; return route.fulfill({ status: 204 }); });
  let payload: any;
  let revogado = false;
  await page.route('**/rest/v1/convites*', async route => {
    if (route.request().method() === 'POST') {
      payload = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: [] });
    } else if (route.request().method() === 'DELETE') {
      revogado = true; await route.fulfill({ json: [{ id: 'convite-1' }] });
    } else await route.fulfill({ json: payload && !revogado ? [{ ...payload, id: 'convite-1', aceito_em: null }] : [] });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByRole('tab', { name: 'Usuários', exact: true }).click();
  const papel = page.getByLabel('Papel do convite');
  await expect(papel.locator('option[value="admin"]')).toHaveCount(0);
  await expect(page.getByLabel('Unidade do convite')).toHaveCount(0);
  await page.getByLabel('E-mail do convite').fill('Aurora@Example.COM');
  await papel.selectOption('coordenador');
  await page.getByRole('button', { name: 'Criar convite' }).click();
  await expect.poll(() => payload).toMatchObject({ email: 'aurora@example.com', unidade_id: FAKE_UNIT_ID, role: 'coordenador' });
  await page.getByRole('button', { name: 'Revogar convite' }).click();
  await expect.poll(() => revogado).toBe(true);
  expect(rpc).toBe(1);
});

test('falha ao aceitar convite aparece na tela', async ({ page }) => {
  await autenticarComoCoordenador(page);
  await page.route('**/rest/v1/rpc/aceitar_convite', route => route.fulfill({ status: 500, json: { message: 'Falha simulada' } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Não foi possível aceitar o convite');
});


test('coordenador vê públicas e não grava fora da própria unidade', async ({ page }) => {
  await autenticarComoCoordenador(page);
  await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [
    { id: FAKE_UNIT_ID, slug: 'hospital-teste', nome: 'Minha unidade', publica: false },
    { id: PUBLIC_ID, slug: 'demonstracao', nome: 'Hospital Demonstração', publica: true },
  ] }));
  await page.goto('/');
  const hospital = page.getByRole('combobox', { name: 'Hospital', exact: true });
  await expect(hospital.locator('option')).toHaveCount(2);
  await hospital.selectOption(PUBLIC_ID);
  await expect(page).toHaveURL(/demonstracao/);
  await page.getByRole('link', { name: 'Equipe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Novo', exact: true })).toHaveCount(0);
});
