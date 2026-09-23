import { test, expect, type Page, type Route } from '@playwright/test';
import { HAS_ENV, FAKE_UNIT_ID, autenticarComoCoordenador, responderPagina } from './supabase-mock';
import { defaultConfig, generateSchedule, validar } from '../src/lib/solver';
import type { Config, Escala } from '../src/lib/solver/types';
import fs from 'node:fs';

// Versões da grade: entrar na semana abre a ATIVA (com conferência viva ao
// arrastar); gerar + salvar cria versão nova; salvar uma versão aberta
// atualiza a própria linha; "Tornar ativa" troca a ativa.
//
// Sem `.env` o fluxo roda no modo demonstração (localStorage `demo_escalas`).
// Com `.env` roda contra um PostgREST simulado com estado, que confere o que o
// app manda para o banco: RPC para versão nova e troca de ativa, PATCH por id
// para regravar uma versão aberta.

const SEMANA = '2026-08-03';
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

/** Célula da grade (tabela da manhã ou da tarde) por sítio e índice do dia. */
function celula(page: Page, turno: 'manha' | 'tarde', sitio: string, d: number) {
  return page.getByRole('table').nth(turno === 'manha' ? 0 : 1)
    .locator(`xpath=.//tr[td[1][normalize-space()="${sitio}"]]/td[${d + 2}]`);
}

async function arrastar(page: Page, nome: string, de: [string, number], para: [string, number]) {
  await celula(page, 'manha', de[0], de[1]).getByText(nome, { exact: true }).dragTo(celula(page, 'manha', para[0], para[1]));
}

/** Um técnico que está num sítio de manhã e cairia num sítio só de
 *  enfermeiros no mesmo dia — o validador tem que acusar "categoria". */
function movimentoQueViolaCategoria(config: Config, grade: Escala) {
  const tec = new Set(config.equipe.filter(p => p.c === 'tec').map(p => p.n));
  for (const origem of config.sitios.manha) for (let d = 0; d < DIAS.length; d++) {
    for (const nome of grade.manha[origem.n]?.[d] ?? []) {
      if (!tec.has(nome)) continue;
      for (const alvo of config.sitios.manha.filter(s => s.quem === 'enf' && s.n !== origem.n)) {
        if ((grade.manha[alvo.n]?.[d] ?? []).includes(nome)) continue;
        const movida: Escala = JSON.parse(JSON.stringify(grade));
        movida.manha[origem.n][d] = movida.manha[origem.n][d].filter((n: string) => n !== nome);
        movida.manha[alvo.n][d] = [...(movida.manha[alvo.n][d] ?? []), nome];
        const msg = validar(config, movida).find(v => v.regra === 'categoria' && v.sitio === alvo.n && v.d === d && v.msg.startsWith(nome))?.msg;
        if (msg) return { nome, de: [origem.n, d] as [string, number], para: [alvo.n, d] as [string, number], msg };
      }
    }
  }
  throw new Error('Nenhum movimento que viole categoria nesta grade de teste.');
}

