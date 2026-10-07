<?php
declare(strict_types=1);
function check($condition,$message){if(!$condition)throw new RuntimeException($message);echo "PASS $message\n";}
function request(string $path,array $headers=[],string $method='GET',string $body=''): array {
    $context=stream_context_create(['http'=>['method'=>$method,'header'=>implode("\r\n",$headers),'content'=>$body,'ignore_errors'=>true,'timeout'=>3]]);
    $result=@file_get_contents('http://127.0.0.1:18743/'.$path,false,$context);return [$http_response_header??[],$result];
}
$private=sys_get_temp_dir().'/qa-http-'.bin2hex(random_bytes(8));mkdir($private,0700);
$catalog=$private.'/products-data.js';file_put_contents($catalog,'window.ROMIKU_PRODUCTS = '.json_encode(['sun5'=>['sku'=>'SUN5','name'=>'Lamp','image'=>'./images/products-local/sun5.jpg']]).';');
$env=['ROMIKU_QA_VERCEL_BYPASS_SECRET'=>'fixture-vercel-bypass','ROMIKU_QA_PRIVATE_DIR'=>$private,'ROMIKU_QA_CATALOG_PATH'=>$catalog,'ROMIKU_QA_CRM_ENDPOINT'=>'https://romiku-crm-prod-git-codex-c-3bcd01-feng-yangs-projects-d31d0be2.vercel.app/api/website-inquiries','ROMIKU_QA_WEBSITE_SECRET'=>str_repeat('fixture-only',3),'ROMIKU_QA_ENABLED'=>'1','ROMIKU_QA_LOCAL_HTTP'=>'1','ROMIKU_QA_PASSWORD_HASH'=>password_hash('fixture-password',PASSWORD_DEFAULT)];
$server=proc_open([PHP_BINARY,'-S','127.0.0.1:18743','-t',__DIR__.'/../public'],[0=>['pipe','r'],1=>['file','/dev/null','a'],2=>['file','/dev/null','a']],$pipes,null,$env);
if(!is_resource($server))throw new RuntimeException('Cannot start test PHP server');
try{
    for($i=0;$i<30;$i++){usleep(50000);[$headers]=request('index.php');if($headers)break;}
    check(str_contains($headers[0]??'','401'),'QA page requires authentication');
    $auth='Authorization: Basic '.base64_encode('romiku-qa:fixture-password');[$headers,$html]=request('index.php',[$auth]);
    check(str_contains($headers[0]??'','200') && str_contains($html,'qa-csrf'),'authorized QA page exposes CSRF token');
    check(!str_contains($html,'Website-Secret')&&!str_contains($html,'vercel.app')&&!str_contains($html,'fixture-vercel-bypass'),'server integration config absent from page');
    preg_match('/name="qa-csrf" content="([^"]+)"/',$html,$csrf);
    $cookie='';foreach($headers as $header)if(str_starts_with(strtolower($header),'set-cookie:'))$cookie=explode(';',substr($header,12))[0];
    $input=['submissionId'=>'123e4567-e89b-42d3-a456-426614174000','customer'=>['name'=>'Tester','email'=>'test@example.test','market'=>'Colombia'],'products'=>[['sku'=>'SUN5','qty'=>120]]];
    foreach(['market'=>'','company'=>str_repeat('C',201),'brand'=>str_repeat('B',201)] as $field=>$value){
        $invalid=$input;$invalid['customer'][$field]=$value;
        [$responseHeaders,$body]=request('submit.php',[$auth,'Content-Type: application/json','Cookie: '.$cookie,'X-ROMIKU-QA-CSRF: '.$csrf[1]],'POST',json_encode($invalid));
        $result=json_decode($body,true);
        check(str_contains($responseHeaders[0]??'','422')&&($result['code']??'')==='VALIDATION_ERROR'&&$result['crmSaved']===false,'HTTP invalid '.$field.' returns editable validation response');
        check(!is_file($private.'/'.$input['submissionId'].'.json'),'HTTP invalid '.$field.' leaves no frozen server submission');
    }

    [$headers]=request('submit.php',[$auth,'Content-Type: application/json'],'POST','{}');check(str_contains($headers[0]??'','403'),'POST without session CSRF denied');
    [$headers]=request('submit.php',[$auth]);check(str_contains($headers[0]??'','405'),'endpoint rejects GET');
}finally{proc_terminate($server);proc_close($server);}
$env['ROMIKU_QA_ENABLED']='0';$server=proc_open([PHP_BINARY,'-S','127.0.0.1:18743','-t',__DIR__.'/../public'],[0=>['pipe','r'],1=>['file','/dev/null','a'],2=>['file','/dev/null','a']],$pipes,null,$env);
try{for($i=0;$i<30;$i++){usleep(50000);[$headers]=request('index.php',[$auth]);if($headers)break;}check(str_contains($headers[0]??'','404'),'disabled QA page is unavailable');}finally{proc_terminate($server);proc_close($server);}
