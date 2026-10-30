#!/usr/bin/env python3
"""Read-only public product-image audit. Requires Python 3.10+, Pillow and curl.
No database access, credentials, source writes or uploaded image content.
"""
import argparse
import concurrent.futures
from collections import Counter
import hashlib
import io
import json
from pathlib import Path
import subprocess
import threading
import time
from urllib.parse import urlencode, urljoin, urlparse
from PIL import Image

HOSTS = {'romiku.com', 'www.romiku.com', 'res.cloudinary.com', 'cdn.sanity.io', 'gxuvcyaa.api.sanity.io'}
QUERY = '*[_type == "product" && !(_id in path("drafts.**")) && isPublished == true] | order(coalesce(sku,""),_id){_id,_updatedAt,sku,name,images}'

def object_after(text, marker):
    return json.JSONDecoder().raw_decode(text[text.index('{', text.index(marker) + len(marker)):])[0]

def website_candidates(sku, index, chunks):
    keys = [k for k, p in index.get('products', {}).items() if isinstance(p, dict) and p.get('sku') == sku]
    if len(keys) > 1:
        return [], ['ambiguous_exact_sku']
    if not keys:
        return [], []
    key = keys[0]
    chunk = chunks.get(index.get('productChunks', {}).get(key), {})
    if 'audit_error' in chunk:
        return [], ['chunk_unavailable']
    product = chunk.get(key, {})
    if product.get('sku') != sku:
        return [], ['chunk_sku_mismatch_or_missing']
    values = [product.get('image')] + (product.get('images') if isinstance(product.get('images'), list) else [])
    return list(dict.fromkeys(urljoin('https://romiku.com/', u) for u in values if isinstance(u, str) and u)), []

def decode_image(body):
    try:
        with Image.open(io.BytesIO(body)) as img:
            img.load()
            return {'decoded': True, 'dimensions': list(img.size), 'format': img.format, 'error': None}
    except Exception as exc:
        return {'decoded': False, 'dimensions': None, 'format': None, 'error': 'decode_' + type(exc).__name__}

def classify(original, website):
    if any(r['decoded'] for r in original):
        return 'A'
    if any(r['decoded'] for r in website):
        return 'B' if original else 'C'
    if any(r.get('http_status') in (401, 403, 429) or r.get('error') or r.get('http_status') is None or r.get('http_status', 0) >= 500 for r in original + website):
        return 'G'
    return 'D'

def classify_row(row):
    flags = ['F'] if row['mapping_issues'] else []
    category = classify(row['original_results'], row['website_results'])
    if category == 'D' and (flags or row['unsupported_image_shapes']):
        category = 'G'
    return category, flags

def needs_check(current, previous):
    return previous is None or any(current.get(k) != previous.get(k) for k in ('original_urls', 'website_urls', 'mapping_issues', 'unsupported_image_shapes'))

def cache_fresh(record, now, max_age):
    return bool(record and record.get('decoded') and 0 <= now - record.get('checked_at_epoch', 0) <= max_age)

