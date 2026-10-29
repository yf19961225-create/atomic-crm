<?php
require __DIR__.'/../../website-runtime/lib/pipeline.php';
function check($v,$m){if(!$v)throw new RuntimeException($m);echo "PASS $m\n";}
$i=['submissionId'=>'123e4567-e89b-42d3-a456-426614174000','customer'=>['name'=>'QA','company'=>'QA Company','brand'=>'QA Brand','email'=>'qa@example.test','market'=>'Mexico','whatsapp'=>'+521234567890','notes'=>'Original note'],'products'=>[['sku'=>'Ab-01','qty'=>1.2345,'notes'=>'First'],['sku'=>'OTHER','qty'=>2.5]]];
$c=['AB-01'=>['sku'=>'Ab-01','name'=>'Exact product','image'=>'./images/products-local/a.jpg','unit'=>'PCS','cartonQty'=>24], 'OTHER'=>['sku'=>'OTHER','name'=>'Other product','image'=>'']];
$n=qa_normalize($i,$c);
check($n['items'][0]['sku']==='Ab-01','original catalog SKU preserved');
check($n['items'][0]['quantity']===1.2345 && $n['items'][1]['quantity']===2.5,'ordered decimal quantities preserved');
check($n['items'][1]['image']==='','empty image remains empty, no borrowed image');
check($n['company']==='QA Company' && $n['brand']==='QA Brand' && $n['whatsapp']==='+521234567890','customer data preserved');
check($n['items'][0]['cartonQty']===24.0 && $n['items'][0]['unit']==='PCS','reliable packing preserved');
