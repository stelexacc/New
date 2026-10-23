from pathlib import Path
import hashlib,json,shutil,subprocess,sys,zipfile,re
root=Path(__file__).resolve().parent;base=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(base.read_bytes()).hexdigest()==(root/'base-sha256.txt').read_text().strip(),'Base ZIP mismatch'
original=out/'original-setup.exe'
with zipfile.ZipFile(base) as z:original.write_bytes(z.read('Stelex-GPT-Setup-1.8.1.exe'))
client=out/'client-files'
subprocess.run(['7z','x',str(original),'-o'+str(client),'-y','-x!Uninstall Stelex GPT.exe','-x!$PLUGINSDIR/*'],check=True,stdout=subprocess.DEVNULL)
removed=['Stelex Admin.exe','resources/private-admin.bundle.json','resources/app/desktop/admin-bundle.cjs']+[p.relative_to(client).as_posix() for p in (client/'resources/app/desktop').glob('locked-admin*')]
cleanup=out/'cleanup';cleanup.mkdir(exist_ok=True);hashes=[]
for name in removed:
 p=client/name
 if p.is_file():hashes.append({'path':name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()});p.unlink()
(cleanup/'old-admin-hashes.json').write_text(json.dumps(hashes,indent=2)+'\n')
shutil.copyfile(root/'client/Remove-BundledAdmin.ps1',cleanup/'Remove-BundledAdmin.ps1')
for name in ['$PLUGINSDIR','resources/app/admin']:
 p=client/name
 if p.exists():shutil.rmtree(p)
# Install all tested application extensions directly; no nested legacy installer.
manifest=json.loads((root/'payload/Stelex-Update/manifest.json').read_text())
for item in manifest:
 src=root/'payload/Stelex-Update'/item['path'];assert hashlib.sha256(src.read_bytes()).hexdigest()==item['sha256']
 dst=client/'resources/app'/item['path'];dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,dst)
models=json.loads((client/'resources/app/config/models.json').read_text(encoding='utf-8-sig'))
assert len(models)==5 and any(m['id']=='stelex-deepseek-r1-abliterated:8b' for m in models)
(client/'models.json').write_text(json.dumps(models,ensure_ascii=False,indent=2)+'\n')
selector=client/'Select-Components.ps1';s=selector.read_text(encoding='utf-8-sig')
for a,b in [("Drawing.Size(690,620)","Drawing.Size(690,([Math]::Max(620,428+48*@($Catalog).Count)))"),('Drawing.Point(25,320)','Drawing.Point(25,$Y)'),('Drawing.Point(25,365)','Drawing.Point(25,($Y+45))'),("Label '' 420 70","Label '' ($Y+100) 70"),('Drawing.Point(370,505)','Drawing.Point(370,($Y+185))')]:
 assert a in s,a;s=s.replace(a,b)
