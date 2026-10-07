<?php
declare(strict_types=1);
require_once __DIR__.'/pipeline.php';
const QA_PREVIEW_HOST='romiku-crm-prod-git-codex-c-3bcd01-feng-yangs-projects-d31d0be2.vercel.app';
function qa_endpoint(string $value): string {
    if ($value!=='https://'.QA_PREVIEW_HOST.'/api/website-inquiries') throw new RuntimeException('Preview endpoint is not allowed');
    return $value;
}
function qa_bypass_secret($value): string {
    if(!is_string($value) || preg_match('/[\r\n]/',$value))throw new RuntimeException('Invalid server bypass configuration');
    return $value;
}
function qa_request_headers(array $config): array {
    // Never construct credentials for a caller-selected host.
    qa_endpoint($config['endpoint']);
    $headers=['Content-Type: application/json','X-ROMIKU-Website-Secret: '.$config['secret']];
    $bypass=qa_bypass_secret($config['vercelBypassSecret']??'');
    if($bypass!=='')$headers[]='x-vercel-protection-bypass: '.$bypass;
    return $headers;
}
function qa_config(): array {
    $directory=realpath(getenv('ROMIKU_QA_PRIVATE_DIR')?:'');$root=realpath($_SERVER['DOCUMENT_ROOT']??'');
    if(!$directory || !$root || $directory===$root || str_starts_with($directory,$root.DIRECTORY_SEPARATOR) || !is_writable($directory))throw new RuntimeException('Private state storage must be outside document root');
    $endpoint=qa_endpoint(getenv('ROMIKU_QA_CRM_ENDPOINT')?:'');
    $secret=getenv('ROMIKU_QA_WEBSITE_SECRET')?:'';
    if(strlen($secret)<24 || preg_match('/[\r\n]/',$secret))throw new RuntimeException('Server credential unavailable');
    $bypass=qa_bypass_secret(getenv('ROMIKU_QA_VERCEL_BYPASS_SECRET')?:'');
    $catalog=realpath(getenv('ROMIKU_QA_CATALOG_PATH')?:'');
    if(!$catalog || !is_file($catalog))throw new RuntimeException('Static catalogue unavailable');
    $mode=getenv('ROMIKU_QA_MAIL_MODE')?:'capture';
    if(!in_array($mode,['capture','internal-only'],true))throw new RuntimeException('Invalid QA mail mode');
    $mailer=null;
    if($mode==='internal-only'){
        $file=realpath(getenv('ROMIKU_QA_MAILER_FILE')?:'');
        if(!$file || !str_starts_with($file,$directory.DIRECTORY_SEPARATOR) || !is_file($file))throw new RuntimeException('Private mailer unavailable');
        $mailer=require $file;
        if(!is_callable($mailer))throw new RuntimeException('Private mailer unavailable');
    }
    return ['directory'=>$directory,'endpoint'=>$endpoint,'secret'=>$secret,'vercelBypassSecret'=>$bypass,'catalog'=>$catalog,'mode'=>$mode,'mailer'=>$mailer];
}
function qa_gate(): void {
    header('Cache-Control: no-store');header('X-Robots-Tag: noindex, nofollow');header('X-Content-Type-Options: nosniff');header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://romiku.com; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    $enabled=getenv('ROMIKU_QA_ENABLED')==='1';$hash=getenv('ROMIKU_QA_PASSWORD_HASH')?:'';
    $secure=($_SERVER['HTTPS']??'')==='on';$local=in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true) && getenv('ROMIKU_QA_LOCAL_HTTP')==='1';
    if(!$enabled || (!$secure&&!$local) || $hash===''){http_response_code(404);exit;}
    if(($_SERVER['PHP_AUTH_USER']??'')!=='romiku-qa' || !password_verify($_SERVER['PHP_AUTH_PW']??'',$hash)){header('WWW-Authenticate: Basic realm="ROMIKU controlled QA"');http_response_code(401);exit;}
    session_name('romiku_qa');session_set_cookie_params(['secure'=>$secure,'httponly'=>true,'samesite'=>'Strict','path'=>'/']);session_start();
    $_SESSION['csrf']??=bin2hex(random_bytes(24));
}
function qa_http(array $config,string $path,array $payload,bool $binary=false): string {
    qa_endpoint($config['endpoint']);
    if(!in_array($path,['/api/website-inquiries','/api/website-inquiry-xlsx'],true))throw new RuntimeException('Endpoint is not allowed');
    if(!function_exists('curl_init'))throw new RuntimeException('PHP cURL is required');
    $handle=curl_init('https://'.QA_PREVIEW_HOST.$path);$body='';$tooLarge=false;
    curl_setopt_array($handle,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>qa_json_payload($payload),CURLOPT_HTTPHEADER=>qa_request_headers($config),CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT=>10,CURLOPT_TIMEOUT=>60,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$body,&$tooLarge,$binary){if(strlen($body)+strlen($chunk)>($binary?20000000:2000000)){$tooLarge=true;return 0;}$body.=$chunk;return strlen($chunk);}]);
    try{$ok=curl_exec($handle);$status=curl_getinfo($handle,CURLINFO_RESPONSE_CODE);$type=curl_getinfo($handle,CURLINFO_CONTENT_TYPE);
        // Never log remote bodies, cURL diagnostics or credentials.
        if(!$ok || $tooLarge || $status<200 || $status>=300)throw new RuntimeException('Preview service unavailable');
        if($binary && !str_starts_with((string)$type,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw new RuntimeException('Invalid attachment response');
        return $body;
    }finally{curl_close($handle);}
}
function qa_capture(string $directory,string $kind,array $mail,string $delivery='captured; not sent'): void {
    if(!in_array($kind,['internal','customer'],true))throw new RuntimeException('Invalid notification');
    $id=qa_uuid($mail['submissionId']);$path=$directory.'/'.$id.'.'.$kind.'.capture.json';
    // Deterministic filenames make capture idempotent even after a process dies before its ledger update.
    if(is_file($path))return;
    $mail['delivery']=$delivery;
    if($mail['attachment']!==null){$filename=$id.'.internal.xlsx';qa_atomic($directory.'/'.$filename,$mail['attachment']);$mail['attachment']=$filename;}
    qa_atomic($path,json_encode($mail,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));
}

function qa_dispatch(array $config,string $kind,array $mail): void {
    if($config['mode']==='capture' || $kind==='customer'){qa_capture($config['directory'],$kind,$mail);return;}
    if($config['mode']!=='internal-only' || $kind!=='internal' || !is_callable($config['mailer']))throw new RuntimeException('Mail mode unavailable');
    $path=$config['directory'].'/'.qa_uuid($mail['submissionId']).'.internal.delivery.json';
    $delivery=is_file($path)?json_decode(file_get_contents($path),true,32,JSON_THROW_ON_ERROR):['state'=>'unsent'];
    if($delivery['state']==='attempting')throw new RuntimeException('Mail acceptance uncertain; operator reconciliation required');
    if($delivery['state']!=='accepted'){
        $mail['recipient']='info@romiku.com';
        $mail['messageId']='qa-'.$mail['submissionId'].'-internal@romiku.com';
        qa_atomic($path,json_encode(['state'=>'attempting'],JSON_THROW_ON_ERROR));
        // Contract: true = SMTP accepted; false = definitely NOT accepted; throw = unknown.
        $accepted=($config['mailer'])($mail);
        if($accepted!==true){qa_atomic($path,json_encode(['state'=>'unsent'],JSON_THROW_ON_ERROR));throw new RuntimeException('Internal mail not accepted');}
        qa_atomic($path,json_encode(['state'=>'accepted'],JSON_THROW_ON_ERROR));
    }
    qa_capture($config['directory'],$kind,$mail,'internal mail accepted by configured transport');
}
