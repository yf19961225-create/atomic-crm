# Read-only product image audit

Requires Python 3.10+, Pillow and curl. No Supabase/Cloudinary/Sanity credentials are used. Only public GET requests are sent; image bodies are decoded in memory, never uploaded or changed.

Full audit (choose a new local output directory):

```sh
python3 scripts/audit-product-images.py --output /private/tmp/romiku-images-YYYYMMDD
```

Incremental audit (checks new/changed exact-SKU candidate sets, explicitly marks unchanged SKUs not rechecked):

```sh
python3 scripts/audit-product-images.py --output /private/tmp/romiku-images-next --previous /private/tmp/romiku-images-YYYYMMDD/audit-results.json --cache /private/tmp/romiku-images-YYYYMMDD/url-results.jsonl
```

Use full mode periodically for unchanged URLs that may have expired. `--cache-hours 0` forces fresh verification. Default successful cache lifetime 24h; failed/blocked responses are rechecked. An interrupted directory can resume; completed reports are never overwritten. Default 4 workers, global request start interval 0.35s, at most one retry of transport/429/5xx, 25s timeout, 20MiB body limit. Keep these bounded; no scheduler is installed.

Outputs: `candidates.json`, per-URL `url-results.jsonl`, `audit-results.json`, `exceptions.json`. Public product names/URLs only, no customer/financial/credential data. Keep downloaded reports outside Git.

A means at least one original candidate decodes. B means original candidates did not decode in this run but an exact-SKU website candidate did. C means no original URL but website candidate decodes. D means no known candidate succeeds without an unresolved request error. F is an independent mapping-risk flag; it does not replace A/B/C/D/G availability classification. G means blocked/transport/unsupported/unchecked. A does not claim every gallery URL succeeds; inspect per-URL evidence. B does not establish that a 401 image is permanently deleted. D empty-data cases need manual product-data review; never reuse another SKU's image. E frontend rendering failure requires browser evidence, not just HTTP. Shared URL across variants is not alone proof of wrong mapping.

Redirects are not followed: a 3xx is reported as redirect_unverified, so an allowed public host cannot redirect the audit outside the allowlist.

HTTP 200 must decode through Pillow to pass. 401/403/429 or tooling/decode limitations require browser verification before declaring no image exists. API mapping and image content identity are separate checks. Browser decode may support formats unavailable in the local Pillow build; report those as unknown.

Tests (no network): `python3 -m unittest discover -s scripts -p 'test_audit_product_images.py'`.
