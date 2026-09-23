import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Route } from '@playwright/test';

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

  await page.route('**/rest/v1/**', route => responderPagina(route, []));
  await page.route('**/rest/v1/rpc/aceitar_convite', route => route.fulfill({ status: 204 }));
  await page.route('**/rest/v1/profiles*', async route => {
    if (opts.profileDelayMs) await new Promise(r => setTimeout(r, opts.profileDelayMs));
    const profile = {
      id: FAKE_USER_ID, unidade_id: FAKE_UNIT_ID, email: fakeUser.email,
      nome: 'Teste E2E', avatar_url: null, role: opts.role ?? 'coordenador', ativo: true,
      created_at: fakeUser.created_at, updated_at: fakeUser.created_at,
    };
    if (new URL(route.request().url()).searchParams.has('id')) await route.fulfill({json:profile});
    else await responderPagina(route, [profile]);
  });
  await page.route('**/rest/v1/disponibilidade_semanal*', route => responderPagina(route, []));
  await page.route('**/rest/v1/escalas_semanais*', route => responderPagina(route, []));
  await page.route('**/rest/v1/regras_config*', route =>
    responderPagina(route, opts.regrasConfig ?? [])
  );
  await page.route('**/rest/v1/unidades*', route =>
    responderPagina(route, [{ id: FAKE_UNIT_ID, nome: 'Unidade Teste', slug: 'hospital-teste', publica: false }])
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
  await page.route('**/rest/v1/**', route => responderPagina(route, []));
  await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [
    { id: FAKE_UNIT_ID, nome: 'Hospital Demonstração', slug: 'demonstracao', publica: true },
  ] }));
}

/** Linhas das tabelas que `carregarConfigUnidade` lê, no formato do banco.
 *  Pessoas são referenciadas por pessoa_id/pessoa_a_id/pessoa_b_id (equipe.id).
 *  Sítio é referenciado por ID: `colocacoes_fixas.sitio_id`,
 *  `proibicoes.sitio_id` e `equipe.fixo_sitio_id` apontam para `sitios.id`. */
export interface UnidadeMock {
  equipe: Record<string, unknown>[];
  sitios: Record<string, unknown>[];
  colocacoesFixas?: Record<string, unknown>[];
  duplasProibidas?: Record<string, unknown>[];
  proibicoes?: Record<string, unknown>[];
  /** Semana com todos disponíveis (OK) para estes nomes curtos. */
  disponiveis: { data_inicio: string; dias: string[] };
  /** Linhas da disponibilidade por nome; sem isto, todos da equipe ficam OK. */
  dadosDisponibilidade?: Record<string, string[]>;
}

/** Serve a configuração da unidade (depois de `autenticarComoCoordenador`)
 *  para o fluxo "Gerar Grade" rodar ponta a ponta contra o mock. */
export async function mockarUnidade(page: Page, u: UnidadeMock) {
  const comUnidade = (linhas: Record<string, unknown>[]) => linhas.map(l => ({ unidade_id: FAKE_UNIT_ID, ...l }));
  await page.route('**/rest/v1/equipe*', route => responderPagina(route, comUnidade(u.equipe)));
  await page.route('**/rest/v1/sitios*', route => responderPagina(route, comUnidade(u.sitios)));
  await page.route('**/rest/v1/colocacoes_fixas*', route => responderPagina(route, comUnidade(u.colocacoesFixas ?? [])));
  await page.route('**/rest/v1/duplas_proibidas*', route => responderPagina(route, comUnidade(u.duplasProibidas ?? [])));
  await page.route('**/rest/v1/proibicoes*', route => responderPagina(route, comUnidade(u.proibicoes ?? [])));
  await page.route('**/rest/v1/disponibilidade_semanal*', route => {
    const semana = {
      unidade_id: FAKE_UNIT_ID, data_inicio: u.disponiveis.data_inicio, data_fim: u.disponiveis.data_inicio,
      dias: u.disponiveis.dias,
      dados: u.dadosDisponibilidade
        ?? Object.fromEntries(u.equipe.map(p => [p.nome_curto, u.disponiveis.dias.map(() => 'OK')])),
    };
    return route.fulfill({ json: new URL(route.request().url()).searchParams.has('data_inicio') ? semana : [semana] });
  });
}

export async function autenticarComoAdmin(page: Page) {
  await autenticarComoCoordenador(page, { role: 'admin' });
}

