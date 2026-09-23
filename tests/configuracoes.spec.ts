import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, FAKE_UNIT_ID, FAKE_USER_ID, autenticarComoCoordenador, autenticarComoAdmin } from './supabase-mock';

async function abrir(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Configurações', exact: true })).toBeVisible();
}

test.describe('Configurações com Supabase', () => {
  test.beforeEach(() => { test.skip(!HAS_ENV, 'Exige Supabase configurado; todas as chamadas são mockadas.'); });

  test('coordenador vê Meus dados e Usuários; Esc fecha e devolve foco', async ({ page }) => {
    await autenticarComoCoordenador(page);
    await abrir(page);
    await expect(page.getByRole('tab')).toHaveText(['Meus dados', 'Usuários']);
    await expect(page.getByRole('tab', { name: 'Unidades', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Configurações', exact: true })).toBeFocused();
  });

  test('visualizador vê apenas Meus dados', async ({ page }) => {
    await autenticarComoCoordenador(page, { role: 'visualizador' });
    await abrir(page);
    await expect(page.getByRole('tab')).toHaveText(['Meus dados']);
  });

  test('admin vê as três abas e navega por setas', async ({ page }) => {
    await autenticarComoAdmin(page);
    await abrir(page);
    await expect(page.getByRole('tab')).toHaveText(['Meus dados', 'Usuários', 'Unidades']);
    await page.getByRole('tab', { name: 'Meus dados' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Usuários', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('salvar nome envia somente nome e atualiza o perfil', async ({ page }) => {
    await autenticarComoCoordenador(page);
    let nome = 'Teste E2E';
    let payload: unknown;
    let filtro: string | null = null;
    await page.route('**/rest/v1/profiles*', async route => {
      if (route.request().method() === 'PATCH') {
        payload = route.request().postDataJSON();
        filtro = new URL(route.request().url()).searchParams.get('id');
        nome = (payload as { nome: string }).nome;
        return route.fulfill({ json: [{ id: FAKE_USER_ID }] });
      }
      return route.fulfill({ json: { id: FAKE_USER_ID, unidade_id: FAKE_UNIT_ID,
        nome, email: 'teste-e2e@example.com', role: 'coordenador', ativo: true, avatar_url: null } });
    });
    await abrir(page);
    await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Novo Nome');
    await page.getByRole('button', { name: 'Salvar nome' }).click();
    await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Nome salvo.');
    expect(payload).toEqual({ nome: 'Novo Nome' });
    expect(filtro).toBe('eq.' + FAKE_USER_ID);
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect(page.locator('header')).toContainText('Novo Nome');
  });

  test('tornar pública exige confirmação e recarrega unidades', async ({ page }) => {
    await autenticarComoAdmin(page);
    let publica = false;
    const patches: unknown[] = [];
    let leituras = 0;
    await page.route('**/rest/v1/unidades*', async route => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON();
        patches.push(payload);
        expect(new URL(route.request().url()).searchParams.get('id')).toBe('eq.' + FAKE_UNIT_ID);
        publica = payload.publica;
        return route.fulfill({ json: [{ id: FAKE_UNIT_ID }] });
      }
      leituras++;
      return route.fulfill({ json: [{ id: FAKE_UNIT_ID, nome: 'Unidade Teste', slug: 'hospital-teste', publica }] });
    });
    await abrir(page);
    await page.getByRole('tab', { name: 'Unidades', exact: true }).click();
    await page.getByRole('button', { name: 'Tornar pública', exact: true }).click();
    await expect(page.getByText('Qualquer pessoa, sem login, poderá ver equipe, sítios, disponibilidade e escalas desta unidade.')).toBeVisible();
    expect(patches).toEqual([]);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    expect(patches).toEqual([]);
    const antes = leituras;
    await page.getByRole('button', { name: 'Tornar pública', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar tornar pública', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Tornar privada', exact: true })).toBeVisible();
    expect(patches).toEqual([{ publica: true }]);
    expect(leituras).toBeGreaterThan(antes);
  });

  test('falha de gravação de unidade aparece na tela', async ({ page }) => {
    await autenticarComoAdmin(page);
    await page.route('**/rest/v1/unidades*', route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 403, json: { code: '42501' } })
      : route.fulfill({ json: [{ id: FAKE_UNIT_ID, nome: 'Unidade Teste', slug: 'hospital-teste', publica: false }] }));
    await abrir(page);
    await page.getByRole('tab', { name: 'Unidades', exact: true }).click();
    await page.getByRole('button', { name: 'Renomear', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Sem permissão para esta unidade');
  });
});

test('modo demonstração também oferece Configurações', async ({ page }) => {
  test.skip(HAS_ENV, 'Cobre o modo demonstração sem .env.');
  await abrir(page);
  await expect(page.getByRole('tab')).toHaveText(['Meus dados', 'Usuários']);
  await expect(page.getByRole('button', { name: 'Salvar nome' })).toBeDisabled();
});
