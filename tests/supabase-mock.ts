import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FAKE_USER_ID = '11111111-1111-4111-8111-111111111111';
export const FAKE_UNIT_ID = '22222222-2222-4222-8222-222222222222';

/** Simula uma sessão de coordenador logado contra um projeto Supabase real,
 *  sem depender de credenciais de teste: injeta a sessão direto no
 *  localStorage (a mesma chave que o supabase-js usa,
 *  `sb-<project-ref>-auth-token`) e intercepta as chamadas REST que o
 *  AuthContext/WorkContext fazem em seguida. Usado pelos testes que precisam
 *  de linhas reais em tabelas escopadas por unidade (RLS exige
 *  `authenticated`, então sem isto elas sempre voltam vazias). */
export async function autenticarComoCoordenador(
  page: Page,
  opts: { profileDelayMs?: number; regrasConfig?: unknown[]; role?: 'admin' | 'coordenador' | 'visualizador' } = {}
) {
  const envTxt = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
  const supabaseUrl = envTxt.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
  expect(supabaseUrl, '.env precisa ter VITE_SUPABASE_URL para este teste derivar a chave de sessão').toBeTruthy();
  const projectRef = new URL(supabaseUrl!).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;

  const fakeUser = {
    id: FAKE_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'teste-e2e@example.com',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const fakeSession = {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: 'bearer',
    user: fakeUser,
  };

  // Sessão já "logada" antes de qualquer script da página rodar — é o que faz
  // o AuthContext achar que há um usuário e disparar a busca do perfil.
  await page.addInitScript(
    ({ key, session }) => window.localStorage.setItem(key, JSON.stringify(session)),
    { key: storageKey, session: fakeSession }
  );

  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/rpc/aceitar_convite', route => route.fulfill({ status: 204 }));
  await page.route('**/rest/v1/profiles*', async route => {
    if (opts.profileDelayMs) await new Promise(r => setTimeout(r, opts.profileDelayMs));
    const profile = {
      id: FAKE_USER_ID, unidade_id: FAKE_UNIT_ID, email: fakeUser.email,
      nome: 'Teste E2E', avatar_url: null, role: opts.role ?? 'coordenador', ativo: true,
      created_at: fakeUser.created_at, updated_at: fakeUser.created_at,
    };
    await route.fulfill({ json: new URL(route.request().url()).searchParams.has('id') ? profile : [profile] });
  });
  await page.route('**/rest/v1/disponibilidade_semanal*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/escalas_semanais*', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/regras_config*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.regrasConfig ?? []) })
  );
  await page.route('**/rest/v1/unidades*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: FAKE_UNIT_ID, nome: 'Unidade Teste', slug: 'hospital-teste', publica: false }]),
    })
  );
  await page.route('**/auth/v1/user*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) })
  );
}

// Decidido a partir do ambiente, não da UI: com `.env` presente o `npm run dev`
// (webServer do playwright.config.ts) sobe com Supabase real e sem sessão
// logada — não há como autenticar como coordenador neste conjunto de testes.
// Sem `.env`, o app entra em modo demonstração como coordenador. Cada teste
// que depende de um desses dois estados escolhe seu lado aqui, na definição
// do arquivo, nunca checando se um botão "está visível agora" e pulando em
// silêncio quando não está (isso escondia falha de setup como se fosse
// comportamento esperado).
export const HAS_ENV = fs.existsSync(path.resolve(__dirname, '..', '.env'));


/** Cenário público vazio para testes de navegação, sem depender do banco remoto. */
export async function visitanteSemDados(page: Page) {
  if (!HAS_ENV) return;
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [
    { id: FAKE_UNIT_ID, nome: 'Hospital Demonstração', slug: 'demonstracao', publica: true },
  ] }));
}

export async function autenticarComoAdmin(page: Page) {
  await autenticarComoCoordenador(page, { role: 'admin' });
}
