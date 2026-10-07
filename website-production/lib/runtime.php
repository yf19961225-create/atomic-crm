<?php
declare(strict_types=1);
require_once __DIR__.'/../../website-runtime/lib/pipeline.php';
require_once __DIR__.'/../../website-runtime/lib/mail.php';
function production_endpoint(string $url): string {
 if($url!=='https://crm2.romiku.com/api/website-inquiries')throw new RuntimeException('Production target refused');
 return $url;
}
function production_http(array $c,string $path,array $payload,bool $binary=false): string {
 production_endpoint($c['endpoint']);
 if(!in_array($path,['/api/website-inquiries','/api/website-inquiry-xlsx'],true))throw new RuntimeException('Endpoint refused');
 if(strlen($c['secret']??'')<24||preg_match('/[\r\n]/',$c['secret']))throw new RuntimeException('Private credential unavailable');
 $h=curl_init('https://crm2.romiku.com'.$path);$body='';
 curl_setopt_array($h,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>qa_json_payload($payload),CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-ROMIKU-Website-Secret: '.$c['secret']],CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>70,CURLOPT_WRITEFUNCTION=>function($h,$part)use(&$body,$binary){if(strlen($body)+strlen($part)>($binary?20000000:2000000))return 0;$body.=$part;return strlen($part);}]);
 try{if(curl_exec($h)===false||curl_getinfo($h,CURLINFO_RESPONSE_CODE)<200||curl_getinfo($h,CURLINFO_RESPONSE_CODE)>=300)throw new RuntimeException('CRM service unavailable');
 if($binary&&!str_starts_with((string)curl_getinfo($h,CURLINFO_CONTENT_TYPE),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new RuntimeException('Attachment unavailable');return $body;
 }finally{curl_close($h);}
}
function production_dispatch(array $c,string $kind,array $mail): void {
 if(!in_array($kind,['internal','customer'],true))throw new RuntimeException('Notification refused');
 $id=qa_uuid($mail['submissionId']);$mail['recipient']=$kind==='internal'?$c['owner']:$mail['recipient'];
 if(!filter_var($mail['recipient'],FILTER_VALIDATE_EMAIL)||preg_match('/[\r\n]/',$mail['recipient']))throw new RuntimeException('Recipient invalid');
 if($kind==='customer'&&($mail['attachment']!==null||$mail['attachmentName']!==null))throw new RuntimeException('Customer attachment forbidden');
 $mail['messageId']='romiku-'.$id.'-'.$kind.'@romiku.com';
 $path=$c['directory'].'/'.$id.'.'.$kind.'.delivery.json';$s=is_file($path)?json_decode(file_get_contents($path),true,32,JSON_THROW_ON_ERROR):['state'=>'unsent'];
 if($s['state']==='accepted')return;
 if($s['state']!=='unsent')throw new RuntimeException('Acceptance uncertain; reconcile before retry');
 qa_atomic($path,json_encode(['state'=>'attempting','messageId'=>$mail['messageId']],JSON_THROW_ON_ERROR));
 $accepted=($c['mailer'])($mail); // Exceptions deliberately leave attempting, never blindly resend.
 qa_atomic($path,json_encode(['state'=>$accepted===true?'accepted':'unsent','messageId'=>$mail['messageId']],JSON_THROW_ON_ERROR));
 if($accepted!==true)throw new RuntimeException('Notification pending');
}
function production_process(array $c,array $input): array {
 return qa_process($input,qa_catalog($c['catalog']),$c['directory'],
 fn($p)=>json_decode(production_http($c,'/api/website-inquiries',$p),true,512,JSON_THROW_ON_ERROR),
 fn($r)=>production_http($c,'/api/website-inquiry-xlsx',['id'=>$r['id'],'submissionId'=>$r['normalizedSubmission']['submissionId']],true),
 fn($kind,$mail)=>production_dispatch($c,$kind,$mail));
}
