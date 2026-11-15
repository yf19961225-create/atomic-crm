-- Extends only the existing language enum-like checks; no data rewrite or ACL change.
ALTER TABLE public.romiku_quotes DROP CONSTRAINT romiku_quotes_document_language_check;
ALTER TABLE public.romiku_quotes ADD CONSTRAINT romiku_quotes_document_language_check CHECK (document_language IN ('zh', 'en', 'es', 'pt-BR'));
ALTER TABLE public.romiku_pis DROP CONSTRAINT romiku_pis_document_language_check;
ALTER TABLE public.romiku_pis ADD CONSTRAINT romiku_pis_document_language_check CHECK (document_language IN ('zh', 'en', 'es', 'pt-BR'));
ALTER TABLE public.romiku_orders DROP CONSTRAINT romiku_orders_document_language_check;
ALTER TABLE public.romiku_orders ADD CONSTRAINT romiku_orders_document_language_check CHECK (document_language IN ('zh', 'en', 'es', 'pt-BR'));