// ---------------------------------------------------------------------------
// Modo demonstração (sem `.env`) — é o que o CI roda.
// ---------------------------------------------------------------------------
test.describe('versões da grade — modo demonstração', () => {
  test.skip(HAS_ENV, 'Com .env o mesmo fluxo roda contra o PostgREST simulado (bloco abaixo).');
  const slug = 'demonstracao';
  // A Config que o app monta no modo demonstração: a equipe do fixture do
  // caso-origem (src/lib/fetchData.ts lê o mesmo arquivo; o import de JSON
  // não roda no carregador do Playwright) e a disponibilidade semeada abaixo.
  const fixture = JSON.parse(fs.readFileSync(new URL('../docs/referencia/disponibilidade_03a07.json', import.meta.url), 'utf8'));
  const configDemo: Config = {
    ...defaultConfig,
    equipe: fixture.disponibilidade.map((d: any) => ({ n: d.nome, c: d.categoria === 'enfermeiro' ? 'enf' : 'tec', t: d.turno === 'manhã' ? 'manha' : d.turno })),
    disp: Object.fromEntries(fixture.disponibilidade.map((d: any) => [d.nome, Object.values(d.status).slice(0, DIAS.length)])),
    dias: DIAS,
  };
  const semeiaDisp = (page: Page) => page.addInitScript(s => {
    if (!localStorage.getItem('demo_disponibilidade')) localStorage.setItem('demo_disponibilidade', JSON.stringify([s]));
  }, { data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS, dados: configDemo.disp });
  const escalasDemo = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('demo_escalas') || '[]'));

  test('gerar novamente só pede confirmação após edição manual', async ({ page }) => {
    await semeiaDisp(page);
    await page.goto(`/${slug}/${SEMANA}`);
    const banner = page.getByTestId('versao-grade');
    const gerar = page.getByRole('button', { name: 'Gerar Grade', exact: true });
    const dialogos: string[] = [];
    page.on('dialog', async d => {
      dialogos.push(d.type());
      await d.dismiss();
    });

    for (let i = 0; i < 2; i++) {
      await gerar.click();
      await expect(banner).toContainText('Grade nova, ainda não salva');
      await expect(gerar).toBeEnabled();
    }
    expect(dialogos).toEqual([]);

    // A geração varia: mova uma pessoa da grade exibida para outro dia.
    const pessoa = page.getByRole('table').first().locator('[draggable="true"]').first();
    const origem = pessoa.locator('xpath=ancestor::td');
    const coluna = await origem.evaluate(td => (td as HTMLTableCellElement).cellIndex);
    const sitio = (await pessoa.locator('xpath=ancestor::tr').locator('td').first().innerText()).trim();
    const nome = (await pessoa.innerText()).trim();
    const destino = celula(page, 'manha', sitio, coluna === 1 ? 1 : 0);
    await pessoa.dragTo(destino);
    await expect(celula(page, 'manha', sitio, coluna - 1).getByText(nome, { exact: true })).toHaveCount(0);
    await expect(destino.getByText(nome, { exact: true })).toBeVisible();
    await gerar.click();
    expect(dialogos).toEqual(['confirm']);
    await expect(destino.getByText(nome, { exact: true })).toBeVisible();
    await expect(banner).toContainText('Grade nova, ainda não salva');
  });

  test('entrar na semana abre a grade ativa salva e arrastar refaz a conferência', async ({ page }) => {
    const grade = generateSchedule(configDemo).escala;
    const mov = movimentoQueViolaCategoria(configDemo, grade);
    // Simula um sítio renomeado depois da gravação: a grade salva guarda o
    // nome velho e não tem a linha do nome novo.
    const renomeado = configDemo.sitios.manha.find(s => s.quem === 'tec' && s.n !== mov.de[0])!.n;
    grade.manha[`${renomeado} (nome antigo)`] = grade.manha[renomeado];
    delete grade.manha[renomeado];
    const ativa = {
      id: '0a0a0a0a-0000-4000-8000-000000000001', titulo: 'ativa', data_inicio: SEMANA, data_fim: '2026-08-07',
      dias: DIAS, grade, violacoes: [], score: 0, ativa: true, substituida_em: null,
      created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    };
    await semeiaDisp(page);
    await page.addInitScript(e => { if (!localStorage.getItem('demo_escalas')) localStorage.setItem('demo_escalas', JSON.stringify([e])); }, ativa);

    await page.goto(`/${slug}/${SEMANA}`);
    const banner = page.getByTestId('versao-grade');
    await expect(banner).toContainText('Versão ativa');
    await expect(banner).toHaveAttribute('data-versao-id', ativa.id);
    await expect(page.getByTestId('indicador-score')).toContainText(/Score: \d+/);
    await expect(page.getByText(mov.msg)).toHaveCount(0);
    await expect(page.getByText(
      `A grade salva usa sítios que não existem mais: ${renomeado} (nome antigo) — as pessoas nessas linhas não são conferidas.`)).toBeVisible();
    // A linha do nome atual entra vazia, para o validador ter o que percorrer.
    await expect(celula(page, 'manha', renomeado, 0)).toBeVisible();

    await arrastar(page, mov.nome, mov.de, mov.para);
    await expect(celula(page, 'manha', mov.para[0], mov.para[1])).toContainText(mov.msg);
    await expect(banner).toContainText('Alterações não salvas');

    // Trocar de semana com edição pendente pergunta; recusar fica onde está.
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Próxima semana' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/${SEMANA}$`));
    await expect(celula(page, 'manha', mov.para[0], mov.para[1])).toContainText(mov.msg);
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Próxima semana' }).click();
    await expect(page).not.toHaveURL(new RegExp(`/${slug}/${SEMANA}$`));
  });

  test('grade salva sem configuração da semana não deixa arrastar nem salvar', async ({ page }) => {
    // Sem disponibilidade salva a Config não fecha: a grade abre só para leitura.
    const grade = generateSchedule(configDemo).escala;
    await page.addInitScript(e => localStorage.setItem('demo_escalas', JSON.stringify([e])), {
      id: '0a0a0a0a-0000-4000-8000-000000000002', titulo: 'sem config', data_inicio: SEMANA, data_fim: '2026-08-07',
      dias: DIAS, grade, violacoes: [], score: 0, ativa: true, substituida_em: null,
      created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    });
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(page.getByTestId('versao-grade')).toContainText('Versão ativa');
    await expect(page.getByText('arrastar e salvar estão bloqueados', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar nesta versão' })).toBeDisabled();
    await expect(page.locator('[draggable="true"]')).toHaveCount(0);
  });

  test('escala antiga do modo demonstração (id numérico) ganha uuid estável e abre pelo Histórico', async ({ page }) => {
    await semeiaDisp(page);
    const grade = generateSchedule(configDemo).escala;
    await page.addInitScript(e => { if (!localStorage.getItem('demo_escalas')) localStorage.setItem('demo_escalas', JSON.stringify([e])); }, {
      id: '1690000000000', titulo: 'legada', data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS, grade,
      rodape: [], violacoes: [], score: 0, status: 'validada', created_at: '2026-08-01T10:00:00.000Z',
    });
    await page.goto(`/${slug}/${SEMANA}/historico`);
    await page.getByRole('button', { name: 'Abrir versão' }).click();
    const banner = page.getByTestId('versao-grade');
    await expect(banner).toContainText('Versão ativa');
    const id = await banner.getAttribute('data-versao-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    await page.reload();
    await expect(banner).toHaveAttribute('data-versao-id', id!);
  });

  test('gerar e salvar duas vezes cria duas versões; editar a antiga não troca a ativa; "Tornar ativa" troca', async ({ page }) => {
    await semeiaDisp(page);
    await page.goto(`/${slug}/${SEMANA}`);
    const banner = page.getByTestId('versao-grade');

    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
      await expect(banner).toContainText('Grade nova, ainda não salva');
      await page.getByRole('button', { name: 'Salvar e Publicar' }).click();
      await expect(page.getByText('Nova versão salva: agora é a ativa desta semana.', { exact: false })).toBeVisible();
      await expect(banner).toContainText('Versão ativa');
    }
    let salvas = await escalasDemo(page);
    expect(salvas).toHaveLength(2);
    const [antiga, nova] = [...salvas].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at));
    expect(nova.ativa).toBe(true);
    expect(antiga.ativa).toBe(false);
    expect(antiga.substituida_em).toBeTruthy();

    // Entrar de novo na semana (sem Histórico) abre a mais nova.
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(banner).toHaveAttribute('data-versao-id', nova.id);

    await page.goto(`/${slug}/${SEMANA}/historico`);
    const linhas = page.locator('tbody tr');
    await expect(linhas).toHaveCount(2);
    const ativaBadge = page.getByText('Ativa', { exact: true });
    await expect(linhas.filter({ has: ativaBadge })).toHaveCount(1);
    await expect(linhas.filter({ hasText: 'Substituída em' })).toHaveCount(1);

    // Abrir a antiga, editar e salvar: atualiza a própria linha.
    await linhas.filter({ hasText: 'Substituída em' }).getByRole('button', { name: 'Abrir versão' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/${SEMANA}\\?escala=${antiga.id}$`));
    await expect(banner).toContainText('Versão substituída em');
    await expect(banner).toHaveAttribute('data-versao-id', antiga.id);
    const mov = movimentoQueViolaCategoria(configDemo, antiga.grade);
    await arrastar(page, mov.nome, mov.de, mov.para);
    await expect(celula(page, 'manha', mov.para[0], mov.para[1])).toContainText(mov.msg);
    await page.getByRole('button', { name: 'Salvar nesta versão' }).click();
    await expect(page.getByText('a versão ativa da semana não mudou', { exact: false })).toBeVisible();

    salvas = await escalasDemo(page);
    expect(salvas).toHaveLength(2);
    const antigaDepois = salvas.find((e: any) => e.id === antiga.id);
    expect(antigaDepois.ativa).toBe(false);
    expect(antigaDepois.grade.manha[mov.para[0]][mov.para[1]]).toContain(mov.nome);
    expect(salvas.find((e: any) => e.id === nova.id).ativa).toBe(true);

    // "Tornar ativa" troca a ativa da semana.
    await banner.getByRole('button', { name: 'Tornar ativa' }).click();
    await expect(banner).toContainText('Versão ativa');
    salvas = await escalasDemo(page);
    expect(salvas.find((e: any) => e.id === antiga.id).ativa).toBe(true);
    expect(salvas.find((e: any) => e.id === nova.id).ativa).toBe(false);
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(banner).toHaveAttribute('data-versao-id', antiga.id);

    // Gerar a partir de uma URL de versão e salvar: a URL volta para a semana
    // (que abre a ativa, a nova) e a confirmação continua na tela.
    await page.goto(`/${slug}/${SEMANA}?escala=${nova.id}`);
    await expect(banner).toContainText('Versão substituída em');
    await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar e Publicar' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/${SEMANA}$`));
    await expect(page.getByText('Nova versão salva: agora é a ativa desta semana.', { exact: false })).toBeVisible();
    await expect(banner).toContainText('Versão ativa');
    expect(await escalasDemo(page)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Supabase (com `.env`): PostgREST simulado com estado.
// ---------------------------------------------------------------------------
const PESSOAS = [
  ['Aurora Estelar', 'enf', 'manha'], ['Íris Lunar', 'enf', 'manha'], ['Ciro Cometa', 'tec', 'manha'], ['Nilo Solar', 'tec', 'manha'],
  ['Lira Boreal', 'enf', 'tarde'], ['Orion Celeste', 'enf', 'tarde'], ['Zafira Nuvem', 'tec', 'tarde'], ['Téo Nebuloso', 'tec', 'tarde'],
] as const;
const SITIOS = [['Consulta demonstrativa', 'enf'], ['Cuidados demonstrativos', 'tec'], ['Ações educativas', 'ambos']] as const;

function gradeManual(): Escala {
  const alterna = (a: string, b: string) => DIAS.map((_, d) => [d % 2 ? b : a]);
  return {
    manha: { 'Consulta demonstrativa': alterna('Aurora Estelar', 'Íris Lunar'), 'Cuidados demonstrativos': alterna('Ciro Cometa', 'Nilo Solar'), 'Ações educativas': DIAS.map(() => []) },
    tarde: { 'Consulta demonstrativa': alterna('Lira Boreal', 'Orion Celeste'), 'Cuidados demonstrativos': alterna('Zafira Nuvem', 'Téo Nebuloso'), 'Ações educativas': DIAS.map(() => []) },
  };
}

async function bancoSimulado(page: Page, iniciais: any[] = []) {
  const linhas: any[] = iniciais.map(l => ({ unidade_id: FAKE_UNIT_ID, ...l }));
  const patches: { url: string; corpo: any }[] = [];
  const rpcs: { nome: string; corpo: any }[] = [];
  let relogio = Date.parse('2026-08-02T12:00:00Z');
  const agora = () => new Date(relogio += 60_000).toISOString();

  await page.route('**/rest/v1/equipe*', r => responderPagina(r, PESSOAS.map(([nome, categoria, turno], i) => ({
    id: `p${i}`, unidade_id: FAKE_UNIT_ID, nome, nome_curto: nome, categoria, turno_base: turno, ordem: i, ativo: true,
  }))));
  await page.route('**/rest/v1/sitios*', r => responderPagina(r, SITIOS.map(([nome, cat], i) => ({
    id: `s${i}`, unidade_id: FAKE_UNIT_ID, ordem: i + 1, nome, nome_tarde: null, categoria_permitida: cat, opcional: false, prioridade_dupla: null,
  }))));
  const disp = { unidade_id: FAKE_UNIT_ID, data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS,
    dados: Object.fromEntries(PESSOAS.map(([n]) => [n, DIAS.map(() => 'OK')])) };
  await page.route('**/rest/v1/disponibilidade_semanal*', r => {
    const di = new URL(r.request().url()).searchParams.get('data_inicio');
    return responderPagina(r, !di || di === `eq.${SEMANA}` ? [disp] : []);
  });
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
      titulo: p.p_titulo, data_inicio: p.p_data_inicio, data_fim: p.p_data_fim, dias: p.p_dias, grade: p.p_grade,
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

test.describe('versões da grade — Supabase', () => {
  test.skip(!HAS_ENV, 'Exige .env para simular a sessão de coordenador; sem ele o bloco de demonstração cobre o fluxo.');
  test.beforeEach(async ({ page }) => { await autenticarComoCoordenador(page); });
  const slug = 'hospital-teste';

  test('abre a ativa ao entrar, versão nova por RPC, regravar por id e "Tornar ativa"', async ({ page }) => {
    const ANTIGA = '0a0a0a0a-0000-4000-8000-0000000000aa';
    const banco = await bancoSimulado(page, [{
      id: ANTIGA, titulo: 'antiga', data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS,
      grade: (g => ({ ...g, manha: { ...g.manha, 'Sala Extinta': [['Íris Lunar'], [], [], [], []] } }))(gradeManual()),
      violacoes: [], score: 0, status: 'validada', ativa: true, substituida_em: null,
      created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    }]);
    const msg = 'Ciro Cometa é técnico e este sítio é de enfermeiros';

    // Entrar na semana abre a ativa, sem passar pelo Histórico; arrastar revalida.
    await page.goto(`/${slug}/${SEMANA}`);
    const banner = page.getByTestId('versao-grade');
    await expect(banner).toContainText('Versão ativa');
    await expect(banner).toHaveAttribute('data-versao-id', ANTIGA);
    await expect(page.getByText(msg)).toHaveCount(0);
    await expect(page.getByText('A grade salva usa sítios que não existem mais: Sala Extinta — as pessoas nessas linhas não são conferidas.')).toBeVisible();
    await arrastar(page, 'Ciro Cometa', ['Cuidados demonstrativos', 0], ['Consulta demonstrativa', 0]);
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toContainText(msg);

    // Com edição pendente, Gerar pergunta antes: recusar mantém a grade editada.
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toContainText(msg);
    await expect(banner).toContainText('Alterações não salvas');

    // Gerar + salvar: RPC de versão nova; a antiga vira substituída.
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
    await expect(banner).toContainText('Grade nova, ainda não salva');
    await page.getByRole('button', { name: 'Salvar e Publicar' }).click();
    await expect(page.getByText('Nova versão salva: agora é a ativa desta semana.', { exact: false })).toBeVisible();
    expect(banco.rpcs.map(r => r.nome)).toEqual(['salvar_escala_nova']);
    expect(banco.rpcs[0].corpo).toMatchObject({ p_unidade_id: FAKE_UNIT_ID, p_data_inicio: SEMANA, p_data_fim: '2026-08-07' });
    const NOVA = banco.linhas.find(l => l.id !== ANTIGA)!.id;
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(banner).toHaveAttribute('data-versao-id', NOVA);

    await page.goto(`/${slug}/${SEMANA}/historico`);
    const linhas = page.locator('tbody tr');
    await expect(linhas).toHaveCount(2);
    await expect(linhas.nth(0)).toContainText('Ativa');
    await expect(linhas.nth(1)).toContainText('Substituída em');

    // Abrir a antiga, editar e salvar: PATCH pelo id, sem tocar em `ativa`.
    await linhas.nth(1).getByRole('button', { name: 'Abrir versão' }).click();
    await expect(page).toHaveURL(new RegExp(`\\?escala=${ANTIGA}$`));
    await expect(banner).toContainText('Versão substituída em');
    await arrastar(page, 'Ciro Cometa', ['Cuidados demonstrativos', 0], ['Consulta demonstrativa', 0]);
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toContainText(msg);
    await page.getByRole('button', { name: 'Salvar nesta versão' }).click();
    await expect(page.getByText('a versão ativa da semana não mudou', { exact: false })).toBeVisible();
    expect(banco.patches).toHaveLength(1);
    expect(new URL(banco.patches[0].url).searchParams.get('id')).toBe(`eq.${ANTIGA}`);
    expect(banco.patches[0].corpo).not.toHaveProperty('ativa');
    expect(banco.patches[0].corpo.grade.manha['Consulta demonstrativa'][0]).toContain('Ciro Cometa');
    expect(banco.linhas).toHaveLength(2);
    expect(banco.linhas.find(l => l.id === NOVA)!.ativa).toBe(true);

    // "Tornar ativa" pelo Histórico.
    await page.goto(`/${slug}/${SEMANA}/historico`);
    await linhas.filter({ hasText: 'Substituída em' }).getByRole('button', { name: 'Tornar ativa' }).click();
    await expect.poll(() => banco.rpcs.length).toBe(2);
    expect(banco.rpcs[1]).toEqual({ nome: 'ativar_escala', corpo: { p_id: ANTIGA } });
    // A lista recarrega: a antiga (criada antes) agora é a Ativa.
    await expect(linhas.filter({ hasText: 'antiga' }).getByText('Ativa', { exact: true })).toBeVisible();
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(banner).toHaveAttribute('data-versao-id', ANTIGA);
  });

  test('grade salva carregando trava Gerar/arrastar; a geração seguinte fica e salva como versão nova', async ({ page }) => {
    const ANTIGA = '0a0a0a0a-0000-4000-8000-0000000000bb';
    const banco = await bancoSimulado(page, [{
      id: ANTIGA, titulo: 'antiga', data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS, grade: gradeManual(),
      violacoes: [], score: 0, status: 'validada', ativa: true, substituida_em: null,
      created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-08-01T10:00:00.000Z',
    }]);
    // A Config da semana demora: a grade salva aparece antes da conferência.
    await page.route('**/rest/v1/regras_config*', async r => { await new Promise(res => setTimeout(res, 1500)); await responderPagina(r, []); });
    await page.goto(`/${slug}/${SEMANA}`);
    const banner = page.getByTestId('versao-grade');
    await expect(banner).toHaveAttribute('data-versao-id', ANTIGA);
    const gerar = page.getByRole('button', { name: 'Carregando…' });
    await expect(gerar).toBeDisabled();
    await expect(page.locator('[draggable="true"]')).toHaveCount(0);
    await expect(page.getByText('Carregando a grade salva…')).toBeVisible();

    await page.getByRole('button', { name: /Gerar Grade|Carregando…/ }).click();
    await expect(banner).toContainText('Grade nova, ainda não salva');
    // Nenhuma etapa atrasada da carga pode trazer a grade salva de volta.
    await page.waitForTimeout(2000);
    await expect(banner).toContainText('Grade nova, ainda não salva');
    await page.getByRole('button', { name: 'Salvar e Publicar' }).click();
    await expect(page.getByText('Nova versão salva', { exact: false })).toBeVisible();
    expect(banco.rpcs.map(r => r.nome)).toEqual(['salvar_escala_nova']);
    expect(banco.patches).toHaveLength(0);
  });

  test('falha ao carregar a grade salva aparece na tela', async ({ page }) => {
    await page.route('**/rest/v1/escalas_semanais*', r => new URL(r.request().url()).searchParams.get('ativa')
      ? r.fulfill({ status: 500, json: { message: 'banco fora do ar' } })
      : responderPagina(r, []));
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(page.getByRole('alert').filter({ hasText: 'Não consegui carregar a grade salva desta semana' })).toContainText('banco fora do ar');
  });
});
