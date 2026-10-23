from pathlib import Path
import hashlib,zipfile,shutil,subprocess,sys
root=Path(__file__).resolve().parent
base=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(base.read_bytes()).hexdigest()==(root/'base-sha256.txt').read_text().strip(),'Base ZIP checksum mismatch'
inner=out/'installer-payload';shutil.copytree(root/'payload',inner,dirs_exist_ok=True)
with zipfile.ZipFile(base) as z:
 for name in ['Stelex-GPT-Setup-1.8.1.exe','Stelex-Admin-Portable-1.8.1.exe']:
  destination=inner/name if name.startswith('Stelex-GPT') else out/name
  destination.write_bytes(z.read(name))
installer=out/'STELEX-GPT-Setup-1.8.1-DeepSeek-Fix.exe'
subprocess.run(['makensis',f'-DINPUT_DIR={inner}',f'-DOUTPUT_FILE={installer}',str(root/'fix-installer.nsi')],check=True)
# Validate the compiled self-extractor's payload, including the mandatory update entrypoint.
unpacked=out/'verify-exe'
subprocess.run(['7z','x',str(installer),'-o'+str(unpacked),'-y'],check=True,stdout=subprocess.DEVNULL)
for p in inner.rglob('*'):
 if p.is_file():
  relative=p.relative_to(inner)
  candidates=[unpacked/relative,unpacked/'$PLUGINSDIR'/'Stelex'/relative,unpacked/'Stelex'/relative]
  matches=[item for item in candidates if item.is_file()]
  assert len(matches)==1,f'Unexpected embedded path: {relative}'
  embedded=matches[0]
  assert embedded.is_file(),f'Missing embedded file: {p.relative_to(inner)}'
  assert hashlib.sha256(embedded.read_bytes()).digest()==hashlib.sha256(p.read_bytes()).digest(),f'Embedded checksum mismatch: {p}'
repair=out/'STELEX-GPT-DeepSeek-Reparatur.zip'
with zipfile.ZipFile(repair,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
 for p in sorted((root/'payload').rglob('*')):
  name=p.relative_to(root/'payload').as_posix()
  if p.is_file() and name not in ['Install.bat','Install.bat.sha256','START-HIER.md','DEEPSEEK-LESEN.md','NEU-LESEN.md'] and not name.endswith('.exe.sha256'):
   z.write(p,name)
full=out/'STELEX-GPT-1.8.1-DeepSeek-Fix-Komplett.zip'
with zipfile.ZipFile(full,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
 z.write(installer,installer.name)
 z.write(out/'Stelex-Admin-Portable-1.8.1.exe','Stelex-Admin-Portable-1.8.1.exe')
 z.write(repair,repair.name)
 z.write(root/'payload/FIX-LESEN.md','START-HIER.md')
for p in [installer,repair,full]:
 p.with_suffix(p.suffix+'.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n')
for p in [repair,full]:
 with zipfile.ZipFile(p) as z:assert z.testzip() is None
print('Compiled installer payload verified. Repair ZIP, installer and full ZIP ready.')
