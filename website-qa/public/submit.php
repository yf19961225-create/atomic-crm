<?php
declare(strict_types=1);
require __DIR__.'/../lib/runtime.php';
qa_gate();header('Content-Type: application/json; charset=utf-8');
function qa_respond(int $status,array $body): never {http_response_code($status);echo json_encode($body,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
if(($_SERVER['REQUEST_METHOD']??'')!=='POST'){header('Allow: POST');qa_respond(405,['success'=>false,'message'=>'POST required']);}
if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_ROMIKU_QA_CSRF']??''))qa_respond(403,['success'=>false,'message'=>'Reload the QA page']);
session_write_close();
if(!str_starts_with(strtolower($_SERVER['CONTENT_TYPE']??''),'application/json'))qa_respond(415,['success'=>false,'message'=>'JSON required']);
$raw=file_get_contents('php://input',false,null,0,262145);
if($raw===false || strlen($raw)>262144)qa_respond(413,['success'=>false,'message'=>'Inquiry is too large']);
try{$input=json_decode($raw,true,32);if(!is_array($input))throw new InvalidArgumentException('Invalid inquiry');
    $config=qa_config();
    // A saved local receipt is replayed without consulting a changed catalogue.
    $id=qa_uuid($input['submissionId']??'');$catalog=is_file($config['directory'].'/'.$id.'.json')?[]:qa_catalog($config['catalog']);
    $result=qa_process($input,$catalog,$config['directory'],
        fn($normalized)=>json_decode(qa_http($config,'/api/website-inquiries',$normalized),true,512,JSON_THROW_ON_ERROR),
        fn($receipt)=>qa_http($config,'/api/website-inquiry-xlsx',['id'=>$receipt['id'],'submissionId'=>$receipt['normalizedSubmission']['submissionId']],true),
        fn($kind,$mail)=>qa_dispatch($config,$kind,$mail));
    $result['notificationMode']=$config['mode'];$result['message']=$result['success']?($config['mode']==='capture'?'QA inquiry saved. Internal and customer notifications captured; no email was sent.':($config['mode']==='controlled-test'?'QA inquiry saved. Both test notifications accepted by the mail transport; inbox receipt must be verified.':'QA inquiry saved. Internal mail sent to ROMIKU; customer notification captured.')):$result['message'];
    qa_respond($result['success']?200:503,$result);
}catch(InvalidArgumentException $e){qa_respond(422,['success'=>false,'crmSaved'=>false,'code'=>'VALIDATION_ERROR','message'=>'Check the inquiry fields and product SKUs. Your draft is retained.']);}
catch(Throwable $e){qa_respond(503,['success'=>false,'crmSaved'=>false,'message'=>'The inquiry could not be confirmed. Your draft and submission ID are retained; retry this same submission.']);}
