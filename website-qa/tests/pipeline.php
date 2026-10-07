<?php
declare(strict_types=1);
require __DIR__.'/../lib/pipeline.php';
function check($condition,$message) { if (!$condition) throw new RuntimeException($message); echo "PASS $message\n"; }
$base=sys_get_temp_dir().'/romiku-qa-test-'.bin2hex(random_bytes(8)); mkdir($base,0700);
$uuid='123e4567-e89b-42d3-a456-426614174000';
$input=['submissionId'=>$uuid,'customer'=>['name'=>'Tester','company'=>'Company','brand'=>'Brand','email'=>'test@example.test','whatsapp'=>'+593 (99) 123-4567','market'=>'Ecuador','notes'=>'Needs'], 'products'=>[['sku'=>'SUN5','qty'=>120.125,'name'=>'forged','image'=>'https://evil.test/x','specifications'=>'forged','cartonQty'=>'900','notes'=>'Keep requirement']]];
$catalog=['SUN5'=>['sku'=>'SUN5','localizedInquiryName'=>['en'=>'Nail Lamp'],'image'=>'./images/products-local/sun5.jpg','parameters'=>[['label'=>['en'=>'Power'],'value'=>['en'=>'48W']]],'cartonQty'=>'12','unit'=>'PCS','cartonCbm'=>0.3]];
$n=qa_normalize($input,$catalog);
check($n['items'][0]['image']==='https://romiku.com/images/products-local/sun5.jpg','image authoritative static catalogue');
check($n['items'][0]['productName']==='Nail Lamp' && $n['items'][0]['specification']==='Power: 48W','catalogue product and specification');
check($n['items'][0]['quantity']===120.125 && $n['items'][0]['cartonQty']===12.0,'request quantity not carton quantity');
check($n['whatsapp']==='+593 (99) 123-4567' && $n['brand']==='Brand','brand and textual WhatsApp preserved');
$optional=$input; unset($optional['customer']['brand'],$optional['customer']['whatsapp']);check(qa_normalize($optional,$catalog)['whatsapp']==='','optional WhatsApp accepted');
foreach (['sku','qty'] as $field) { $bad=$input; $bad['products'][0][$field]=$field==='sku'?'UNKNOWN':0; try { qa_normalize($bad,$catalog); throw new RuntimeException('accepted invalid'); } catch (InvalidArgumentException $e) { check(true,'invalid '.$field.' rejected'); }}
$bad=$input;$bad['customer']['email']='';try {qa_normalize($bad,$catalog);throw new RuntimeException('missing email');} catch(InvalidArgumentException $e){check(true,'email required');}
$events=[];$crmCalls=0;$sendCalls=['internal'=>0,'customer'=>0];$failCrm=true;$failInternal=true;
$crm=function($submission) use (&$events,&$crmCalls,&$failCrm) { $events[]='crm';$crmCalls++;if($failCrm)throw new RuntimeException('secret must not escape');return ['success'=>true,'replay'=>false,'id'=>'123e4567-e89b-42d3-a456-426614174010','document_number'=>'WI-000123','submitted_at'=>'2026-10-01T01:02:03Z','normalizedSubmission'=>$submission];};
$attachment=function($receipt) use (&$events){$events[]='attachment';check($receipt['submitted_at']==='2026-10-01T01:02:03Z','attachment original date');return 'PK'.str_repeat('x',100);};
$send=function($kind,$mail)use(&$events,&$sendCalls,&$failInternal){$events[]=$kind;$sendCalls[$kind]++;if($kind==='internal' && $failInternal)throw new RuntimeException('mail failure');check($kind==='internal' || $mail['attachment']===null,'customer no attachment');check(str_contains($mail['html'],'120.125'),'same requested quantity in mail');};
try {qa_process($input,$catalog,$base,$crm,$attachment,$send);throw new RuntimeException('CRM failure ignored');}catch(RuntimeException $e){check($events===['crm'],'CRM failure sends no mail');}
$failCrm=false;$result=qa_process($input,$catalog,$base,$crm,$attachment,$send);check($result['crmSaved'] && !$result['success'] && $result['notifications']['customer']==='sent','CRM saved and customer recorded on internal mail failure');
$failInternal=false;$changed=$input;$changed['products'][0]['qty']=999;$changed['customer']['email']='changed@example.test';$result=qa_process($changed,[],$base,$crm,$attachment,$send);
check($result['success'] && $crmCalls===2,'retry skips successful CRM write and ignores changed catalogue/payload');
check($sendCalls['internal']===2 && $sendCalls['customer']===1,'retry sends only unsent notification');
qa_process($input,[],$base,$crm,$attachment,$send);check($sendCalls['internal']===2 && $sendCalls['customer']===1,'repeated completed retry sends nothing');
$html=qa_mail('internal',['document_number'=>'WI-1','submitted_at'=>'2026-10-01','normalizedSubmission'=>$n],'PK')['html'];check(str_contains($html,'Brand') && str_contains($html,'Request Qty') && !str_contains($html,'Order Qty'),'internal mail labels');
$customer=qa_mail('customer',['document_number'=>'WI-1','submitted_at'=>'2026-10-01','normalizedSubmission'=>$n],null);check(!str_contains($customer['html'],'CBM')&&!str_contains($customer['html'],'WI-1')&&!str_contains($customer['html'],'48W'),'customer concise no internal fields');
$replayInput=$input;$replayInput['submissionId']='123e4567-e89b-42d3-a456-426614174001';$original=$n;$original['submissionId']=$replayInput['submissionId'];$replayInput['products'][0]['qty']=999;
$replayCrm=fn($p)=>['success'=>true,'replay'=>true,'id'=>'123e4567-e89b-42d3-a456-426614174011','document_number'=>'WI-2','submitted_at'=>'2026-10-01T01:02:03Z','normalizedSubmission'=>$original];
$result=qa_process($replayInput,$catalog,$base,$replayCrm,$attachment,$send);check($result['replay'] && $result['success'],'server replay original normalized payload drives notification');
echo "Pipeline tests complete\n";
$customerFails=true;$seen=['internal'=>0,'customer'=>0];$new=$input;$new['submissionId']='123e4567-e89b-42d3-a456-426614174003';
$notify=function($kind,$mail)use(&$seen,&$customerFails){$seen[$kind]++;if($kind==='customer'&&$customerFails)throw new RuntimeException('definite failure');};
$before=$crmCalls;qa_process($new,$catalog,$base,$crm,$attachment,$notify);$customerFails=false;qa_process($new,[],$base,$crm,$attachment,$notify);
check($seen['internal']===1&&$seen['customer']===2,'customer-only failure retries customer without internal duplicate');check($crmCalls===$before+1,'same email different UUID creates distinct CRM submission');
$unknownPacking=$catalog;unset($unknownPacking['SUN5']['cartonQty'],$unknownPacking['SUN5']['cartonCbm']);$normalized=qa_normalize($input,$unknownPacking);check(!array_key_exists('cartonQty',$normalized['items'][0])&&!array_key_exists('cartonCbm',$normalized['items'][0]),'unknown packing keys omitted');
$high=$input;$high['products'][0]['qty']='99999999999999.1234';try{qa_normalize($high,$catalog);throw new LogicException('rounded quantity allowed');}catch(InvalidArgumentException $e){check(true,'unsafe decimal magnitude rejected instead of rounded');}
