# Order XLSX-first PDF POC worker

This directory is a disposable **Preview-only** LibreOffice conversion POC.
It accepts only a short-lived signed URL for an already rendered final Order
XLSX. It does not accept an Order id and it does not read Supabase tables,
Sanity, Product Library, Formal Customer, or seller data.

## Environment boundary

- Supabase target must be romiku-crm-preview / ciwaibtotispazfviims.
- PREVIEW_STORAGE_ORIGIN must be
  https://ciwaibtotispazfviims.supabase.co.
- ORDER_PDF_POC_TOKEN is a worker-only short-lived bearer secret; never
  commit or expose it in browser code.
- The input Storage bucket is private. The browser-side uploader owns removal
  of its object after it receives the streamed PDF; the worker has no
  Supabase service role or database credentials.

## Font preflight

The worker must run preflightTemplateFonts against the **same XLSX bytes**
being converted. Its legal compatibility map is explicit:

| Template family | Worker family |
| --- | --- |
| Arial | Liberation Sans |
| Songti SC Regular | Noto Serif CJK SC |
| 宋体 | Noto Serif CJK SC |

Do not upload, commit, or install a user's local font files. If the image
cannot resolve this map or the user rejects the resulting visual comparison,
stop the LibreOffice path rather than changing the approved XLSX renderer.

## Endpoint

POST /convert accepts the JSON body with sourceUrl set to a short-lived signed
XLSX URL and the Authorization Bearer POC token. The source URL must be HTTPS
and exactly match PREVIEW_STORAGE_ORIGIN; redirects, non-XLSX content, and
oversized inputs are rejected before LibreOffice starts.

The worker creates a unique directory below /tmp, uses a fresh LibreOffice
profile, streams the resulting PDF, and removes local files in finally. It
must not log source URLs, document content, PDF bytes, or credentials.

## POC operating sequence

1. Confirm Preview project ref and private bucket policy before upload.
2. Export a saved real Preview Order from the existing CRM XLSX button.
3. Run worker font preflight on those exact XLSX bytes.
4. Upload the XLSX to the private bucket with a short signed URL; call this
   worker; download the streamed PDF; remove the input object from the
   authenticated uploader in a finally path.
5. Repeat for a 3--5 product order and a 20+ product order.
6. Present each matching XLSX/PDF pair for human visual approval. Do not
   enable the CRM PDF button unless the POC is accepted.
