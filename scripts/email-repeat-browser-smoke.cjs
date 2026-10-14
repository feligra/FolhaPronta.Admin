const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3116';
const output = path.resolve(process.env.TEST_OUTPUT_DIR || '../output/admin-email-repeat-2026-10-14');
const escape = value => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const options = {
  templates: [{id:'classic',name:'Clássico',description:'Mensagem clássica.',accentColor:'#54A0A8'}, {id:'letter',name:'Carta',description:'Mensagem pessoal.',accentColor:'#A685C9'}],
  categories: [{id:'notice',label:'Aviso'}, {id:'promotion',label:'Promoção'}],
  maxRecipients:50,maxSubjectLength:160,maxBodyLength:12000,sendingConfigured:true,
};

async function main() {
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(()=>{
    if(window !== window.top) return;
    localStorage.setItem('fp_admin_access','fake-admin-email-repeat');
    localStorage.setItem('fp_admin_refresh','fake-refresh');
    localStorage.setItem('fp_admin_user',JSON.stringify({id:'admin-repeat',name:'Admin teste',email:'admin@example.com',role:'Admin',userType:1}));
  });
  const sends=[],batches=new Map(),checks=[],errors=[],unexpected=[];
  let nextFailure=null, statusUnavailable=false, sendGate=null, statusGate=null, statusStarted=null, statusSent=false;
  const batchResult = data => ({requestId:data.requestId,total:data.recipients.length,queued:data.recipients.length,sent:0,failed:0,results:data.recipients.map(email=>({email,status:'queued',retrying:false,nextAttemptAt:null}))});
  await context.route('**/api/**',async route=>{
    const req=route.request(), url=new URL(req.url()), method=req.method();
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type','access-control-allow-methods':'GET,POST,OPTIONS'};
    const respond=(body,status=200)=>route.fulfill({status,headers,json:body}).catch(()=>{});
    if(method==='OPTIONS') return route.fulfill({status:204,headers});
    if(url.pathname==='/api/admin/emails/templates') return respond(options);
    if(url.pathname==='/api/admin/emails/preview') {
      const data=req.postDataJSON();
      return respond({subject:data.subject,html:`<html><body><h1>${escape(data.subject)}</h1><p>${escape(data.body)}</p></body></html>`});
    }
    if(url.pathname==='/api/admin/emails/send') {
      const data=req.postDataJSON(); sends.push(data);
      await (sendGate || new Promise(resolve=>setTimeout(resolve,120)));
      const failure=nextFailure; nextFailure=null;
      if(failure==='validation') return respond({error:{message:'Confira os destinatários.'}},400);
      if(failure==='transport') return respond({error:{message:'Resposta indisponível.'}},503);
      batches.set(data.requestId,data);
      if(failure==='after-commit') return respond({error:{message:'Confirmação indisponível.'}},503);
      return respond(batchResult(data));
    }
    if(url.pathname.startsWith('/api/admin/emails/send/')) {
      const data=batches.get(url.pathname.split('/').pop());
      statusStarted?.();
      if(statusGate) await statusGate;
      if(statusUnavailable) return respond({error:{message:'Consulta indisponível.'}},503);
      return data ? respond(statusSent ? {...batchResult(data),queued:0,sent:data.recipients.length,results:data.recipients.map(email=>({email,status:'sent',retrying:false,nextAttemptAt:null}))} : batchResult(data)) : respond({error:{message:'Envio não encontrado.'}},404);
    }
    unexpected.push(`${method} ${url.pathname}`);
    return respond({error:{message:'Rota não simulada.'}},404);
  });
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/api/')) return route.fallback();
    return ['localhost','127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(15000);
  const subject=page.getByLabel('Assunto',{exact:true}), body=page.getByLabel('Corpo do e-mail'), recipients=page.getByLabel('E-mails dos destinatários');
  const status=page.getByRole('region',{name:'Andamento do envio'});
  const send=count=>page.getByRole('button',{name:`Enviar para ${count} ${count===1?'destinatário':'destinatários'}`,exact:true});
  const waitPreview=text=>page.frameLocator('iframe').getByRole('heading',{name:text,exact:true}).waitFor();
  const check=async(name,run)=>{await run(); checks.push(name); console.log(`PASS ${name}`);};
  try {
    await page.goto(`${base}/enviar-email`);
    await check('Primeiro envio confirma, libera edição e exige novos destinatários sem reload',async()=>{
      await subject.fill('Primeiro aviso'); await body.fill('Mensagem para a primeira família.');
      await recipients.fill('familia@example.com; copia@example.com; FAMILIA@example.com');
      await waitPreview('Primeiro aviso');
      await send(2).evaluate(button=>{button.click();button.click();});
      await status.getByText('familia@example.com',{exact:true}).waitFor();
      assert.equal(sends.length,1); assert.equal(sends[0].recipients.length,2);
      assert(await subject.isEnabled()); assert(await recipients.isEnabled());
      assert.equal(await recipients.inputValue(),'');
      assert.equal(await subject.inputValue(),'Primeiro aviso');
      assert.equal(await body.inputValue(),'Mensagem para a primeira família.');
      assert(await send(0).isDisabled());
    });
    await check('Consulta de andamento não apaga os destinatários do próximo envio',async()=>{
      await recipients.fill('professora@example.com; socio@example.com');
      await Promise.all([
        page.waitForResponse(response=>response.url().includes('/api/admin/emails/send/')),
        page.getByRole('button',{name:'Atualizar envio'}).click(),
      ]);
      assert.equal(await recipients.inputValue(),'professora@example.com; socio@example.com');
    });
    await check('Segundo envio independente preserva modelo, categoria e cópia com UUID novo',async()=>{
      await subject.fill('Segundo aviso'); await body.fill('Mensagem para a professora.');
      await page.getByRole('radio',{name:/^Carta /}).check();
      await page.getByLabel('Tipo de mensagem').selectOption('promotion');
      await waitPreview('Segundo aviso');
      await send(2).click();
      await status.getByText('professora@example.com',{exact:true}).waitFor();
      assert.equal(sends.length,2); assert.equal(batches.size,2);
      assert.notEqual(sends[0].requestId,sends[1].requestId);
      assert.equal(sends[1].templateId,'letter'); assert.equal(sends[1].category,'promotion');
      assert.equal(sends[1].subject,'Segundo aviso'); assert.equal(sends[1].body,'Mensagem para a professora.');
      assert.deepEqual(sends[1].recipients,['professora@example.com','socio@example.com']);
      assert(await subject.isEnabled()); assert.equal(await recipients.inputValue(),'');
      await page.screenshot({path:path.join(output,'segundo-envio-desktop.png'),fullPage:true});
    });
    await check('Resposta atrasada do envio anterior não libera uma tentativa ainda incerta',async()=>{
      let releaseStatus,releaseSend,started;
      statusGate=new Promise(resolve=>{releaseStatus=resolve;});
      sendGate=new Promise(resolve=>{releaseSend=resolve;});
      const statusRequest=new Promise(resolve=>{started=resolve;});
      statusStarted=started;
      await page.getByRole('button',{name:'Atualizar envio'}).click();
      await statusRequest;
      await recipients.fill('terceiro@example.com');
      await send(1).click();
      releaseStatus(); statusGate=null; statusStarted=null;
      await page.waitForTimeout(150);
      assert(await subject.isDisabled());
      releaseSend(); sendGate=null;
      await status.getByText('terceiro@example.com',{exact:true}).waitFor();
      assert.equal(sends.length,3); assert(await subject.isEnabled());
      assert(await page.getByRole('button',{name:'Atualizar envio'}).isEnabled());
    });
    await check('Resposta de transporte incerta bloqueia edição e repete somente o mesmo UUID',async()=>{
      nextFailure='transport'; statusUnavailable=true;
      await recipients.fill('recuperar@example.com');
      await send(1).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      assert(await subject.isDisabled()); assert(await recipients.isDisabled());
      const failed=sends.at(-1); statusUnavailable=false;
      await page.getByRole('button',{name:'Tentar registrar novamente'}).click();
      await status.getByText('recuperar@example.com',{exact:true}).waitFor();
      assert.deepEqual(sends.at(-1),failed); assert.equal(sends.length,5); assert.equal(batches.size,4);
      assert(await recipients.isEnabled()); assert.equal(await recipients.inputValue(),'');
    });
    await check('Confirmação recuperada por consulta libera envio sem repetir POST',async()=>{
      nextFailure='after-commit'; statusUnavailable=true;
      await recipients.fill('confirmado@example.com');
      await send(1).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      assert(await subject.isDisabled()); statusUnavailable=false;
      await page.getByRole('button',{name:'Atualizar envio'}).click();
      await status.getByText('confirmado@example.com',{exact:true}).waitFor();
      assert.equal(sends.length,6); assert.equal(batches.size,5);
      assert(await subject.isEnabled()); assert.equal(await recipients.inputValue(),'');
    });
    await check('Rejeição de validação mantém texto para corrigir e o novo envio recebe outro UUID',async()=>{
      nextFailure='validation'; await recipients.fill('corrigir@example.com');
      await send(1).click();
      await page.getByRole('alert').getByText('Confira os destinatários.').waitFor();
      assert(await recipients.isEnabled()); assert.equal(await recipients.inputValue(),'corrigir@example.com');
      assert.equal(await subject.inputValue(),'Segundo aviso');
      const rejected=sends.at(-1).requestId;
      await recipients.fill('corrigido@example.com'); await send(1).click();
      await status.getByText('corrigido@example.com',{exact:true}).waitFor();
      assert.notEqual(sends.at(-1).requestId,rejected); assert.equal(sends.length,8); assert.equal(batches.size,6);
    });
    await check('Novo envio no celular e reinício explícito sem recarregar a página',async()=>{
      await page.setViewportSize({width:390,height:844});
      await recipients.fill('mobile@example.com; copia-mobile@example.com');
      assert(await send(2).isEnabled());
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await send(2).click(); await status.getByText('mobile@example.com',{exact:true}).waitFor();
      await page.screenshot({path:path.join(output,'envio-seguinte-mobile.png'),fullPage:true});
      await page.getByRole('button',{name:'Escrever outra mensagem'}).click();
      assert.equal(await subject.inputValue(),''); assert.equal(await body.inputValue(),''); assert.equal(await recipients.inputValue(),'');
      assert(await subject.isEnabled()); assert.equal(sends.length,9);
    });
    await check('Reload de envio incerto conserva mensagem, destinatários e UUID mesmo com consulta404',async()=>{
      nextFailure='transport'; statusUnavailable=true;
      await subject.fill('Preservar após interrupção'); await body.fill('Mensagem que não pode ser enviada duas vezes.');
      await recipients.fill('interrompido@example.com; copia-interrompido@example.com');
      await waitPreview('Preservar após interrupção'); await send(2).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      const pending=sends.at(-1);
      statusUnavailable=false; await page.reload();
      await page.getByRole('alert').getByText('Envio não encontrado.',{exact:true}).waitFor();
      assert.equal(await subject.inputValue(),pending.subject,'A mensagem pendente precisa sobreviver ao reload');
      assert.equal(await body.inputValue(),pending.body);
      assert.equal(await recipients.inputValue(),pending.recipients.join('\n'));
      assert(await subject.isDisabled()); assert.equal(await page.getByRole('button',{name:'Voltar à composição'}).count(),0);
      // The original request may finish after the lookup returned 404.
      batches.set(pending.requestId,pending);
      await page.getByRole('button',{name:'Tentar registrar novamente'}).click();
      await status.getByText('interrompido@example.com',{exact:true}).waitFor();
      assert.deepEqual(sends.at(-1),pending); assert.equal(sends.length,11); assert.equal(batches.size,8);
      assert(await recipients.isEnabled()); assert.equal(await recipients.inputValue(),'');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('fp_admin_email_request_admin-repeat')),pending.requestId);
    });
    await check('Confirmação por consulta prevalece sobre erro tardio da repetição em andamento',async()=>{
      nextFailure='after-commit'; statusUnavailable=true;
      await recipients.fill('confirmacao-concorrente@example.com'); await send(1).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      let releaseStatus,releaseSend,started;
      statusGate=new Promise(resolve=>{releaseStatus=resolve;});
      sendGate=new Promise(resolve=>{releaseSend=resolve;});
      const statusRequest=new Promise(resolve=>{started=resolve;}); statusStarted=started;
      await page.getByRole('button',{name:'Atualizar envio'}).click(); await statusRequest;
      nextFailure='transport';
      await page.getByRole('button',{name:'Tentar registrar novamente'}).click();
      statusUnavailable=false; statusSent=true;
      releaseStatus(); statusGate=null; statusStarted=null;
      await status.getByText('Enviado',{exact:true}).waitFor();
      releaseSend(); sendGate=null;
      await page.waitForTimeout(200);
      assert(await subject.isEnabled()); assert.equal(await page.getByRole('alert').count(),0,'Erro atrasado não pode contradizer confirmação já recebida');
      assert.equal(await recipients.inputValue(),''); assert.equal(sends.length,13);
      statusSent=false;
    });
    await check('Resposta antiga na fila não regride confirmação de entrega recebida durante repetição',async()=>{
      nextFailure='after-commit'; statusUnavailable=true;
      await recipients.fill('entrega-concorrente@example.com'); await send(1).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      let releaseStatus,releaseSend,started;
      statusGate=new Promise(resolve=>{releaseStatus=resolve;});
      sendGate=new Promise(resolve=>{releaseSend=resolve;});
      const statusRequest=new Promise(resolve=>{started=resolve;}); statusStarted=started;
      await page.getByRole('button',{name:'Atualizar envio'}).click(); await statusRequest;
      await page.getByRole('button',{name:'Tentar registrar novamente'}).click();
      statusUnavailable=false; statusSent=true;
      releaseStatus(); statusGate=null; statusStarted=null;
      await status.getByText('Enviado',{exact:true}).waitFor();
      releaseSend(); sendGate=null; await page.waitForTimeout(200);
      assert.equal(await status.getByText('Enviado',{exact:true}).count(),1,'Resposta anterior da fila não pode apagar entrega confirmada');
      assert.equal(await status.getByText('Na fila',{exact:true}).count(),0);
      assert.equal(await page.getByRole('alert').count(),0); assert.equal(sends.length,15);
      await page.screenshot({path:path.join(output,'confirmacao-concorrente-mobile.png'),fullPage:true});
      statusSent=false;
    });
    await check('Consulta404 iniciada antes da confirmação não mostra falha depois do registro',async()=>{
      nextFailure='transport';
      await recipients.fill('consulta-antiga@example.com'); await send(1).click();
      await page.getByRole('button',{name:'Tentar registrar novamente'}).waitFor();
      let releaseStatus,releaseSend,started;
      statusGate=new Promise(resolve=>{releaseStatus=resolve;});
      sendGate=new Promise(resolve=>{releaseSend=resolve;});
      const statusRequest=new Promise(resolve=>{started=resolve;}); statusStarted=started;
      await page.getByRole('button',{name:'Atualizar envio'}).click(); await statusRequest;
      await page.getByRole('button',{name:'Tentar registrar novamente'}).click();
      releaseSend(); sendGate=null;
      await status.getByText('consulta-antiga@example.com',{exact:true}).waitFor();
      releaseStatus(); statusGate=null; statusStarted=null;
      await page.waitForTimeout(150);
      assert.equal(await page.getByRole('alert').count(),0,'Consulta anterior ao registro não pode exibir uma falha falsa');
      assert(await recipients.isEnabled()); assert.equal(sends.length,17);
    });
    assert.deepEqual(errors,[]); assert.deepEqual(unexpected,[]);
    const report={checks,passed:checks.length,sendRequests:sends.length,uniqueSendIds:new Set(sends.map(item=>item.requestId)).size,registeredBatches:batches.size,externalEmailsSent:0,errors,unexpected};
    fs.writeFileSync(path.join(output,'email-repeat-browser-report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
