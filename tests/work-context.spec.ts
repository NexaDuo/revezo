import { defaultConfig } from '../src/lib/solver/defaultConfig';
import { test, expect } from '@playwright/test';
import { HAS_ENV, FAKE_USER_ID, FAKE_UNIT_ID, autenticarComoCoordenador, responderPagina } from './supabase-mock';

test.describe('WorkContext — semana e unidade dirigem o que a tela carrega', () => {
  test('a semana aparece no seletor do header, sem título duplicado', async ({ page }) => {
    if (HAS_ENV) await autenticarComoCoordenador(page);
    const slug = HAS_ENV ? 'hospital-teste' : 'demonstracao';
    await page.goto(`/${slug}/2026-08-03`);
    await expect(page.getByLabel('Semana', { exact: true })).toHaveValue('2026-08-03');
    await expect(page.getByTestId('titulo-semana')).toHaveCount(0);
  });

  test('semana sem disponibilidade salva mostra o aviso da semana (modo demonstração)', async ({ page }) => {
    test.skip(HAS_ENV, 'Sem sessão logada, o Supabase real nunca resolve uma unidade — ver o teste "sem unidade resolvida" abaixo.');

    await page.goto('/disponibilidade');
    await expect(page.getByRole('heading', { name: 'Disponibilidade da semana' })).toBeVisible();

    // Modo demonstração sempre resolve para a unidade demo, sem chamada de
    // rede — a semana corrente não tem nada salvo, e é só isso que este
    // teste precisa provar: um aviso específico da semana, não um silêncio.
    await expect(page.getByText(/Nenhuma disponibilidade salva para a semana de/)).toBeVisible();
  });

  test('sem unidade resolvida mostra aviso explícito (Supabase real, sem sessão)', async ({ page }) => {
    test.skip(!HAS_ENV, 'Só é determinístico com Supabase real: em modo demonstração a unidade sempre resolve.');

    await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [] }));
    await page.goto('/disponibilidade');
    await expect(page.getByRole('heading', { name: 'Disponibilidade da semana' })).toBeVisible();

    // Sem sessão, o WorkContext termina de resolver sem achar unidade — isso
    // é uma falha real (não uma corrida de carregamento) e tem que aparecer
    // como tal, não como uma tela em branco.
    await expect(page.getByText(/Nenhuma unidade selecionada/)).toBeVisible();
  });

  test('Gerar Grade bloqueia quando a semana não tem disponibilidade salva (modo demonstração)', async ({ page }) => {
    test.skip(HAS_ENV, 'Precisa do botão "Gerar Grade", que só existe para coordenador/admin — sem sessão, o Supabase real entra como visualizador.');

    await page.goto('/');
    const botaoGerar = page.getByRole('button', { name: /Gerar Grade/ });
    await expect(botaoGerar).toBeVisible();
    await botaoGerar.click();

    // Geração bloqueada: nunca deve rodar o solver com "todo mundo
    // disponível" presumido em silêncio — isso é o dado alucinado que o
    // produto não pode gerar sozinho.
    await expect(page.getByText(/Geração bloqueada/)).toBeVisible();
    await expect(
      page.getByText('Clique em "Gerar Grade" para visualizar a escala gerada pelo solver.')
    ).toBeVisible();
  });

  test('carregamento inicial não mostra erro de unidade prematuro (perfil demorando, Supabase real mockado)', async ({ page }) => {
    // A corrida só é observável quando `exigirUnidade()` pode de fato lançar
    // no meio de uma resolução em andamento — em modo demonstração `listar()`
    // nunca lança, então só o modo credenciado prova alguma coisa aqui. Sem
    // `.env` não há URL/projeto Supabase reais para derivar a chave de
    // localStorage da sessão, então este teste não roda nesse lado.
    test.skip(!HAS_ENV, 'Precisa de um projeto Supabase real (URL do .env) para simular a sessão via localStorage.');

    // O perfil demora ~1.5s a responder: é exatamente a janela onde a corrida
    // original acontecia — managers consultando com `unidadeId` ainda nulo
    // porque o WorkContext ainda não tinha recebido o perfil.
    await autenticarComoCoordenador(page, { profileDelayMs: 1500 });

    const dialogos: string[] = [];
    page.on('dialog', async d => {
      dialogos.push(d.message());
      await d.dismiss();
    });

    await page.goto('/regras');
    await expect(page.getByRole('heading', { name: /^Regras/ })).toBeVisible();

    // Ainda dentro da janela de 1.5s (perfil não respondeu): tem que aparecer
    // um indicador de carregamento, nunca o erro de unidade ausente — a
    // unidade só está demorando a resolver, não está de fato faltando.
    await expect(page.getByText(/Nenhuma unidade selecionada/)).not.toBeVisible();
    await expect(page.getByText('Carregando...').first()).toBeVisible();

    // Depois que o perfil chega e a unidade resolve, o erro nunca deveria ter
    // aparecido em nenhum momento da espera.
    await page.waitForTimeout(1700);
    await expect(page.getByText(/Nenhuma unidade selecionada/)).not.toBeVisible();
    expect(dialogos, 'nenhum alert() nativo deveria disparar durante o carregamento inicial').toEqual([]);
  });

  test('o polegar do liga/desliga de regra fica dentro da trilha, ligado e desligado (Supabase real mockado)', async ({ page }) => {
    // Regressão relatada pelo usuário: o polegar branco do switch de
    // liga/desliga (RegrasManager) ficava fora da trilha. Precisa de linhas
    // reais em `regras_config` para existir algum switch na tela — RLS exige
    // `authenticated`, então isso nunca acontece sem sessão (nem em modo
    // demonstração, onde `listar()` sempre volta vazio de propósito).
    test.skip(!HAS_ENV, 'Precisa de um projeto Supabase real (URL do .env) para simular sessão e linhas de regras_config.');

    await autenticarComoCoordenador(page, {
      regrasConfig: [
        { id: 'r1', chave: 'disponibilidade', nome: 'Disponibilidade do mês', descricao: null, ativa: true, rigida: true, ordem: 1 },
        { id: 'r2', chave: 'turnoBase', nome: 'Turno-base', descricao: null, ativa: false, rigida: true, ordem: 2 },
      ],
    });

    await page.goto('/regras');
    await expect(page.getByRole('heading', { name: /^Regras/ })).toBeVisible();

    // 'disponibilidade' cobre o estado LIGADO, 'turnoBase' o DESLIGADO — as
    // duas posições do polegar (translate-x-5 e translate-x-0), sem precisar
    // clicar (clicar exigiria mockar também o UPDATE em regras_config).
    for (const chave of ['disponibilidade', 'turnoBase']) {
      const botao = page.getByTestId(`regra-toggle-${chave}`);
      const polegar = page.getByTestId(`regra-toggle-knob-${chave}`);
      await expect(botao).toBeVisible();

      const caixaBotao = await botao.boundingBox();
      const caixaPolegar = await polegar.boundingBox();
      expect(caixaBotao, `botão de ${chave} precisa ter geometria`).not.toBeNull();
      expect(caixaPolegar, `polegar de ${chave} precisa ter geometria`).not.toBeNull();

      expect(caixaPolegar!.x, `polegar de ${chave} não pode começar antes da trilha`).toBeGreaterThanOrEqual(caixaBotao!.x);
      expect(
        caixaPolegar!.x + caixaPolegar!.width,
        `polegar de ${chave} não pode terminar depois da trilha`
      ).toBeLessThanOrEqual(caixaBotao!.x + caixaBotao!.width);

      // Segunda regressão relatada pelo usuário: o switch (botão sem texto)
      // alinhava pela borda de baixo na linha de base e ficava fora da altura
      // da pílula de severidade da mesma linha. Centros verticais devem bater.
      const caixaSeveridade = await page.getByTestId(`regra-severidade-${chave}`).boundingBox();
      expect(caixaSeveridade, `severidade de ${chave} precisa ter geometria`).not.toBeNull();
      const centro = (c: { y: number; height: number }) => c.y + c.height / 2;
      expect(
        Math.abs(centro(caixaBotao!) - centro(caixaSeveridade!)),
        `switch e severidade de ${chave} precisam estar na mesma altura`
      ).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('Contexto na URL', () => {
  test.beforeEach(async ({ page }) => {
    if (HAS_ENV) await autenticarComoCoordenador(page);
  });
  const slug = HAS_ENV ? 'hospital-teste' : 'demonstracao';

  for (const tela of ['', '/regras']) {
    test(`redireciona URL antiga ${tela || '/'}`, async ({ page }) => {
      await page.goto(tela || '/');
      await expect(page).toHaveURL(new RegExp(`/${slug}/\\d{4}-\\d{2}-\\d{2}${tela}$`));
    });
  }

  test('deep link, reload e sidebar preservam contexto', async ({ page }) => {
    await page.goto(`/${slug}/2026-08-03/regras`);
    await expect(page.getByRole('heading', { name: /^Regras/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Semana', { exact: true })).toHaveValue('2026-08-03');
    await expect(page.getByRole('link', { name: 'Regras & Conferência' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Disponibilidade', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${slug}/2026-08-03/disponibilidade$`));
    await expect(page.getByText(/Nenhuma disponibilidade salva para a semana de/)).toBeVisible();
  });

  for (const contexto of ['inexistente/2026-08-03', `${slug}/2026-08-04`, `${slug}/2026-02-30`, `${slug}/abc`]) {
    test(`recusa contexto inválido ${contexto}`, async ({ page }) => {
      await page.goto(`/${contexto}/regras`);
      await expect(page.getByRole('alert')).toContainText('Corrija o contexto');
      await expect(page.getByText(/Unidade de saúde inexistente|Semana inválida/)).toBeVisible();
      await page.getByRole('link', { name: 'Ir para contexto válido' }).click();
      await expect(page.getByRole('heading', { name: /^Regras/ })).toBeVisible();
    });
  }

  test('trocar semana navega e carrega a disponibilidade correspondente', async ({ page }) => {
    const semanas = [
      { data_inicio: '2026-08-03', data_fim: '2026-08-07', dias: ['SEG'], dados: { 'Pessoa A': ['OK'] } },
      { data_inicio: '2026-08-10', data_fim: '2026-08-14', dias: ['SEG'], dados: { 'Pessoa B': ['F'] } },
    ];
    if (HAS_ENV) await page.route('**/rest/v1/disponibilidade_semanal*', route => route.fulfill({ json: semanas }));
    else await page.addInitScript(s => { try { localStorage.setItem('demo_disponibilidade', JSON.stringify(s)); } catch {} }, semanas);
    await page.goto(`/${slug}/2026-08-03/disponibilidade`);
    await expect(page.getByRole('cell', { name: 'Pessoa A', exact: true })).toBeVisible();
    await page.getByLabel('Semana', { exact: true }).selectOption('2026-08-10');
    await expect(page).toHaveURL(new RegExp(`/${slug}/2026-08-10/disponibilidade$`));
    await expect(page.getByRole('cell', { name: 'Pessoa B', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Pessoa A', exact: true })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('cell', { name: 'Pessoa A', exact: true })).toBeVisible();
  });

  test('header e grade cabem em 375px e seletores não são impressos', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${slug}/2026-08-03`);
    await expect(page.getByLabel('Semana', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('header')).toBeHidden();
  });
});

test('admin troca hospital mantendo semana e tela; perfil comum tem rótulo', async ({ page }) => {
  test.skip(!HAS_ENV, 'Admin simulado precisa da configuração do Supabase.');
  await autenticarComoCoordenador(page);
  await page.goto('/hospital-teste/2026-08-03/regras');
  await expect(page.getByLabel('Semana', { exact: true })).toHaveValue('2026-08-03');
  await expect(page.getByRole('combobox', { name: 'Unidade de saúde', exact: true })).toHaveCount(0);
  await page.route('**/rest/v1/profiles*', route => route.fulfill({ json: {
    id: FAKE_USER_ID, unidade_id: FAKE_UNIT_ID, role: 'admin', nome: 'Teste Admin', ativo: true,
  } }));
  await page.route('**/rest/v1/unidades*', route => route.fulfill({ json: [
    { id: FAKE_UNIT_ID, slug: 'hospital-teste', nome: 'Hospital A' },
    { id: '33333333-3333-4333-8333-333333333333', slug: 'hospital-b', nome: 'Hospital B' },
  ] }));
  await page.reload();
  await page.getByRole('combobox', { name: 'Unidade de saúde', exact: true }).selectOption({ label: 'Hospital B' });
  await expect(page).toHaveURL(/\/hospital-b\/2026-08-03\/regras$/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Unidade de saúde', exact: true })).toHaveValue('33333333-3333-4333-8333-333333333333');
});

test('salvar disponibilidade revalida a fonte de semanas do header', async ({ page }) => {
  test.skip(!HAS_ENV, 'Interceptação de persistência precisa da configuração do Supabase.');
  await autenticarComoCoordenador(page);
  const semanas = [{ data_inicio: '2026-08-03', data_fim: '2026-08-07', dias: ['SEG'], dados: { 'Pessoa A': ['OK'] } }];
  await page.route('**/rest/v1/disponibilidade_semanal*', async route => {
    if (route.request().method() === 'POST') {
      semanas[0].dados = route.request().postDataJSON()[0].dados;
      // Simula outra semana importada desde a última leitura.
      semanas.push({ data_inicio: '2026-08-10', data_fim: '2026-08-14', dias: ['SEG'], dados: { 'Pessoa A': ['F'] } });
      await route.fulfill({ status: 201, json: [] });
    } else await route.fulfill({ json: semanas });
  });
  await page.goto('/hospital-teste/2026-08-03/disponibilidade');
  await page.getByRole('row').filter({ hasText: 'Pessoa A' }).getByRole('combobox').selectOption('F');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByLabel('Semana', { exact: true }).locator('option[value="2026-08-10"]')).toHaveCount(1);
});


test.describe('Grade — ações e conferência locais', () => {
  test.beforeEach(async ({ page }) => {
    if (HAS_ENV) await autenticarComoCoordenador(page);
  });
  const slug = HAS_ENV ? 'hospital-teste' : 'demonstracao';
  const botoes = ['Importar Planilha (.xlsx)', 'Gerar Grade', 'Imprimir / Salvar PDF'];

  test('ações e estado vazio ficam somente na grade', async ({ page }) => {
    await page.goto(`/${slug}/2026-08-03`);
    for (const name of botoes) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    await expect(page.getByTestId('indicador-score')).toHaveText('Nenhuma grade gerada — conferência pendente.');
    await expect(page.getByTestId('indicador-score')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeDisabled();

    for (const rota of ['regras', 'equipe', 'sitios', 'disponibilidade', 'historico']) {
      await page.goto(`/${slug}/2026-08-03/${rota}`);
      await expect(page.getByLabel('Semana', { exact: true })).toHaveValue('2026-08-03');
      for (const name of botoes) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
      await expect(page.getByTestId('indicador-score')).toHaveCount(0);
    }
  });

  for (const ausentes of [false, true]) {
    test(`geração mostra score e impressão oculta controles (ausentes: ${ausentes})`, async ({ page }) => {
      // Com Supabase, equipe vazia bloqueia a geração de propósito (App.tsx:
      // sem roster da unidade não se gera). O fluxo completo roda no modo
      // demonstração — que é o que o CI executa.
      test.skip(HAS_ENV, 'Geração ponta a ponta coberta pelo modo demonstração (sem .env).');
      const dados = ausentes
        ? Object.fromEntries(defaultConfig.equipe.map(p => [p.n, ['F', 'F', 'F', 'F', 'F']]))
        : defaultConfig.disp;
      const semana = { data_inicio: '2026-08-03', data_fim: '2026-08-07', dias: defaultConfig.dias, dados };
      await page.addInitScript(s => localStorage.setItem('demo_disponibilidade', JSON.stringify([s])), semana);
      await page.goto(`/${slug}/2026-08-03`);
      await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
      const indicador = page.getByTestId('indicador-score');
      await expect(indicador).toContainText(/Score: \d+/);
      await expect(indicador).toBeInViewport();
      if (ausentes) {
        await expect(indicador).toHaveAttribute('role', 'alert');
        await expect(indicador).toHaveClass(/bg-red-100/);
        await expect(indicador).toContainText(/[1-9]\d* rígidas/);
      }
      await expect(page.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeEnabled();
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByRole('toolbar', { name: 'Ações da grade', includeHidden: true })).toBeHidden();
      await expect(indicador).toBeHidden();
      for (const name of botoes) await expect(page.getByRole('button', { name, exact: true, includeHidden: true })).toBeHidden();
      const tabelas = page.getByRole('table');
      await expect(tabelas).toHaveCount(2);
      const principal = await page.locator('main').boundingBox();
      for (const tabela of await tabelas.all()) {
        await expect(tabela).toBeVisible();
        const caixa = await tabela.boundingBox();
        expect(caixa!.width).toBeGreaterThanOrEqual(principal!.width - 2);
      }
      expect(principal!.x).toBe(0);
      // Folhas de outra origem (a fonte do Google Fonts) não expõem cssRules.
      const cssPagina = await page.evaluate(() => [...document.styleSheets]
        .flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
        .find(r => r instanceof CSSPageRule)?.cssText);
      expect(cssPagina?.toLowerCase()).toContain('a4 landscape');
      expect(cssPagina).toContain('8mm');
    });
  }
});
for (const tela of ['equipe', 'sitios'] as const) {
  test(`${tela}: criar e editar enviam apenas colunas do schema e mostram erro legível`, async ({ page }) => {
    test.skip(!HAS_ENV, 'Payload REST exige Supabase configurado; demonstração não envia requisições.');
    await autenticarComoCoordenador(page);
    const inicial = tela === 'equipe'
      ? { nome: 'Pessoa teste', nome_curto: 'PT', categoria: 'tec', turno_base: 'manha', fixo_sitio_id: null, isento_acoes: false, custo_extra: 0, ativo: true, ordem: 7 }
      : { nome: 'Sítio teste', nome_tarde: null, categoria_permitida: 'ambos', opcional: false, prioridade_dupla: null, ordem: 7 };
    const linhas: Record<string, unknown>[] = [{ ...inicial, id: 'existente', unidade_id: FAKE_UNIT_ID, created_at: '2026-09-01' }];
    const escritas: { metodo: string; dados: Record<string, unknown> }[] = [];
    let falhar = false;
    await page.route(`**/rest/v1/${tela}*`, async route => {
      const metodo = route.request().method();
      if (metodo === 'POST' || metodo === 'PATCH') {
        const body = route.request().postDataJSON();
        const dados = Array.isArray(body) ? body[0] : body;
        escritas.push({ metodo, dados });
        if (falhar) {
          await route.fulfill({ status: 409, json: { code: '23505', message: 'duplicate key value violates unique constraint' } });
          return;
        }
        if (metodo === 'POST') linhas.push({ ...dados, id: 'novo', created_at: '2026-09-23' });
        else Object.assign(linhas[1], dados);
        await route.fulfill({ status: 200, json: [{ id: 'novo' }] });
      } else await responderPagina(route, linhas);
    });
    await page.goto(`/${tela}`);
    await page.getByRole('button', { name: 'Novo', exact: true }).click();
    await expect(page.getByLabel('Ordem', { exact: true })).toHaveValue('8');
    await page.getByLabel('Nome', { exact: true }).fill('Novo registro');
    if (tela === 'equipe') {
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await expect(page.getByRole('alert')).toHaveText('Informe o nome curto.');
      expect(escritas).toHaveLength(0);
      await page.getByLabel('Nome curto', { exact: true }).fill('NR');
    }
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    const esperado = { ...inicial, nome: 'Novo registro', ordem: 8, ...(tela === 'equipe' ? { nome_curto: 'NR' } : {}) };
    await expect.poll(() => escritas.length).toBe(1);
    expect(escritas[0]).toEqual({ metodo: 'POST', dados: { ...esperado, unidade_id: FAKE_UNIT_ID } });
    const linha = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Novo registro', exact: true }) });
    await linha.getByRole('button', { name: 'Editar', exact: true }).click();
    if (tela === 'equipe') {
      await page.getByLabel('Categoria', { exact: true }).selectOption('enf');
      await page.getByLabel('Turno base').selectOption('noite');
      await page.getByLabel('Isento de Ações').check();
      await page.getByLabel('Custo extra').fill('1.5');
      await page.getByLabel('Ativo', { exact: true }).uncheck();
      // Posto fixo é um select de sítios (grava o id); "Nenhum" vira NULL.
      await page.getByLabel('Sítio fixo').selectOption({ label: 'Nenhum' });
    } else {
      await page.getByLabel('Categoria permitida').selectOption('tec');
      await page.getByLabel('Opcional').check();
      await page.getByLabel('Prioridade de dupla').fill('2');
      await page.getByLabel('Nome à tarde').fill('   ');
    }
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect.poll(() => escritas.length).toBe(2);
    expect(escritas[1]).toEqual({ metodo: 'PATCH', dados: {
      ...esperado,
      ...(tela === 'equipe'
        ? { categoria: 'enf', turno_base: 'noite', isento_acoes: true, custo_extra: 1.5, ativo: false }
        : { categoria_permitida: 'tec', opcional: true, prioridade_dupla: 2 }),
    } });
    await linha.getByRole('button', { name: 'Editar', exact: true }).click();
    falhar = true;
    await page.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Já existe um registro com esse nome curto/ordem nesta unidade');
    await expect(page.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  });
}
