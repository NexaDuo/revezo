import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FAKE_USER_ID = '11111111-1111-4111-8111-111111111111';
const FAKE_UNIT_ID = '22222222-2222-4222-8222-222222222222';

/** Simula uma sessão de coordenador logado contra um projeto Supabase real,
 *  sem depender de credenciais de teste: injeta a sessão direto no
 *  localStorage (a mesma chave que o supabase-js usa,
 *  `sb-<project-ref>-auth-token`) e intercepta as chamadas REST que o
 *  AuthContext/WorkContext fazem em seguida. Usado pelos testes que precisam
 *  de linhas reais em tabelas escopadas por unidade (RLS exige
 *  `authenticated`, então sem isto elas sempre voltam vazias). */
async function autenticarComoCoordenador(
  page: Page,
  opts: { profileDelayMs?: number; regrasConfig?: unknown[] } = {}
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

  await page.route('**/rest/v1/profiles*', async route => {
    if (opts.profileDelayMs) await new Promise(r => setTimeout(r, opts.profileDelayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_USER_ID,
        unidade_id: FAKE_UNIT_ID,
        email: fakeUser.email,
        nome: 'Teste E2E',
        avatar_url: null,
        role: 'coordenador',
        ativo: true,
        created_at: fakeUser.created_at,
        updated_at: fakeUser.created_at,
      }),
    });
  });
  await page.route('**/rest/v1/regras_config*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.regrasConfig ?? []) })
  );
  await page.route('**/rest/v1/unidades*', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: FAKE_UNIT_ID, nome: 'Unidade Teste' }]),
    })
  );
  await page.route('**/auth/v1/user*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fakeUser) })
  );
}

/** Extrai o dia (DD) de um ISO `YYYY-MM-DD` sem depender de fuso horário. */
function diaDe(iso: string): string {
  return iso.split('-')[2];
}

// Decidido a partir do ambiente, não da UI: com `.env` presente o `npm run dev`
// (webServer do playwright.config.ts) sobe com Supabase real e sem sessão
// logada — não há como autenticar como coordenador neste conjunto de testes.
// Sem `.env`, o app entra em modo demonstração como coordenador. Cada teste
// que depende de um desses dois estados escolhe seu lado aqui, na definição
// do arquivo, nunca checando se um botão "está visível agora" e pulando em
// silêncio quando não está (isso escondia falha de setup como se fosse
// comportamento esperado).
const HAS_ENV = fs.existsSync(path.resolve(__dirname, '..', '.env'));

test.describe('WorkContext — semana e unidade dirigem o que a tela carrega', () => {
  test('o título da semana vem de semanaInicio, não de new Date() solto', async ({ page }) => {
    await page.goto('/');

    const titulo = page.getByTestId('titulo-semana');
    await expect(titulo).toBeVisible();

    const semanaInicio = await titulo.getAttribute('data-semana-inicio');
    expect(semanaInicio, 'App.tsx precisa expor a semana do WorkContext em data-semana-inicio').not.toBeNull();
    expect(semanaInicio).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // O texto renderizado ("Semana DD a DD de mês / ano") tem que bater com a
    // segunda-feira que o contexto guarda — não com uma data calculada de novo
    // dentro do componente.
    const texto = await titulo.innerText();
    expect(texto).toContain(diaDe(semanaInicio!));
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
    await expect(page.getByRole('heading', { name: 'Gerenciador de Regras' })).toBeVisible();

    // Ainda dentro da janela de 1.5s (perfil não respondeu): tem que aparecer
    // um indicador de carregamento, nunca o erro de unidade ausente — a
    // unidade só está demorando a resolver, não está de fato faltando.
    await expect(page.getByText(/Nenhuma unidade selecionada/)).not.toBeVisible();
    await expect(page.getByText('Carregando...')).toBeVisible();

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
    await expect(page.getByRole('heading', { name: 'Gerenciador de Regras' })).toBeVisible();

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