selector.write_text(s,encoding='utf-8-sig')
package=client/'resources/app/package.json';data=json.loads(package.read_text());data['stelexRole']='client';package.write_text(json.dumps(data,indent=2)+'\n')
(client/'resources/app/desktop/entry.cjs').write_text("'use strict';\nrequire('./main.cjs');\n")
for name in ['Setup-Client.ps1','Install.bat']:shutil.copyfile(root/'client'/name,client/name)
shutil.copyfile(root/'payload/Wait-StelexBackend.ps1',client/'Wait-StelexBackend.ps1')
(client/'Install.bat.sha256').write_text(hashlib.sha256((client/'Install.bat').read_bytes()).hexdigest()+'  Install.bat\n')
readme='''STELEX GPT – Client ohne Admin\n\nDas Setup installiert ausschliesslich den Chat-Client mit DeepSeek-Auswahl, Free-Limits und Plugins. Eine Stelex-Admin-EXE, das private Admin-Bundle und die Admin-Oberflaeche sind nicht enthalten. Der alte kombinierte Installer ist weder eingebettet noch wird er heruntergeladen.\n\nSetup starten, Zielordner und gewuenschte Modelle auswaehlen. DeepSeek ist die fuenfte Option; die Modellgewichte werden bei Auswahl ueber Ollama heruntergeladen (ca. 5 GB).\n\nBestehende Chats und Modelle bleiben erhalten. Beim Upgrade wird ausschliesslich die bekannte frueher gebuendelte Admin-Kopie anhand ihrer Pruefsummen entfernt. Separat installierte oder veraenderte Admin-Dateien und persoenliche Daten werden nicht geloescht.\n\nWeitere Modelle koennen spaeter ueber Install.bat im installierten Programmordner eingerichtet werden; dieses Skript laedt keinen alten Installer.\n\nPruefung: Payload, Modellkataloge und Abwesenheit von Admin-Dateien werden vor Veroeffentlichung automatisiert geprueft. Der Windows-Installer wird unter Linux gebaut und extrahiert geprueft; kein vollstaendiger Windows-End-to-End-Test.\n'''
(client/'README.md').write_text(readme,encoding='utf-8-sig');(client/'START-HERE.txt').write_text(readme)
for p in client.rglob('*'):
 if p.is_file():
  rel=p.relative_to(client).as_posix()
  assert p.name.lower() not in ['stelex admin.exe','private-admin.bundle.json','original-setup.exe'],rel
  assert not p.name.startswith('locked-admin') and p.name!='admin-bundle.cjs',rel
  assert not rel.startswith('resources/app/admin/'),rel
assert 'releases/download' not in (client/'Install.bat').read_text()
# Uninstall only installed payload files, preserving files added by the user.
delete=out/'uninstall-files.nsh';lines=[]
for p in sorted(client.rglob('*')):
 if p.is_file():lines.append('Delete "$INSTDIR\\'+p.relative_to(client).as_posix().replace('/','\\')+'"')
for p in sorted((p for p in client.rglob('*') if p.is_dir()),key=lambda p:len(p.parts),reverse=True):lines.append('RMDir "$INSTDIR\\'+p.relative_to(client).as_posix().replace('/','\\')+'"')
delete.write_text('\n'.join(lines)+'\n')
installer=out/'STELEX-GPT-Setup-1.8.1-Client-Only.exe'
subprocess.run(['makensis',f'-DINPUT_DIR={client}',f'-DCLEANUP_DIR={cleanup}',f'-DDELETE_MANIFEST={delete}',f'-DOUTPUT_FILE={installer}',str(root/'client/client-installer.nsi')],check=True)
check=out/'verify-client-installer';subprocess.run(['7z','x',str(installer),'-o'+str(check),'-y','-x!Uninstall Stelex GPT.exe'],check=True,stdout=subprocess.DEVNULL)
for p in client.rglob('*'):
 if p.is_file():
  relative=p.relative_to(client);embedded=check/relative
  assert embedded.is_file(),f'Missing compiled payload: {relative}'
  assert hashlib.sha256(embedded.read_bytes()).digest()==hashlib.sha256(p.read_bytes()).digest(),str(relative)
for p in check.rglob('*'):
 if p.is_file():
  assert p.name.lower() not in ['stelex admin.exe','private-admin.bundle.json','original-setup.exe']
  assert not p.name.startswith('locked-admin') and p.name!='admin-bundle.cjs'
# Publish a manifest so the client-only content can be reviewed independently.
audit={p.relative_to(client).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(client.rglob('*')) if p.is_file()}
(out/'STELEX-GPT-Client-Only-Dateiliste.json').write_text(json.dumps(audit,indent=2)+'\n')
archive=out/'STELEX-GPT-1.8.1-Nur-Client-Ordner.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=1) as z:
 z.write(installer,'STELEX-GPT/'+installer.name)
 z.writestr('STELEX-GPT/START-HIER.txt',readme)
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
for p in [installer,archive]:p.with_suffix(p.suffix+'.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n')
print('CLIENT-ONLY VERIFIED:',len(audit),'payload files; no Admin EXE, private bundle, Admin UI or nested legacy setup.')
