<?php
// EXAMPLE ONLY: do not install until separately authorized. No credential is packaged.
return [
 'enabled'=>false,
 'endpoint'=>'https://crm2.romiku.com/api/website-inquiries',
 'secret'=>require '/home/romilnrk/romiku-private/website-intake/shared-secret.php',
 'owner'=>'info@romiku.com', // Confirm against existing ROMIKU_OWNER_EMAIL before enable.
 'directory'=>'/home/romilnrk/romiku-private/website-intake/state',
 'catalog'=>'/home/romilnrk/public_html/products-data.js', // Verify real static catalogue path.
];
