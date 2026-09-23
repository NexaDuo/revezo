import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, autenticarComoCoordenador, mockarUnidade } from './supabase-mock';
import { defaultConfig, generateSchedule, validar, criarEscalaVazia } from '../src/lib/solver';
import { indexarRotulos, sitiosForaDaUnidade } from '../src/lib/referenciasSitio';
import type { Config, Escala } from '../src/lib/solver/types';

// Regressão: renomear um sítio em Configurações deixou 11 colocações fixas
// apontando para o nome antigo (a referência era texto), e "Gerar Grade"
// quebrava no validador com "Cannot read properties of undefined (reading '1')".
// Agora a referência é o id do sítio; o validador também nunca lança diante
// de um sítio que não está na grade (grade salva antiga, modo demonstração).

// Lógica pura: roda igual com e sem `.env`. Nome inventado de propósito: o
// nome antigo real ainda existe no `defaultConfig` (dado semente).
test.describe('sítio que não existe na grade', () => {
  const FANTASMA = 'Sítio que foi renomeado';
  const pessoa = 'Pessoa Fictícia';
  const config: Config = {
    ...defaultConfig,
    equipe: [{ n: pessoa, c: 'enf', t: 'ambos' }, { n: 'Outra Fictícia', c: 'tec', t: 'ambos' }],
    fixas: [{ p: pessoa, d: 1, t: 'manha', s: FANTASMA }, { p: pessoa, d: 3, t: 'tarde', s: FANTASMA }],
    proibicoes: [{ pessoa, sitio: FANTASMA }],
    sextaAnterior: { manha: { [FANTASMA]: [pessoa] }, tarde: {} },
    acoes: FANTASMA,
    prioridadeDupla: [FANTASMA, ...defaultConfig.prioridadeDupla],
  };

  test('validador e solver não lançam; a fixa órfã vira violação, não silêncio', () => {
    expect(() => validar(config, criarEscalaVazia(config))).not.toThrow();
    const r = generateSchedule(config);
    expect(r.violacoes.filter(v => v.regra === 'fixas' && v.sitio === FANTASMA).length).toBeGreaterThan(0);
  });

  test('grade salva antiga sem um sítio atual não derruba o validador e é detectada', () => {
    const antiga: Escala = { manha: { [FANTASMA]: [[], [], [], [], []] }, tarde: {} };
    expect(() => validar(defaultConfig, antiga)).not.toThrow();
    expect(sitiosForaDaUnidade(antiga, defaultConfig.sitios)).toEqual([FANTASMA]);
  });

  test('referência por id resolve para o nome ATUAL, no rótulo do turno', () => {
    const antes = indexarRotulos([{ id: 's-9', nome: 'Nome antigo', nome_tarde: null }, { id: 's-2', nome: 'Curativo', nome_tarde: 'Curativo 16h' }]);
    const depois = indexarRotulos([{ id: 's-9', nome: 'Nome novo', nome_tarde: null }, { id: 's-2', nome: 'Curativo', nome_tarde: 'Curativo 16h' }]);
    expect(antes('s-9', 'manha')).toBe('Nome antigo');
    expect(depois('s-9', 'manha')).toBe('Nome novo');
    expect(depois('s-2', 'tarde')).toBe('Curativo 16h');
    expect(depois('s-2', 'manha')).toBe('Curativo');
    expect(depois('nao-existe', 'manha')).toBeNull();
  });
});

// Ponta a ponta contra o Supabase mockado (precisa do `.env` para simular a
// sessão de coordenador; sem ele o app só tem o modo demonstração, coberto acima).
const ANTIGO = 'Ações de vigilância/VD/PSE/Ensino/cursos/grupos';
const NOVO = 'Ações de vigilância, VD, PSE, Ensino, cursos, grupos';
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
const nomes = ['Aurora Estelar', 'Íris Lunar', 'Ciro Cometa', 'Nilo Solar', 'Lira Boreal', 'Orion Celeste'];

