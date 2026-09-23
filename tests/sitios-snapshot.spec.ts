import { test, expect } from '@playwright/test';
import { atualizarFotografia, configDaFotografia, fotografarSitios, inferirFotografia, ordenarGradeFotografada, orfaosDaGrade, type SitioSnapshot } from '../src/lib/sitiosSnapshot';
import { sextaDaEscala } from '../src/lib/sextaAnterior';
import { montarConfig } from '../src/lib/montarConfig';
import { validar } from '../src/lib/solver/validator';
import type { Escala } from '../src/lib/solver/types';

const sitio = (id: string, nome: string, ordem = 0): SitioSnapshot => ({
  id, nome, nome_tarde: null, ordem, categoria_permitida: 'tec', opcional: false, prioridade_dupla: null,
});
const foto = [{ ...sitio('a', 'Sala antiga'), nome_tarde: 'Sala antiga tarde' }, sitio('b', 'Sala excluída', 1)];
const grade: Escala = {
  manha: { 'Sala excluída': [['Pessoa B']], 'Sala antiga': [['Pessoa A']] },
  tarde: { 'Sala antiga tarde': [['Pessoa C']] },
};
const atuais = [sitio('novo', 'Sala nova'), { ...sitio('a', 'Sala atual', 1), nome_tarde: 'Sala atual tarde' }];

test('ordem vem da fotografia mesmo quando JSONB reordena chaves; sem acrescentar linhas', () => {
  expect(Object.keys(ordenarGradeFotografada(grade, foto).manha)).toEqual(['Sala antiga', 'Sala excluída']);
  expect(Object.keys(ordenarGradeFotografada(grade, foto).tarde)).toEqual(['Sala antiga tarde']);
  expect(ordenarGradeFotografada(grade, null)).toBe(grade);
});

test('salvar casa por ID, cria vazias, preserva excluídas e não altera a origem', () => {
  const original = structuredClone(grade);
  const r = atualizarFotografia(grade, foto, atuais, ['Sexta']);
  expect(r.grade.manha).toEqual({ 'Sala nova': [[]], 'Sala atual': [['Pessoa A']], 'Sala excluída': [['Pessoa B']] });
  expect(r.grade.tarde).toEqual({ 'Sala nova': [[]], 'Sala atual tarde': [['Pessoa C']] });
  expect(r.sitios.find(s => s.id === 'b')).toMatchObject({ removido: true, nome: 'Sala excluída' });
  expect(orfaosDaGrade(r.grade, r.sitios, atuais)).toEqual(['Sala excluída']);
  expect(grade).toEqual(original);
  expect(atualizarFotografia(r.grade, r.sitios, atuais, ['Sexta'])).toEqual(r);
});

test('nome reutilizado não sobrescreve linha de outro ID', () => {
  expect(() => atualizarFotografia(grade, foto, [sitio('outro', 'Sala antiga')], ['Sexta'])).toThrow('Sítios diferentes');
});

test('legado reserva nomes exatos antes de canon e preserva chave órfã', () => {
  const legado: Escala = { manha: { 'Curativo- CME 16h': [[]], Curativo: [[]], Desconhecido: [['Pessoa']] }, tarde: {} };
  const inferida = inferirFotografia(legado, [sitio('c', 'Curativo')]);
  expect(inferida.find(s => s.id === 'c')?.nome).toBe('Curativo');
  expect(inferida.filter(s => s.removido)).toHaveLength(2);
  expect(inferirFotografia({ manha: { 'Curativo- CME 16h': [[]] }, tarde: {} }, [sitio('c', 'Curativo')])[0].id).toBe('c');
});

test('sexta anterior traduz os dois turnos por ID e exclui IDs apagados', () => {
  expect(sextaDaEscala(grade, ['Sexta'], foto, atuais)).toEqual({
    manha: { 'Sala atual': ['Pessoa A'] }, tarde: { 'Sala atual tarde': ['Pessoa C'] },
  });
});

test('regras por ID usam rótulos e categorias históricos; referências externas avisam', () => {
  const { config, avisos } = montarConfig({
    sitios: foto,
    equipe: [{ id: 'p', nome_curto: 'Pessoa A', categoria: 'tec', turno_base: 'manha', ativo: true, fixo_sitio_id: 'a' }],
    regras: [], duplas: [],
    proibicoes: [{ pessoa_id: 'p', sitio_id: 'a' }, { pessoa_id: 'p', sitio_id: 'novo' }],
    fixas: [{ tipo: 'fixa_sitio', pessoa_id: 'p', sitio_id: 'a', turno: 'tarde', dia: 0 }],
  });
  expect(config.sitios.manha[0]).toMatchObject({ n: 'Sala antiga', quem: 'tec' });
  expect(config.equipe[0]).toMatchObject({ fixo: 'Sala antiga', fixoTarde: 'Sala antiga tarde' });
  expect(config.fixas[0].s).toBe('Sala antiga tarde');
  expect(config.proibicoes.map(p => p.sitio)).toEqual(['Sala antiga', 'Sala antiga tarde']);
  expect(avisos.join(' ')).toContain('Proibições apontam para sítio que não foi encontrado');
});


