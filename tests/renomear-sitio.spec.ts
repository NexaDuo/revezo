import { test, expect, type Page } from '@playwright/test';
import { HAS_ENV, autenticarComoCoordenador, mockarUnidade } from './supabase-mock';
import { defaultConfig, generateSchedule, validar, criarEscalaVazia } from '../src/lib/solver';
import { indexarRotulos, sitiosForaDaUnidade } from '../src/lib/referenciasSitio';
import { montarConfig } from '../src/lib/montarConfig';
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

// O mapeamento real id -> nome (linhas do banco -> Config), sem Supabase: roda
// com e sem `.env`, inclusive no CI.
test.describe('montarConfig: linhas da unidade -> Config', () => {
  const sitios = [
    { id: 's1', ordem: 1, nome: 'Consulta', nome_tarde: null, categoria_permitida: 'enf' as const, opcional: false, prioridade_dupla: null },
    { id: 's2', ordem: 2, nome: 'Curativo', nome_tarde: 'Curativo tarde', categoria_permitida: 'tec' as const, opcional: false, prioridade_dupla: null },
    { id: 's3', ordem: 3, nome: 'Ações antigo', nome_tarde: null, categoria_permitida: 'ambos' as const, opcional: false, prioridade_dupla: null },
  ];
  const pessoaLinha = (nome_curto: string, categoria: string, fixo_sitio_id: string | null = null) =>
    ({ nome_curto, categoria, turno_base: 'ambos', fixo_sitio_id, isento_acoes: false, custo_extra: 0 });
  const base = {
    equipe: [pessoaLinha('Ana', 'enf'), pessoaLinha('Bia', 'tec'), pessoaLinha('Caio', 'tec', 's2'), pessoaLinha('Duda', 'tec')],
    sitios, regras: [], duplas: [],
    proibicoes: [{ pessoa_curto: 'Bia', sitio_id: 's2' }],
    fixas: [
      { pessoa_curto: 'Duda', dia: 0, turno: 'tarde', tipo: 'fixa_sitio', sitio_id: 's2' },
      { pessoa_curto: 'Duda', dia: 2, turno: 'manha', tipo: 'fixa_sitio', sitio_id: 's2' },
      { pessoa_curto: 'Ana', dia: 1, turno: 'manha', tipo: 'fixa_sitio', sitio_id: 's3' },
    ],
  };

  test('fixa à tarde usa o nome da tarde; de manhã, o da manhã', () => {
    const { config, avisos } = montarConfig(base);
    expect(config.fixas).toContainEqual({ p: 'Duda', d: 0, t: 'tarde', s: 'Curativo tarde' });
    expect(config.fixas).toContainEqual({ p: 'Duda', d: 2, t: 'manha', s: 'Curativo' });
    expect(avisos.join(' ')).not.toMatch(/não foi encontrado/);
  });

  test('proibição entra com os dois rótulos do sítio', () => {
    const { config } = montarConfig(base);
    expect(config.proibicoes).toEqual([{ pessoa: 'Bia', sitio: 'Curativo' }, { pessoa: 'Bia', sitio: 'Curativo tarde' }]);
  });

  test('posto fixo vale à tarde pelo nome da tarde (solver 4.1 e isenção de dias seguidos)', () => {
    const { config } = montarConfig(base);
    const caio = config.equipe.find(p => p.n === 'Caio')!;
    expect(caio).toMatchObject({ fixo: 'Curativo', fixoTarde: 'Curativo tarde' });
    const r = generateSchedule({ ...config, disp: {} });
    for (let d = 0; d < config.dias.length; d++) {
      expect(r.escala.manha['Curativo'][d]).toContain('Caio');
      expect(r.escala.tarde['Curativo tarde'][d]).toContain('Caio');
    }
    expect(r.violacoes.filter(v => v.regra === 'diasSeguidos' && v.msg.startsWith('Caio'))).toEqual([]);
  });

  test('sítio renomeado: mesmo id, nome novo, fixa continua valendo', () => {
    const renomeado = { ...base, sitios: sitios.map(s => s.id === 's3' ? { ...s, nome: 'Ações novo' } : s) };
    const { config, avisos } = montarConfig(renomeado);
    expect(config.fixas).toContainEqual({ p: 'Ana', d: 1, t: 'manha', s: 'Ações novo' });
    expect(config.acoes).toBe('Ações novo');
    expect(avisos.join(' ')).not.toMatch(/não foi encontrado/);
  });

  test('id órfão: aviso nomeia pessoa, dia e turno (sem id, sem "undefined")', () => {
    const { config, avisos } = montarConfig({
      ...base,
      equipe: [...base.equipe, pessoaLinha('Eva', 'tec', 'sumiu')],
      proibicoes: [{ pessoa_curto: 'Bia', sitio_id: 'sumiu' }],
      fixas: [{ pessoa_curto: 'Ana', dia: 1, turno: 'manha', tipo: 'fixa_sitio', sitio_id: 'sumiu' }],
    });
    const texto = avisos.join('\n');
    expect(texto).toContain('Colocações fixas apontam para sítio que não foi encontrado nesta unidade (1 regra): Ana (Terça, manhã)');
    expect(texto).toContain('Proibições apontam para sítio que não foi encontrado nesta unidade: Bia');
    expect(texto).toContain('Posto fixo aponta para sítio que não foi encontrado nesta unidade: Eva');
    expect(texto).not.toMatch(/sumiu|undefined/);
    expect(config.fixas).toEqual([]);
    expect(config.equipe.find(p => p.n === 'Eva')?.fixo).toBeUndefined();
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
  await expect(aviso).toContainText('(11 regras)');
  await expect(aviso).toContainText('Aurora Estelar (Segunda, manhã)');
  await expect(aviso).toContainText('foram ignoradas');
  await expect(aviso).not.toContainText('sitio-apagado');
  expect(erros).toEqual([]);
});
