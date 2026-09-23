import * as XLSX from 'xlsx';
import { Pessoa, StatusDisponibilidade } from './solver/types';

export const MESES: Record<string, number> = {JAN:1,FEV:2,MAR:3,ABR:4,MAI:5,JUN:6,JUL:7,AGO:8,SET:9,OUT:10,NOV:11,DEZ:12};
export const DIAS_SEMANA = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

export const numDia = (v: any) => { 
  const str = String(v).replace(",",".");
  const n = parseFloat(str); 
  return (Number.isFinite(n) && n===Math.round(n) && n>=1 && n<=31) ? n : null; 
};

const COD_PLANTAO = ["P","PN","P4","PHE","PBH","TP"];
const COD_TRABALHA = ["M","T","N","N1","N2"];

export function classificar(cod: string): StatusDisponibilidade {
  const c = String(cod||"").toUpperCase().trim();
  if(!c) return "OK";
  if(COD_PLANTAO.includes(c)) return "P";
  if(COD_TRABALHA.includes(c)) return "OK";
  return c; 
}

export function analisar(celulas: any[][]) {
  let cab = {linha:-1, qtd:0};
  celulas.forEach((l,i)=>{
    const qtd = (l||[]).filter(v=>numDia(v)!==null).length;
    if(qtd > cab.qtd) cab = {linha:i, qtd};
  });
  if(cab.linha < 0) return null;
  const colDia: Record<number, number> = {};
  (celulas[cab.linha]||[]).forEach((v,c)=>{ const n = numDia(v); if(n!==null && colDia[n]===undefined) colDia[n]=c; });

  const pessoas: any[] = [];
  const marcadores: Record<number, string> = {};
  let turno: string | null = null;
  for(let i=cab.linha+1; i<celulas.length; i++){
    const linha = celulas[i]||[]; const a = String(linha[0]||"").toUpperCase().trim();
    if(/^(MANH|MANHÃ|MANHA)/.test(a)) turno = "manha";
    else if(a.startsWith("TARDE")) turno = "tarde";
    else if(a.startsWith("NOITE")) turno = "noite";
    
    if(["MANHÃ","MANHA","TARDE","NOITE"].includes(a)){
      for(const [n,c] of Object.entries(colDia)){
        const v = String(linha[c]||"").toUpperCase().trim();
        if(v==="S"||v==="D") marcadores[Number(n)] = v;
      }
      continue;
    }
    const nome = String(linha[1]||"").trim();
    const cat = String(linha[2]||"").trim();
    if(!nome || !cat) continue;
    if(/^(nome|registro|legenda)/i.test(nome)) continue;
    const horario = String(linha[4]||"").trim();
    const c = /enferm[ae]ir/i.test(cat) ? "enf" : (/t[eé]cnic|aux/i.test(cat) ? "tec" : null);
    if(!c) continue;
    const status: Record<number, string> = {};
    for(const [n,col] of Object.entries(colDia)) status[Number(n)] = String(linha[col]||"").trim();
    pessoas.push({nome, cat, horario, c, t: /^16:/.test(horario) ? "noite" : (turno||"manha"), status});
  }
  return {linhaCab:cab.linha, colDia, pessoas, marcadores};
}

export function descobrirAno(mes: number, marcadores: Record<number, string>, sugestao: number | null) {
  const anos = [sugestao, ...[0,1,-1,2,-2,3].map(k=>new Date().getFullYear()+k)].filter(Boolean) as number[];
  for(const ano of anos){
    let ok = true, checados = 0;
    for(const [dia,marca] of Object.entries(marcadores)){
      const wd = new Date(ano, mes-1, Number(dia)).getDay();
      checados++;
      if((marca==="S" && wd!==6) || (marca==="D" && wd!==0)){ ok=false; break; }
    }
    if(ok && checados>0) return ano;
  }
  return sugestao || new Date().getFullYear();
}

