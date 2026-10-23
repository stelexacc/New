from pathlib import Path
import hashlib,sys,zipfile
source=Path(sys.argv[1]);output=Path(sys.argv[2]);output.mkdir(parents=True,exist_ok=True)
installer=source/'STELEX-GPT-Setup-1.8.1-DeepSeek-Fix.exe';repair=source/'STELEX-GPT-DeepSeek-Reparatur.zip'
for file in [installer,repair]:assert hashlib.sha256(file.read_bytes()).hexdigest()==file.with_suffix(file.suffix+'.sha256').read_text().split()[0],file.name
readme='''STELEX GPT – alles in einem Ordner\n\nNeuinstallation / Aktualisierung:\nSTELEX-GPT-Setup-1.8.1-DeepSeek-Fix.exe starten. Dieses Setup enthaelt auch die DeepSeek-, Free-Limit- und Plugin-Ergaenzungen.\n\nDeepSeek bei bestehender Installation nachruesten:\nAlle Stelex-Apps schliessen und im Unterordner DeepSeek-Reparatur die Datei DeepSeek-Reparieren.bat starten. Das Modell wird danach heruntergeladen (ca. 5 GB).\n\nDas Admin-Tool ist absichtlich nicht enthalten. Es gibt dafuer einen separaten Download. Chats und bestehende Modelle werden von der Reparatur nicht geloescht.\n\nDetails und Pruefgrenzen: DeepSeek-Reparatur/FIX-LESEN.md.\n'''
archive=output/'STELEX-GPT-1.8.1-Alles-in-einem-Ordner.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
 z.write(installer,'STELEX-GPT/'+installer.name)
 z.write(installer.with_suffix('.exe.sha256'),'STELEX-GPT/'+installer.name+'.sha256')
 z.writestr('STELEX-GPT/START-HIER.txt',readme)
 with zipfile.ZipFile(repair) as r:
  assert r.testzip() is None
  for name in r.namelist():
   assert not name.startswith('/') and '..' not in Path(name).parts
   z.writestr('STELEX-GPT/DeepSeek-Reparatur/'+name,r.read(name))
with zipfile.ZipFile(archive) as z:
 assert z.testzip() is None
 assert all(name.startswith('STELEX-GPT/') for name in z.namelist())
 assert all('Stelex-Admin-Portable' not in name for name in z.namelist())
 assert hashlib.sha256(z.read('STELEX-GPT/'+installer.name)).hexdigest()==hashlib.sha256(installer.read_bytes()).hexdigest()
 print('Verified:',len(z.namelist()),'files, one top-level folder, Admin excluded;',archive.stat().st_size,'bytes')
archive.with_suffix('.zip.sha256').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n')