function segundaAtualISO() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const equipe = nomes.map((nome, i) => ({
  id: `pessoa-${i}`, nome, nome_curto: nome, ativo: true, ordem: i,
  categoria: i % 2 ? 'tec' : 'enf', turno_base: 'ambos', fixo_sitio_id: null, isento_acoes: false, custo_extra: 0,
}));
const sitio = (id: string, ordem: number, nome: string, categoria_permitida: string) =>
  ({ id, ordem, nome, nome_tarde: null, categoria_permitida, opcional: false, prioridade_dupla: null });
const fixa = (i: number, sitio_id: string) => ({
  id: `cf-${i}`, pessoa_curto: nomes[i % nomes.length], dia: i % 5, turno: i % 2 ? 'tarde' : 'manha',
  sitio_id, tipo: 'fixa_sitio', descricao: null, depende_de_plantao: false,
});

async function gerar(page: Page) {
  const erros: string[] = [];
  page.on('pageerror', e => erros.push(e.message));
  await page.goto(`/hospital-teste/${segundaAtualISO()}`);
  await page.getByRole('button', { name: 'Gerar Grade', exact: true }).click();
  await expect(page.getByTestId('indicador-score')).toContainText(/Score: \d+/);
  await expect(page.getByRole('table')).toHaveCount(2);
  await expect(page.getByText('Falha ao gerar a grade')).toHaveCount(0);
  return erros;
}

test('sítio renomeado: as colocações fixas continuam valendo pelo id', async ({ page }) => {
  test.skip(!HAS_ENV, 'Precisa do Supabase configurado para simular as tabelas da unidade.');
  await autenticarComoCoordenador(page);
  // As fixas foram criadas quando o sítio s3 se chamava ANTIGO; o sítio foi
  // renomeado para NOVO. O id não mudou, então nada fica órfão.
  await mockarUnidade(page, {
    equipe,
    sitios: [sitio('s1', 1, 'Consulta', 'enf'), sitio('s2', 2, 'Curativo', 'tec'), sitio('s3', 3, NOVO, 'ambos')],
    colocacoesFixas: [fixa(0, 's3')], // Aurora Estelar, segunda (dia 0), manhã
    disponiveis: { data_inicio: segundaAtualISO(), dias: DIAS },
  });
  const erros = await gerar(page);

  const manha = page.getByRole('table').first();
  const linha = manha.getByRole('row').filter({ has: page.getByRole('cell', { name: NOVO, exact: true }) });
  await expect(linha.getByRole('cell').nth(1)).toContainText('Aurora Estelar');
  await expect(page.getByText(/apontam para sítio que não foi encontrado/)).toHaveCount(0);
  await expect(page.getByText(ANTIGO)).toHaveCount(0);
  expect(erros).toEqual([]);
});

test('fixas apontando para sítio que a unidade não tem: grade gera e o aviso aparece', async ({ page }) => {
  test.skip(!HAS_ENV, 'Precisa do Supabase configurado para simular as tabelas da unidade.');
  await autenticarComoCoordenador(page);
  await mockarUnidade(page, {
    equipe,
    sitios: [sitio('s1', 1, 'Consulta', 'enf'), sitio('s2', 2, 'Curativo', 'tec'), sitio('s3', 3, NOVO, 'ambos')],
    colocacoesFixas: Array.from({ length: 11 }, (_, i) => fixa(i, 'sitio-apagado')),
    disponiveis: { data_inicio: segundaAtualISO(), dias: DIAS },
  });
  const erros = await gerar(page);

  const aviso = page.getByRole('listitem').filter({ hasText: 'Colocações fixas apontam para sítio que não foi encontrado' });
  await expect(aviso).toBeVisible();
  await expect(aviso).toContainText('"sitio-apagado" (11 regras)');
  await expect(aviso).toContainText('foram ignoradas');
  expect(erros).toEqual([]);
});
