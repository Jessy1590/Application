# =============================================================================
# Préparation des images du parcours « CardioVasculaires - Deust 2A » (blocs photo)
#  - Lit les pptx / docx de cours (déjà extraits en dossiers : p11, p13, cv, hta, hemo, raa)
#  - Redimensionne (max 1600 px), convertit en JPEG (qualité 88, < 5 Mo)
#  - Masque (bandeaux noirs) les données nominatives des 2 ordonnances du rappel sang
#  - Écrit dans $Out\upload\modules\<module_id>\<slug>.jpg  (même arborescence que le bucket)
# Ne contient aucun secret. L'upload se fait ensuite via `supabase storage cp` (voir STATE.md).
# Usage : powershell -File cardio_images_prepare.ps1 -Src <dossier extraits> -Out <dossier sortie>
# =============================================================================
param(
  [string]$Src = "$env:TEMP\jp-media",
  [string]$Out = "$env:TEMP\jp-media"
)
Add-Type -AssemblyName System.Drawing

$mod = @{
  sang_rappel         = 'e9adf9b0-090e-4d11-bfb4-ce6d01066cf3'
  sang_anemies        = 'fc7d0e3c-f2b9-42de-a253-5b4f3f7aa95c'
  sang_antiagregants  = '578a6b03-19f6-4825-b703-b7fbe2a879e9'
  sang_anticoagulants = '9c921bad-b792-4399-90c1-5d1b0eb7186c'
  sang_hemophilies    = 'a72226d0-b374-4821-a8c3-1cdad8420982'
  cv_definitions      = 'e9e30d64-3829-466c-8ccc-bfb0064adf06'
  cv_angor            = '5eb80f08-844a-4816-90d7-3e7071897d4b'
  cv_idm              = '96adf329-cad1-4b1b-896e-c9d930d252ba'
  cv_arythmies        = 'bbc00500-0686-4c31-893f-acbd71832018'
  cv_ic               = 'ed49bf8d-55c6-4756-952a-f927b1ed1e07'
  cv_veines           = 'a391cd7f-1081-48d3-b106-4e6f0e046eda'
  cv_urgences         = 'da6b1276-8a88-417b-9438-be0306a72719'
  hta_rappel_pa       = '26f24ecd-7a54-40ed-a97f-f790f12d2cfc'
  hta_raa             = '603a0958-684d-41ee-997e-ded72cf1b370'
  hta_clinique        = '5a2f6bb1-7901-4b03-b84d-6360916a41fb'
  hta_classes         = 'f0382a46-ee1d-4a53-8ef8-fdd8ea17bd6e'
  hta_associations    = '0918cd23-6d0b-47c4-8f61-73c47e6842fb'
}

