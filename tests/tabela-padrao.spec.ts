import { test, expect } from '@playwright/test';
import { HAS_ENV, FAKE_UNIT_ID, autenticarComoCoordenador, responderPagina } from './supabase-mock';

test('paginação, busca, modal e cache durante a navegação', async ({ page }) => {
  test.skip(!HAS_ENV, 'Requisições PostgREST exigem configuração; são todas interceptadas.');
  await autenticarComoCoordenador(page);
  let leituras = 0;
  const linhas = Array.from({length:12}, (_,i)=>({id:`p-${i}`,unidade_id:FAKE_UNIT_ID,nome:`Pessoa Fictícia ${String(i+1).padStart(2,'0')}`,nome_curto:`F${i+1}`,categoria:'tec',turno_base:'manha',ativo:true,isento_acoes:false,custo_extra:0,ordem:i+1}));
  await page.route('**/rest/v1/equipe*', async route => {
    const req = route.request();
    if(req.method()==='PATCH') {
      const id = new URL(req.url()).searchParams.get('id')!.slice(3);
      Object.assign(linhas.find(r=>r.id===id)!,req.postDataJSON());
      return route.fulfill({json:[{id}]});
    }
    // A Equipe também lê a lista inteira (sem paginação) para barrar nome
    // curto repetido; só as leituras da tabela contam e têm de ser paginadas.
    if (!req.headers()['prefer']?.includes('count=exact')) return responderPagina(route,linhas);
    leituras++;
    expect(new URL(req.url()).searchParams.get('limit')).toBe('10');
    return responderPagina(route,linhas);
  });
  await page.goto('/equipe');
  await expect(page.getByText('Mostrando 1 a 10 de 12')).toBeVisible();
  await page.getByRole('button',{name:'Próxima página'}).click();
  await expect(page.getByText('Mostrando 11 a 12 de 12')).toBeVisible();
  await page.getByRole('button',{name:'Página anterior'}).click();
  await page.getByRole('textbox',{name:'Buscar Equipe'}).fill('12');
  await expect(page.getByText('Mostrando 1 a 1 de 1')).toBeVisible();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'Editar registro',exact:true});
  await modal.getByRole('textbox',{name:'Nome',exact:true}).fill('Pessoa Fictícia 12 Editada');
  await modal.getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole('cell',{name:'Pessoa Fictícia 12 Editada',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Buscar Equipe'}).fill('');
  await expect(page.getByText('Mostrando 1 a 10 de 12')).toBeVisible();
  const antes=leituras;
  await page.getByRole('link',{name:'Sítios',exact:true}).click();
  await page.getByRole('link',{name:'Equipe',exact:true}).click();
  await expect(page.getByText('Mostrando 1 a 10 de 12')).toBeVisible();
  expect(leituras).toBe(antes);
});

test('erro de leitura aparece na tela',async({page})=>{
  test.skip(!HAS_ENV, 'Exige Supabase configurado para simular erro de leitura remoto.');
  await autenticarComoCoordenador(page);
  await page.route('**/rest/v1/equipe*',route=>route.fulfill({status:500,json:{message:'Falha de leitura simulada'}}));
  await page.goto('/equipe');
  await expect(page.getByRole('alert')).toContainText('Falha de leitura simulada');
  await expect(page.getByText('Nenhum registro encontrado.')).toHaveCount(0);
});

test('demonstração pagina em memória e mantém edição entre telas',async({page})=>{
  test.skip(HAS_ENV,'Cobre a interface offline sem .env.');
  await page.goto('/equipe');
  for(let i=1;i<=11;i++) {
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    const modal=page.getByRole('dialog');
    await modal.getByLabel('Nome',{exact:true}).fill(`Fictícia ${i}`);
    await modal.getByLabel('Nome curto',{exact:true}).fill(`F${i}`);
    await modal.getByLabel('Ordem',{exact:true}).fill(String(i));
    await modal.getByRole('button',{name:'Salvar',exact:true}).click();
    await expect(modal).toHaveCount(0);
  }
  await expect(page.getByText('Mostrando 1 a 10 de 11')).toBeVisible();
  await page.getByRole('button',{name:'Próxima página'}).click();
  await expect(page.getByText('Mostrando 11 a 11 de 11')).toBeVisible();
  await page.getByRole('textbox',{name:'Buscar Equipe'}).fill('11');
  await expect(page.getByText('Mostrando 1 a 1 de 1')).toBeVisible();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByRole('dialog').getByLabel('Nome',{exact:true}).fill('Fictícia Editada 11');
  await page.getByRole('dialog').getByRole('button',{name:'Salvar',exact:true}).click();
  await expect(page.getByRole('cell',{name:'Fictícia Editada 11',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Sítios',exact:true}).click();
  await page.getByRole('link',{name:'Equipe',exact:true}).click();
  await expect(page.getByText('Mostrando 1 a 10 de 11')).toBeVisible();
});