test('legado com rótulos cruzados associa por turno sem duplicar pessoas', () => {
  const cadastro = [
    { ...sitio('a', 'Sala A'), nome_tarde: 'Sala B' },
    { ...sitio('b', 'Sala B', 1), nome_tarde: 'Sala C' },
  ];
  const legado: Escala = { manha: { 'Sala B': [['Pessoa M']] }, tarde: { 'Sala B': [['Pessoa T']] } };
  const copia = structuredClone(legado);
  const foto = inferirFotografia(legado, cadastro);
  expect(foto.find(s => s.id === 'a')?.linhas).toEqual({ manha: null, tarde: 'Sala B' });
  expect(foto.find(s => s.id === 'b')?.linhas).toEqual({ manha: 'Sala B', tarde: null });
  expect(fotografarSitios(foto)).toEqual(foto);
  const salvo = atualizarFotografia(legado, foto, cadastro, ['Sexta']);
  expect(salvo.grade).toEqual({
    manha: { 'Sala A': [[]], 'Sala B': [['Pessoa M']] },
    tarde: { 'Sala B': [['Pessoa T']], 'Sala C': [[]] },
  });
  expect(atualizarFotografia(salvo.grade, salvo.sitios, cadastro, ['Sexta'])).toEqual(salvo);
  expect(sextaDaEscala(legado, ['Sexta'], foto, cadastro)).toEqual({
    manha: { 'Sala B': ['Pessoa M'] }, tarde: { 'Sala B': ['Pessoa T'] },
  });
  expect(legado).toEqual(copia);
});

test('candidatura canônica ambígua permanece órfã, preservada e sinalizada', () => {
  const cadastro = [sitio('a', 'Curativo'), sitio('b', 'Curativo- CME 16h', 1)];
  const legado: Escala = { manha: { ' Curativo ': [['Pessoa']] }, tarde: {} };
  const foto = inferirFotografia(legado, cadastro);
  expect(foto).toHaveLength(1);
  expect(foto[0]).toMatchObject({ removido: true, linhas: { manha: ' Curativo ', tarde: null } });
  expect(orfaosDaGrade(legado, foto, cadastro)).toEqual([' Curativo ']);
  const salvo = atualizarFotografia(legado, foto, cadastro, ['Segunda']);
  expect(Object.values(salvo.grade.manha).flat(2)).toEqual(['Pessoa']);
  expect(salvo.grade.manha[' Curativo ']).toEqual([['Pessoa']]);
  expect(orfaosDaGrade(salvo.grade, salvo.sitios, cadastro)).toEqual([' Curativo ']);
});

test('nomes exatos ambíguos não escolhem um ID arbitrário', () => {
  const legado: Escala = { manha: { Sala: [['Pessoa']] }, tarde: {} };
  const foto = inferirFotografia(legado, [sitio('a', 'Sala'), sitio('b', 'Sala')]);
  expect(foto[0]).toMatchObject({ removido: true, linhas: { manha: 'Sala', tarde: null } });
  expect(orfaosDaGrade(legado, foto, [])).toEqual(['Sala']);
});

test('fotografia antiga inconsistente não pode consumir uma origem duas vezes', () => {
  const legado: Escala = { manha: { Sala: [['Pessoa']] }, tarde: {} };
  expect(() => atualizarFotografia(legado, [sitio('a', 'Sala'), sitio('b', 'Sala')],
    [sitio('a', 'Nova A'), sitio('b', 'Nova B')], ['Segunda'])).toThrow('mais de um sítio');
});

test('abertura e salvamento conferem FC em sítio excluído, inclusive após reabrir', () => {
  const historica = [sitio('excluido', 'Sala excluída')];
  const grade: Escala = { manha: { 'Sala excluída': [['Pessoa']] }, tarde: {} };
  const base = montarConfig({ sitios: [], equipe: [
    { id: 'p', nome_curto: 'Pessoa', categoria: 'tec', turno_base: 'manha', ativo: true },
  ], regras: [], proibicoes: [], duplas: [], fixas: [] }).config;
  base.dias = ['Segunda']; base.disp = { Pessoa: ['FC'] };
  const salvo = atualizarFotografia(grade, historica, [], base.dias);
  for (const [g, foto] of [[grade, historica], [salvo.grade, salvo.sitios],
    [JSON.parse(JSON.stringify(salvo.grade)), JSON.parse(JSON.stringify(salvo.sitios))]] as const) {
    const config = configDaFotografia(base, g, foto);
    const vs = validar(config, g);
    expect(vs).toEqual(expect.arrayContaining([expect.objectContaining({
      hard: true, regra: 'disponibilidade', sitio: 'Sala excluída', turno: 'manha',
    })]));
    expect(vs.some(v => v.hard)).toBe(true);
  }
  expect(base.sitios.manha).toEqual([]);
  // Mesmo uma linha legada sem ID conhecido recebe conferência.
  const inferida = inferirFotografia(grade, []);
  expect(validar(configDaFotografia(base, grade, inferida), grade)
    .some(v => v.hard && v.regra === 'disponibilidade')).toBe(true);
});

test('linha fora da fotografia bloqueia conferência completa na abertura e no salvamento', () => {
  const base = montarConfig({ sitios: [], equipe: [], regras: [], proibicoes: [], duplas: [], fixas: [] }).config;
  expect(() => configDaFotografia(base, grade, [])).toThrow('Conferência incompleta');
  expect(() => atualizarFotografia(grade, [], [], ['Segunda'])).toThrow('não consta da fotografia');
});


test('turno ausente de sítio removido não captura linha de outro ID ao salvar', () => {
  const cadastro = [{ ...sitio('atual', 'Sala nova'), nome_tarde: 'Sala compartilhada' }];
  const foto: SitioSnapshot[] = [{ ...sitio('removido', 'Sala antiga'), nome_tarde: 'Sala compartilhada',
    linhas: { manha: 'Sala antiga', tarde: null } }];
  const grade: Escala = { manha: { 'Sala antiga': [['Pessoa']] }, tarde: {} };
  const salvo = atualizarFotografia(grade, foto, cadastro, ['Segunda']);
  expect(salvo.sitios.find(s => s.id === 'removido')?.linhas).toEqual({ manha: 'Sala antiga', tarde: null });
  expect(atualizarFotografia(salvo.grade, salvo.sitios, cadastro, ['Segunda'])).toEqual(salvo);
});
