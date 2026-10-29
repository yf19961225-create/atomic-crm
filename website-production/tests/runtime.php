<?php
require __DIR__.'/../lib/runtime.php';
function check($v,$m){if(!$v)throw new RuntimeException($m);echo "PASS $m\n";}
$d=sys_get_temp_dir().'/production-runtime-'.bin2hex(random_bytes(8));mkdir($d,0700);
$c=['directory'=>$d,'owner'=>'info@example.test'];$calls=[];$acceptCustomer=false;
$c['mailer']=function($m)use(&$calls,&$acceptCustomer){$calls[]=$m;return $m['attachment']!==null||$acceptCustomer;};
$m=['submissionId'=>'123e4567-e89b-42d3-a456-426614174000','recipient'=>'buyer@example.test','html'=>'Saved snapshot','attachment'=>'PK original','attachmentName'=>'WI-1.xlsx'];
production_dispatch($c,'internal',$m);
$cm=$m;$cm['attachment']=null;$cm['attachmentName']=null;
try{production_dispatch($c,'customer',$cm);}catch(RuntimeException $e){}
$acceptCustomer=true;production_dispatch($c,'internal',$m);production_dispatch($c,'customer',$cm);production_dispatch($c,'customer',$cm);
check(count($calls)===3,'partial failure retries customer only');
check($calls[0]['recipient']==='info@example.test'&&$calls[1]['recipient']==='buyer@example.test','production owner and saved customer destinations, no QA recipient');
check($calls[0]['attachment']==='PK original'&&$calls[2]['attachment']===null,'original workbook internal only');
check(production_endpoint('https://crm2.romiku.com/api/website-inquiries')==='https://crm2.romiku.com/api/website-inquiries','Production endpoint accepted');
foreach(['https://crm.romiku.com/api/website-inquiries','https://preview.vercel.app/api/website-inquiries']as$u){try{production_endpoint($u);throw new LogicException('unsafe endpoint');}catch(RuntimeException $e){check(true,'non-production endpoint rejected');}}
$c['mailer']=function($m){throw new RuntimeException('uncertain acknowledgement');};$cm['submissionId']='123e4567-e89b-42d3-a456-426614174001';
try{production_dispatch($c,'customer',$cm);}catch(RuntimeException $e){}
$c['mailer']=function($m){throw new LogicException('duplicate transport');};try{production_dispatch($c,'customer',$cm);}catch(RuntimeException $e){check(true,'uncertain acceptance blocks automatic resend');}
$reviewInput=['submissionId'=>'123e4567-e89b-42d3-a456-426614174099','customer'=>['name'=>'QA','email'=>'qa@example.test','market'=>'UK'],'products'=>[['sku'=>'QA','qty'=>1]]];
$reviewCatalog=['QA'=>['sku'=>'QA','name'=>'QA','image'=>'']];
$attempts=0;$c['mailer']=function($m)use(&$attempts){$attempts++;throw new RuntimeException('unknown SMTP result');};
$receipt=fn($p)=>['success'=>true,'id'=>'123e4567-e89b-42d3-a456-426614174098','document_number'=>'WI-99','submitted_at'=>'2026-10-28T00:00:00Z','normalizedSubmission'=>$p];
$dispatch=fn($kind,$mail)=>production_dispatch($c,$kind,$mail);
$r=qa_process($reviewInput,$reviewCatalog,$d,$receipt,fn()=>'PK test',$dispatch);
check(!$r['success'] && $r['crmSaved'] && $r['notifications']['internal']==='review_required','uncertain SMTP explicitly requires review, not ordinary retry');
qa_process($reviewInput,[],$d,fn()=>throw new LogicException('CRM repeated'),fn()=>'PK test',$dispatch);
check($attempts===2,'uncertain internal and customer never automatically resent');
// A persisted CRM receipt remains authoritative even if the live catalogue changes.
$c['catalog']='/missing-catalog-for-retry-test.js';
try{$retry=production_process($c,$reviewInput);check($retry['crmSaved']===true,'saved retry does not depend on current catalogue');}
catch(Throwable $e){throw new RuntimeException('saved retry unnecessarily required current catalogue',0,$e);}
