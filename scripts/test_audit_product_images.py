import importlib.util
import pathlib
import unittest
from unittest.mock import patch
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location('audit', pathlib.Path(__file__).with_name('audit-product-images.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class ImageAuditTests(unittest.TestCase):
    def test_exact_sku_mapping_does_not_borrow_normalized_neighbor(self):
        index = {'products': {'a': {'sku': 'NA-255'}}, 'productChunks': {'a': 'nail'}}
        chunks = {'nail': {'a': {'sku': 'NA-255', 'image': '/a.jpg'}}}
        self.assertEqual(audit.website_candidates('NA255', index, chunks), ([], []))
        self.assertEqual(audit.website_candidates('NA-255', index, chunks), (['https://romiku.com/a.jpg'], []))

    def test_ambiguous_or_mismatched_sku_is_rejected(self):
        index = {'products': {'a': {'sku': 'A'}, 'b': {'sku': 'A'}}}
        self.assertEqual(audit.website_candidates('A', index, {}), ([], ['ambiguous_exact_sku']))
        index = {'products': {'a': {'sku': 'A'}}, 'productChunks': {'a': 'nail'}}
        self.assertEqual(audit.website_candidates('A', index, {'nail': {'a': {'sku': 'B', 'image': '/b.jpg'}}}), ([], ['chunk_sku_mismatch_or_missing']))

    def test_all_gallery_candidates_preserve_order_without_duplicates(self):
        index = {'products': {'a': {'sku': 'A'}}, 'productChunks': {'a': 'nail'}}
        chunks = {'nail': {'a': {'sku': 'A', 'image': '/1.jpg', 'images': ['/1.jpg', '/2.jpg']}}}
        self.assertEqual(audit.website_candidates('A', index, chunks)[0], ['https://romiku.com/1.jpg', 'https://romiku.com/2.jpg'])

    def test_200_html_is_not_a_decoded_image(self):
        self.assertFalse(audit.decode_image(b'<html>error</html>')['decoded'])

    def test_blocked_is_unknown_not_missing_and_empty_with_good_fallback_is_c(self):
        good = {'decoded': True, 'http_status': 200, 'error': None}
        blocked = {'decoded': False, 'http_status': 403, 'error': None}
        missing = {'decoded': False, 'http_status': 404, 'error': None}
        self.assertEqual(audit.classify([], [good]), 'C')
        self.assertEqual(audit.classify([blocked], []), 'G')
        self.assertEqual(audit.classify([missing], []), 'D')
        self.assertEqual(audit.classify([blocked], [good]), 'B')
        self.assertEqual(audit.classify([good], []), 'A')

    def test_incremental_selection_checks_changed_candidates(self):
        before = {'sku': 'A', 'original_urls': ['https://romiku.com/1.jpg'], 'website_urls': []}
        self.assertFalse(audit.needs_check(before, before))
        self.assertTrue(audit.needs_check({**before, 'original_urls': ['https://romiku.com/2.jpg']}, before))
        self.assertTrue(audit.needs_check(before, None))

    def test_expired_cache_is_not_fresh_and_unknowns_are_rechecked(self):
        record = {'checked_at_epoch': 100, 'decoded': True}
        self.assertTrue(audit.cache_fresh(record, 110, 20))
        self.assertFalse(audit.cache_fresh(record, 130, 20))
        self.assertFalse(audit.cache_fresh({'checked_at_epoch':100,'decoded':False}, 110, 20))

    def test_mapping_flags_do_not_replace_source_availability(self):
        good = {'decoded': True, 'http_status': 200}
        row = {'original_results': [good], 'website_results': [], 'mapping_issues': ['ambiguous_exact_sku'], 'unsupported_image_shapes': []}
        self.assertEqual(audit.classify_row(row), ('A', ['F']))
        self.assertEqual(audit.classify_row({**row, 'original_results': []}), ('G', ['F']))

    def test_redirects_never_reach_untrusted_hosts(self):
        with patch.object(audit.subprocess, 'run', return_value=SimpleNamespace(stdout=b'body\n302', returncode=0)) as run:
            status, body, error = audit.Reader(0).get('https://romiku.com/test.jpg')
            self.assertNotIn('--location', run.call_args.args[0])
            self.assertEqual(status, 302)
            self.assertEqual(error, 'redirect_unverified')

if __name__ == '__main__':
    unittest.main()
