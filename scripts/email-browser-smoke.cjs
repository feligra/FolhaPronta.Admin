const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3013';
const output = path.resolve('../output/revisao-correcoes/admin');
const templates = [
  {id:'classic',name:'Clássico',description:'Cabeçalho roxo e cartão claro para mensagens do dia a dia.',accentColor:'#65469b'},
  {id:'spotlight',name:'Destaque',description:'Faixa azul e título amplo para novidades e promoções.',accentColor:'#165f92'},
  {id:'letter',name:'Carta',description:'Uma mensagem acolhedora, com aparência de carta pessoal.',accentColor:'#81613d'},
  {id:'bulletin',name:'Comunicado',description:'Linhas limpas e destaque verde para avisos objetivos.',accentColor:'#236b55'},
  {id:'celebration',name:'Celebração',description:'Detalhes em coral para boas notícias e conquistas.',accentColor:'#a94258'},
];
const options = {templates,categories:[{id:'promotion',label:'Promoção'},{id:'notice',label:'Aviso'},{id:'news',label:'Novidade'},{id:'misc',label:'Outros'}],maxRecipients:50,maxSubjectLength:160,maxBodyLength:12000,sendingConfigured:true};
const now = new Date().toISOString();
const end = new Date(Date.now()+30*86400000).toISOString();
const user = {id:'customer-email',name:'Professora de teste',email:'cliente@example.com',role:'User',userType:1,isActive:true,emailConfirmed:true,createdAt:now,phone:null,cpf:null,address:null,trialStartedAt:now,trialEndsAt:now,trialPdfsGenerated:1};
const detail = {user,currentSubscription:null,payments:[],totalActivitiesGenerated:1,activitiesByType:[],classrooms:[],recentActivities:[]};
const plan = {id:'plan-test',name:'FolhaPronta Completo',slug:'pro',monthlyPrice:29.9,isActive:true,billingFrequencyMonths:1};
const escape = value => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function previewHtml(data) {
  const template = templates.find(item=>item.id===data.templateId);
  const file = path.resolve(`../output/revisao-correcoes/emails/${data.templateId}.html`);
  if (fs.existsSync(file)) {
    const original = fs.readFileSync(file,'utf8');
    return original.replace(/Novidade(?=<\/p>)/,escape(options.categories.find(item=>item.id===data.category).label))
      .replace(/<title>[\s\S]*?<\/title>/,`<title>${escape(data.subject)}</title>`)
      .replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/,`$1${escape(data.subject)}$2`)
      .replace(/(<td style="padding:28px;font-size:16px[^>]*>)[\s\S]*?(<\/td>)/,`$1${escape(data.body).replace(/\n/g,'<br>')}$2`);
  }
  return `<html><body style="margin:0"><h1 style="color:${template.accentColor}">${escape(data.subject)}</h1><p>${escape(data.body).replace(/\n/g,'<br>')}</p></body></html>`;
}

async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    if (window !== window.top) return;
    localStorage.setItem('fp_admin_access','fake-email-admin');
    localStorage.setItem('fp_admin_refresh','fake-refresh');
    localStorage.setItem('fp_admin_user',JSON.stringify({id:'admin-email',name:'Admin teste',email:'admin@example.com',role:'Admin',userType:1}));
  });
  const sends=[],grants=[],previews=[],unexpected=[],errors=[];
  const batches=new Map();
  let failNextSend=false, failStatus=false, statusSent=false, failGrantAfterCommit=false, grantCommitted=false;
  let grantWait = null;
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),method=req.method();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(method==='OPTIONS')return route.fulfill({status:204,headers});
    const respond=(body,status=200)=>route.fulfill({status,headers,json:body}).catch(()=>{});
    if(url.pathname==='/api/admin/emails/templates')return respond(options);
    if(url.pathname==='/api/admin/emails/preview'){
      const data=req.postDataJSON(); previews.push(data);
      if(data.subject==='Resposta antiga')await new Promise(r=>setTimeout(r,1000));
      return respond({subject:data.subject,html:previewHtml(data)});
    }
    if(url.pathname==='/api/admin/emails/send'){
      const data=req.postDataJSON();sends.push(data);
      await new Promise(r=>setTimeout(r,150));
      if(failNextSend){failNextSend=false;return respond({error:{message:'Falha temporária simulada'}},503);}
      if(!batches.has(data.requestId))batches.set(data.requestId,data);
      return respond(result(data));
    }
    if(url.pathname.startsWith('/api/admin/emails/send/')){
      if(failStatus)return respond({error:{message:'Consulta temporariamente indisponível'}},503);
      const data=batches.get(url.pathname.split('/').pop());
      return data?respond(result(data)):respond({error:{message:'Envio não encontrado.'}},404);
    }
    if(url.pathname==='/api/admin/users/customer-email')return respond(grantCommitted ? {...detail,currentSubscription:{id:'committed-sub',planId:plan.id,planName:plan.name,planSlug:plan.slug,monthlyAmount:plan.monthlyPrice,billingFrequencyMonths:1,status:'Active',currentPeriodStart:now,currentPeriodEnd:end,hasAccess:true,createdAt:now,canceledAt:null,cancelReason:null}} : detail);
    if(url.pathname==='/api/admin/plans')return respond({items:[plan],totalActivityTypes:30});
    if(url.pathname==='/api/admin/users/customer-email/grant-subscription'){
      const data=req.postDataJSON();grants.push(data);
      await (grantWait || new Promise(r=>setTimeout(r,250)));
      if(failGrantAfterCommit){grantCommitted=true;failGrantAfterCommit=false;return respond({error:{message:'Resposta perdida após concessão simulada'}},503);}
      return respond({subscriptionId:'new-subscription',currentPeriodEnd:end,emailStatus:data.sendEmail?'queued':'not_requested'});
    }
    unexpected.push(`${method} ${url.pathname}`);
    return respond({error:{message:'Rota não simulada'}},404);
  });
  function result(data){return {requestId:data.requestId,total:data.recipients.length,queued:statusSent?0:data.recipients.length,sent:statusSent?data.recipients.length:0,failed:0,results:data.recipients.map(email=>({email,status:statusSent?'sent':'queued',retrying:false,nextAttemptAt:now}))};}
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/'))return route.fallback();
    return ['localhost','127.0.0.1'].includes(url.hostname)?route.continue():route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const checks=[];
  const check=async(name,fn)=>{await fn();checks.push(name);process.stdout.write(`PASS ${name}\n`);};
  const waitPreview=async(subject)=>{
    await page.frameLocator('iframe[title="Conteúdo do e-mail"]').getByRole('heading',{name:subject,exact:true}).waitFor();
  };
  const fits=async()=>assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Sem overflow horizontal');
  async function openGrant(){await page.goto(base+'/clientes/customer-email');await page.getByRole('button',{name:'Assinatura',exact:true}).click();await page.getByRole('button',{name:'Conceder assinatura',exact:true}).click();await page.getByLabel('Plano',{exact:true}).selectOption('plan-test');return page.getByRole('dialog');}
  try{
    await check('Nova aba protegida, cinco modelos e campos obrigatórios',async()=>{
      await page.goto(base+'/enviar-email');await page.getByRole('heading',{name:'Enviar e-mail',exact:true}).waitFor();
      await page.getByRole('radio').first().waitFor();assert.equal(await page.getByRole('radio').count(),5);
      assert.equal(await page.getByLabel('Tipo de mensagem').locator('option').count(),4);
      assert(await page.getByRole('button',{name:'Enviar para 0 destinatários'}).isDisabled());assert.equal(sends.length,0);
    });
    await check('Prévia segura, destinatários repetidos e inválidos',async()=>{
      await page.getByLabel('Assunto',{exact:true}).fill('Aviso <b>especial</b>');
      await page.getByLabel('Corpo do e-mail').fill('Olá!\n<b>Texto literal</b>\nSegundo parágrafo.');
      await page.getByLabel('E-mails dos destinatários').fill('Um@example.com; um@EXAMPLE.com\ndois@example.com\ninvalido');
      await waitPreview('Aviso <b>especial</b>');
      assert(await page.getByRole('button',{name:'Enviar para 2 destinatários'}).isDisabled());
      assert(await page.frameLocator('iframe').locator('body').innerText().then(x=>x.includes('<b>Texto literal</b>')));
      assert.equal(await page.frameLocator('iframe').locator('b').count(),0);
      await page.getByLabel('E-mails dos destinatários').fill('Um@example.com; um@EXAMPLE.com\ndois@example.com');
      assert(await page.getByRole('button',{name:'Enviar para 2 destinatários'}).isEnabled());
    });
    await check('Prévia antiga não substitui edição mais recente',async()=>{
      await page.getByLabel('Assunto',{exact:true}).fill('Resposta antiga');
      await page.waitForTimeout(450);
      await page.getByLabel('Assunto',{exact:true}).fill('Mensagem atualizada');
      assert(await page.getByRole('button',{name:'Enviar para 2 destinatários'}).isDisabled());
      await waitPreview('Mensagem atualizada');await page.waitForTimeout(800);await waitPreview('Mensagem atualizada');
    });
    await check('Modelos e categoria independentes, desktop e celular',async()=>{
      for(const template of templates){await page.getByRole('radio',{name:new RegExp(template.name)}).check();await waitPreview('Mensagem atualizada');}
      await page.getByLabel('Tipo de mensagem').selectOption('promotion');await waitPreview('Mensagem atualizada');
      await fits();await page.screenshot({path:path.join(output,'enviar-email-desktop.png'),fullPage:true});
      for(const width of [390,320]){await page.setViewportSize({width,height:850});await page.getByRole('button',{name:'Prévia no celular'}).click();await fits();}
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(output,'enviar-email-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    });
    await check('Envio duplo bloqueado e conteúdo enviado igual ao da prévia',async()=>{
      await page.getByRole('button',{name:'Enviar para 2 destinatários'}).evaluate(button=>{button.click();button.click();});
      await page.getByRole('region',{name:'Andamento do envio'}).getByText('Um@example.com',{exact:true}).waitFor();
      assert.equal(sends.length,1);assert.equal(sends[0].recipients.length,2);assert.equal(sends[0].templateId,'celebration');assert.equal(sends[0].category,'promotion');
      assert.equal(sends[0].subject,'Mensagem atualizada');assert.equal(sends[0].body,'Olá!\n<b>Texto literal</b>\nSegundo parágrafo.');
      assert.match(sends[0].requestId,/^[0-9a-f-]{36}$/);
    });
    await check('Recarregar consulta o mesmo envio sem repetir POST',async()=>{
      statusSent=true;await page.reload();
      await page.getByRole('region',{name:'Andamento do envio'}).getByText('Enviado',{exact:true}).first().waitFor();
      assert.equal(sends.length,1);
      await page.getByRole('button',{name:'Escrever outra mensagem'}).click();
    });
    await check('Erro de transporte conserva o identificador para nova tentativa',async()=>{
      statusSent=false;failNextSend=true;failStatus=true;
      await page.getByLabel('Assunto',{exact:true}).fill('Segunda mensagem');await page.getByLabel('Corpo do e-mail').fill('Corpo da segunda mensagem.');await page.getByLabel('E-mails dos destinatários').fill('tres@example.com');await waitPreview('Segunda mensagem');
      await page.getByRole('button',{name:'Enviar para 1 destinatário',exact:true}).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      const id=sends.at(-1).requestId;failStatus=false;
      await page.getByRole('button',{name:'Tentar registrar novamente'}).click();
      await page.getByRole('region',{name:'Andamento do envio'}).getByText('tres@example.com',{exact:true}).waitFor();
      assert.equal(sends.at(-1).requestId,id);assert.equal(sends.length,3);
    });
    await check('Falha de consulta após reload preserva a solicitação pendente',async()=>{
      failStatus=true;await page.reload();await page.getByRole('alert').getByText('Consulta temporariamente indisponível').waitFor();
      assert.equal(await page.getByRole('button',{name:'Voltar à composição'}).count(),0);assert.equal(sends.length,3);
      failStatus=false;await page.getByRole('button',{name:'Atualizar envio'}).click();await page.getByRole('region',{name:'Andamento do envio'}).getByText('tres@example.com',{exact:true}).waitFor();
    });
    await check('Concessão começa sem email e desmarcar remove mensagem do payload',async()=>{
      const dialog=await openGrant();const checkbox=dialog.getByLabel('Enviar e-mail ao cliente',{exact:false});
      assert.equal(await checkbox.isChecked(),false);assert.equal(await dialog.getByRole('radio').count(),0);
      await checkbox.check();await dialog.getByLabel('Mensagem personalizada',{exact:true}).check();await dialog.getByLabel('Sua mensagem').fill('Não deve ser enviada');await checkbox.uncheck();
      await dialog.getByRole('button',{name:'Conceder por 30d'}).click();await dialog.waitFor({state:'hidden'});
      assert.equal(grants.length,1);assert.equal(grants[0].sendEmail,false);assert.equal(grants[0].emailMessage,undefined);assert.equal(grants[0].emailMessageType,undefined);
      await page.getByRole('status').getByText('A concessão foi realizada sem enviar e-mail.').waitFor();
    });
    await check('Concessão com mensagem genérica opcional e bloqueio de clique duplo',async()=>{
      const dialog=await openGrant();await dialog.getByLabel('Enviar e-mail ao cliente',{exact:false}).check();assert(await dialog.getByLabel('Mensagem genérica',{exact:true}).isChecked());
      let releaseGrant;
      grantWait = new Promise(resolve=>{releaseGrant=resolve;});
      try {
        await dialog.getByRole('button',{name:'Conceder por 30d'}).evaluate(button=>{button.click();button.click();});
        for(const key of ['Tab','Shift+Tab','Tab']) {
          await page.keyboard.press(key);
          assert(await dialog.evaluate(element=>element.contains(document.activeElement)), 'Foco permanece no modal durante a concessão');
        }
      } finally { releaseGrant(); grantWait = null; }
      await dialog.waitFor({state:'hidden'});
      assert.equal(grants.length,2);assert.equal(grants[1].sendEmail,true);assert.equal(grants[1].emailMessageType,'generic');assert.equal(grants[1].emailMessage,undefined);
      await page.getByRole('status').getByText('O aviso por e-mail foi colocado na fila de envio.').waitFor();
    });
    await check('Mensagem personalizada obrigatória quando selecionada e modal mobile',async()=>{
      await page.setViewportSize({width:390,height:740});const dialog=await openGrant();await dialog.getByLabel('Enviar e-mail ao cliente',{exact:false}).check();await dialog.getByLabel('Mensagem personalizada',{exact:true}).check();
      await dialog.getByRole('button',{name:'Conceder por 30d'}).click();await dialog.getByRole('alert').waitFor();assert.equal(grants.length,2);
      await dialog.getByLabel('Sua mensagem').fill('Parabéns!\nVocê recebeu esta cortesia.');
      await fits();await dialog.evaluate(element=>{element.scrollTop=0;});await page.screenshot({path:path.join(output,'conceder-assinatura-mobile.png'),fullPage:true});
      await dialog.getByRole('button',{name:'Conceder por 30d'}).click();await dialog.waitFor({state:'hidden'});
      assert.equal(grants.length,3);assert.equal(grants[2].emailMessageType,'custom');assert.equal(grants[2].emailMessage,'Parabéns!\nVocê recebeu esta cortesia.');
    });
    await check('Concessão com confirmação incerta consulta o cliente antes de repetir',async()=>{
      const dialog=await openGrant();failGrantAfterCommit=true;
      await dialog.getByRole('button',{name:'Conceder por 30d'}).click();await dialog.getByRole('alert').waitFor();
      assert(await dialog.getByRole('button',{name:'Conceder por 30d'}).isDisabled());assert.equal(grants.length,4);
      await dialog.getByRole('button',{name:'Atualizar dados do cliente'}).click();await dialog.waitFor({state:'hidden'});
      await page.getByRole('heading',{name:'Assinatura corrente'}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Conceder assinatura',exact:true}).count(),0);assert.equal(grants.length,4);
    });
    assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
    const report={checks,passed:checks.length,sendRequests:sends.length,uniqueSendIds:new Set(sends.map(s=>s.requestId)).size,grantRequests:grants.length,previewRequests:previews.length,externalEmailsSent:0,errors,unexpected};
    fs.writeFileSync(path.join(output,'email-browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
