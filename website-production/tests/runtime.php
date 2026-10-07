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