# lesson ; slug ; source (deck:fichier)
$items = @'
sang_rappel;hemostase-primaire;hemo:word/media/image1.jpeg
sang_rappel;cascade-coagulation;hemo:word/media/image2.jpeg
sang_rappel;composition-sang;p11:ppt/media/image7.png
sang_rappel;hematopoiese;p11:ppt/media/image9.png
sang_rappel;erythropoiese;p11:ppt/media/image14.jpeg
sang_rappel;hemoglobine;p11:ppt/media/image10.jpeg
sang_rappel;breche-vasculaire;p11:ppt/media/image24.png
sang_rappel;ordonnance-1;p11:ppt/media/image21.png
sang_rappel;ordonnance-2;p11:ppt/media/image22.png
sang_anemies;frottis;p13:ppt/media/image5.jpeg
sang_anemies;anemie-symptomes;p13:ppt/media/image6.png
sang_anemies;drepanocytose;p13:ppt/media/image7.png
sang_anemies;maladie-hemolytique-rh;p13:ppt/media/image8.png
sang_anemies;immunisation-rh;p13:ppt/media/image9.png
sang_antiagregants;thrombose;p13:ppt/media/image20.png
sang_antiagregants;embolie-pulmonaire;p13:ppt/media/image22.jpeg
sang_antiagregants;avc-ischemique;p13:ppt/media/image23.jpeg
sang_antiagregants;thrombus-coronaire;p13:ppt/media/image24.jpeg
sang_antiagregants;fibrillation-auriculaire;p13:ppt/media/image25.jpeg
sang_antiagregants;cox-thromboxane;p13:ppt/media/image26.jpeg
sang_antiagregants;cox1-cox2;p13:ppt/media/image27.jpeg
sang_anticoagulants;sites-action-cascade;p13:ppt/media/image29.jpeg
sang_anticoagulants;heparines-hnf-hbpm;p13:ppt/media/image30.jpeg
sang_anticoagulants;anti-iia-anti-xa;p13:ppt/media/image31.jpeg
sang_anticoagulants;posologies-hbpm;p13:ppt/media/image32.png
sang_anticoagulants;mecanisme-aod;p13:ppt/media/image33.jpeg
sang_anticoagulants;tableau-aod;p13:ppt/media/image34.jpeg
sang_anticoagulants;mecanisme-avk;p13:ppt/media/image35.jpeg
sang_anticoagulants;relais-heparine-avk;p13:ppt/media/image36.jpeg
sang_anticoagulants;inr-zone;p13:ppt/media/image38.jpeg
sang_anticoagulants;hirudine;p13:ppt/media/image39.png
sang_hemophilies;hemophilie-transmission;p13:ppt/media/image40.png
sang_hemophilies;purpura;p13:ppt/media/image44.png
cv_definitions;arteres-anevrisme;cv:ppt/media/image5.png
cv_definitions;plaque-atherome;cv:ppt/media/image6.jpeg
cv_definitions;atherosclerose-symptomes;cv:ppt/media/image7.png
cv_angor;maladie-coronarienne;cv:ppt/media/image8.jpeg
cv_angor;angor-effort;cv:ppt/media/image9.png
cv_angor;natispray;cv:ppt/media/image10.jpeg
cv_angor;douleur-angineuse;cv:ppt/media/image11.jpeg
cv_angor;betabloquants;cv:ppt/media/image14.png
cv_idm;idm-schema;cv:ppt/media/image17.png
cv_idm;idm-signes;cv:ppt/media/image18.png
cv_idm;progression-plaque;cv:ppt/media/image19.png
cv_idm;stades-atherome;cv:ppt/media/image20.jpeg
cv_idm;pontage-coronarien;cv:ppt/media/image21.jpeg
cv_idm;pontage-schema;cv:ppt/media/image22.jpeg
cv_idm;angioplastie-stent;cv:ppt/media/image23.png
cv_arythmies;ecg-base;cv:ppt/media/image24.jpeg
cv_arythmies;ecg-troubles;cv:ppt/media/image25.jpeg
cv_arythmies;potentiel-action;cv:ppt/media/image26.gif
cv_arythmies;qt-long;cv:ppt/media/image28.png
cv_arythmies;torsades-medicaments;cv:ppt/media/image27.png
cv_ic;pompe-defaillante;cv:ppt/media/image29.jpeg
cv_ic;coeur-normal-ic;cv:ppt/media/image30.jpeg
cv_ic;affiche-ic;cv:ppt/media/image31.jpeg
cv_veines;aomi-stades;cv:ppt/media/image33.png
cv_veines;retour-veineux;cv:ppt/media/image34.jpeg
cv_veines;pompe-musculaire;cv:ppt/media/image35.png
cv_veines;valvules;cv:ppt/media/image36.jpeg
cv_veines;stade-varicosites;cv:ppt/media/image37.jpeg
cv_veines;stade-varices;cv:ppt/media/image38.jpeg
cv_veines;stade-oedeme;cv:ppt/media/image39.jpeg
cv_veines;stade-trophique;cv:ppt/media/image40.jpeg
cv_veines;stade-ulcere;cv:ppt/media/image41.jpeg
cv_veines;echo-doppler;cv:ppt/media/image42.png
cv_veines;conseils-habitudes;cv:ppt/media/image43.png
cv_veines;contention-classes;cv:ppt/media/image44.png
cv_veines;hemorroides;cv:ppt/media/image45.png
cv_urgences;circulation;cv:ppt/media/image46.png
cv_urgences;oap;cv:ppt/media/image47.jpeg
hta_rappel_pa;tensiometre;hta:ppt/media/image8.png
hta_rappel_pa;determinants-pa;hta:ppt/media/image11.png
hta_rappel_pa;regulation-pa;hta:ppt/media/image12.png
hta_rappel_pa;elasticite-vasculaire;hta:ppt/media/image13.jpeg
hta_rappel_pa;barorecepteurs;hta:ppt/media/image14.jpeg
hta_rappel_pa;courbe-pression;hta:ppt/media/image17.jpeg
hta_rappel_pa;mesure-auscultatoire;hta:ppt/media/image18.jpeg
hta_raa;schema-raa;raa:word/media/image1.png
hta_raa;raa-synthese;hta:ppt/media/image16.jpeg
hta_clinique;complications-organes;hta:ppt/media/image19.jpeg
hta_classes;raa-ieca;hta:ppt/media/image21.jpeg
hta_classes;raa-ieca-sartans;hta:ppt/media/image22.jpeg
hta_classes;antihta-centraux;hta:ppt/media/image23.png
hta_associations;associations-possibles;hta:ppt/media/image24.png
hta_associations;dispensation;hta:ppt/media/image25.jpg
'@ -split "`r?`n" | Where-Object { $_.Trim() }