/** PostgREST uses offset/limit for range() in supabase-js v2; also accepts Range. */
export async function responderPagina(route: Route, dados: any[]) {
  const url = new URL(route.request().url());
  let linhas = [...dados];
  const unidade = url.searchParams.get('unidade_id');
  if (unidade?.startsWith('eq.')) linhas = linhas.filter(r => r.unidade_id === undefined || r.unidade_id === unidade.slice(3));
  const or = url.searchParams.get('or');
  if (or) {
    const termos = [...or.matchAll(/([a-z_]+)\.ilike\.("(?:\\.|[^"\\])*"|[^,()]+)/g)];
    const inclusoes = [...or.matchAll(/([a-z_]+)\.in\.\(([^)]*)\)/g)];
    linhas = linhas.filter(r => inclusoes.some(([, coluna, valores]) => valores.split(',').map(v => v.startsWith('"') ? JSON.parse(v) : v).includes(r[coluna])) || termos.some(([, coluna, valor]) => {
      let texto = valor.startsWith('"') ? JSON.parse(valor) : valor;
      texto = texto.slice(1, -1).replace(/\\([%_\\])/g, '$1').toLocaleLowerCase();
      return String(r[coluna] ?? '').toLocaleLowerCase().includes(texto);
    }));
  }
  const ordem = url.searchParams.get('order')?.split(',') ?? [];
  linhas.sort((a,b) => {
    for (const spec of ordem) { const [campo, direcao] = spec.split('.'); const cmp = a[campo] < b[campo] ? -1 : a[campo] > b[campo] ? 1 : 0; if(cmp) return direcao === 'desc' ? -cmp : cmp; }
    return 0;
  });
  const total = linhas.length;
  const range = route.request().headers()['range']?.match(/(\d+)-(\d+)/);
  const from = range ? Number(range[1]) : Number(url.searchParams.get('offset') ?? 0);
  const limite = range ? Number(range[2]) - from + 1 : Number(url.searchParams.get('limit') ?? total);
  linhas = linhas.slice(from, from + limite);
  const count = route.request().headers()['prefer']?.includes('count=exact');
  return route.fulfill({ json: linhas, headers: count ? {
    'Content-Range': total ? `${from}-${from + linhas.length - 1}/${total}` : '*/0',
    'Access-Control-Expose-Headers': 'Content-Range',
  } : {} });
}

/** Banco de versões com estado: fotografia via RPC e PATCH, devolvida na leitura. */
export async function mockarEscalas(page: Page, iniciais: any[] = []) {
  const linhas: any[] = iniciais.map(l => ({ unidade_id: FAKE_UNIT_ID, ...l }));
  const patches: { url: string; corpo: any }[] = [];
  const rpcs: { nome: string; corpo: any }[] = [];
  let relogio = Date.parse('2026-08-02T12:00:00Z');
  const agora = () => new Date(relogio += 60_000).toISOString();

  await page.route('**/rest/v1/escalas_semanais*', async (r: Route) => {
    const url = new URL(r.request().url());
    const filtros = (['id', 'data_inicio', 'ativa'] as const).map(c => [c, url.searchParams.get(c)?.replace(/^eq\./, '')] as const).filter(([, v]) => v != null);
    const bate = (l: any) => filtros.every(([c, v]) => String(l[c]) === v);
    if (r.request().method() === 'PATCH') {
      const corpo = r.request().postDataJSON();
      patches.push({ url: r.request().url(), corpo });
      const alvo = linhas.filter(bate);
      for (const l of alvo) Object.assign(l, corpo, { updated_at: agora() });
      return r.fulfill({ json: alvo });
    }
    return responderPagina(r, linhas.filter(bate));
  });
  await page.route('**/rest/v1/rpc/salvar_escala_nova', async r => {
    const p = r.request().postDataJSON();
    rpcs.push({ nome: 'salvar_escala_nova', corpo: p });
    const t = agora();
    for (const l of linhas) if (l.data_inicio === p.p_data_inicio && l.ativa) Object.assign(l, { ativa: false, substituida_em: t });
    const nova = { id: `0b0b0b0b-0000-4000-8000-${String(linhas.length + 1).padStart(12, '0')}`, unidade_id: p.p_unidade_id,
      titulo: p.p_titulo, data_inicio: p.p_data_inicio, data_fim: p.p_data_fim, dias: p.p_dias, grade: p.p_grade, sitios: p.p_sitios,
      violacoes: p.p_violacoes, score: p.p_score, status: p.p_status, ativa: true, substituida_em: null, created_at: t, updated_at: t };
    linhas.push(nova);
    return r.fulfill({ json: nova });
  });
  await page.route('**/rest/v1/rpc/ativar_escala', async r => {
    const p = r.request().postDataJSON();
    rpcs.push({ nome: 'ativar_escala', corpo: p });
    const alvo = linhas.find(l => l.id === p.p_id);
    if (!alvo) return r.fulfill({ status: 400, json: { message: 'Grade não encontrada ou sem acesso' } });
    const t = agora();
    for (const l of linhas) if (l.data_inicio === alvo.data_inicio && l.ativa && l.id !== alvo.id) Object.assign(l, { ativa: false, substituida_em: t });
    Object.assign(alvo, { ativa: true, substituida_em: null });
    return r.fulfill({ json: alvo });
  });
  return { linhas, patches, rpcs };
}
