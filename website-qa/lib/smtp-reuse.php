<?php
declare(strict_types=1);
/** Only this explicitly authorized QA submission and recipient may reach the existing transport. */
function qa_reused_smtp(array $mail,array $identity,callable $smtp): bool {
    if(($mail['recipient']??'')!=='yf19961225@gmail.com' || ($mail['submissionId']??'')!=='eb90d6ce-8f63-4f44-a805-969ebf15eac3')throw new RuntimeException('QA SMTP recipient or submission refused');
    foreach(['email','name','replyTo'] as $key)if(!is_string($identity[$key]??null)||preg_match('/[\r\n]/',$identity[$key]))throw new RuntimeException('Invalid sender identity');
    if(!filter_var($identity['email'],FILTER_VALIDATE_EMAIL)||!filter_var($identity['replyTo'],FILTER_VALIDATE_EMAIL))throw new RuntimeException('Invalid sender address');
    return qa_local_mail($mail,static function($to,$subject,$body,$headers)use($identity,$smtp){
        $from='From: =?UTF-8?B?'.base64_encode($identity['name']).'?= <'.$identity['email'].'>';
        $headers=$from.substr($headers,strpos($headers,"\r\n"));
        $raw='To: '.$to."\r\nSubject: ".$subject."\r\nDate: ".gmdate('D, d M Y H:i:s O')."\r\nReply-To: ".$identity['replyTo']."\r\n".$headers."\r\n\r\n".$body;
        return $smtp($to,$raw);
    });
}
