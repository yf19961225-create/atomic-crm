import importlib.util,unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('p',Path(__file__).with_name('production_readonly.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
class GuardTests(unittest.TestCase):
 def test_target(self):
  self.assertEqual(p.validate_target('postgresql://postgres.vddjodsbmuarshnytyvb:fixture@aws-0-ca-central-1.pooler.supabase.com:5432/postgres'),p.TARGET)
 def test_rejects(self):
  for v in ['postgresql://postgres.ciwaibtotispazfviims:fixture@aws-0-ca-central-1.pooler.supabase.com:5432/postgres','postgresql://postgres.vddjodsbmuarshnytyvb:fixture@evil.test:5432/postgres','postgresql://postgres.vddjodsbmuarshnytyvb:fixture@aws-0-ca-central-1.pooler.supabase.com:6543/postgres','postgresql://postgres.vddjodsbmuarshnytyvb:fixture@aws-0-ca-central-1.pooler.supabase.com:5432/postgres?options=evil']:
   with self.assertRaises(ValueError):p.validate_target(v)
 def test_drift(self):
  d=p.compare({'columns':{'a':1,'b':2}},{'columns':{'a':3,'c':4}})['columns'];self.assertEqual(d,{'missing':['b'],'changed':['a'],'extra':['c']})
if __name__=='__main__':unittest.main()
