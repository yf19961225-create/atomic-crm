<?php
declare(strict_types=1);
require __DIR__.'/../lib/runtime.php';
function check($condition,$message){if(!$condition)throw new RuntimeException($message);echo "PASS $message\n";}
$allowed='https://'.QA_PREVIEW_HOST.'/api/website-inquiries';check(qa_endpoint($allowed)===$allowed,'fixed Preview endpoint allowed');
foreach(['https://crm.romiku.com/api/website-inquiries','https://crm2.romiku.com/api/website-inquiries','https://romiku-crm-prod.vercel.app/api/website-inquiries','https://'.QA_PREVIEW_HOST.'.evil.test/api/website-inquiries',$allowed.'?redirect=1','http://'.QA_PREVIEW_HOST.'/api/website-inquiries']as$url){try{qa_endpoint($url);throw new LogicException('unsafe host allowed');}catch(RuntimeException $e){check(true,'unapproved endpoint denied');}}
$dir=sys_get_temp_dir().'/qa-runtime-'.bin2hex(random_bytes(8));mkdir($dir,0700);$file=$dir.'/products-data.js';file_put_contents($file,'window.ROMIKU_PRODUCTS = '.json_encode(['sun5'=>['sku'=>'SUN5','image'=>'./images/products-local/sun5.jpg']]).';');check(isset(qa_catalog($file)['SUN5']),'static assignment parsed without JS execution');
file_put_contents($file,'alert("no");');try{qa_catalog($file);throw new LogicException('invalid catalog accepted');}catch(RuntimeException $e){check(true,'invalid static catalogue rejected');}
$id='123e4567-e89b-42d3-a456-426614174000';$mail=['submissionId'=>$id,'html'=>'Original','attachment'=>'PK fake fixture','attachmentName'=>'WI-1.xlsx'];qa_capture($dir,'internal',$mail);$mail['html']='Changed';qa_capture($dir,'internal',$mail);$saved=json_decode(file_get_contents($dir.'/'.$id.'.internal.capture.json'),true);check($saved['html']==='Original','capture replay does not replace original');check(file_get_contents($dir.'/'.$id.'.internal.xlsx')==='PK fake fixture','capture stores workbook bytes privately');check((fileperms($dir.'/'.$id.'.internal.xlsx')&0777)===0600,'captured workbook private file permissions');
check(!str_contains(file_get_contents(__DIR__.'/../public/qa.mjs'),'Website-Secret'),'server secret absent browser code');
echo "Runtime tests complete\n";
$calls=0;$accept=false;$config=['directory'=>$dir,'mode'=>'internal-only','mailer'=>function($mail)use(&$calls,&$accept){$calls++;check($mail['recipient']==='info@romiku.com','real internal target is fixed');check($mail['attachment']!==null,'real internal mail has workbook');return $accept;}];
$mail['submissionId']='123e4567-e89b-42d3-a456-426614174001';
try{qa_dispatch($config,'internal',$mail);throw new LogicException('failed delivery ignored');}catch(RuntimeException $e){check(true,'definite mail failure retryable');}
$accept=true;qa_dispatch($config,'internal',$mail);qa_dispatch($config,'internal',$mail);check($calls===2,'accepted internal mail not resent');
$customer=$mail;$customer['attachment']=null;$customer['recipient']='qa@example.com';qa_dispatch($config,'customer',$customer);check($calls===2,'customer always captured even internal-only mode');
$mail['submissionId']='123e4567-e89b-42d3-a456-426614174002';$config['mailer']=function($mail)use(&$calls){$calls++;throw new RuntimeException('uncertain SMTP ack');};
for($i=0;$i<2;$i++){try{qa_dispatch($config,'internal',$mail);}catch(RuntimeException $e){}}
check($calls===3,'uncertain SMTP acceptance prevents automatic duplicate');
$headersConfig=['endpoint'=>$allowed,'secret'=>'fixture-website-secret'];
$headers=qa_request_headers($headersConfig);check(count($headers)===2,'absent bypass preserves existing headers');
$headersConfig['vercelBypassSecret']='fixture-vercel-bypass';
$headers=qa_request_headers($headersConfig);check(in_array('x-vercel-protection-bypass: fixture-vercel-bypass',$headers,true),'server request includes optional Vercel bypass');
foreach(["bad\r\nInjected: yes","bad\nvalue"]as$bad){$headersConfig['vercelBypassSecret']=$bad;try{qa_request_headers($headersConfig);throw new LogicException('header injection accepted');}catch(RuntimeException $e){check(true,'bypass CRLF rejected');}}
$headersConfig['vercelBypassSecret']='fixture-vercel-bypass';$headersConfig['endpoint']='https://evil.test/api/website-inquiries';try{qa_request_headers($headersConfig);throw new LogicException('bypass leaked to external host');}catch(RuntimeException $e){check(true,'bypass not built for unapproved host');}
check(!str_contains(file_get_contents(__DIR__.'/../public/qa.mjs'),'protection-bypass')&&!str_contains(file_get_contents(__DIR__.'/../public/submission.mjs'),'VERCEL_BYPASS'),'bypass never exposed in browser modules');
$_SERVER['DOCUMENT_ROOT']=realpath(__DIR__.'/../public');
putenv('ROMIKU_QA_MAIL_MODE=capture');
putenv('ROMIKU_QA_PRIVATE_DIR='.$dir);putenv('ROMIKU_QA_CRM_ENDPOINT='.$allowed);putenv('ROMIKU_QA_WEBSITE_SECRET='.str_repeat('fixture-only',3));putenv('ROMIKU_QA_CATALOG_PATH='.$file);putenv('ROMIKU_QA_VERCEL_BYPASS_SECRET=fixture-vercel-bypass');
check(qa_config()['vercelBypassSecret']==='fixture-vercel-bypass','optional bypass loaded only from server environment');
putenv("ROMIKU_QA_VERCEL_BYPASS_SECRET=bad\r\nheader");try{qa_config();throw new LogicException('config accepted header injection');}catch(RuntimeException $e){check(true,'server bypass config rejects CRLF');}
putenv('ROMIKU_QA_VERCEL_BYPASS_SECRET');check(qa_config()['vercelBypassSecret']==='','missing optional bypass leaves configuration usable');
