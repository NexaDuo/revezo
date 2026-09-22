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

const NOME_CURTO: [string, string][] = [
  ["May Britt","May"],["Sandra Rejane","Sandra"],["Shana","Shana"],
  ["Ana Cláudia","Ana Claudia"],["Ana Claudia","Ana Claudia"],
  ["Daniele de Souza","Dani P"],["Daniela Prado","Dani P"],["Luciana","Luciana"],
  ["Maria Janir","Maria"],["Maria","Maria"],["Andressa","Andressa"],["Vanessa","Vanessa"],
  ["Fernanda","Fernanda"],["Carolina Santana","Carolina K"],["Michele","Michele"],
  ["Fabiano","Fabiano"],["Nicole","Nicole"],["Daniele Volkmer","Dani J"],
  ["Daniela Jacobsen","Dani J"],["Paula","Paula"],["Carolina Feijó","Carol V"],
  ["Jomalba","Jomalba"],["Regina","Regina"],["Leticia","Leticia"],["Letícia","Leticia"],["Allan","Allan"],
];

const semAcento = (s: string) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

export function nomeCurto(txt: string, equipe: Pessoa[]): string | null {
  const t = semAcento(txt);
  for(const [longo,curto] of NOME_CURTO) if(t.startsWith(semAcento(longo))) return curto;
  const prim = txt.trim().split(/\s+/)[0];
  return equipe.find(p=>semAcento(p.n)===semAcento(prim))?.n || null;
}

export function nomesCurtos(pessoas: any[], equipe: Pessoa[]) {
  const base = pessoas.map(p=> nomeCurto(p.nome, equipe) || p.nome.trim().split(/\s+/)[0]);
  const conta: Record<string, number> = {};
  base.forEach(n=> conta[n] = (conta[n]||0)+1);
  return base.map((n,i)=>{
    if(conta[n]===1) return n;
    const partes = pessoas[i].nome.trim().split(/\s+/);
    return `${n} ${partes[partes.length-1][0].toUpperCase()}`;
  });
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