class Reader:
    def __init__(self, interval):
        self.interval = interval
        self.next_request = 0
        self.lock = threading.Lock()

    def get(self, url):
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname not in HOSTS or parsed.username or parsed.password:
            return None, b'', 'untrusted_url'
        with self.lock:
            delay = max(0, self.next_request - time.monotonic())
            self.next_request = max(self.next_request, time.monotonic()) + self.interval
        time.sleep(delay)
        p = subprocess.run(['curl', '--silent', '--show-error', '--proto', '=https', '--max-time', '25', '--max-filesize', '20971520', '--user-agent', 'ROMIKU-ReadOnly-Image-Audit/1.0', '--write-out', '\n%{http_code}', url], capture_output=True)
        body, _, status = p.stdout.rpartition(b'\n')
        code = int(status) if status.isdigit() else None
        error = 'transport_' + str(p.returncode) if p.returncode else ('redirect_unverified' if code and 300 <= code < 400 else None)
        return code, body, error

    def required_text(self, url):
        status, body, error = self.get(url)
        if status != 200 or error:
            raise RuntimeError('inventory_request_failed: status=' + str(status) + ', category=' + str(error))
        return body.decode('utf-8')

    def check(self, url):
        started = time.monotonic()
        status, body, error = self.get(url)
        attempts = 1
        if error or status == 429 or (status is not None and status >= 500):
            time.sleep(2)
            status, body, error = self.get(url)
            attempts = 2
        decoded = decode_image(body) if status == 200 and not error else {'decoded': False, 'error': error}
        return {'url': url, 'http_status': status, **decoded, 'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest() if decoded['decoded'] else None, 'elapsed_ms': round((time.monotonic()-started)*1000), 'attempts': attempts, 'checked_at_epoch': time.time(), 'checked_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'browser_confirmation_required': status in (401,403,429) or bool(decoded.get('error'))}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New report directory (outside Git recommended)')
    parser.add_argument('--catalog-file', type=Path, help='Optional current public Sanity result JSON')
    parser.add_argument('--previous', type=Path, help='Incremental: previous audit-results.json; unchanged SKUs recorded as not rechecked')
    parser.add_argument('--cache', type=Path, help='Optional previous url-results.jsonl')
    parser.add_argument('--cache-hours', type=float, default=24)
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=4)
    parser.add_argument('--interval', type=float, default=.35, help='Global request launch interval; minimum 0.35s')
    args = parser.parse_args()
    if args.interval < .35 or args.cache_hours < 0:
        parser.error('interval must be >= 0.35 and cache-hours >= 0')
    args.output.mkdir(parents=True, exist_ok=True)
    if (args.output/'audit-results.json').exists():
        parser.error('Completed output exists; select a new output directory')
    reader = Reader(args.interval)
    catalog_raw = args.catalog_file.read_text() if args.catalog_file else reader.required_text('https://gxuvcyaa.api.sanity.io/v2025-07-05/data/query/production?' + urlencode({'query': QUERY}))
    catalog = json.loads(catalog_raw)['result']
    index = object_after(reader.required_text('https://romiku.com/data/products-index.js'), 'window.ROMIKU_PRODUCT_INDEX =')
    chunks = {}
    for category, filename in index.get('chunks', {}).items():
        if not isinstance(filename, str) or '/' in filename or not filename.startswith('products-') or not filename.endswith('.js'):
            raise RuntimeError('Unexpected website chunk filename')
        try:
            chunks[category] = object_after(reader.required_text('https://romiku.com/data/' + filename), 'window.ROMIKU_PRODUCTS || {},')
        except (RuntimeError, ValueError):
            chunks[category] = {'audit_error': True}
    previous = {r['id']: r for r in json.loads(args.previous.read_text())['products']} if args.previous else {}
    rows = []
    for product in catalog:
        images = product.get('images') or []
        website, issues = website_candidates(product.get('sku'), index, chunks)
        row = {'id': product['_id'], 'sku': product.get('sku'), 'name': product.get('name'), 'updated_at': product.get('_updatedAt'), 'original_urls': list(dict.fromkeys(i['url'] for i in images if isinstance(i, dict) and isinstance(i.get('url'), str) and i['url'])), 'website_urls': website, 'mapping_issues': issues, 'unsupported_image_shapes': [i for i in images if not isinstance(i, dict) or not isinstance(i.get('url'), str)]}
        row['check_selected'] = not args.previous or needs_check(row, previous.get(row['id']))
        rows.append(row)
    (args.output/'candidates.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    urls = {u for r in rows if r['check_selected'] for u in r['original_urls'] + r['website_urls']}
    cache_path = args.output/'url-results.jsonl'
    cache = {}
    for path in (args.cache, cache_path):
        if path and path.exists():
            for line in path.read_text().splitlines():
                r = json.loads(line)
                if cache_fresh(r, time.time(), args.cache_hours*3600):
                    cache[r['url']] = r
    print(json.dumps({'products':len(rows),'selected_products':sum(r['check_selected'] for r in rows),'unique_urls':len(urls),'cached':len(urls & cache.keys())}), flush=True)
    with cache_path.open('a') as out, concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(reader.check, sorted(urls-cache.keys())):
            cache[result['url']] = result
            out.write(json.dumps(result, ensure_ascii=False)+'\n')
            out.flush()
            if len(cache)%100 == 0:
                print(json.dumps({'checked_urls':len(urls & cache.keys()),'total_urls':len(urls)}), flush=True)
    for row in rows:
        row['frontend_rendering_verified'] = False
        if not row['check_selected']:
            row['provisional_category'] = 'G'
            row['reason'] = 'incremental_unchanged_not_rechecked'
            row['previous_evidence'] = previous.get(row['id'])
            continue
        row['original_results'] = [cache[u] for u in row['original_urls']]
        row['website_results'] = [cache[u] for u in row['website_urls']]
        row['provisional_category'], row['risk_flags'] = classify_row(row)
    report = {'scope':'published Sanity products','created_at_utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'counts':dict(Counter(r['provisional_category'] for r in rows)), 'products':rows,'notes':['Image HTTP/decode availability only; E frontend failures and F visual/mapping risks require browser evidence.', 'Blocked original with decoded fallback means fallback available, not proof original permanently deleted.', 'D empty known candidate lists require manual data review; never borrow a different SKU image.']}
    (args.output/'audit-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    (args.output/'exceptions.json').write_text(json.dumps([r for r in rows if r['provisional_category'] in ('D','G') or r.get('risk_flags')], ensure_ascii=False, indent=2))
    print(json.dumps({'complete':True,'counts':report['counts']}), flush=True)

if __name__ == '__main__':
    main()
