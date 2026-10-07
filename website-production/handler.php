<?php
declare(strict_types=1);
ini_set('display_errors','0');umask(0077);
require_once __DIR__.'/lib/runtime.php';
header('Cache-Control: no-store');header('Content-Type: application/json');header('X-Content-Type-Options: nosniff');
function production_response(int $status,array $data): never {http_response_code($status);echo json_encode($data);exit;}
try {
 if(($_SERVER['HTTPS']??'')!=='on')production_response(400,['ok'=>false,'code'=>'HTTPS_REQUIRED']);
 $file='/home/romilnrk/romiku-private/website-intake/config.php';
 if(!is_file($file))production_response(503,['ok'=>false,'code'=>'INTAKE_NOT_CONFIGURED']);
 $c=require $file;
 if(($c['enabled']??false)!==true)production_response(503,['ok'=>false,'code'=>'INTAKE_PAUSED']);
 production_endpoint($c['endpoint']);
 $private=realpath($c['directory']);$web=realpath($_SERVER['DOCUMENT_ROOT']);
 if(!$private||!$web||str_starts_with($private,$web.'/')||$private===$web||!is_writable($private))throw new RuntimeException('Private state unavailable');
 session_name('romiku_intake');session_set_cookie_params(['secure'=>true,'httponly'=>true,'samesite'=>'Strict','path'=>'/api/']);session_start();$_SESSION['csrf']??=bin2hex(random_bytes(24));
 if($_SERVER['REQUEST_METHOD']==='GET'&&($_GET['csrf']??'')==='1')production_response(200,['csrf'=>$_SESSION['csrf']]);
 if($_SERVER['REQUEST_METHOD']!=='POST')production_response(405,['ok'=>false,'code'=>'METHOD_NOT_ALLOWED']);
 if(!in_array($_SERVER['HTTP_ORIGIN']??'',['https://romiku.com','https://www.romiku.com'],true)||!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_ROMIKU_CSRF']??''))production_response(403,['ok'=>false,'code'=>'REQUEST_REFUSED']);
 session_write_close();
 if(strtolower(explode(';',$_SERVER['CONTENT_TYPE']??'')[0])!=='application/json')production_response(415,['ok'=>false,'code'=>'JSON_REQUIRED']);
 $body=file_get_contents('php://input',false,null,0,1048577);if(strlen($body)>1048576)production_response(413,['ok'=>false,'code'=>'BODY_TOO_LARGE']);
 $input=json_decode($body,true);if(json_last_error()!==JSON_ERROR_NONE||!is_array($input))throw new InvalidArgumentException('Invalid submission');
 // Bound per-IP public submissions using a private lock. No untrusted IP header is used.
 $rate=fopen($private.'/rate-'.hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown').'.json','c+');if(!$rate||!flock($rate,LOCK_EX))throw new RuntimeException('Rate state unavailable');
 $times=json_decode(stream_get_contents($rate),true)?:[];$times=array_values(array_filter($times,fn($t)=>is_int($t)&&$t>time()-60));
 if(count($times)>=10){flock($rate,LOCK_UN);fclose($rate);production_response(429,['ok'=>false,'code'=>'RETRY_LATER']);}
 $times[]=time();ftruncate($rate,0);rewind($rate);fwrite($rate,json_encode($times));fflush($rate);flock($rate,LOCK_UN);fclose($rate);
 define('ROMIKU_API_BOOTSTRAPPED',true);$c['mailer']=require __DIR__.'/mailer.php';
 $result=production_process($c,$input);
 production_response($result['success']?200:503,$result+['ok'=>$result['success'],'reference'=>$result['document_number'],'crmSynced'=>true]);
}catch(InvalidArgumentException $e){production_response(422,['ok'=>false,'code'=>'VALIDATION_ERROR']);}
catch(Throwable $e){production_response(503,['ok'=>false,'code'=>'INTAKE_UNAVAILABLE','message'=>'Retry the same submission.']);}
