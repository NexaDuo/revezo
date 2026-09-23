import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, FAKE_USER_ID, autenticarComoCoordenador } from './supabase-mock';

// O Clarity identifica a sessão só pelo uuid do perfil (LGPD: e-mail de
// profissional de saúde não vai para a Microsoft). O stub substitui a fila do
// snippet de index.html (que faz `c[a]=c[a]||...` e mantém o nosso) e a tag
// real é bloqueada para não consumir a fila.
async function gravarClarity(page: Page) {
  await page.route('https://www.clarity.ms/**', route => route.abort());
  await page.addInitScript(() => {
    (window as any).__clarity = [];
    (window as any).clarity = (...args: unknown[]) => (window as any).__clarity.push(args);
  });
  return () => page.evaluate(() => JSON.parse(JSON.stringify((window as any).__clarity)) as unknown[][]);
}

test('logado: Clarity recebe o uuid do perfil, papel e unidade, nunca e-mail', async ({ page }) => {
  test.skip(!HAS_ENV, 'Sessão simulada precisa da URL do Supabase (.env); o modo demonstração é coberto abaixo.');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page);
  await page.goto('/hospital-teste/2026-08-03');
  await expect.poll(async () => (await chamadas()).filter(c => c[0] === 'set' && c[1] === 'unidade').map(c => c[2]))
    .toContain('hospital-teste');
  const todas = await chamadas();
  expect(todas).toContainEqual(['identify', FAKE_USER_ID, null, null, FAKE_USER_ID]);
  expect(todas).toContainEqual(['set', 'usuario_id', FAKE_USER_ID]);
  expect(todas).toContainEqual(['set', 'papel', 'coordenador']);
  expect(JSON.stringify(todas), 'nenhum e-mail pode ir para o Clarity').not.toContain('@');
  expect(JSON.stringify(todas), 'nem o nome da pessoa').not.toContain('Teste E2E');
});

test('sem login (visitante ou modo demonstração) não identifica no Clarity', async ({ page }) => {
  const chamadas = await gravarClarity(page);
  if (HAS_ENV) await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.goto('/');
  await expect(page.getByLabel('Semana', { exact: true }).or(page.getByRole('alert')).first()).toBeVisible();
  await page.waitForTimeout(300);
  expect((await chamadas()).filter(c => c[0] === 'identify')).toEqual([]);
});

test('Clarity bloqueado (adblock) não quebra a tela', async ({ page }) => {
  await page.route('https://www.clarity.ms/**', route => route.abort());
  // Sem função: o `c[a]=c[a]||...` do snippet não consegue sobrescrever.
  await page.addInitScript(() => Object.defineProperty(window, 'clarity', { value: undefined, writable: false }));
  const erros: string[] = [];
  page.on('pageerror', e => erros.push(e.message));
  if (HAS_ENV) await autenticarComoCoordenador(page);
  await page.goto(`/${HAS_ENV ? 'hospital-teste' : 'demonstracao'}/2026-08-03`);
  await expect(page.getByLabel('Semana', { exact: true })).toHaveValue('2026-08-03');
  expect(erros).toEqual([]);
});