export function semanasDoMes(ano: number, mes: number) {
  const ultimo = new Date(ano, mes, 0).getDate(), semanas = [];
  let atual = [];
  for(let d=1; d<=ultimo; d++){
    const wd = new Date(ano, mes-1, d).getDay();
    if(wd>=1 && wd<=5) atual.push(d);
    if(wd===5 || d===ultimo){ if(atual.length){ semanas.push(atual); atual=[]; } }
  }
  // data_inicio/data_fim reais: são a chave da semana no banco. Só os rótulos
  // ("Segunda 03") não bastam — não carregam o ano nem o mês.
  const iso = (d: number) =>
    `${ano}-${String(mes).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  return semanas.map(dias=>({
    dias,
    inicio: iso(dias[0]),
    fim: iso(dias[dias.length-1]),
    rotulos: dias.map(d=>`${DIAS_SEMANA[new Date(ano,mes-1,d).getDay()]} ${String(d).padStart(2,"0")}`),
    label: `${String(dias[0]).padStart(2,"0")} a ${String(dias[dias.length-1]).padStart(2,"0")}/${String(mes).padStart(2,"0")}`,
  }));
}

const semAcento = (s: string) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

const palavras = (s: string) => semAcento(s).replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);

/** Quantas palavras do nome cadastrado casam com o nome da planilha; 0 = não
 *  casa. A primeira palavra tem que ser igual; as demais aparecem na mesma
 *  ordem, podendo pular palavras da planilha (o cadastro costuma omitir
 *  sobrenomes do meio). Uma letra solta é inicial: "K" casa com "Kaufmann".
 *  Palavra inteira sempre: "Lia" não casa com "Liana". */
function casarPalavras(cadastro: string[], planilha: string[]): number {
  if (!cadastro.length || cadastro[0] !== planilha[0]) return 0;
  let j = 1;
  for (let i = 1; i < cadastro.length; i++) {
    const w = cadastro[i];
    while (j < planilha.length && planilha[j] !== w && !(w.length === 1 && planilha[j].startsWith(w))) j++;
    if (j >= planilha.length) return 0;
    j++;
  }
  return cadastro.length;
}

/** Resultado de casar uma linha da planilha com a Equipe da unidade. */
export type Casamento =
  | { curto: string; na: "equipe" }
  | { curto: string; na: "fora" }
  | { curto: string; na: "ambiguo"; candidatos: string[] };

/** Quem da Equipe casa com o nome da planilha, pelo nome cadastrado
 *  (`completo`) ou pelo nome curto. Vence quem casa mais palavras; empate
 *  entre pessoas diferentes é ambíguo e não se chuta. */
function candidatos(txt: string, equipe: Pessoa[]): string[] {
  const plan = palavras(txt);
  let melhor = 0, quem: string[] = [];
  for (const p of equipe) {
    const nota = Math.max(
      p.completo ? casarPalavras(palavras(p.completo), plan) : 0,
      casarPalavras(palavras(p.n), plan),
    );
    if (!nota || nota < melhor) continue;
    if (nota > melhor) { melhor = nota; quem = []; }
    if (!quem.includes(p.n)) quem.push(p.n);
  }
  return quem;
}

/** Nome curto de quem aparece na planilha, pela Equipe da unidade. `null`
 *  quando ninguém casa ou quando mais de uma pessoa casa igualmente. O
 *  apelido é dado da unidade (coluna `nome` da Equipe), nunca código. */
export function nomeCurto(txt: string, equipe: Pessoa[]): string | null {
  const c = candidatos(txt, equipe);
  return c.length === 1 ? c[0] : null;
}

/** Casa cada linha da planilha com a Equipe. Quem não casa (ou casa com mais
 *  de uma pessoa, ou disputa a mesma pessoa com outra linha) fica com um nome
 *  derivado da planilha e marcado, para a tela dizer isso em vez de trocar a
 *  disponibilidade de alguém em silêncio. */
export function casarComEquipe(pessoas: { nome: string }[], equipe: Pessoa[]): Casamento[] {
  const achados = pessoas.map(p => candidatos(p.nome, equipe));
  const usos: Record<string, number> = {};
  achados.forEach(c => { if (c.length === 1) usos[c[0]] = (usos[c[0]] || 0) + 1; });

  const prim = (nome: string) => nome.trim().split(/\s+/)[0];
  const base = pessoas.map(p => prim(p.nome));
  const conta: Record<string, number> = {};
  achados.forEach((c, i) => { if (!(c.length === 1 && usos[c[0]] === 1)) conta[base[i]] = (conta[base[i]] || 0) + 1; });
  const doCadastro = new Set(equipe.map(p => p.n));
  const derivado = (i: number) => {
    const partes = pessoas[i].nome.trim().split(/\s+/);
    const n = conta[base[i]] > 1 ? `${base[i]} ${partes[partes.length - 1][0].toUpperCase()}` : base[i];
    // Nunca herdar o nome curto de outra pessoa da Equipe (e o posto fixo dela).
    return doCadastro.has(n) ? pessoas[i].nome.trim() : n;
  };

  return achados.map((c, i): Casamento => {
    if (c.length === 1 && usos[c[0]] === 1) return { curto: c[0], na: "equipe" };
    if (c.length === 0) return { curto: derivado(i), na: "fora" };
    return { curto: derivado(i), na: "ambiguo", candidatos: c };
  });
}

export function nomesCurtos(pessoas: { nome: string }[], equipe: Pessoa[]) {
  return casarComEquipe(pessoas, equipe).map(c => c.curto);
}

/** Texto do aviso para as linhas que não viraram ninguém da Equipe. */
export function avisoNaoCasados(pessoas: { nome: string }[], casamentos: Casamento[]): string[] {
  return casamentos.flatMap((c, i) =>
    c.na === "fora" ? [`${pessoas[i].nome} (não está na Equipe)`]
    : c.na === "ambiguo" ? [c.candidatos.length > 1
        ? `${pessoas[i].nome} (pode ser ${c.candidatos.join(" ou ")})`
        : `${pessoas[i].nome} (outra linha da planilha também casa com ${c.candidatos[0]})`]
    : []);
}

export async function parseExcel(file: File) {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  const abas = [];
  
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const celulas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
    abas.push({ nome: sheetName, celulas });
  }
  return abas;
}
