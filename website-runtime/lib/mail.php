<?php
declare(strict_types=1);
/** Shared MIME encoder. Dispatch validates recipients and maintains the delivery journal. */
function qa_local_mail(array $mail,?callable $transport=null): bool {
    foreach(['recipient','subject','messageId','attachmentName']as$key){
        $value=$mail[$key]??null;
        if($value!==null && (!is_string($value) || preg_match('/[\r\n]/',$value)))throw new RuntimeException('Unsafe mail header');
    }
    if(!filter_var($mail['recipient']??'',FILTER_VALIDATE_EMAIL) || !preg_match('/^(?:qa|romiku)-[a-f0-9-]+-(internal|customer)@romiku\.com$/D',$mail['messageId']??''))throw new RuntimeException('Invalid message identity');
    $headers="From: ROMIKU <info@romiku.com>\r\nMIME-Version: 1.0\r\nMessage-ID: <".$mail['messageId'].">";
    $subject='=?UTF-8?B?'.base64_encode($mail['subject']).'?=';
    $html=chunk_split(base64_encode($mail['html']),76,"\r\n");
    if($mail['attachment']===null){
        $headers.="\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64";$body=$html;
    }else{
        if(!preg_match('/^WI-[A-Za-z0-9-]+\.xlsx$/D',$mail['attachmentName']??''))throw new RuntimeException('Invalid attachment name');
        $boundary='romiku_mail_'.bin2hex(random_bytes(16));
        $headers.="\r\nContent-Type: multipart/mixed; boundary=\"".$boundary.'"';
        $body='--'.$boundary."\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".$html;
        $body.='--'.$boundary."\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\nContent-Disposition: attachment; filename=\"".$mail['attachmentName']."\"\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($mail['attachment']),76,"\r\n").'--'.$boundary."--\r\n";
    }
    $transport??=static fn($to,$subject,$body,$headers)=>mail($to,$subject,$body,$headers);
    // Local MTA acceptance is not proof of arrival in the recipient inbox.
    return $transport($mail['recipient'],$subject,$body,$headers)===true;
}
