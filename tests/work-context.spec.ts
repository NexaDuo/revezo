import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  test('carregamento inicial não mostra erro de unidade prematuro (modo demonstração)', async ({ page }) => {
    test.skip(HAS_ENV, 'A corrida só é observável quando exigirUnidade() pode lançar — em demo, listar() nunca lança, então este teste não prova nada nesse modo.');

    const dialogos: string[] = [];
    page.on('dialog', async d => {
      dialogos.push(d.message());
      await d.dismiss();
    });

    await page.goto('/regras');
    await expect(page.getByRole('heading', { name: 'Gerenciador de Regras' })).toBeVisible();

    // A unidade demo resolve de forma síncrona (sem rede) — se os managers
    // consultassem antes do WorkContext assentar, isso apareceria aqui como
    // um erro de "nenhuma unidade selecionada" que se desfaz sozinho.
    await expect(page.getByText(/Nenhuma unidade selecionada/)).not.toBeVisible();
    expect(dialogos, 'nenhum alert() nativo deveria disparar durante o carregamento inicial').toEqual([]);
  });
});
