#Requires -Version 5.1
param([switch]$CheckOnly)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$CatalogPath=Join-Path $PSScriptRoot 'models.json'
if(-not (Test-Path -LiteralPath $CatalogPath)){$CatalogPath=Join-Path (Split-Path -Parent $PSScriptRoot) 'config\models.json'}
$Catalog=Get-Content -LiteralPath $CatalogPath -Encoding UTF8 -Raw | ConvertFrom-Json
$Form=New-Object Windows.Forms.Form
$Form.Text='STELEX | Installation nach deinem Bedarf'
$Form.Size=New-Object Drawing.Size(690,620)
$Form.StartPosition='CenterScreen'
$Form.BackColor=[Drawing.Color]::FromArgb(12,10,16)
$Form.ForeColor=[Drawing.Color]::White
$Form.FormBorderStyle='FixedDialog'
$Form.MaximizeBox=$false
$Form.Font=New-Object Drawing.Font('Segoe UI',10)
$IconPath=Join-Path $PSScriptRoot 'resources\app\desktop\assets\icon.ico'
if(Test-Path $IconPath){$Form.Icon=New-Object Drawing.Icon($IconPath)}
function Label([string]$Text,[int]$Y,[int]$Height=40){$L=New-Object Windows.Forms.Label;$L.Text=$Text;$L.Location=New-Object Drawing.Point(25,$Y);$L.Size=New-Object Drawing.Size(620,$Height);$Form.Controls.Add($L);return $L}
$null=Label 'STELEX GPT - du entscheidest, was installiert wird.' 20
$null=Label 'Ein Modell reicht. Der Pruefer kann dasselbe Modell erneut verwenden.' 65
$Checks=@();$Y=120
foreach($Item in $Catalog){
 $C=New-Object Windows.Forms.CheckBox
 $C.Text=('{0} | Download ca. {1} GB' -f $Item.name,$Item.downloadGB)
 $C.Location=New-Object Drawing.Point(25,$Y);$C.Size=New-Object Drawing.Size(620,40)
 $C.Tag=$Item;$C.Checked=($Item.id -eq 'stelex-qwen35-hauhau:9b')
 $Form.Controls.Add($C);$Checks+=$C;$Y+=48
}
$Voice=New-Object Windows.Forms.CheckBox;$Voice.Text='Sprachmodul pruefen (bereits gebuendelt, ca. 0,16 GB)';$Voice.Checked=$true;$Voice.Location=New-Object Drawing.Point(25,320);$Voice.Size=New-Object Drawing.Size(620,40);$Form.Controls.Add($Voice)
$Python=New-Object Windows.Forms.CheckBox;$Python.Text='Python-EXE-Builder herunterladen (optional, ca. 0,35 GB)';$Python.Checked=$false;$Python.Location=New-Object Drawing.Point(25,365);$Python.Size=New-Object Drawing.Size(620,40);$Form.Controls.Add($Python)
$Total=Label '' 420 70
$Update={ $GB=0.75;foreach($C in $Checks){if($C.Checked){$GB+=[double]$C.Tag.downloadGB}};if($Python.Checked){$GB+=0.35};$Total.Text=('Geschaetzter Bedarf: ca. {0:N1} GB. Vorhandene Ollama-Daten werden wiederverwendet. Groessen sind Richtwerte; alte Modelle werden nicht geloescht.' -f $GB) }
foreach($C in $Checks){$C.Add_CheckedChanged($Update)};$Python.Add_CheckedChanged($Update);&$Update
$Install=New-Object Windows.Forms.Button;$Install.Text='Auswahl installieren';$Install.BackColor=[Drawing.Color]::FromArgb(255,45,85);$Install.ForeColor=[Drawing.Color]::White;$Install.Location=New-Object Drawing.Point(370,505);$Install.Size=New-Object Drawing.Size(270,45);$Install.DialogResult=[Windows.Forms.DialogResult]::OK;$Form.Controls.Add($Install);$Form.AcceptButton=$Install
if($CheckOnly){@{models=@($Checks|Where-Object {$_.Checked}|ForEach-Object {$_.Tag.id});python=$Python.Checked;voice=$Voice.Checked;estimatedLabel=$Total.Text}|ConvertTo-Json -Compress;$Form.Dispose();exit 0}
if($Form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK){exit 1}
$Selected=@($Checks|Where-Object {$_.Checked}|ForEach-Object {$_.Tag.id})
$Config=@{models=$Selected;voice=$Voice.Checked;python=$Python.Checked}
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'selected-components.json'),($Config|ConvertTo-Json -Depth 5),(New-Object Text.UTF8Encoding($false)))
$Form.Dispose()
exit 0
