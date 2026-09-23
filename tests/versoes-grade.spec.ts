import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, FAKE_UNIT_ID, autenticarComoCoordenador, responderPagina, mockarEscalas } from './supabase-mock';
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
    // Só o nome (1º nó de texto): a linha órfã mostra o motivo na mesma célula.
    .locator(`xpath=.//tr[td[1][normalize-space(text()[1])="${sitio}"]]/td[${d + 2}]`);
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
    await page.getByRole('button', { name: 'Salvar e Publicar' }).click();
    await expect(page.getByText('Nova versão salva: agora é a ativa desta semana.', { exact: false })).toBeVisible();

    // A confirmação depende da edição, não da solução aleatória do solver.
    // Reabre uma grade mínima conhecida, evitando arrastar sobre células cuja
    // altura/conteúdo muda entre reinícios da geração.
    const grade: Escala = { manha: {}, tarde: {} };
    for (const t of ['manha', 'tarde'] as const)
      for (const sitio of configDemo.sitios[t]) grade[t][sitio.n] = DIAS.map(() => []);
    const tecnico = configDemo.equipe.find(p => p.c === 'tec')!.n;
    const origemNome = configDemo.sitios.manha.find(s => s.quem === 'tec')!.n;
    grade.manha[origemNome][0] = [tecnico];
    const mov = movimentoQueViolaCategoria(configDemo, grade);
    await page.evaluate(e => localStorage.setItem('demo_escalas', JSON.stringify([e])), {
      id: '0a0a0a0a-0000-4000-8000-000000000099', titulo: 'edição conhecida',
      data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS, grade,
      violacoes: [], score: 0, ativa: true, substituida_em: null, created_at: '2026-08-01T10:00:00Z',
    });
    await page.reload();
    await expect(banner).toContainText('Versão ativa');
    await expect(gerar).toBeEnabled();
    const origem = celula(page, 'manha', mov.de[0], mov.de[1]);
    const destino = celula(page, 'manha', mov.para[0], mov.para[1]);
    await expect(destino.getByText(mov.nome, { exact: true })).toHaveCount(0);
    // Eventos HTML5 exercitam a edição sem depender de coordenadas/scroll da tabela.
    const transferencia = await page.evaluateHandle(() => new DataTransfer());
    await origem.getByText(mov.nome, { exact: true }).dispatchEvent('dragstart', { dataTransfer: transferencia });
    await destino.dispatchEvent('drop', { dataTransfer: transferencia });
    await transferencia.dispose();
    await expect(origem.getByText(mov.nome, { exact: true })).toHaveCount(0);
    await expect(destino.getByText(mov.nome, { exact: true })).toBeVisible();
    await gerar.click();
    expect(dialogos).toEqual(['confirm']);
    await expect(destino.getByText(mov.nome, { exact: true })).toBeVisible();
    await expect(banner).toContainText('Alterações não salvas');
  });

  test('voltar do navegador com grade não salva pergunta e, se cancelar, fica', async ({ page }) => {
    await semeiaDisp(page);
    await page.goto(`/${slug}/${SEMANA}/regras`);
    await page.getByRole('link', { name: 'Grade da Semana' }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/${SEMANA}$`));
    await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
    const banner = page.getByTestId('versao-grade');
    await expect(banner).toContainText('Grade nova, ainda não salva');

    const dialogos: string[] = [];
    page.once('dialog', d => { dialogos.push(d.message()); d.dismiss(); });
    await page.goBack();
    await expect.poll(() => dialogos.length).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/${slug}/${SEMANA}$`));
    await expect(banner).toContainText('Grade nova, ainda não salva');

    page.once('dialog', d => d.accept());
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${slug}/${SEMANA}/regras$`));
  });

  test('semana com versões e nenhuma ativa diz isso e permite tornar ativa', async ({ page }) => {
    await semeiaDisp(page);
    const grade = generateSchedule(configDemo).escala;
    await page.addInitScript(e => {
      if (!localStorage.getItem('demo_escalas')) localStorage.setItem('demo_escalas', JSON.stringify([e]));
    }, {
      id: '0a0a0a0a-0000-4000-8000-000000000077', titulo: 'substituída', data_inicio: SEMANA, data_fim: '2026-08-07',
      dias: DIAS, grade, violacoes: [], score: 0, ativa: false, substituida_em: '2026-08-02T10:00:00Z',
      created_at: '2026-08-01T10:00:00Z',
    });
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(page.getByTestId('semana-sem-ativa')).toContainText('1 versão salva, nenhuma ativa');
    await page.getByRole('button', { name: 'Tornar ativa a versão mais recente' }).click();
    await expect(page.getByTestId('versao-grade')).toContainText('Versão ativa');
  });

  test('localStorage indisponível não derruba a demonstração', async ({ page }) => {
    // O script do Clarity (terceiro) também usa storage e lança; o que se testa é o app.
    await page.route('**/*clarity.ms/**', r => r.abort());
    await page.addInitScript(() => {
      for (const m of ['getItem', 'setItem', 'removeItem'] as const)
        Storage.prototype[m] = () => { throw new DOMException('bloqueado', 'SecurityError'); };
    });
    const erros: string[] = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(page.getByLabel('Semana', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar Grade', exact: true })).toBeVisible();
    expect(erros).toEqual([]);
  });

  test('impressão em largura de celular mostra a grade sem os controles', async ({ page }) => {
    await semeiaDisp(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${slug}/${SEMANA}`);
    await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
    await expect(page.getByTestId('versao-grade')).toContainText('Grade nova, ainda não salva');
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Gerar Grade', exact: true })).toBeHidden();
    await expect(page.getByTestId('versao-grade')).toBeHidden();
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
      `A grade salva usa sítios removidos ou sem correspondência inequívoca: ${renomeado} (nome antigo) (grade antiga: sem sítio correspondente no cadastro) — confira as linhas preservadas antes de salvar.`)).toBeVisible();
    // A linha órfã fica na grade, marcada e com o motivo na tela.
    await expect(page.locator('[data-sitio-orfao]')).toHaveCount(1);
    await expect(page.locator('[data-sitio-orfao]')).toContainText('grade antiga: sem sítio correspondente no cadastro');
    // Abrir legado preserva as chaves: não acrescenta a linha atual.
    await expect(celula(page, 'manha', renomeado, 0)).toHaveCount(0);

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
    const finais = await escalasDemo(page);
    expect(finais).toHaveLength(3);
    expect(finais.every((e: any) => Array.isArray(e.sitios) && e.sitios.length > 0)).toBe(true);
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
  await page.route('**/rest/v1/equipe*', r => responderPagina(r, PESSOAS.map(([nome, categoria, turno], i) => ({
    id: `p${i}`, unidade_id: FAKE_UNIT_ID, nome, nome_curto: nome, categoria, turno_base: turno, ordem: i, ativo: true,
  }))));
  const sitios = SITIOS.map(([nome, cat], i) => ({
    id: `s${i}`, unidade_id: FAKE_UNIT_ID, ordem: i + 1, nome: String(nome), nome_tarde: null as string | null, categoria_permitida: cat, opcional: false, prioridade_dupla: null,
  }));
  await page.route('**/rest/v1/sitios*', r => responderPagina(r, sitios));
  const disp = { unidade_id: FAKE_UNIT_ID, data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS,
    dados: Object.fromEntries(PESSOAS.map(([n]) => [n, DIAS.map(() => 'OK')])) };
  await page.route('**/rest/v1/disponibilidade_semanal*', r => {
    const di = new URL(r.request().url()).searchParams.get('data_inicio');
    return responderPagina(r, !di || di === `eq.${SEMANA}` ? [disp] : []);
  });
  return { ...await mockarEscalas(page, iniciais), sitios };
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
    await expect(page.getByText('A grade salva usa sítios removidos ou sem correspondência inequívoca: Sala Extinta (grade antiga: sem sítio correspondente no cadastro) — confira as linhas preservadas antes de salvar.')).toBeVisible();
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
    expect(banco.rpcs[0].corpo.p_sitios.map((s: any) => s.id)).toEqual(['s0', 's1', 's2']);
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

  test('fotografia: histórico mantém nomes e ordem; salvar atualiza por ID sem perder conteúdo', async ({ page }) => {
    const id = '0a0a0a0a-0000-4000-8000-0000000000cc';
    const banco = await bancoSimulado(page, [{
      id, titulo: 'fotografia', data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS,
      grade: gradeManual(), sitios: null, violacoes: [], score: 0, ativa: true,
      substituida_em: null, created_at: '2026-08-01T10:00:00Z',
    }]);
    await page.goto(`/${slug}/${SEMANA}`);
    await page.getByRole('button', { name: 'Salvar nesta versão' }).click();
    await expect.poll(() => banco.patches.length).toBe(1);
    expect(banco.linhas[0].sitios.map((s: any) => s.id)).toEqual(['s0', 's1', 's2']);
    const conteudo = structuredClone(banco.linhas[0].grade);
    // Simula também a ordem de chaves não confiável do JSONB.
    banco.linhas[0].grade.manha = Object.fromEntries(Object.entries(conteudo.manha).reverse());
    banco.sitios[0].nome = 'Consulta atual';
    banco.sitios[0].nome_tarde = 'Consulta vespertina atual';
    banco.sitios[0].ordem = 9;
    banco.sitios[0].categoria_permitida = 'tec';
    banco.sitios.push({ ...banco.sitios[1], id: 's3', nome: 'Sala nova', ordem: 8 });
    await page.goto(`/${slug}/${SEMANA}/historico`);
    await page.getByRole('button', { name: 'Abrir versão' }).click();
    await expect(page.getByRole('button', { name: 'Salvar nesta versão' })).toBeEnabled();
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toContainText('Aurora Estelar');
    await expect(celula(page, 'tarde', 'Consulta demonstrativa', 0)).toContainText('Lira Boreal');
    await expect(celula(page, 'manha', 'Consulta atual', 0)).toHaveCount(0);
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).not.toContainText('este sítio é de técnicos');
    await expect(celula(page, 'manha', 'Sala nova', 0)).toHaveCount(0);
    await expect(page.getByRole('table').first().locator('tbody tr').first()).toContainText('Consulta demonstrativa');
    await page.getByRole('button', { name: 'Salvar nesta versão' }).click();
    await expect(celula(page, 'manha', 'Consulta atual', 0)).toContainText('Aurora Estelar');
    await expect(celula(page, 'manha', 'Consulta atual', 0)).toContainText('este sítio é de técnicos');
    await expect(celula(page, 'tarde', 'Consulta vespertina atual', 0)).toContainText('Lira Boreal');
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toHaveCount(0);
    await expect(celula(page, 'manha', 'Sala nova', 0).locator('[draggable]')).toHaveCount(0);
    expect(banco.linhas[0].grade.manha['Consulta atual']).toEqual(conteudo.manha['Consulta demonstrativa']);
    expect(banco.linhas[0].grade.tarde['Consulta vespertina atual']).toEqual(conteudo.tarde['Consulta demonstrativa']);
    expect(banco.linhas[0].sitios.map((s: any) => s.id)).toEqual(['s1', 's2', 's3', 's0']);
  });

  test('sítio excluído continua na fotografia, na grade e no aviso após salvar e reabrir', async ({ page }) => {
    const id = '0a0a0a0a-0000-4000-8000-0000000000dd';
    const banco = await bancoSimulado(page, [{
      id, titulo: 'exclusão', data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS,
      grade: gradeManual(), violacoes: [], score: 0, ativa: true,
      substituida_em: null, created_at: '2026-08-01T10:00:00Z',
    }]);
    banco.linhas[0].sitios = structuredClone(banco.sitios);
    banco.sitios.splice(0, 1);
    await page.goto(`/${slug}/${SEMANA}/historico`);
    await page.getByRole('button', { name: 'Abrir versão' }).click();
    const aviso = page.getByText('A grade salva usa sítios removidos ou sem correspondência inequívoca:', { exact: false });
    await expect(aviso).toContainText('Consulta demonstrativa');
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toContainText('Aurora Estelar');
    await page.getByRole('button', { name: 'Salvar nesta versão' }).click();
    await expect.poll(() => banco.patches.length).toBe(1);
    expect(banco.linhas[0].sitios.find((s: any) => s.id === 's0')).toMatchObject({ removido: true, nome: 'Consulta demonstrativa' });
    await page.reload();
    await expect(aviso).toContainText('Consulta demonstrativa');
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toContainText('Aurora Estelar');
  });

  test('legado sem fotografia abre exatamente as chaves salvas', async ({ page }) => {
    const grade = { manha: { 'Nome de antes': [['Aurora Estelar'], [], [], [], []] }, tarde: {} };
    await bancoSimulado(page, [{
      id: '0a0a0a0a-0000-4000-8000-0000000000ee', titulo: 'legado',
      data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS, grade, sitios: null,
      violacoes: [], score: 0, ativa: true, substituida_em: null, created_at: '2026-08-01T10:00:00Z',
    }]);
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(page.getByRole('button', { name: 'Salvar nesta versão' })).toBeEnabled();
    await expect(page.getByRole('table').first().locator('tbody tr')).toHaveCount(1);
    await expect(celula(page, 'manha', 'Nome de antes', 0)).toContainText('Aurora Estelar');
    await expect(celula(page, 'manha', 'Consulta demonstrativa', 0)).toHaveCount(0);
    await expect(page.getByText('A grade salva usa sítios removidos ou sem correspondência inequívoca:', { exact: false })).toContainText('Nome de antes');
  });

  test('legado sem fotografia reconcilia IDs pelo nome canônico, ordena pelo cadastro e marca a órfã', async ({ page }) => {
    const g = gradeManual();
    // Chaves em ordem invertida (JSONB) e uma com caixa/espaços diferentes do cadastro.
    const grade = {
      manha: { 'Sala Extinta': [['Nilo Solar'], [], [], [], []], 'Ações educativas': g.manha['Ações educativas'],
        'Cuidados demonstrativos': g.manha['Cuidados demonstrativos'], 'CONSULTA  demonstrativa': g.manha['Consulta demonstrativa'] },
      tarde: g.tarde,
    };
    const banco = await bancoSimulado(page, [{
      id: '0a0a0a0a-0000-4000-8000-0000000000ef', titulo: 'legado canônico',
      data_inicio: SEMANA, data_fim: '2026-08-07', dias: DIAS, grade, sitios: null,
      violacoes: [], score: 0, ativa: true, substituida_em: null, created_at: '2026-08-01T10:00:00Z',
    }]);
    await page.goto(`/${slug}/${SEMANA}`);
    await expect(page.getByRole('button', { name: 'Salvar nesta versão' })).toBeEnabled();
    const linhas = page.getByRole('table').first().locator('tbody tr');
    await expect(linhas.locator('td:first-child')).toHaveText([
      'CONSULTA  demonstrativa', 'Cuidados demonstrativos', 'Ações educativas', /^Sala Extinta/,
    ]);
    const orfa = linhas.filter({ hasText: 'Sala Extinta' });
    await expect(orfa).toHaveAttribute('data-sitio-orfao', 'true');
    await expect(orfa).toContainText('grade antiga: sem sítio correspondente no cadastro');
    await expect(page.locator('[data-sitio-orfao]')).toHaveCount(1);
    await expect(page.getByText('A grade salva usa sítios removidos ou sem correspondência inequívoca:', { exact: false }))
      .toContainText('Sala Extinta (grade antiga: sem sítio correspondente no cadastro)');

    await page.getByRole('button', { name: 'Salvar nesta versão' }).click();
    await expect.poll(() => banco.patches.length).toBe(1);
    expect(banco.linhas[0].sitios.map((s: any) => s.id)).toEqual(['s0', 's1', 's2', 'legado:Sala Extinta']);
    expect(banco.linhas[0].grade.manha['Consulta demonstrativa']).toEqual(g.manha['Consulta demonstrativa']);
    expect(banco.linhas[0].grade.manha['Sala Extinta']).toEqual([['Nilo Solar'], [], [], [], []]);
    await expect(orfa).toHaveAttribute('data-sitio-orfao', 'true');
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
