const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3013';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '../output/revisao-correcoes/admin');
const previewDirectory = path.resolve(process.env.FOLHAPRONTA_EMAIL_PREVIEW_DIR || '../output/revisao-correcoes/emails');
const templates = [
  {id:'classic',name:'Clássico',description:'Papel creme e detalhes turquesa, como nas mensagens de contato do site.',accentColor:'#54A0A8',stamp:'Carta aberta'},
  {id:'spotlight',name:'Destaque',description:'Selo coral e mensagem em destaque para novidades e promoções.',accentColor:'#F76B5C',stamp:'Em destaque'},
  {id:'letter',name:'Carta',description:'Detalhes lilás e uma apresentação acolhedora para mensagens pessoais.',accentColor:'#A685C9',stamp:'Carta da equipe'},
  {id:'bulletin',name:'Comunicado',description:'Selo verde e quadro de mensagem para avisos importantes.',accentColor:'#648A68',stamp:'Comunicado'},
  {id:'celebration',name:'Celebração',description:'Selo amarelo e detalhes festivos para compartilhar boas notícias.',accentColor:'#FFC93C',stamp:'Boas notícias'},
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
  const file = path.join(previewDirectory,`${data.templateId}.html`);
  if (process.env.FOLHAPRONTA_EMAIL_PREVIEW_DIR) assert(fs.existsSync(file), `Prévia real do servidor ausente: ${file}`);
  if (fs.existsSync(file)) {
    const original = fs.readFileSync(file,'utf8');
    return original.replace(/(<p style="margin:0 0 12px;[^>]*>)[\s\S]*?(<\/p>)/,`$1${escape(options.categories.find(item=>item.id===data.category).label)}$2`)
      .replace(/<title>[\s\S]*?<\/title>/,`<title>${escape(data.subject)}</title>`)
      .replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/,`$1${escape(data.subject)}$2`)
      .replace(/(<div class="message"[^>]*>)[\s\S]*?(<\/div>)/,`$1${escape(data.body).replace(/\n/g,'<br>')}$2`);
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
  let failNextSend=false, failStatus=false, statusSent=false, partialDelivery=false, failGrantAfterCommit=false, grantCommitted=false;
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
      if(data.body===Array(12).fill('https://spam.example.com').join('\n'))return respond({error:{message:'A mensagem contém links em excesso ou muito repetidos. Reduza os links antes de enviar.'}},400);
      return respond({subject:data.subject,html:previewHtml(data)});
    }
    if(url.pathname==='/api/admin/emails/send'){
      const data=req.postDataJSON();sends.push(data);
      await new Promise(r=>setTimeout(r,150));
      if(failNextSend){failNextSend=false;return respond({error:{message:'Falha temporária simulada'}},503);}
      if(data.recipients.includes('temporario@mailinator.com'))return respond({error:{message:'E-mails temporários ou descartáveis não são aceitos. Use um e-mail permanente.'}},400);
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
  function result(data){
    if(partialDelivery)return {requestId:data.requestId,total:data.recipients.length,queued:0,sent:1,failed:data.recipients.length-1,results:data.recipients.map((email,index)=>({email,status:index===0?'sent':'failed',retrying:index!==0,nextAttemptAt:index===0?null:end,error:index===0?null:'A última tentativa falhou. O envio permanece na fila para nova tentativa; consulte o histórico de e-mails.'}))};
    return {requestId:data.requestId,total:data.recipients.length,queued:statusSent?0:data.recipients.length,sent:statusSent?data.recipients.length:0,failed:0,results:data.recipients.map(email=>({email,status:statusSent?'sent':'queued',retrying:false,nextAttemptAt:now}))};
  }
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
      for(const template of templates){
        await page.getByRole('radio',{name:new RegExp(`^${template.name} `)}).check();await waitPreview('Mensagem atualizada');
        if(process.env.FOLHAPRONTA_EMAIL_PREVIEW_DIR){
          await page.frameLocator('iframe').getByText(new RegExp(template.stamp)).waitFor();
          assert.equal(await page.frameLocator('iframe').locator('body').evaluate(body=>getComputedStyle(body).backgroundColor),'rgb(255, 233, 203)');
          assert(await page.frameLocator('iframe').getByText('CNPJ 66.099.913/0001-15',{exact:false}).isVisible());
        }
      }
      await page.getByLabel('Tipo de mensagem').selectOption('promotion');await waitPreview('Mensagem atualizada');
      await fits();await page.screenshot({path:path.join(output,'enviar-email-desktop.png'),fullPage:true});
      for(const width of [390,320]){
        await page.setViewportSize({width,height:850});await page.getByRole('button',{name:'Prévia no celular'}).click();await fits();
        assert(await page.frameLocator('iframe').locator('html').evaluate(element=>element.scrollWidth <= innerWidth+1),'E-mail cabe na prévia mobile sem rolagem horizontal');
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:path.join(output,'enviar-email-mobile.png'),fullPage:true});
      await page.setViewportSize({width:1440,height:1000});
    });
    if(process.env.FOLHAPRONTA_EMAIL_PREVIEW_DIR) await check('Cinco modelos reais legíveis no celular com assunto e palavras longas',async()=>{
      const previewPage=await context.newPage();
      try{
        await previewPage.setViewportSize({width:320,height:850});
        for(const template of templates){
          await previewPage.setContent(previewHtml({templateId:template.id,category:'notice',subject:'Comunicado '+ 'A'.repeat(145),body:'Olá!\n\n'+ 'Aprendizagem'.repeat(60)+'\n\nCom carinho,\nEquipe FolhaPronta'}));
          assert(await previewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Modelo ${template.id} sem overflow com palavras longas`);
          assert.equal(await previewPage.locator('h1').innerText(),'Comunicado '+ 'A'.repeat(145));
          assert.equal(await previewPage.locator('.message').innerText(),'Olá!\n\n'+ 'Aprendizagem'.repeat(60)+'\n\nCom carinho,\nEquipe FolhaPronta');
          await previewPage.setContent(fs.readFileSync(path.join(previewDirectory,`${template.id}.html`),'utf8'));
          await previewPage.screenshot({path:path.join(output,`${template.id}-mobile.png`),fullPage:true});
          await previewPage.setViewportSize({width:800,height:1000});
          await previewPage.screenshot({path:path.join(output,`${template.id}-desktop.png`),fullPage:true});
          await previewPage.setViewportSize({width:320,height:850});
        }
      }finally{await previewPage.close();}
    });
    await check('Bloqueio antiabuso da prévia impede envio e permite corrigir a mensagem',async()=>{
      await page.getByLabel('Corpo do e-mail').fill(Array(12).fill('https://spam.example.com').join('\n'));
      await page.getByRole('alert').getByText('A mensagem contém links em excesso ou muito repetidos. Reduza os links antes de enviar.').waitFor();
      assert(await page.getByRole('button',{name:'Enviar para 2 destinatários'}).isDisabled());
      assert.equal(await page.locator('iframe[title="Conteúdo do e-mail"]').count(),0);
      assert.equal(sends.length,0);
      await page.getByLabel('Corpo do e-mail').fill('Olá!\n<b>Texto literal</b>\nSegundo parágrafo.');
      await waitPreview('Mensagem atualizada');
      assert(await page.getByRole('button',{name:'Enviar para 2 destinatários'}).isEnabled());
    });
    await check('Envio duplo bloqueado e conteúdo enviado igual ao da prévia',async()=>{
      await page.getByRole('button',{name:'Enviar para 2 destinatários'}).evaluate(button=>{button.click();button.click();});
      await page.getByRole('region',{name:'Andamento do envio'}).getByText('Um@example.com',{exact:true}).waitFor();
      assert.equal(sends.length,1);assert.equal(sends[0].recipients.length,2);assert.equal(sends[0].templateId,'celebration');assert.equal(sends[0].category,'promotion');
      assert.equal(sends[0].subject,'Mensagem atualizada');assert.equal(sends[0].body,'Olá!\n<b>Texto literal</b>\nSegundo parágrafo.');
      assert.match(sends[0].requestId,/^[0-9a-f-]{36}$/);
    });
    await check('Falha em uma cópia mantém o outro destinatário enviado e mostra a nova tentativa',async()=>{
      partialDelivery=true;await page.getByRole('button',{name:'Atualizar envio'}).click();
      const status=page.getByRole('region',{name:'Andamento do envio'});
      await status.getByText('Nova tentativa agendada',{exact:true}).waitFor();
      assert.equal(await status.getByText('Enviado',{exact:true}).count(),1);
      assert.equal(await status.getByText('Nova tentativa agendada',{exact:true}).count(),1);
      assert.equal(await status.getByText('Próxima tentativa:',{exact:false}).count(),1);
      assert.equal(sends.length,1);
      partialDelivery=false;
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
    await check('Destinatário temporário rejeitado libera correção sem apagar a mensagem',async()=>{
      await page.getByRole('button',{name:'Escrever outra mensagem'}).click();
      await page.getByLabel('Assunto',{exact:true}).fill('Mensagem legítima');
      await page.getByLabel('Corpo do e-mail').fill('Aviso sobre as próximas atividades da turma.');
      await page.getByLabel('E-mails dos destinatários').fill('temporario@mailinator.com; permanente@example.com');
      await waitPreview('Mensagem legítima');
      await page.getByRole('button',{name:'Enviar para 2 destinatários'}).click();
      await page.getByRole('alert').getByText('E-mails temporários ou descartáveis não são aceitos. Use um e-mail permanente.').waitFor();
      assert.equal(await page.getByRole('region',{name:'Andamento do envio'}).count(),0);
      assert.equal(await page.getByLabel('Assunto',{exact:true}).inputValue(),'Mensagem legítima');
      assert.equal(batches.size,2);
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('fp_admin_email_request_admin-email')),null);
      await page.getByLabel('E-mails dos destinatários').fill('permanente@example.com');
      await page.getByRole('button',{name:'Enviar para 1 destinatário',exact:true}).click();
      await page.getByRole('region',{name:'Andamento do envio'}).getByText('permanente@example.com',{exact:true}).waitFor();
      assert.equal(batches.size,3);assert.equal(sends.length,5);
      assert.notEqual(sends.at(-1).requestId,sends.at(-2).requestId);
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
