from pathlib import Path
import hashlib,json,sys,zipfile
root=Path(__file__).resolve().parent
base=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(base.read_bytes()).hexdigest()==(root/'base-sha256.txt').read_text().strip(),'Unexpected base ZIP checksum'
expected=json.loads((root/'expected-contents.json').read_text())
entries={}
with zipfile.ZipFile(base) as z:
 for name in z.namelist():
  assert '/' not in name and '\\' not in name,'Unexpected base path'
  entries[name]=z.read(name)
for p in (root/'payload').rglob('*'):
 if p.is_file():entries[p.relative_to(root/'payload').as_posix()]=p.read_bytes()
assert set(entries)==set(expected),'Package membership mismatch'
for name,data in entries.items():assert hashlib.sha256(data).hexdigest()==expected[name],f'Content mismatch: {name}'
package=out/'STELEX-GPT-1.8.1-DeepSeek-FreeLimits-Plugins.zip'
with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=1) as z:
 for name in sorted(entries):
  info=zipfile.ZipInfo(name,date_time=(2026,10,23,14,26,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
  z.writestr(info,entries[name],compresslevel=1)
with zipfile.ZipFile(package) as z:assert z.testzip() is None
package.with_suffix('.zip.sha256').write_text(hashlib.sha256(package.read_bytes()).hexdigest()+'  '+package.name+'\n')
print(f'Verified {len(entries)} files, {package.stat().st_size} bytes')
