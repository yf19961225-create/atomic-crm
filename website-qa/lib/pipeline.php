<?php
declare(strict_types=1);

function qa_text($value, int $max = 2000): string {
    if (!is_string($value) && !is_numeric($value) && $value !== null) throw new InvalidArgumentException('Invalid text field');
    $text=trim((string)$value);
    // Match JavaScript/Zod UTF-16 length, without truncating Unicode customer data.
    $characters=preg_match_all('/./us',$text);
    $surrogatePairs=preg_match_all('/[\x{10000}-\x{10FFFF}]/u',$text);
    if ($characters===false || $surrogatePairs===false || $characters+$surrogatePairs>$max || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/',$text)) throw new InvalidArgumentException('Invalid text field');
    return $text;
}
function qa_has_content(string $value): bool {
    // JS String.trim() also treats Unicode separators and BOM as whitespace.
    return preg_match('/[^\p{Z}\s\x{FEFF}]/u',$value)===1;
}
function qa_json_payload(array $payload): string {
    $json=json_encode($payload,JSON_THROW_ON_ERROR);
    if(strlen($json)>1048576)throw new InvalidArgumentException('Normalized inquiry exceeds CRM body limit');
    return $json;
}
function qa_uuid($value): string {
    $id=strtolower(qa_text($value,36));
    if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/D',$id)) throw new InvalidArgumentException('Valid submission ID required');
    return $id;
}
function qa_localized($value,int $max=10000): string { return qa_text(is_array($value)?($value['en']??$value['zh']??''):$value,$max); }
function qa_optional_number($value,float $max): ?float {
    if($value===null || $value==='')return null;
    if(!is_numeric($value) || !is_finite((float)$value) || (float)$value<0 || (float)$value>$max)throw new InvalidArgumentException('Invalid packing value');
    return (float)$value;
}
function qa_catalog(string $file): array {
    // Parse the server's static assignment as JSON. Never execute JavaScript or query Sanity.
    $source=file_get_contents($file);
    if (!is_string($source) || !preg_match('/^\s*window\.ROMIKU_PRODUCTS\s*=\s*(\{.*\})\s*;?\s*$/s',$source,$match)) throw new RuntimeException('Static product catalogue unavailable');
    $products=json_decode($match[1],true,512,JSON_THROW_ON_ERROR);$catalog=[];
    foreach ($products as $product) {
        $sku=strtoupper(qa_text($product['sku']??'',120));
        if ($sku==='') continue;
        if (isset($catalog[$sku]) && $catalog[$sku]!==$product) throw new RuntimeException('Ambiguous catalogue SKU');
        $catalog[$sku]=$product;
    }
    return $catalog;
}
function qa_normalize(array $input,array $catalog): array {
    $customer=$input['customer']??[];
    if (!is_array($customer)) throw new InvalidArgumentException('Customer required');
    $email=qa_text($customer['email']??'',254);
    if (!filter_var($email,FILTER_VALIDATE_EMAIL) || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/D',$email)) throw new InvalidArgumentException('Valid email required');
    $name=qa_text($customer['name']??'',200);
    if (!qa_has_content($name)) throw new InvalidArgumentException('Name required');
    $country=qa_text($customer['market']??'',100);
    if(!qa_has_content($country))throw new InvalidArgumentException('Country / Market required');
    $company=qa_text($customer['company']??'',200);
    $brand=qa_text($customer['brand']??'',200);
    $products=$input['products']??[];
    if (!is_array($products) || count($products)<1 || count($products)>100) throw new InvalidArgumentException('Select 1–100 products');
    $items=[];
    foreach ($products as $selected) {
        if (!is_array($selected)) throw new InvalidArgumentException('Invalid product');
        $sku=strtoupper(qa_text($selected['sku']??'',120));if(!qa_has_content($sku))throw new InvalidArgumentException('SKU required');$product=$catalog[$sku]??null;
        if (!$product) throw new InvalidArgumentException('Unknown SKU');
        $quantity=$selected['qty']??null;
        if ((!is_numeric($quantity)) || !preg_match('/^\d{1,11}(?:\.\d{1,4})?$/D',(string)$quantity) || (float)$quantity<=0) throw new InvalidArgumentException('Positive quantity with at most 4 decimals required');
        $image=qa_text($product['image']??'',1000);
        $image=preg_replace('~^(?:https://romiku\.com/|\./|/)~','',$image);
        if (!preg_match('~^images/products-local/[A-Za-z0-9_/-]+\.(?i:jpe?g|png)$~D',$image) || str_contains($image,'..')) throw new InvalidArgumentException('Catalogue image must be a local PNG or JPEG product image');
        $spec=[];foreach (($product['parameters']??[]) as $parameter) {
            $value=qa_localized($parameter['value']??'');$label=qa_localized($parameter['label']??'');
            if($value!=='')$spec[]=($label!==''?$label.': ':'').$value;
        }
        $carton=qa_optional_number($product['cartonQty']??null,100000000);$cbm=qa_optional_number($product['cartonCbm']??null,1000000);
        $productName=qa_localized($product['localizedInquiryName']??$product['localizedName']??$product['english']??$product['name']??$sku,500);
        if(!qa_has_content($productName))throw new InvalidArgumentException('Product name required');
        $specification=qa_text(implode("\n",$spec),10000);
        $unit=qa_text($product['unit']??'',40);
        if ($unit==='' && preg_match('/\d\s+(PCS|SETS?|PAIRS?|BOTTLES?)\b/i',$product['moq']??'',$m))$unit=strtoupper($m[1]);
        $items[]=['sku'=>$sku,'productName'=>$productName,'image'=>'https://romiku.com/'.$image,'specification'=>$specification,'quantity'=>(float)$quantity,'requirement'=>qa_text($selected['notes']??'',5000),'unit'=>$unit,...($carton!==null?['cartonQty'=>$carton]:[]),...($cbm!==null?['cartonCbm'=>$cbm]:[])];
    }
    $normalized=['submissionId'=>qa_uuid($input['submissionId']??''),'customerName'=>$name,'company'=>$company,'brand'=>$brand,'email'=>$email,'whatsapp'=>qa_text($customer['whatsapp']??'',100),'country'=>$country,'message'=>qa_text($customer['notes']??'',5000),'items'=>$items];
    qa_json_payload($normalized);
    return $normalized;
}
function qa_atomic(string $path,string $body): void {
    $tmp=tempnam(dirname($path),'.pending-');if($tmp===false)throw new RuntimeException('State storage unavailable');
    try {chmod($tmp,0600);$handle=fopen($tmp,'wb');if(!$handle)throw new RuntimeException('State storage unavailable');
        try {if(fwrite($handle,$body)!==strlen($body) || !fflush($handle))throw new RuntimeException('State storage unavailable');if(function_exists('fsync')&&!fsync($handle))throw new RuntimeException('State storage unavailable');}finally{fclose($handle);}
        if(!rename($tmp,$path))throw new RuntimeException('State storage unavailable');
    }finally{if(is_file($tmp))unlink($tmp);}
}
function qa_mail(string $kind,array $receipt,?string $attachment): array {
    $s=$receipt['normalizedSubmission'];$escape=fn($s)=>htmlspecialchars((string)$s,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');$rows='';
    foreach($s['items'] as $item){$rows.='<tr><td>'.$escape($item['sku']).'</td><td>'.$escape($item['productName']).'</td>';
        if($kind==='internal')$rows.='<td>'.nl2br($escape($item['specification']."\n".$item['requirement'])).'</td>';
        $rows.='<td>'.$escape($item['quantity']).'</td>'.($kind==='internal'?'<td>'.$escape($item['cartonQty']??'').'</td>':'').'</tr>';
    }
    $html='<h1>'.($kind==='internal'?'ROMIKU Website Inquiry '.$escape($receipt['document_number']):'Your inquiry has been received').'</h1>';
    if($kind==='internal'){
        $html.='<p>Date: '.$escape($receipt['submitted_at']).'</p>';
        foreach(['customerName'=>'Name','company'=>'Company','brand'=>'Brand','email'=>'Email','whatsapp'=>'WhatsApp','country'=>'Market','message'=>'Notes']as$key=>$label)$html.='<p><strong>'.$label.':</strong> '.nl2br($escape($s[$key]??'')).'</p>';
    }else{$html.='<p>Hello '.$escape($s['customerName']).', thank you for your inquiry. Our team will contact you by email.</p>';}
    $html.='<table><thead><tr><th>SKU</th><th>Product</th>'.($kind==='internal'?'<th>Specs / Notes</th>':'').'<th>'.($kind==='internal'?'Request Qty':'Qty').'</th>'.($kind==='internal'?'<th>Carton Qty</th>':'').'</tr></thead><tbody>'.$rows.'</tbody></table>';
    return ['subject'=>$kind==='internal'?'ROMIKU Website Inquiry '.$receipt['document_number']:'Your inquiry has been received','html'=>$html,'recipient'=>$kind==='customer'?$s['email']:null,'attachment'=>$kind==='internal'?$attachment:null,'attachmentName'=>$kind==='internal'?$receipt['document_number'].'.xlsx':null,'submissionId'=>$s['submissionId']];
}
function qa_process(array $input,array $catalog,string $directory,callable $crm,callable $attachment,callable $send): array {
    $id=qa_uuid($input['submissionId']??'');$lock=fopen($directory.'/'.$id.'.lock','c');
    if(!$lock || !flock($lock,LOCK_EX))throw new RuntimeException('State storage unavailable');
    chmod($directory.'/'.$id.'.lock',0600);
    try {
        $path=$directory.'/'.$id.'.json';$state=is_file($path)?json_decode(file_get_contents($path),true,512,JSON_THROW_ON_ERROR):[];
        $save=function()use(&$state,$path){qa_atomic($path,json_encode($state,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES));};
        if(!isset($state['submission'])){$state=['submission'=>qa_normalize($input,$catalog),'notifications'=>['internal'=>'pending','customer'=>'pending']];$save();}
        $cached=isset($state['receipt']);
        if(!$cached){
            $receipt=$crm($state['submission']);
            if(($receipt['success']??false)!==true || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD',$receipt['id']??'') || !preg_match('/^WI-[A-Za-z0-9-]+$/D',$receipt['document_number']??'') || empty($receipt['submitted_at']) || ($receipt['normalizedSubmission']['submissionId']??null)!==$id || empty($receipt['normalizedSubmission']['items']))throw new RuntimeException('Invalid CRM receipt');
            $state['receipt']=$receipt;$save();
        }
        $receipt=$state['receipt'];
        foreach(['internal','customer']as$kind){
            if($state['notifications'][$kind]==='sent')continue;
            try {
                $bytes=null;
                if($kind==='internal'){$bytes=$attachment($receipt);if(!is_string($bytes)||!str_starts_with($bytes,'PK'))throw new RuntimeException('Invalid workbook');}
                $send($kind,qa_mail($kind,$receipt,$bytes));$state['notifications'][$kind]='sent';$save();
            }catch(Throwable $e){$state['notifications'][$kind]='pending';$save();}
        }
        $complete=!in_array('pending',$state['notifications'],true);
        return ['success'=>$complete,'crmSaved'=>true,'replay'=>$cached||($receipt['replay']??false),'document_number'=>$receipt['document_number'],'submitted_at'=>$receipt['submitted_at'],'notifications'=>$state['notifications'],'message'=>$complete?'Your inquiry has been received.':'Inquiry saved. Some notifications are pending; retry this same submission.'];
    }finally{flock($lock,LOCK_UN);fclose($lock);}
}
