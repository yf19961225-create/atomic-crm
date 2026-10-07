<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'||$argc!==3||is_file($argv[2]))throw new RuntimeException('CLI source and new private output required');
$source=$argv[1];
$wanted=['clean_text','smtp_password','smtp_read','smtp_expect','smtp_write','smtp_command','smtp_data_escape','smtp_send_raw'];
$tokens=token_get_all(file_get_contents($source));$functions=[];
for($i=0;$i<count($tokens);$i++){
 if(!is_array($tokens[$i])||$tokens[$i][0]!==T_FUNCTION)continue;
 $start=$i;$j=$i+1;while(isset($tokens[$j])&&is_array($tokens[$j])&&$tokens[$j][0]===T_WHITESPACE)$j++;
 if(!isset($tokens[$j])||!is_array($tokens[$j])||$tokens[$j][0]!==T_STRING||!in_array($tokens[$j][1],$wanted,true))continue;
 $name=$tokens[$j][1];$depth=0;$began=false;$body='';
 for($k=$start;$k<count($tokens);$k++){
  $t=$tokens[$k];$body.=is_array($t)?$t[1]:$t;
  if($t==='{'){$depth++;$began=true;}elseif($t==='}')$depth--;
  if($began&&$depth===0)break;
 }
 if(!$began||$depth!==0||isset($functions[$name]))throw new RuntimeException('Unexpected transport source');
 $functions[$name]=$body;$i=$k;
}
if(count($functions)!==count($wanted))throw new RuntimeException('Missing transport function');
$out="<?php\ndeclare(strict_types=1);\n// Exact function declarations from existing website; no submit-handler top-level execution.\n".implode("\n",array_values($functions));
umask(0077);file_put_contents($argv[2],$out);chmod($argv[2],0600);echo "SMTP declarations prepared; original handler not executed.\n";
