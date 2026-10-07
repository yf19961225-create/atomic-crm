<?php
declare(strict_types=1);
// This file only references existing configuration. It contains no credentials.
require_once '/home/romilnrk/public_html/api/config.php';
require_once __DIR__.'/existing-smtp-functions.php';
return static function(array $mail): bool {
 return qa_local_mail($mail,static function($to,$subject,$body,$headers){
  foreach([ROMIKU_FROM_NAME,ROMIKU_FROM_EMAIL,ROMIKU_OWNER_EMAIL] as $value)if(preg_match('/[\r\n]/',$value))throw new RuntimeException('Sender identity invalid');
  $headers='From: =?UTF-8?B?'.base64_encode(ROMIKU_FROM_NAME).'?= <'.ROMIKU_FROM_EMAIL.'>'.substr($headers,strpos($headers,"\r\n"));
  return smtp_send_raw($to,'To: '.$to."\r\nSubject: ".$subject."\r\nDate: ".gmdate('D, d M Y H:i:s O')."\r\nReply-To: ".ROMIKU_OWNER_EMAIL."\r\n".$headers."\r\n\r\n".$body);
 });
};
