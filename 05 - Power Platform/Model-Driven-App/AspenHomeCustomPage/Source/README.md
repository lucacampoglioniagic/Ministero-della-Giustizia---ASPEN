# Home Custom Page — Sorgente reale (Screen1.fx.yaml / App.fx.yaml)

Questi due file sono il **vero** sorgente Power Fx round-trippabile della custom page "Home"
(`agc_home_629be`, custom page di tipo `canvasapptype=2` embedded nella app modello ASPENPOC),
estratto ed editato direttamente il 11/09/2026.

## Perché non basta `pac canvas download`/`pac canvas list`
Le custom page (canvasapptype=2) non sono visibili a `pac canvas list`/`pac canvas download`:
questi comandi funzionano solo con canvas app standalone. Per estrarre/reimportare il sorgente
reale di una custom page è necessario passare dalla soluzione:

1. Individuare il `canvasappid` via Web API (entità `canvasapps`).
2. Se l'export diretto della soluzione che contiene l'app fallisce (es. corruzione della metadata
   cache, vedi `Risposta_MS_Support_EntityMap_Corruption.md`), creare una soluzione temporanea
   minimale, aggiungere solo il componente canvas app (`AddSolutionComponent`, ComponentType 300,
   AddRequiredComponents=false) ed esportarla con `pac solution export --managed false`.
3. `pac solution unpack --packagetype Unmanaged` → estrae `CanvasApps/<nome>_DocumentUri.msapp`.
4. `pac canvas unpack --msapp <path> --sources <dir>` → estrae il vero `Src/Screen1.fx.yaml` e
   `Src/App.fx.yaml` (editabili).
5. Dopo le modifiche: `pac canvas pack --sources <dir> --msapp <nuovo.msapp>`, sostituire il file
   `.msapp` nella cartella unpacked della soluzione, `pac solution pack`, poi
   `pac solution import --publish-changes --force-overwrite`.
6. **Nota**: l'import aggiorna il `.msapp` in Dataverse ma il player pubblicato può restare in
   cache; se le modifiche non sono visibili, aprire l'app in modalità Designer e ripubblicare la
   pagina, oppure aggiornare via browser (hard refresh / pulizia storage), come già documentato in
   `README.md` (limitazione custom page già nota).

## Modifiche implementate in questa sessione
- **Sfondo** `Screen1.Fill` impostato a `RGBA(250,250,250,1)` (#FAFAFA).
- **Responsività**: formule con nome (Named Formulas) definite in `App.fx.yaml`
  (`HomeMargin`, `HomeNumCols`, `HomeCardWidth`, `HomeStatsCols`, ecc.) basate su `App.Width`,
  che determinano dinamicamente margini, numero di colonne (3 → 2 → 1) e larghezza dei riquadri.
  I 3 riquadri principali e il pannello statistiche usano queste formule per `X`/`Y`/`Width`
  invece di coordinate fisse; sotto i 700px collassano su una singola colonna, sotto i 1150px
  su due colonne.
- **Border-radius sui riquadri**: il controllo `rectangle` di questa app non espone proprietà
  `Radius*`. Per ottenere angoli arrotondati coerenti con le altre pagine, i riquadri card/icone/
  pannello statistiche sono stati convertiti in controlli `button` con `DisplayMode.Disabled`,
  `Text=""` e proprietà `RadiusTopLeft/TopRight/BottomLeft/BottomRight` (12px per le card e il
  pannello statistiche, 10px per i quadrati icona), mappando `Fill/BorderColor/Color` sulle
  rispettive proprietà `Disabled*` (attive quando il controllo è disabilitato).
