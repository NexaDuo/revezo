import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, FAKE_USER_ID, FAKE_UNIT_ID, autenticarComoCoordenador } from './supabase-mock';

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

test('logado: Clarity recebe o UUID do perfil, papel e environment, nunca e-mail', async ({ page }) => {
  test.skip(!HAS_ENV, 'Sessão simulada precisa da URL do Supabase (.env); o modo demonstração é coberto abaixo.');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page);
  await page.goto('/hospital-teste/2026-08-03');
  await expect.poll(async () => (await chamadas()).filter(c => c[0] === 'set' && c[1] === 'papel').map(c => c[2]))
    .toContain('coordenador');
  const todas = await chamadas();
  expect(todas).toContainEqual(['set', 'environment', 'development']);
  expect(todas).toContainEqual(['identify', FAKE_USER_ID]);
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

test('gravação do Clarity mascara a tela inteira por padrão (nomes de profissionais)', async ({ page }) => {
  await gravarClarity(page);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-clarity-mask', 'true');
  await expect(page.locator('[data-clarity-unmask]')).toHaveCount(1);
  await expect(page.getByTitle('Versão do sistema')).toHaveAttribute('data-clarity-unmask', 'true');
});

test('logout recarrega a página: a sessão seguinte do Clarity não herda o uuid', async ({ page }) => {
  test.skip(!HAS_ENV, 'Logout só existe com Supabase configurado (modo demonstração não sai).');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page, { sessao: 'umaVez' });
  await page.goto('/hospital-teste/2026-08-03');
  await expect.poll(async () => (await chamadas()).filter(c => c[0] === 'identify').length).toBe(1);
  await page.evaluate(() => { (window as any).__documentoAntigo = true; });
  const recarga = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Sair' }).click();
  await recarga;
  expect(await page.evaluate(() => (window as any).__documentoAntigo ?? false), 'signOut precisa recarregar a página').toBe(false);
  await expect(page.getByRole('button', { name: /^Entrar/ }).first()).toBeVisible();
  await page.waitForTimeout(300);
  expect((await chamadas()).filter(c => c[0] === 'identify')).toEqual([]);
});

const temSessao = (page: Page) => page.evaluate(() => Object.keys(localStorage).some(k => /^sb-.*-auth-token$/.test(k)));

test('logout com erro 500 no servidor ainda sai neste computador e recarrega', async ({ page }) => {
  test.skip(!HAS_ENV, 'Logout só existe com Supabase configurado.');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page, { sessao: 'umaVez' });
  await page.route('**/auth/v1/logout*', route => route.fulfill({ status: 500, json: { message: 'falha' } }));
  await page.goto('/hospital-teste/2026-08-03');
  await expect.poll(async () => (await chamadas()).filter(c => c[0] === 'identify').length).toBe(1);
  const recarga = page.waitForEvent('load');
  await page.getByRole('button', { name: 'Sair' }).click();
  await recarga;
  await expect(page.getByRole('button', { name: /^Entrar/ }).first()).toBeVisible();
  expect(await temSessao(page), 'sessão não pode ser restaurada depois do logout').toBe(false);
  expect((await chamadas()).filter(c => c[0] === 'identify')).toEqual([]);
});

test('saída em outra aba recarrega esta aba, que não volta identificada', async ({ context, page }) => {
  test.skip(!HAS_ENV, 'Logout só existe com Supabase configurado.');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page, { sessao: 'umaVez' });
  await page.goto('/hospital-teste/2026-08-03');
  await expect.poll(async () => (await chamadas()).filter(c => c[0] === 'identify').length).toBe(1);
  const outra = await context.newPage();
  await outra.route('https://www.clarity.ms/**', route => route.abort());
  await autenticarComoCoordenador(outra, { sessao: 'umaVez' });
  await outra.goto('/hospital-teste/2026-08-03');
  const recarga = page.waitForEvent('load');
  await outra.getByRole('button', { name: 'Sair' }).click();
  await recarga;
  await expect(page.getByRole('button', { name: /^Entrar/ }).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect((await chamadas()).filter(c => c[0] === 'identify')).toEqual([]);
  expect(await temSessao(page)).toBe(false);
});

test('trocar de unidade só atualiza a tag, sem reidentificar; inativo não aparece como coordenador', async ({ page }) => {
  test.skip(!HAS_ENV, 'Troca de hospital precisa de admin simulado (Supabase configurado).');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page, { role: 'admin' });
  await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [
    { id: FAKE_UNIT_ID, slug: 'hospital-teste', nome: 'Hospital A' },
    { id: '33333333-3333-4333-8333-333333333333', slug: 'hospital-b', nome: 'Hospital B' },
  ] }));
  await page.goto('/hospital-teste/2026-08-03/regras');
  const tags = async (tag: string) => (await chamadas()).filter(c => c[0] === 'set' && c[1] === tag).map(c => c[2]);
  await expect.poll(async () => {
    const p = await tags('papel');
    return p.length > 0 ? p[0] : null;
  }).toBe('admin');
  expect(await tags('papel')).toEqual(['admin']);
  await page.getByRole('combobox', { name: 'Unidade de saúde', exact: true }).selectOption({ label: 'Hospital B' });
  await page.waitForURL('**/hospital-b/**');
  expect((await chamadas()).filter(c => c[0] === 'identify')).toHaveLength(1);

  await page.route('**/rest/v1/profiles*', route => route.fulfill({ json: {
    id: FAKE_USER_ID, unidade_id: FAKE_UNIT_ID, role: 'coordenador', nome: 'Teste E2E', ativo: false,
  } }));
  await page.reload();
  await expect.poll(() => tags('papel')).toEqual(['inativo']);
});

test('login Google usa PKCE: sem token na URL, sessão vem da troca do ?code=', async ({ page }) => {
  // Cobre tudo do lado do app; o Google em si é simulado pelo redirect 302.
  test.skip(!HAS_ENV, 'Login Google só existe com Supabase configurado.');
  const chamadas = await gravarClarity(page);
  await autenticarComoCoordenador(page, { sessao: 'nenhuma' });
  let autorizacao: URL | undefined;
  let grant: string | null = null;
  await page.route('**/auth/v1/authorize*', route => {
    autorizacao = new URL(route.request().url());
    const volta = new URL(autorizacao.searchParams.get('redirect_to')!);
    volta.searchParams.set('code', 'codigo-de-uso-unico');
    return route.fulfill({ status: 302, headers: { location: volta.toString() } });
  });
  await page.route('**/auth/v1/token*', route => {
    grant = new URL(route.request().url()).searchParams.get('grant_type');
    return route.fallback();
  });
  // Começa numa tela funda: o redirect tem que voltar à raiz do app (allow-list).
  await page.goto('/hospital-teste/2026-08-03/regras');
  await page.getByRole('button', { name: /^Entrar/ }).first().click();
  await page.getByRole('button', { name: 'Continuar com o Google' }).click();
  await expect.poll(async () => (await chamadas()).filter(c => c[0] === 'identify').map(c => c[1])).toEqual([FAKE_USER_ID]);
  expect(autorizacao?.searchParams.get('code_challenge'), 'authorize precisa levar o desafio PKCE').toBeTruthy();
  expect(grant).toBe('pkce');
  expect(new URL(autorizacao!.searchParams.get('redirect_to')!).pathname, 'redirectTo fixo na raiz do app').toBe('/');
  await expect(page).not.toHaveURL(/code=|access_token/);
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