# Zones à masquer (fractions x0,y0,x1,y1 de l'image) — données nominatives des ordonnances
$redact = @{
  'ordonnance-1' = @(
    @(0.03, 0.015, 0.93, 0.145),   # en-tête prescripteur (nom, adresse, tél., codes-barres)
    @(0.03, 0.165, 0.60, 0.205),   # patiente (nom, date de naissance)
    @(0.04, 0.540, 0.32, 0.655),   # signature / tampon prescripteur
    @(0.45, 0.535, 0.80, 0.730),   # tampon pharmacie
    @(0.08, 0.930, 0.95, 0.975)    # numéros de garde
  )
  'ordonnance-2' = @(
    @(0.03, 0.025, 0.95, 0.175),   # en-tête prescripteur
    @(0.03, 0.305, 0.60, 0.355)    # patiente (nom, date de naissance)
  )
}

$maxSide = 1600
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)

$report = @()
foreach ($line in $items) {
  $a = $line.Split(';'); $lesson = $a[0]; $slug = $a[1]; $d, $rel = $a[2].Split(':', 2)
  $srcFile = Join-Path (Join-Path $Src $d) ($rel -replace '/', '\')
  if (-not (Test-Path $srcFile)) { Write-Warning "absent : $srcFile"; continue }
  $img = [System.Drawing.Image]::FromFile($srcFile)
  $sc = [math]::Min(1.0, $maxSide / [math]::Max($img.Width, $img.Height))
  $w = [int][math]::Round($img.Width * $sc); $h = [int][math]::Round($img.Height * $sc)
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'; $g.PixelOffsetMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $w, $h)
  if ($redact.ContainsKey($slug)) {
    foreach ($r in $redact[$slug]) {
      $g.FillRectangle([System.Drawing.Brushes]::Black, [single]($r[0] * $w), [single]($r[1] * $h), [single](($r[2] - $r[0]) * $w), [single](($r[3] - $r[1]) * $h))
    }
  }
  $g.Dispose(); $img.Dispose()
  $dir = Join-Path $Out ("upload\modules\" + $mod[$lesson])
  New-Item -ItemType Directory -Force $dir | Out-Null
  $dst = Join-Path $dir ($slug + '.jpg')
  $bmp.Save($dst, $enc, $ep); $bmp.Dispose()
  $report += ('{0};{1};{2};{3}x{4};{5} Ko' -f $lesson, $slug, $mod[$lesson], $w, $h, [int]((Get-Item $dst).Length / 1KB))
}
$report | Out-File (Join-Path $Out 'upload-report.txt') -Encoding utf8
"{0} images préparées" -f $report.Count
