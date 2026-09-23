import { test, expect } from '@playwright/test';
import { atualizarFotografia, inferirFotografia, ordenarGradeFotografada, orfaosDaGrade, type SitioSnapshot } from '../src/lib/sitiosSnapshot';
import { sextaDaEscala } from '../src/lib/sextaAnterior';
import { montarConfig } from '../src/lib/montarConfig';
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
