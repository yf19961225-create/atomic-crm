#!/usr/bin/env python3
"""Offline allowlist packaging. Never access private config or remote services."""
import argparse,hashlib,json,zipfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('output',type=Path);a=p.parse_args();r=Path(__file__).resolve().parents[1]
files=['website-runtime/lib/pipeline.php','website-runtime/lib/mail.php','website-production/lib/runtime.php','website-production/mailer.php','website-production/handler.php','website-production/config.example.php','website-production/public/submit-rfq.php','website-production/public/submission.mjs','website-production/app.js.patch','website-production/app-source.sha256','website-production/prepare-app.py','website-production/extract-smtp.php','website-production/README.md','release/prepare-smtp-loader.py','release/SMTP-MOVE.md','release/ENV-PREFLIGHT.md']
if a.output.exists():raise SystemExit('Refusing to overwrite existing package')
manifest={f:hashlib.sha256((r/f).read_bytes()).hexdigest() for f in files}
with zipfile.ZipFile(a.output,'x',zipfile.ZIP_DEFLATED) as z:
 for f in files:z.write(r/f,f)
 z.writestr('MANIFEST.json',json.dumps(manifest,indent=2))
a.output.chmod(0o600)
print('Offline package prepared: '+str(a.output));print('SHA256 '+hashlib.sha256(a.output.read_bytes()).hexdigest())
