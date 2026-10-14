const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3116';
const output=path.resolve(process.env.TEST_OUTPUT_DIR || '../output/promocao-primeiro-mes-2026-10-14/admin');
const plan=(id,name,slug,price,frequency=1)=>({id,name,slug,monthlyPrice:price,billingFrequencyMonths:frequency,firstMonthDiscountEnabled:false,
  description:'Plano de teste',featuresJson:'["Catálogo completo"]',isActive:true,sortOrder:0,mercadoPagoPlanId:null,includesWeeklyPlanner:true,
  allowedActivities:[],allowedActivitiesCount:0,hasActivityRestrictions:false,subscriptionCount:0});

async function main(){
  fs.mkdirSync(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  await context.addInitScript(()=>{
    if(window!==window.top)return;
    localStorage.setItem('fp_admin_access','fake-admin-plans');
    localStorage.setItem('fp_admin_refresh','fake-refresh');
    localStorage.setItem('fp_admin_user',JSON.stringify({id:'admin-plans',name:'Admin teste',email:'admin@example.com',role:'Admin',userType:1}));
  });
  const plans=new Map([
    ['monthly',plan('monthly','Mensal','mensal',29.9)],
    ['annual',plan('annual','Anual','anual',299.9,12)],
    ['legacy-annual',{...plan('legacy-annual','Legado anual','premium-anual',299.9),billingFrequencyMonths:undefined}],
    ['trial',plan('trial','Teste','trial',20)],
    ['free',plan('free','Grátis','free',20)],
    ['zero',plan('zero','Cortesia','cortesia',0)],
  ]);
  const creates=[],updates=[],checks=[],errors=[],unexpected=[];
  let rejectUpdate=false;
  let holdNextList=false, delayedListStarted=false, releaseDelayedList=null;
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'};
    const respond=(body,status=200)=>route.fulfill({status,headers,json:body}).catch(()=>{});
    if(method==='OPTIONS')return route.fulfill({status:204,headers});
    if(url.pathname==='/api/admin/plans' && method==='GET'){
      const snapshot={items:structuredClone([...plans.values()]),totalActivityTypes:33};
      if(holdNextList){holdNextList=false;delayedListStarted=true;await new Promise(resolve=>releaseDelayedList=resolve);}
      return respond(snapshot);
    }
    if(url.pathname==='/api/admin/plans' && method==='POST'){
      const data=req.postDataJSON();creates.push(data);
      const id='created-'+creates.length;
      plans.set(id,{...plan(id,data.name,data.slug,data.monthlyPrice,/^(anual)$|(-anual)$/.test(data.slug)?12:1),...data});
      return respond({id,slug:data.slug});
    }
    const match=url.pathname.match(/^\/api\/admin\/plans\/([^/]+)$/);
    if(match && method==='GET')return respond(plans.get(match[1]));
    if(match && method==='PATCH'){
      const data=req.postDataJSON();updates.push({id:match[1],...data});
      if(rejectUpdate){rejectUpdate=false;return respond({error:{message:'Falha de teste ao salvar o plano.'}},400);}
      plans.set(match[1],{...plans.get(match[1]),...data});
      return route.fulfill({status:204,headers});
    }
    unexpected.push(`${method} ${url.pathname}`);return respond({error:{message:'Rota não simulada'}},404);
  });
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/'))return route.fallback();
    return ['localhost','127.0.0.1'].includes(url.hostname)?route.continue():route.abort();
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const dialog=()=>page.getByRole('dialog');
  const checkbox=()=>dialog().getByRole('checkbox',{name:'50% de desconto no primeiro mês',exact:true});
  const card=name=>page.getByRole('article').filter({has:page.getByRole('heading',{name,exact:true})});
  const open=async name=>{await card(name).getByRole('button',{name:'Editar',exact:true}).click();await dialog().getByLabel('Nome',{exact:true}).waitFor();};
  const close=async()=>{await dialog().getByRole('button',{name:'Fechar',exact:true}).click();await dialog().waitFor({state:'hidden'});};
  const save=async()=>{await dialog().getByRole('button',{name:'Salvar alterações',exact:true}).click();await dialog().waitFor({state:'hidden'});};
  const fits=async()=>{assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await dialog().evaluate(e=>e.scrollWidth<=e.clientWidth+1));};
  const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name);};
  try{
    await page.goto(base+'/planos');await page.getByRole('heading',{name:'Planos',exact:true}).waitFor();
    await check('Criação começa desmarcada e apresenta o primeiro mês e a renovação antes de ativar',async()=>{
      await page.getByRole('button',{name:'Novo plano',exact:true}).click();
      assert.equal(await checkbox().isChecked(),false);assert(await checkbox().isDisabled());
      await dialog().getByLabel('Nome',{exact:true}).fill('Novo mensal');await dialog().getByLabel('Preço mensal (R$)',{exact:true}).fill('29.90');
      assert(await checkbox().isEnabled());assert.equal(await checkbox().isChecked(),false);
      await dialog().getByText('Primeiro mês:',{exact:false}).waitFor();
      assert((await dialog().innerText()).includes('R$ 14,95'));assert((await dialog().innerText()).includes('R$ 29,90/mês'));
      await checkbox().check();await dialog().getByRole('button',{name:'Criar plano',exact:true}).click();
      await dialog().getByRole('heading',{name:'Editar plano · Novo mensal'}).waitFor();
      assert.equal(creates.length,1);assert.equal(creates[0].firstMonthDiscountEnabled,true);assert(await checkbox().isChecked());
      await close();await card('Novo mensal').getByText('50% de desconto no primeiro mês',{exact:true}).waitFor();
    });
    await check('Ativar a promoção mensal salva true e reabrir preserva a seleção',async()=>{
      await open('Mensal');assert.equal(await checkbox().isChecked(),false);await checkbox().check();
      await dialog().getByText('Desconto único para novos assinantes elegíveis.',{exact:false}).waitFor();
      await save();assert.equal(updates.at(-1).firstMonthDiscountEnabled,true);
      await card('Mensal').getByText('Oferta exibida nas páginas públicas.',{exact:false}).waitFor();
      await open('Mensal');assert(await checkbox().isChecked());await checkbox().scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,'promocao-mensal-desktop.png'),fullPage:true});await close();
    });
    await check('Editar outros campos preserva a promoção ativa sem enviar false por engano',async()=>{
      await open('Mensal');await dialog().getByLabel('Nome',{exact:true}).fill('Mensal atualizado');await save();
      assert.equal(updates.at(-1).name,'Mensal atualizado');assert.equal(updates.at(-1).firstMonthDiscountEnabled,undefined);
      assert.equal(plans.get('monthly').firstMonthDiscountEnabled,true);
      await card('Mensal atualizado').getByText('50% de desconto no primeiro mês',{exact:true}).waitFor();
    });
    await check('Desativar mantém a escolha após falha e salva false ao tentar novamente',async()=>{
      await open('Mensal atualizado');await checkbox().uncheck();rejectUpdate=true;
      await dialog().getByRole('button',{name:'Salvar alterações',exact:true}).click();
      await dialog().getByText('Falha de teste ao salvar o plano.',{exact:true}).waitFor();assert.equal(await checkbox().isChecked(),false);
      await save();assert.equal(updates.at(-1).firstMonthDiscountEnabled,false);
      assert.equal(await card('Mensal atualizado').getByText('50% de desconto no primeiro mês',{exact:true}).count(),0);
      await open('Mensal atualizado');assert.equal(await checkbox().isChecked(),false);await close();
    });
    await check('Anuais com frequência explícita ou slug legado exibem checkbox bloqueado e motivo',async()=>{
      for(const name of ['Anual','Legado anual']){
        await card(name).getByText('/ano',{exact:true}).waitFor();
        await open(name);assert(await checkbox().isDisabled());assert.equal(await checkbox().isChecked(),false);
        assert(await dialog().getByLabel('Preço anual (R$)',{exact:true}).isVisible());
        await dialog().getByText('Disponível somente para planos mensais. Planos anuais não recebem esta promoção.',{exact:true}).waitFor();await close();
      }
    });
    await check('Trial, free e preço zero impedem ativação mesmo com frequência mensal',async()=>{
      for(const name of ['Teste','Grátis','Cortesia']){
        await open(name);assert(await checkbox().isDisabled());assert.equal(await checkbox().isChecked(),false);await close();
      }
    });
    await check('Preço de um centavo bloqueia oferta que arredondaria para o preço integral',async()=>{
      await open('Mensal atualizado');
      await dialog().getByLabel('Preço mensal (R$)',{exact:true}).fill('0.01');
      assert(await checkbox().isDisabled());
      await dialog().getByText('Defina um preço mensal de pelo menos R$ 0,02 para disponibilizar a promoção.',{exact:true}).waitFor();
      await dialog().getByLabel('Preço mensal (R$)',{exact:true}).fill('0.02');
      assert(await checkbox().isEnabled());
      assert((await dialog().innerText()).includes('R$ 0,01'));
      await close();
    });
    await check('Mudar criação marcada para anual envia false e não publica promoção incompatível',async()=>{
      await page.getByRole('button',{name:'Novo plano',exact:true}).click();
      await dialog().getByLabel('Nome',{exact:true}).fill('Plano extra');await dialog().getByLabel('Preço mensal (R$)',{exact:true}).fill('99.90');
      await checkbox().check();await dialog().getByLabel('Slug (URL)',{exact:true}).fill('extra-anual');
      assert(await checkbox().isDisabled());assert.equal(await checkbox().isChecked(),false);
      await dialog().getByRole('button',{name:'Criar plano',exact:true}).click();await dialog().getByRole('heading',{name:'Editar plano · Plano extra'}).waitFor();
      assert.equal(creates.at(-1).firstMonthDiscountEnabled,false);assert(await checkbox().isDisabled());await close();
    });
    await check('Tornar gratuito um plano promocional desativa a flag no mesmo salvamento',async()=>{
      await open('Novo mensal');assert(await checkbox().isChecked());await dialog().getByLabel('Preço mensal (R$)',{exact:true}).fill('0');
      assert(await checkbox().isDisabled());assert.equal(await checkbox().isChecked(),false);await save();
      assert.equal(updates.at(-1).monthlyPrice,0);assert.equal(updates.at(-1).firstMonthDiscountEnabled,false);
      await open('Novo mensal');assert(await checkbox().isDisabled());assert.equal(await checkbox().isChecked(),false);await close();
    });
    await check('Criação sem marcar envia false explicitamente',async()=>{
      await page.getByRole('button',{name:'Novo plano',exact:true}).click();
      await dialog().getByLabel('Nome',{exact:true}).fill('Mensal sem oferta');await dialog().getByLabel('Preço mensal (R$)',{exact:true}).fill('25');
      await dialog().getByRole('button',{name:'Criar plano',exact:true}).click();await dialog().getByRole('heading',{name:'Editar plano · Mensal sem oferta'}).waitFor();
      assert.equal(creates.at(-1).firstMonthDiscountEnabled,false);assert.equal(await checkbox().isChecked(),false);await close();
    });
    await check('Controle legível no celular claro e escuro, com alternância por teclado',async()=>{
      await page.setViewportSize({width:390,height:844});await open('Mensal atualizado');
      await checkbox().scrollIntoViewIfNeeded();await fits();await checkbox().focus();await page.keyboard.press('Space');assert(await checkbox().isChecked());
      await checkbox().evaluate(element=>element.closest('section').scrollIntoView({block:'center'}));
      await page.screenshot({path:path.join(output,'promocao-mensal-mobile.png')});
      await page.evaluate(()=>document.documentElement.dataset.theme='dark');await fits();
      await page.screenshot({path:path.join(output,'promocao-mensal-mobile-escuro.png')});
      await save();assert.equal(updates.at(-1).firstMonthDiscountEnabled,true);
    });
    await check('Resposta antiga de Recarregar não reativa visualmente uma oferta recém-desligada',async()=>{
      holdNextList=true;await page.getByRole('button',{name:'Recarregar',exact:true}).click();
      for(let attempt=0;attempt<50&&!delayedListStarted;attempt++)await page.waitForTimeout(20);
      assert(delayedListStarted,'The old request must be in flight');
      await open('Mensal atualizado');assert(await checkbox().isChecked());await checkbox().uncheck();await save();
      await card('Mensal atualizado').getByText('Sem promoção de primeiro mês.',{exact:true}).waitFor();
      releaseDelayedList();releaseDelayedList=null;
      await page.waitForTimeout(350);
      assert.equal(await card('Mensal atualizado').getByText('50% de desconto no primeiro mês',{exact:true}).count(),0,
        'A stale response must never overwrite the saved flag');
      assert.equal(plans.get('monthly').firstMonthDiscountEnabled,false);
    });
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    const report={checks,passed:checks.length,createdPlans:creates.length,updates:updates.length,realPlansChanged:0,errors,unexpected};
    fs.writeFileSync(path.join(output,'plans-promotion-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{releaseDelayedList?.();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
