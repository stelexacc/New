from pathlib import Path
import sys,zipfile,hashlib,subprocess,json,shutil
root=Path(__file__).resolve().parent;base=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True)
assert hashlib.sha256(base.read_bytes()).hexdigest()==(root/'base-sha256.txt').read_text().strip()
original=out/'original-admin.exe'
with zipfile.ZipFile(base) as z:original.write_bytes(z.read('Stelex-Admin-Portable-1.8.1.exe'))
subprocess.run(['7z','x',str(original),'-o'+str(out/'admin-extracted'),'-y'],check=True,stdout=subprocess.DEVNULL)
source=out/'admin-extracted/$PLUGINSDIR/StelexAdmin';app=source/'resources/app'
assert json.loads((app/'package.json').read_text())['stelexRole']=='admin'
protected=source/'resources/private-admin.bundle.json';before=hashlib.sha256(protected.read_bytes()).hexdigest()
for item in json.loads((root/'payload/Stelex-Update/manifest.json').read_text()):
 p=root/'payload/Stelex-Update'/item['path'];assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'];target=app/item['path'];target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
shutil.copy2(root/'admin/locked-admin.cjs',app/'desktop/locked-admin.cjs');shutil.copy2(root/'admin/credits.js',app/'desktop/admin-credits.js')
assert hashlib.sha256(protected.read_bytes()).hexdigest()==before,'Encrypted owner bundle must remain unchanged'
(source/'START-HIER.txt').write_text('STELEX ADMIN – aktualisiert\n\nStelex Admin.exe starten und mit deinem bestehenden Admin-Zugangscode entsperren.\nCredits vergeben: Konto suchen, Betrag eintragen, gutschreiben. Gilt fuer die Konten auf diesem Stelex-Server; fremde lokale Konten erscheinen hier nicht.\nUpdate senden: fertige Setup.exe oder ZIP, neue Versionsnummer v1.8.2 und GitHub-Token mit Contents-Schreibrecht fuer stelexacc/New angeben. Veroeffentlicht oeffentlich auf GitHub. Token wird nicht gespeichert. Nutzer sehen Updates in der neuen Client-Version beim Start bzw. spaetestens nach 15 Minuten bei geoeffneter App.\n\nVor dem Wechsel beide alten Stelex-Apps schliessen. Dieses Admin-Tool wird separat verteilt und niemals vom Client-Setup installiert. Der verschluesselte Zugangsschutz und der bisherige Zugangscode bleiben erhalten.\n',encoding='utf-8-sig')
artifact=out/'STELEX-Admin-Aktualisiert.zip'
with zipfile.ZipFile(artifact,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(source.rglob('*')):
  if p.is_file():z.write(p,'STELEX-Admin/'+p.relative_to(source).as_posix())
(artifact.with_suffix('.zip.sha256')).write_text(hashlib.sha256(artifact.read_bytes()).hexdigest()+'  '+artifact.name+'\n')
print('Separate Admin ZIP built; encrypted owner bundle unchanged.')
