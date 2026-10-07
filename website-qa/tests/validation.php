<?php
declare(strict_types=1);
require __DIR__.'/../lib/pipeline.php';
function check($condition,$message){if(!$condition)throw new RuntimeException($message);echo "PASS $message\n";}
$input=['submissionId'=>'123e4567-e89b-42d3-a456-426614174000','customer'=>['name'=>'Tester','email'=>'test@example.test','market'=>'Colombia'],'products'=>[['sku'=>'SUN5','qty'=>120]]];
$catalog=['SUN5'=>['sku'=>'SUN5','name'=>'Lamp','image'=>'./images/products-local/sun5.jpg']];
$cases=[];
$bad=$catalog;$bad['SUN5']['image']='./images/products-local/sun5.webp';$cases[]=[$input,$bad,'WebP image'];
$bad=$catalog;$bad['SUN5']['image']='./IMAGES/products-local/sun5.jpg';$cases[]=[$input,$bad,'noncanonical image path'];
foreach(['name'=>["\u{00a0}"],'market'=>['',"\u{00a0}",str_repeat('C',101)],'company'=>[str_repeat('C',201)],'brand'=>[str_repeat('B',201)]] as $field=>$values)foreach($values as $value){$bad=$input;$bad['customer'][$field]=$value;$cases[]=[$bad,$catalog,$field];}
foreach(['name'=>['',"\u{00a0}",str_repeat('N',501)],'cartonQty'=>[100000001,-1,INF],'cartonCbm'=>[1000001,-1,INF]]as$field=>$values)foreach($values as$value){$bad=$catalog;$bad['SUN5'][$field]=$value;$cases[]=[$input,$bad,$field];}
$bad=$catalog;$bad['SUN5']['parameters']=array_fill(0,11,['label'=>['en'=>'Spec'],'value'=>['en'=>str_repeat('S',1000)]]);$cases[]=[$input,$bad,'aggregate specification'];
$largeInput=$input;$largeInput['products']=array_fill(0,100,['sku'=>'SUN5','qty'=>120]);$largeCatalog=$catalog;$largeCatalog['SUN5']['name']=str_repeat('N',500);$largeCatalog['SUN5']['parameters']=[['value'=>str_repeat('S',10000)]];$cases[]=[$largeInput,$largeCatalog,'aggregate JSON body'];
foreach($cases as [$badInput,$badCatalog,$label]){
    $dir=sys_get_temp_dir().'/qa-validation-'.bin2hex(random_bytes(8));mkdir($dir,0700);$calls=0;
    $crm=function($payload)use(&$calls){$calls++;throw new RuntimeException('CRM must not be called');};
    try{qa_process($badInput,$badCatalog,$dir,$crm,fn()=>'',fn()=>null);throw new RuntimeException('Invalid submission accepted');}
    catch(InvalidArgumentException $error){check($calls===0 && !is_file($dir.'/'.$input['submissionId'].'.json'),'invalid '.$label.' rejected before state write and CRM');}
}
$good=$input;$good['customer']['market']=str_repeat('C',100);$good['customer']['company']=str_repeat('公',200);$good['customer']['brand']=str_repeat('B',200);$goodCatalog=$catalog;$goodCatalog['SUN5']['name']=str_repeat('N',500);$goodCatalog['SUN5']['cartonQty']=100000000;$goodCatalog['SUN5']['cartonCbm']=1000000;$goodCatalog['SUN5']['parameters']=[['value'=>str_repeat('S',10000)]];
$n=qa_normalize($good,$goodCatalog);check($n['company']===$good['customer']['company']&&strlen($n['items'][0]['specification'])===10000,'API boundary values preserved without truncation');
foreach(['png','jpg','jpeg'] as $extension){$supported=$catalog;$supported['SUN5']['image']='./images/products-local/sun5.'.$extension;$n=qa_normalize($input,$supported);check($n['items'][0]['image']==='https://romiku.com/images/products-local/sun5.'.$extension,'supported '.$extension.' image preserved');}
