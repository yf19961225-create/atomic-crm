#!/usr/bin/env python3
"""Local/offline only. Emit patched copy; never overwrite original."""
import argparse,hashlib,subprocess,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
root=Path(__file__).resolve().parent
if a.output.exists() or a.source.resolve()==a.output.resolve():raise SystemExit('Output must be a new file')
if hashlib.sha256(a.source.read_bytes()).hexdigest()!=(root/'app-source.sha256').read_text().split()[0]:raise SystemExit('Source drift: re-audit before patching')
with tempfile.TemporaryDirectory() as d:
 f=Path(d)/'app.js';f.write_bytes(a.source.read_bytes())
 subprocess.run(['patch','--batch',str(f),str(root/'app.js.patch')],check=True)
 a.output.write_bytes(f.read_bytes())
print('Offline patched copy prepared; live source unchanged')
