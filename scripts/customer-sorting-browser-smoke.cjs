/* Local UI contract checks: every API request is intercepted. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Felipe/Desktop/repos/.task-tools/browser-tools/node_modules/playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3013';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '../output/admin-customer-sorting-2026-10-25');
const timestamp = '2026-10-25T01:02:03';
const rows = Array.from({length:45},(_,i)=>({
  id:`customer-${String(i).padStart(2,'0')}`, name:`Cliente ${String(44-i).padStart(2,'0')}`, email:`cliente-${String(i).padStart(2,'0')}@example.invalid`,
  role:'User',userType:i%4,isActive:true,emailConfirmed:i%2===0,createdAt:`2026-10-${String(1+i%24).padStart(2,'0')}T12:00:00Z`,
  lastLoginAt:i%7===0?null:timestamp,planSlug:i%3===0?null:i%2===0?'alfa':'zeta',subscriptionStatus:i%3===0?null:'Active',
  isPaidPlan:i%3!==0,isTrialActive:false,trialStatus:i%3===0?'NotStarted':'Subscribed',trialStartedAt:null,trialEndsAt:null,
  totalActivitiesGenerated:i,lastActivityGeneratedAt:i%4===0?null:timestamp,
}));
const report={checks:[],pageErrors:[],requests:[],allApiMocked:true};
let delayedField=null;
async function eventually(assertion) { for(let i=0;i<80;i++){try{return await assertion();}catch(error){if(i===79)throw error;await new Promise(resolve=>setTimeout(resolve,40));}} }
(async()=>{
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || 'C:/Users/Felipe/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Tokyo'});
  await context.addInitScript(()=>{
    localStorage.setItem('fp_admin_access','local-sorting-token');localStorage.setItem('fp_admin_refresh','local-sorting-refresh');
    localStorage.setItem('fp_admin_user',JSON.stringify({id:'admin-local',name:'Admin teste',email:'admin@example.invalid',role:'Admin',userType:1}));
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url()), headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type'};
    if(!url.pathname.startsWith('/api/')) return ['localhost','127.0.0.1'].includes(url.hostname)?route.continue():route.abort();
    if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname!=='/api/admin/users')return route.fulfill({json:{status:'ok'},headers});
    const query=Object.fromEntries(url.searchParams); report.requests.push(query);
    const field=query.sortBy||'createdAt',desc=query.sortDirection!=='asc',page=Number(query.page||1),pageSize=Number(query.pageSize||20);
    const source=rows.filter(row=>!query.search||`${row.name} ${row.email}`.toLowerCase().includes(query.search.toLowerCase()));
    source.sort((a,b)=>a[field]==null&&b[field]!=null?1:b[field]==null&&a[field]!=null?-1:
      (a[field]===b[field]?a.id.localeCompare(b.id):((a[field]>b[field]?1:-1)*(desc?-1:1))));
    if(field===delayedField){delayedField=null;await new Promise(resolve=>setTimeout(resolve,500));}
    return route.fulfill({headers,json:{items:source.slice((page-1)*pageSize,page*pageSize),page,pageSize,totalCount:source.length,totalPages:Math.ceil(source.length/pageSize)}});
  });
  const page=await context.newPage();page.on('pageerror',error=>report.pageErrors.push(error.message));
  async function check(name,run){await run();report.checks.push(name);console.log('PASS '+name);}
  async function settled(field,direction,pageNumber=1){await eventually(async()=>{
    const last=report.requests.at(-1);assert.equal(last.sortBy,field);assert.equal(last.sortDirection,direction);assert.equal(last.page,String(pageNumber));
    assert.equal(await page.locator('table').getAttribute('aria-busy'),'false');
  });}
  try{
    await page.goto(base+'/clientes?search=cliente&role=User&isActive=true&page=2');
    await settled('createdAt','desc',2);
    await check('Cada cabeçalho alterna asc/desc e consulta a API com filtros e página1',async()=>{
      const columns=[['Usuário','name'],['Tipo','userType'],['Plano / teste grátis','planSlug'],['Assinatura','subscriptionStatus'],['Atividades','totalActivitiesGenerated'],['Cadastro','createdAt'],['Último login','lastLoginAt']];
      for(const[label,field]of columns){
        await page.getByRole('button',{name:`Ordenar por ${label} em ordem crescente`,exact:true}).click();await settled(field,'asc');
        assert.equal(await page.getByRole('columnheader').filter({has:page.getByRole('button',{name:`Ordenar por ${label} em ordem decrescente`,exact:true})}).getAttribute('aria-sort'),'ascending');
        assert.equal(report.requests.at(-1).search,'cliente');assert.equal(report.requests.at(-1).role,'User');assert.equal(report.requests.at(-1).isActive,'true');
        await page.getByRole('button',{name:`Ordenar por ${label} em ordem decrescente`,exact:true}).click();await settled(field,'desc');
      }
      assert.equal(await page.getByRole('columnheader',{name:'Abrir cliente',exact:true}).getByRole('button').count(),0);
    });
    await check('Ordenação é mantida na paginação e a página2 recebe o próximo conjunto global',async()=>{
      await page.getByLabel('Ordenar por',{exact:true}).selectOption('name');await settled('name','asc');
      assert((await page.locator('tbody tr').first().innerText()).includes('Cliente 00'));
      await page.locator('main').getByRole('button').filter({has:page.locator('svg.lucide-chevron-right')}).last().click();await settled('name','asc',2);
      assert((await page.locator('tbody tr').first().innerText()).includes('Cliente 20'));
      assert.equal(new URL(page.url()).searchParams.get('sortBy'),'name');
    });
    await check('Último login exibe data+hora de Brasília com timezone do navegador diferente',async()=>{
      await page.getByLabel('Ordenar por',{exact:true}).selectOption('lastLoginAt');await settled('lastLoginAt','asc');
      assert((await page.locator('tbody').innerText()).includes('24/10/2026, 22:02:03'));
      await page.screenshot({path:path.join(output,'clientes-desktop.png'),fullPage:true});
    });
    await check('Bookmarks e retorno do histórico restauram ordenação',async()=>{
      await page.goto(base+'/clientes?sortBy=email&sortDirection=asc&page=2');await settled('email','asc',2);
      assert.equal(await page.getByLabel('Ordenar por',{exact:true}).inputValue(),'email');
      await page.getByLabel('Ordenar por',{exact:true}).selectOption('totalActivitiesGenerated');await settled('totalActivitiesGenerated','asc');
      await page.goBack();await settled('email','asc',2);
    });
    await check('Resposta atrasada de ordenação anterior não troca o conjunto atual',async()=>{
      delayedField='name';await page.getByLabel('Ordenar por',{exact:true}).selectOption('name');
      await page.waitForRequest(request=>new URL(request.url()).searchParams.get('sortBy')==='name').catch(()=>{});
      await page.getByLabel('Ordenar por',{exact:true}).selectOption('email');await settled('email','asc');
      await page.waitForTimeout(600);assert((await page.locator('tbody tr').first().innerText()).includes('cliente-00@example.invalid'));
    });
    await check('Mobile permite ordenar todos os atributos e exibe horário/nulos sem overflow',async()=>{
      await page.setViewportSize({width:390,height:844});
      await page.goto(base+'/clientes?sortBy=email&sortDirection=asc');await settled('email','asc');
      assert(await page.getByLabel('Ordenar por',{exact:true}).isVisible());
      const cards=page.locator('main .lg\\:hidden');
      assert((await cards.innerText()).includes('Último login: —'));assert((await cards.innerText()).includes('24/10/2026, 22:02:03'));
      await page.getByLabel('Ordenar por',{exact:true}).selectOption('lastActivityGeneratedAt');await settled('lastActivityGeneratedAt','asc');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:path.join(output,'clientes-mobile.png'),fullPage:true});
    });
    assert.deepEqual(report.pageErrors,[]);
  }finally{await browser.close();fs.writeFileSync(path.join(output,'browser-report.json'),JSON.stringify(report,null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
