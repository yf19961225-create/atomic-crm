<?php
require __DIR__.'/../lib/mail.php';
require __DIR__.'/../lib/smtp-reuse.php';
function ok($v,$m){if(!$v)throw new RuntimeException($m);echo "PASS $m\n";}
$m=['recipient'=>'yf19961225@gmail.com','subject'=>'Inquiry','html'=>'<p>Saved qty 120</p>','messageId'=>'qa-eb90d6ce-8f63-4f44-a805-969ebf15eac3-internal@romiku.com','attachment'=>'PK exact bytes','attachmentName'=>'WI-000226.xlsx','submissionId'=>'eb90d6ce-8f63-4f44-a805-969ebf15eac3'];
$identity=['email'=>'info@romiku.com','name'=>'ROMIKU NAILS','replyTo'=>'info@romiku.com'];$calls=[];
$transport=function($to,$raw)use(&$calls){$calls[]=[$to,$raw];return true;};
ok(qa_reused_smtp($m,$identity,$transport),'existing SMTP callback accepts QA MIME');
ok(count($calls)===1 && $calls[0][0]==='yf19961225@gmail.com','single allowlisted envelope recipient');
ok(str_contains($calls[0][1],'Reply-To: info@romiku.com')&&str_contains($calls[0][1],'Subject: ')&&str_contains($calls[0][1],base64_encode('PK exact bytes')),'sender config and exact workbook preserved');
foreach(['recipient'=>'real@example.com','submissionId'=>'123e4567-e89b-42d3-a456-426614174000'] as $key=>$val){$bad=$m;$bad[$key]=$val;try{qa_reused_smtp($bad,$identity,$transport);throw new LogicException('unsafe send');}catch(RuntimeException $e){ok(count($calls)===1,'reject '.$key.' before SMTP');}}
$badIdentity=$identity;$badIdentity['name'].="\r\nBcc: bad@example.com";try{qa_reused_smtp($m,$badIdentity,$transport);throw new LogicException('unsafe identity');}catch(RuntimeException $e){ok(count($calls)===1,'reject identity header injection');}
$c=$m;$c['messageId']=str_replace('internal','customer',$m['messageId']);$c['attachment']=null;$c['attachmentName']=null;
qa_reused_smtp($c,$identity,$transport);ok(!str_contains($calls[1][1],'multipart')&&!str_contains($calls[1][1],'.xlsx'),'customer has no attachment');
