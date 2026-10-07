#!/usr/bin/env python3
"""Prepare a separate loader copy; never execute config, read secret, or overwrite source."""
import argparse,os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
old="$romikuSmtpSecretPath = __DIR__ . '/smtp-secret.php';"
new="$romikuSmtpSecretPath = '/home/romilnrk/romiku-private/smtp/smtp-secret.php';"
s=a.source.read_text()
if s.count(old)!=1:raise SystemExit('Loader drift: expected exactly one audited assignment')
fd=os.open(a.output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write(s.replace(old,new))
print('Loader copy prepared; original and credentials unchanged')
