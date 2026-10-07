<?php
declare(strict_types=1);
require __DIR__.'/../lib/mail.php';
function check($ok,$message){if(!$ok)throw new RuntimeException($message);echo "PASS $message\n";}
$mail=['recipient'=>'internal@example.com','subject'=>'ROMIKU Website Inquiry WI-TEST','html'=>'<p>Name: QA Buyer</p>','messageId'=>'qa-123e4567-e89b-42d3-a456-426614174000-internal@romiku.com','attachment'=>'PK workbook bytes','attachmentName'=>'WI-TEST.xlsx'];
$calls=[];$transport=function(...$args)use(&$calls){$calls[]=$args;return true;};
check(qa_local_mail($mail,$transport),'local transport accepted internal MIME');
[$to,$subject,$body,$headers]=$calls[0];
check($to==='internal@example.com','MIME transport uses only supplied controlled recipient');
check(str_contains($headers,'multipart/mixed') && str_contains($body,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') && str_contains($body,base64_encode('PK workbook bytes')),'internal MIME attaches exact workbook bytes');
check(str_contains($body,base64_encode('<p>Name: QA Buyer</p>')),'HTML encoded without changing business content');
$customer=$mail;$customer['recipient']='customer-test@example.com';$customer['attachment']=null;$customer['attachmentName']=null;
qa_local_mail($customer,$transport);
check(str_contains($calls[1][3],'text/html') && !str_contains($calls[1][3],'multipart') && !str_contains($calls[1][2],'workbook'),'customer MIME is HTML only without XLSX');
foreach(['recipient','subject','messageId','attachmentName']as$key){$bad=$mail;$bad[$key].="\r\nBcc: real@example.com";try{qa_local_mail($bad,$transport);throw new LogicException('header injection accepted');}catch(RuntimeException $e){check(count($calls)===2,'unsafe '.$key.' rejected before local transport');}}
check(qa_local_mail($mail,fn(...$args)=>false)===false,'definite local transport rejection remains retryable');
