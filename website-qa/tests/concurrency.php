<?php
declare(strict_types=1);
require __DIR__.'/../lib/pipeline.php';
if(($argv[1]??'')==='worker'){
    $dir=$argv[2];$input=['submissionId'=>'123e4567-e89b-42d3-a456-426614174000','customer'=>['name'=>'Tester','email'=>'test@example.test','market'=>'Colombia'],'products'=>[['sku'=>'SUN5','qty'=>120]]];$catalog=['SUN5'=>['sku'=>'SUN5','name'=>'Lamp','image'=>'./images/products-local/sun5.jpg']];
    $crm=function($submission)use($dir){file_put_contents($dir.'/crm.calls',"create\n",FILE_APPEND|LOCK_EX);usleep(150000);return ['success'=>true,'replay'=>false,'id'=>'123e4567-e89b-42d3-a456-426614174001','document_number'=>'WI-1','submitted_at'=>'2026-10-01','normalizedSubmission'=>$submission];};
    echo json_encode(qa_process($input,$catalog,$dir,$crm,fn($receipt)=>'PK fixture',function($kind,$mail)use($dir){file_put_contents($dir.'/mail.calls',$kind."\n",FILE_APPEND|LOCK_EX);}));exit;
}
$dir=sys_get_temp_dir().'/qa-concurrency-'.bin2hex(random_bytes(8));mkdir($dir,0700);$workers=[];
for($i=0;$i<2;$i++){$process=proc_open([PHP_BINARY,__FILE__,'worker',$dir],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);$workers[]=[$process,$pipes];}
foreach($workers as[$process,$pipes]){fclose($pipes[0]);$output=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($process)!==0 || !(json_decode($output,true)['success']??false))throw new RuntimeException('Concurrent worker failed '.$error);}
if(file_get_contents($dir.'/crm.calls')!=="create\n" || file_get_contents($dir.'/mail.calls')!=="internal\ncustomer\n")throw new RuntimeException('Duplicate concurrent notification or CRM call');
echo "PASS concurrent PHP requests share one CRM receipt and one notification per channel\n";
