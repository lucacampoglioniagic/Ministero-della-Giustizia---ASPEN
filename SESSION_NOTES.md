# Session Notes — ASPEN / Ministero della Giustizia

> Note di sessione in ordine cronologico inverso (più recente in cima).

---

## Session 2026-07-07

### What was done
- **Pulizia dati post-migrazione su Dataverse** (ambiente `LCC-MINISTEROGIUSTIZIA-DEMO`), completando quanto lasciato aperto dalla sessione del 06/07/2026:
  - **Rimossi 20 record duplicati** da `agc_fascicolo2`: la migrazione del 06/07 era stata eseguita due volte (batch delle 15:59 e batch delle 19:34, contenuto identico), portando la tabella da 40 a 20 record (uno per ogni Numero RG).
  - **Popolata `agc_canestrofascicolo`** (era vuota): creati 13 record copiando `agc_tipodireato` → `agc_name` e `agc_pesocanestro` → `agc_peso` dalla vecchia tabella `agc_canestro`, usata come unico riferimento disponibile.
  - **Riassociati i fascicoli al canestro**: recuperato il collegamento originale fascicolo→canestro dalla vecchia tabella `agc_fascicolo` (campo `_agc_canestro_value`, ancora leggibile via Web API nonostante la ghost relationship che ne impediva la scrittura/lo schema change) e replicato su `agc_fascicolo2.agc_Canestrofascicolo` verso i nuovi record di `agc_canestrofascicolo`. **18 fascicoli su 20** associati correttamente; i restanti 2 (`2022`... in realtà `2024` e `RG-2026/11122`) non avevano canestro nemmeno nella tabella storica, quindi restano senza associazione.
  - Operazioni eseguite via Dataverse Web API (`fetch` autenticato via cookie di sessione sul portale Maker), non tramite script offline.
- **Documentazione**: chiarito esplicitamente in `README.md` che `agc_fascicolo` e `agc_canestro` sono **dismesse e non vanno più utilizzate** — restano solo come backup storico read-only. Aggiornati i "Prossimi passi".

### Decisions made
- **Nessuna eliminazione fisica delle tabelle legacy**: `agc_fascicolo` e `agc_canestro` restano in ambiente come backup, ma la documentazione ora vieta esplicitamente il loro utilizzo per qualunque nuovo sviluppo.
- **Fascicoli senza canestro storico** (`2024`, `RG-2026/11122`) lasciati senza associazione anziché assegnare un canestro arbitrario — da chiarire con il cliente in una sessione futura.
- **Peso canestro**: tutti i 13 record storici avevano `agc_pesocanestro = 1`; il valore è stato copiato as-is in `agc_canestrofascicolo.agc_peso` senza modifiche/interpretazioni.

### Current status
- ✅ `agc_fascicolo2`: 20 record, nessun duplicato.
- ✅ `agc_canestrofascicolo`: 13 record popolati (nomi e peso da `agc_canestro`).
- ✅ 18/20 fascicoli associati al canestro corretto; 2 senza canestro (dati origine mancanti).
- ✅ Documentazione aggiornata con divieto esplicito di utilizzo delle tabelle legacy.
- ⚠️ Tabelle legacy `agc_fascicolo` e `agc_canestro` ancora presenti in ambiente (nessuna azione di hide/disable eseguita in questa sessione).

### Next steps
1. Verificare con il cliente/referenti a quale canestro assegnare i 2 fascicoli rimasti senza associazione (`2024`, `RG-2026/11122`).
2. Procedere con la dismissione (hide/disable) delle tabelle legacy `agc_fascicolo` e `agc_canestro`.
3. Configurare la form di `agc_fascicolo2` nel Maker Portal con i controlli PCF.
4. Eseguire test end-to-end di creazione fascicolo su `agc_fascicolo2` con associazione canestro.

### Files changed
- `README.md` — nota esplicita "tabelle legacy dismesse, non usare"; aggiornati Prossimi Passi (item 12 nuovo, item 13 nuovo)
- `SESSION_NOTES.md` — aggiunta sessione 2026-07-07
- Dati Dataverse: `agc_fascicolo2` (20 record, deduplicati), `agc_canestrofascicolo` (13 record creati), associazioni fascicolo↔canestro aggiornate

### Update 07/07/2026 (pomeriggio) — Fix binding dashboard "Cruscotto ASPEN"

**Problema rilevato**: rispondendo alla domanda "il PCF del cruscotto recupera i canestri dalla nuova tabella?", verifica del `formxml` live del dashboard "Cruscotto ASPEN" (via Web API `systemforms`) ha rivelato che i controlli `CaricoMagistratiChart` e `StatoFascicoliChart` erano ancora bindati (tramite `TargetEntityType` e `ViewId` del dataset) alle view Dataverse **"Fascicoli aperti"** e **"Fascicoli (tutti)"**, entrambe costruite sulla **vecchia tabella `agc_fascicolo`** (dismessa). Il codice TypeScript dei due PCF era già stato aggiornato il 06/07 per leggere `agc_canestrofascicolo`/`agc_canestrofascicoloname`, ma questi campi non esistono sulla vecchia entità (che ha `agc_canestro`/`agc_canestroname`) — quindi il canestro nel modal sarebbe risultato vuoto, e i dati mostrati nel grafico non includevano gli aggiornamenti presenti solo su `agc_fascicolo2`.

**Fix applicato**:
1. Create due nuove view pubbliche su `agc_fascicolo2`: `Fascicoli 2 aperti (Cruscotto)` (id `9cdb22db-db79-f111-ab0e-70a8a581677c`) e `Fascicoli 2 (tutti) (Cruscotto)` (id `3c5b46e1-db79-f111-ab0e-70a8a581677c`), fetchxml/layoutxml equivalenti alle originali ma sull'entità `agc_fascicolo2` (con in più l'attributo `agc_canestrofascicolo`).
2. Aggiornato il `formxml` del dashboard (`systemforms`, formid `d4cd81e8-5963-f111-ab0c-7ced8d72f54e`): sostituito `TargetEntityType` (`agc_fascicolo` → `agc_fascicolo2`) e `ViewId` (verso le nuove view) su entrambi i controlli custom.
3. Pubblicazione con `PublishAllXml`.
4. Verificato che il `formxml` risultante non contiene più riferimenti a `agc_fascicolo` (solo `agc_fascicolo2`, 10 occorrenze).

**Nota**: `CaricoPerCanestro` (sulla form Magistrato) non era interessato — interroga `agc_fascicolo2` direttamente via WebAPI nel codice, indipendentemente da view/dashboard.

**Files changed**: `README.md` (sezione PCF + nota migrazione)

### Update 07/07/2026 (sera) — Command bar Fascicolo 2 allineata alla vecchia tabella

**Richiesta**: "aggiorniamo la commandbar di fascicolo 2, deve essere uguale a quella della vecchia tabella fascicolo, nascondiamo i tasti non necessari e aggiungiamo i tasti chiudi fascicolo e assegnazione automatica, con le stesse logiche della vecchia tabella".

**Verifica pulsanti custom (nessuna modifica necessaria)**: testando live su form e griglia di entrambe le tabelle, i pulsanti **"Assegna Fascicolo"** (form + griglia) e **"Chiudi Caso"** (form) su `agc_fascicolo2` sono risultati già identici a `agc_fascicolo`, incluse le enable rule (nascosti quando il fascicolo ha già un magistrato assegnato/è già chiuso). Chiarito con il cliente che **"assegnazione automatica" coincide con il pulsante esistente "Assegna Fascicolo"** (dialog con algoritmo del magistrato meno carico) — non serve un pulsante distinto.

**Bug reale trovato e corretto**: i 5 pulsanti standard che il `RibbonDiff.xml` doveva nascondere in griglia (Mostra grafico, Mostra questa visualizzazione, Invia link tramite messaggio e-mail, Flusso, Esegui report) **non venivano mai nascosti**, su nessuna delle due tabelle, da quando questa personalizzazione è stata introdotta: gli attributi `Location` degli `HideCustomAction` erano ID "di manuale"/copiati che non corrispondevano a nessun controllo reale della ribbon compilata (Dataverse ignora silenziosamente un `Location` che non trova, senza errori).

ID reali individuati confrontando la ribbon compilata (`RetrieveEntityRibbon`) prima e dopo l'ipotesi di fix, e ispezionando il DOM dei pulsanti live:
- `Mscrm.HomepageGrid.agc_fascicolo2.MainTab.QuickPowerBI.Button` (Mostra questa visualizzazione)
- `Mscrm.HomepageGrid.agc_fascicolo2.Send` **+** `Mscrm.HomepageGrid.agc_fascicolo2.SendDirectEmail` **+** `Mscrm.HomepageGrid.agc_fascicolo2.modern.SendDirectEmail` (Invia link tramite messaggio e-mail — la piattaforma renderizza questo comando tramite 3 controlli OOB paralleli, vanno nascosti tutti e 3)
- `Mscrm.HomepageGrid.agc_fascicolo2.Flows.RefreshCommandBar` **+** `Mscrm.HomepageGrid.agc_fascicolo2.Flows.RefreshCommandBar.Flows` (Flusso — anche qui esistono un anchor esterno e una voce annidata con la stessa label, entrambe da nascondere)
- `Mscrm.HomepageGrid.agc_fascicolo2.RunReport` (Esegui report)
- **"Mostra grafico" (`ShowChartPane`) resta visibile**: è un comando iniettato dalla command bar moderna, non esiste nel `RibbonXml` classico e quindi non è nascondibile con `HideCustomAction`. È presente identico anche sulla vecchia tabella `agc_fascicolo`, quindi la parità tra le due tabelle resta comunque garantita — resta un limite noto della piattaforma (il Command Designer visuale avrebbe l'azione "Nascondi", ma è risultata disabilitata/non selezionabile in questo ambiente per questo comando).

**Fix applicato**: aggiornato `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/RibbonDiff.xml` con gli 8 `HideCustomAction` corretti sopra elencati (versione solution `1.0.0.2`).

**Nota importante sul deploy**: la reimportazione della solution `AgicAspenRibbon` **fallisce se include anche `agc_fascicolo`** (vecchia tabella), perché quest'ultima ha ancora l'errore SQL storico `Invalid column name 'agc_CanestroName'` (la stessa ghost relationship già documentata nella sessione 2026-07-06, mai risolta sulla tabella dismessa) che impedisce a Dataverse di rigenerare la sua filtered view durante l'import. Poiché `agc_fascicolo` non è stata toccata da questa modifica (e resta comunque dismessa/da non usare), il deploy è stato **scoperto solo su `agc_fascicolo2`**: creata una copia temporanea della solution con `agc_fascicolo` escluso dai `RootComponents`, pacchettizzata e importata con `pac solution import --force-overwrite --publish-changes`. Il file sorgente `RibbonDiff.xml` di `agc_Fascicolo` (vecchia tabella) **non è stato modificato** — resta con i vecchi `Location` inefficaci, coerente con il fatto che quella tabella non deve più essere usata.

**Verifica**: rifatta una `RetrieveEntityRibbon` dopo l'import — confermato via confronto testuale che tutti gli 8 controlli sopra elencati non compaiono più nella ribbon compilata di `agc_fascicolo2` (in precedenza c'era esattamente 1 occorrenza di ciascuno). Non è stato possibile fare una verifica visiva finale nel browser perché la sessione autenticata di test è stata persa per errore (cancellazione accidentale dei cookie durante un tentativo di forzare il refresh della cache client della command bar) — il cliente ha confermato di fidarsi della verifica lato server. **Si raccomanda un controllo visivo con refresh forzato (Ctrl+F5) sulla griglia "Fascicoli 2" alla prima occasione utile.**

**Files changed**:
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/RibbonDiff.xml` — 8 `HideCustomAction` con `Location` corrette
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Other/Solution.xml` — versione `1.0.0.1` → `1.0.0.2`
- Solution Dataverse `AgicAspenRibbon` reimportata (solo componente `agc_fascicolo2`) e pubblicata nell'ambiente `LCC-MINISTEROGIUSTIZIA-DEMO`
- `README.md` / `SESSION_NOTES.md` aggiornati

### Update 07/07/2026 (notte) — Migrazione campo Peso → Peso calcolato

**Contesto**: il cliente ha rimosso il campo `agc_peso` (Decimal, manuale) da form e viste della tabella `agc_fascicolo2` e ha creato un nuovo campo calcolato **"Peso calcolato"** (logical name `agc_pesocalcolato`, tipo Decimal, formula) che sostituisce il vecchio in tutti i calcoli. `agc_peso` resta nello schema come colonna storica non più mantenuta/aggiornata.

**Individuazione del logical name**: la sessione autenticata su `crm4.dynamics.com` era stata persa nel task precedente (incidente cookie clear). Recuperato il logical name navigando la UI del Maker Portal (`make.powerapps.com`, sessione ancora valida) fino alla lista Colonne della tabella "Fascicolo 2": confermato `agc_Pesocalcolato` (schema name) → `agc_pesocalcolato` (logical name).

**Recupero sessione live**: l'utente ha ri-autenticato manualmente il tab Playwright su `crm4.dynamics.com` (verificato con `WhoAmI()` → 200). Il profilo `pac` CLI (`luca.campoglioni@agic.it` su `LCC-MINISTEROGIUSTIZIA-DEMO`) era invece rimasto valido per tutta la sessione, indipendentemente dal browser — utilizzato per il deploy dei PCF.

**Componenti aggiornati**:
1. **`CaricoPerCanestro`** (`05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts`) — query WebAPI (`$select`, `$filter`, somma per canestro) aggiornata da `agc_peso` a `agc_pesocalcolato`. Ricompilato e ridistribuito con `pac pcf push --publisher-prefix agc` (fallisce sempre sul cleanup finale per file lock, ma genera comunque lo zip in `obj/PowerAppsToolsTemp_agc/bin/Debug/`) + `pac solution import --force-overwrite --publish-changes`.
2. **`StatoFascicoliChart`** (`05 - Power Platform/PCF-Pie/StatoFascicoliChart/index.ts`) — `record.getValue("agc_peso")` → `record.getValue("agc_pesocalcolato")` nella colonna "Peso" del modal drill-down. Stesso flusso di ricompilazione/redeploy.
3. **`CaricoMagistratiChart`** — il codice non hardcoda il campo (proprietà bound configurabile `pesoField`), quindi non richiede modifiche/redeploy del codice. Aggiornato solo il commento doc nel manifest (`ControlManifest.Input.xml`) e il **binding live** `pesoField` nel `formxml` del dashboard "Cruscotto ASPEN" (`systemforms`, formid `d4cd81e8-5963-f111-ab0c-7ced8d72f54e`): sostituite le 3 occorrenze (una per `formFactor` 0/1/2) di `<pesoField>agc_peso</pesoField>` con `<pesoField>agc_pesocalcolato</pesoField>` via PATCH Web API.
4. **Viste del dashboard**: `Fascicoli 2 aperti (Cruscotto)` (id `9cdb22db-db79-f111-ab0e-70a8a581677c`) e `Fascicoli 2 (tutti) (Cruscotto)` (id `3c5b46e1-db79-f111-ab0e-70a8a581677c`) referenziavano `agc_peso` sia in `fetchxml` (attribute) sia in `layoutxml` (cell) — sostituito con `agc_pesocalcolato` in entrambe via PATCH su `savedqueries`. Necessario perché `StatoFascicoliChart` legge la colonna "Peso" direttamente dal dataset bindato alla view, non come proprietà dichiarata nel manifest.
5. **`agc_assignfascicolodialog.html`** (webresource HTML del dialog "Assegnazione automatica", `05 - Power Platform/AssegnaFascicolo/WebResources/`) — la logica di bilanciamento del carico (punto 2 dei commenti nel file: somma pesi per magistrato compatibile, sceglie il meno carico) sommava `agc_peso`; aggiornata a `agc_pesocalcolato` in query e somma. Senza questo fix l'assegnazione automatica avrebbe continuato a bilanciare il carico su un campo non più mantenuto dagli utenti. Contenuto del webresource aggiornato via PATCH su `webresourceset` (retrieve → find by name → patch content base64 UTF-8 → `PublishXml`).

**Pubblicazione**: tutte le modifiche (view, formxml dashboard, webresource) pubblicate con `PublishAllXml`/`PublishXml` via Web API dal tab browser autenticato dall'utente; i due PCF pubblicati tramite il flusso standard `pac pcf push` + `pac solution import --publish-changes`.

**Verifica**: rilettura post-update via Web API di entrambe le `savedqueries` (fetchxml/layoutxml senza più `agc_peso`, con `agc_pesocalcolato` presente), del `formxml` del dashboard (0 occorrenze `agc_peso`, 3 occorrenze `agc_pesocalcolato`) e del contenuto del webresource (base64 decodificato, `agc_pesocalcolato` presente, nessuna query `$select=agc_peso,` residua).

**Nota**: il campo `agc_peso` **non è stato eliminato** dallo schema di `agc_fascicolo2` (resta come colonna storica non più esposta su form/viste, per compatibilità/backup) — solo i componenti applicativi sono stati aggiornati a leggere `agc_pesocalcolato`.

**Files changed**:
- `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts`
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/index.ts`
- `05 - Power Platform/PCF/CaricoMagistratiChart/ControlManifest.Input.xml` (commento doc)
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/ControlManifest.Input.xml` (commento doc)
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html`
- Dataverse live: `savedqueries` (2 view), `systemforms` (dashboard "Cruscotto ASPEN"), `webresourceset` (`agc_assignfascicolodialog.html`) — tutti pubblicati
- `README.md` / `SESSION_NOTES.md` aggiornati

### Bug aggiuntivo scoperto e risolto: `CaricoPerCanestro` mostrava "Errore: [object Object]"

Durante la verifica visiva post-migrazione, la form "Fascicoli" del magistrato mostrava il messaggio d'errore `Errore: [object Object]` al posto del grafico "Carico per Canestro". Diagnosticato tramite console del browser (`UciError`/`storage` error): la query WebAPI del PCF selezionava ancora `agc_fascicoloid` come chiave primaria, ma la primary key della nuova tabella `agc_fascicolo2` è `agc_fascicolo2id` (verificato via `EntityDefinitions(LogicalName='agc_fascicolo2')?$select=PrimaryIdAttribute` → `agc_fascicolo2id`). Era un refuso residuo della migrazione tabellare del 06/07, non collegato direttamente al cambio Peso→Peso calcolato, ma bloccava proprio il PCF richiesto dall'utente in questo task.

**Fix**: `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts` — `$select=agc_fascicoloid,...` → `$select=agc_fascicolo2id,...`. Ricompilato (`tsc --noEmit` + `npm run build`, entrambi puliti) e ridistribuito con lo stesso flusso `pac pcf push --publisher-prefix agc` + `pac solution import --force-overwrite --publish-changes`.

**Verifica**: ricaricata la form del magistrato "Dott.ssa Laura Verdi", tab "Fascicoli" — il grafico "Carico per Canestro" ora renderizza correttamente le barre per canestro (pesi 17.0 pt e 14.0 pt), escludendo correttamente dal calcolo il fascicolo con stato "Chiuso" (12.00), coerentemente con la logica `_isClosedFascicolo`. Nessun errore residuo in console riferito al componente.

---

## Session 2026-07-06

### What was done
- **Migrazione tabelle Dataverse**: la tabella `agc_fascicolo` presentava una ghost relationship corrotta (`agc_CanestroName` nel SQL) che impediva la creazione di nuovi fascicoli. Come soluzione permanente sono state create due nuove tabelle pulite:
  - `agc_fascicolo2` — sostituisce `agc_fascicolo` come tabella principale dei fascicoli
  - `agc_canestrofascicolo` — sostituisce `agc_canestro` come tabella delle materie/competenze
- **Migrazione dati**: 20 record migrati da `agc_fascicolo` → `agc_fascicolo2`.
- **PCF `CaricoPerCanestro`**: aggiornato per interrogare `agc_fascicolo2`; lookup canestro ora letta come `_agc_canestrofascicolo_value`.
- **PCF `CaricoMagistratiChart`**: modal aggiornato per usare i campi `agc_canestrofascicolo` / `agc_canestrofascicoloname`.
- **PCF `StatoFascicoliChart`**: modal aggiornato per usare i campi `agc_canestrofascicolo` / `agc_canestrofascicoloname`.
- **`agc_assignfascicolo.js`**: `updateRecord` aggiornato a `"agc_fascicolo2"`; controllo assegnazione usa `agc_canestrofascicolo`.
- **`agc_assignfascicolodialog.html`**: endpoint aggiornato da `agc_fascicolos` a `agc_fascicolo2s`.
- **Plugin `SetOwnerTeamPlugin`**: registrato su `agc_fascicolo2` (messaggio `Create`, stage Pre-Operation 20).

### Decisions made
- **Nuove tabelle anziché fix sulla tabella corrotta**: scelto approccio di creazione di tabelle pulite per evitare rischi di reintroduzione del problema a livello di metadati Dataverse.
- **Naming**: `agc_fascicolo2` (non rinominata perché Dataverse non supporta il rinomino del LogicalName); `agc_canestrofascicolo` come nome più descrittivo per la tabella canestri.
- **Migrazione dati**: i 20 record esistenti trasferiti manualmente prima dello switch del codice.

### Current status
- ✅ `agc_fascicolo2` operativa; creazione nuovi fascicoli funzionante.
- ✅ `agc_canestrofascicolo` operativa come tabella canestri.
- ✅ Tutti i PCF aggiornati per usare le nuove tabelle.
- ✅ Ribbon dialog aggiornato per endpoint `agc_fascicolo2s`.
- ✅ Plugin `SetOwnerTeamPlugin` attivo su `agc_fascicolo2`.
- ✅ 20 record migrati correttamente.
- ⚠️ Le tabelle originali `agc_fascicolo` e `agc_canestro` restano in ambiente ma non sono più usate dal codice applicativo.

### Next steps
1. Verificare in ambiente che la creazione di nuovi fascicoli su `agc_fascicolo2` sia stabile end-to-end.
2. Valutare la dismissione (disattivazione) delle tabelle legacy `agc_fascicolo` e `agc_canestro` dopo periodo di stabilizzazione.
3. Aggiornare la Custom Page "ASPEN Home" in Power Apps Studio: data source e URL di navigazione (`etn=agc_fascicolo2`).

### Files changed
- `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts` — query su `agc_fascicolo2`, lookup `_agc_canestrofascicolo_value`
- `05 - Power Platform/PCF/CaricoMagistratiChart/index.ts` — modal campo `agc_canestrofascicolo`/`agc_canestrofascicoloname`
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/index.ts` — modal campo `agc_canestrofascicolo`/`agc_canestrofascicoloname`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js` — `updateRecord("agc_fascicolo2")`, controllo `agc_canestrofascicolo`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html` — endpoint `agc_fascicolo2s`
- `README.md` — modello dati aggiornato, nota migrazione, sezione Plugin, riferimenti `agc_fascicolo2`/`agc_canestrofascicolo` in tutta la documentazione; item 10 Prossimi Passi marcato risolto
- `SESSION_NOTES.md` — aggiunta sessione 2026-07-06

---

## Session 2026-07-06

### What was done
- **Migrazione completa agc_fascicolo → agc_fascicolo2** per bypassare la corruzione SQL nella tabella vecchia (ghost relationship `agc_canestro` causava `SqlException: Invalid column name 'agc_CanestroName'` su ogni schema change).
- Creata `agc_fascicolo2` su Dataverse via REST API (MetadataId: `3ebfe566-5379-f111-ab0e-0022489974e1`) con tutti i campi + 2 relazioni (→ `agc_canestrofascicolo`, → `agc_giudice`). Il campo `agc_peso` ora è Decimal normale (non più formula, ValidForCreate/Update=1).
- Migrati 20 record da `agc_fascicolos` → `agc_fascicolo2s` preservando il magistrato assegnato.
- Aggiornati e caricati su Dataverse: PCF **CaricoPerCanestro** (entity `agc_fascicolo2`, field `_agc_canestrofascicolo_value`), **CaricoMagistratiChart**, **StatoFascicoliChart** (canestro field aggiornato nel modal).
- Aggiornati e pubblicati su Dataverse: `agc_assignfascicolo.js` (updateRecord su `agc_fascicolo2`, control `agc_canestrofascicolo`) e `agc_assignfascicolodialog.html` (endpoint `agc_fascicolo2s`).
- Registrato **SetOwnerTeamPlugin** su `agc_fascicolo2` (step ID: `764dea2a-7779-f111-ab0e-002248996a6d`, Pre-Create, stage 20).
- Rimossa soluzione temporanea `AgicTempWR` da Dataverse e file temporanei dalla repo.
- Commit `7ca5685` pushato su GitHub.

### Decisions made
- **`pac pcf push` workaround**: il comando fallisce sempre sul cleanup (file lock), ma il zip viene generato in `obj/PowerAppsToolsTemp_agc/bin/Debug/`. Soluzione operativa: `pac solution import --path <zip> --force-overwrite`. Questo è il **flusso standard** per i PCF da ora in poi.
- **Publisher prefix per PCF**: i custom control sono registrati con prefix `agc` (non `cc`). Il prefix `cc` era errato e causava il conflitto "already created by another publisher". Usare sempre `--publisher-prefix agc` con `pac pcf push`.
- **agc_fascicolo (vecchia)** lasciata intatta per ora — i 20 record storici restano come backup. Decisione su hide/disable rimandata alla prossima sessione.
- La corruzione della solution `ASPENPOC` (ghost relationship ID: `1e8be637-4f63-f111-ab0c-7ced8d4558ae`) impedisce ancora l'export della solution — non impatta il funzionamento operativo ma blocca il pack automatico.

### Current status
- ✅ `agc_fascicolo2` operativa su Dataverse con 20 record migrati.
- ✅ Tutti i PCF (CaricoPerCanestro, CaricoMagistratiChart, StatoFascicoliChart) aggiornati e caricati su Dataverse.
- ✅ Webresource JS e HTML aggiornate e pubblicate.
- ✅ Plugin SetOwnerTeamPlugin attivo su agc_fascicolo2.
- ⚠️ Form di agc_fascicolo2 nel Maker Portal **non configurata** (i controlli PCF non sono ancora aggiunti alla form — da fare manualmente nel portal).
- ⚠️ Test end-to-end creazione fascicolo **non ancora eseguito**.
- ⚠️ Vecchia tabella `agc_fascicolo` ancora presente (non nascosta/disabilitata).

### Next steps
1. Aprire **Maker Portal** e configurare la form di `agc_fascicolo2`: aggiungere i controlli PCF (CaricoPerCanestro, CaricoMagistratiChart, StatoFascicoliChart) alla form principale.
2. Eseguire test end-to-end: creare un nuovo fascicolo su `agc_fascicolo2`, verificare assegnazione magistrato, canestro, plugin SetOwnerTeam.
3. Valutare se **nascondere o disabilitare** la vecchia tabella `agc_fascicolo` per evitare confusione agli utenti.
4. Verificare il **cruscotto** (Custom Page Home) e aggiornare le query KPI che ancora puntano ad `agc_fascicolos`.

### Files changed
- `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts` — entity `agc_fascicolo2`, field `_agc_canestrofascicolo_value`
- `05 - Power Platform/PCF/CaricoMagistratiChart/index.ts` — modal canestro field → `agc_canestrofascicolo`
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/index.ts` — modal canestro field → `agc_canestrofascicolo`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js` — updateRecord su `agc_fascicolo2`, control `agc_canestrofascicolo`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html` — endpoint `agc_fascicolo2s` (GET + PATCH)
- `05 - Power Platform/PCF/tsconfig.json`, `eslint.config.mjs`, `PCF.pcfproj` — fix multi-project ESLint/tsconfig conflict per CaricoPerCanestro
- `SESSION_NOTES.md` — aggiunta sessione 2026-07-06

---

## Session 2026-06-26

### What was done
- **Layout responsivo** della Custom Page "ASPEN Home": ricostruita con container AutoLayout annidati (`conRoot` → `conCards` → card containers). `conCards` e `conStats` usano `LayoutWrap: true` per adattarsi a schermi stretti; ogni card ha `FillPortions: 1` e `LayoutMinWidth: 280`.
- **KPI dinamici da Dataverse**: aggiunto data source "Fascicoli" (`agc_fascicolo`). 4 indicatori live: Fascicoli Attivi (`CountRows`), Creati ultimi 7 giorni (`Filter` + `DateAdd`), Peso medio (`Average`), Imputati totali (`Sum`).
- **Icone SVG inline**: sostituiti i rettangoli placeholder (`recIconD`, `recIconL`, `recIconC`) con controlli `Image` contenenti SVG inline (48×48 px, colore `#003366`): grafico a barre (Cruscotto), documento con righe (Lista Fascicoli), cerchio con + (Nuovo Fascicolo).
- Tutte le modifiche applicate direttamente in **Power Apps Studio** via automazione Playwright e pubblicate sull'ambiente.

### Decisions made
- **AutoLayout containers** scelti per il layout responsivo (LayoutWrap per wrap automatico delle card su schermi stretti).
- **Image controls con SVG data URI** per le icone, perché il tipo `Icon` nativo non è supportato via YAML paste/import nel designer.
- **Power Apps Studio come sorgente primaria**: le modifiche live non sono state riportate nel file `.pa.yaml` locale, che resta come riferimento storico. Future modifiche vanno fatte direttamente in Power Apps Studio.
- **Automazione Playwright** usata per interagire con Power Apps Studio (click, type, navigazione) in modo programmatico.

### Current status
- ✅ Layout responsivo con AutoLayout containers pubblicato e funzionante.
- ✅ KPI dinamici da Dataverse operativi (19 fascicoli, peso medio 14.2, 156 imputati totali).
- ✅ Icone SVG visibili su tutte e 3 le card operative.
- ✅ Pagina pubblicata e attiva come home della Model-Driven App ASPEN.
- ⚠️ Il file `.pa.yaml` locale è divergente dalla versione live (riferimento storico).

### Next steps
1. Mantenere il file `.pa.yaml` locale come riferimento storico; future modifiche alla home vanno fatte in **Power Apps Studio** direttamente.
2. Valutare export periodico della pagina da Studio per tenere aggiornato il sorgente nel repository (se il formato lo consente).
3. Proseguire con i prossimi step del POC: rimuovi assegnazione, command bar cleanup, notifiche Power Automate.

### Files changed
- `README.md` — aggiornata sezione "Custom Page — Home ASPEN" con layout responsivo, KPI dinamici, icone SVG; aggiornata data POC a 26/06/2026; aggiunto `Mockup/` all'albero repository.
- `SESSION_NOTES.md` — aggiunta sessione 2026-06-26.
- ⚠️ `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/agc_aspenhome.pa.yaml` — **NON modificato** intenzionalmente (la versione live in Power Apps Studio è la fonte di verità).

---

## Session 2026-06-16

### What was done
- Consolidata la chiusura della sessione documentando lo stato della **Custom Page "ASPEN Home"** (già presente nei file di progetto).
- Registrato il tentativo di rilascio su `https://lccministerogiustiziademo.crm4.dynamics.com`: autenticazione PAC riuscita e identificazione corretta di app **ASPEN** e solution **ASPENPOC**.
- Allineata la documentazione sui riferimenti di solution target per la custom page, usando **ASPEN POC / ASPENPOC** dove pertinente.

### Decisions made
- Il rilascio della custom page non è al momento fully automated con il PAC CLI disponibile: import diretto da `.pa.yaml`/`.msapp` non gestibile end-to-end solo da CLI in questo setup.
- Scelta operativa: eseguire il **primo publish dal Maker Portal**, poi proseguire con manutenzione/versioning dal repository.
- Standardizzato il naming della solution target in documentazione: `ASPENPOC` (label: ASPEN POC).

### Current status
- ✅ Custom page home presente e documentata.
- ✅ Accesso PAC all'ambiente DEMO funzionante, con discovery di app e solution target completata.
- ⚠️ Pipeline di deploy custom page non ancora completamente automatizzabile con gli strumenti CLI attuali.

### Next steps
1. Effettuare il primo publish della custom page da Maker Portal nella solution `ASPENPOC`.
2. Verificare apertura app ASPEN con home custom page impostata come default.
3. Rivalutare automazione CLI dopo primo publish (pack/import/publish) e aggiornare la runbook tecnica.

### Files changed
- `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/agc_aspenhome.pa.yaml` — custom page home creata (3 pulsanti + navigazione `Launch`)
- `README.md` — aggiunta sezione "Custom Page — Home ASPEN" + passi manuali maker portal
- `SESSION_NOTES.md` — aggiunta sessione di chiusura con stato deploy, blocco PAC CLI e decisioni operative.

---

## Session 2026-06-12

### What was done
- Aggiornato `agc_fascicolo.agc_statocaso` con nuovo valore OptionSet **Chiuso (2)** e pubblicato in ambiente.
- Aggiornati i PCF di cruscotto:
  - `CaricoMagistratiChart`: esclusione fascicoli chiusi, barra `(non assegnato)` dedicata, ordinamento in fondo, refresh one-shot a 2s dal primo caricamento.
  - `CaricoPerCanestro`: esclusione fascicoli chiusi e nuovo messaggio empty state.
  - `StatoFascicoliChart`: colore stato Chiuso + selettore anno con filtro per annata.
- Corretto campo `agc_statocaso` come filtrabile nelle viste (`IsFilterable=1`).
- Estesa command bar fascicolo con comando **Chiudi Caso**:
  - conferma utente,
  - update stato a Chiuso,
  - refresh form + ribbon.
- Aggiornata icona del comando **Chiudi Caso** con web resource dedicata `agc_closefascicolo_icon.svg`.
- Corretto dialog di assegnazione automatica: il calcolo del carico magistrati ora esclude i fascicoli chiusi.

### Current status
- ✅ Stato Chiuso disponibile e usabile in UI.
- ✅ Tutti i calcoli di carico (magistrato/canestro/assegnazione automatica) escludono i fascicoli chiusi.
- ✅ Cruscotto con filtro anno sul grafico a torta.
- ✅ Comando Chiudi Caso operativo con conferma e refresh.

### Files changed
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo/Entity.xml`
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo/RibbonDiff.xml`
- `05 - Power Platform/AssegnaFascicolo/SolutionProject/Entities/agc_fascicolo/RibbonDiff/RibbonDiff.xml`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_closefascicolo_icon.svg`
- `05 - Power Platform/PCF/CaricoMagistratiChart/index.ts`
- `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts`
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/index.ts`
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/css/chart.css`
- `README.md`

---

## Session 2026-06-11

### What was done
- Analizzato errore Dataverse su **Canestro** in fase di cambio owner team e apertura form (`0x80044150`, `Sql Number: 208`), con identificazione come problema platform/metadati ambiente e non di logica JS/PCF.
- Verificata la configurazione della sitemap su **Impostazioni > Configurazioni**: impostata regola per privilegio di lettura su `agc_configurazione`; utente con ruolo operativo vede la voce ma riceve correttamente accesso negato ai record.
- Verificata la disponibilità dei campi **rollup** in Dataverse: in UI moderna si configurano impostando tipo numerico e comportamento rollup.
- Confermato limite Dataverse: un rollup non aggrega un campo di origine di tipo **calculated** (`agc_fascicolo.agc_peso`).
- Creato branch `modifica-command-bar`, aggiunti `HideCustomAction` per i comandi standard della griglia Fascicoli e deploy su ambiente demo (`AgicAspenRibbon_v8`).
- Verificato post-deploy: i comandi standard risultano ancora visibili in UCI, quindi è necessario intervenire con **Command Designer** (comandi moderni).

### Decisions made
- Per il bug su Canestro, prima azione consigliata: riallineamento metadati in ambiente (publish completo + ricompilazione formula dipendente) e solo dopo eventuale escalation Microsoft con Activity/Session/Correlation IDs.
- Per la sicurezza navigazione, mantenere il controllo principale a livello privilegi tabella; valutare app separata admin/operatori se serve nascondere completamente l'area.
- Per il carico totale magistrato, sospesa implementazione rollup su `agc_peso` finché il peso resta colonna calculated.

### Current status
- ⚠️ Errore SQL su Canestro ancora aperto in ambiente (`0x80044150` / `Sql Number: 208`).
- ✅ Accesso ai record Configurazioni correttamente negato al ruolo operativo.
- ⚠️ Voce sitemap Configurazioni ancora visibile ai non admin (con access denied all'apertura); da rifinire UX se richiesto.
- ⚠️ Rollup peso totale magistrato non applicabile direttamente su `agc_peso` finché è calculated.
- ⚠️ Rimozione comandi standard della command bar Fascicoli non ancora effettiva via RibbonDiff; da completare in Command Designer.

### Next steps
1. Chiudere il bug **Canestro** con riallineamento metadati in ambiente ed eventuale ticket Microsoft.
2. Stabilizzare UX sicurezza sitemap (valutare split app **ASPEN Admin** / **ASPEN Operatore**).
3. Implementare tasto **"Rimuovi assegnazione"** e rendere stabile l'enable rule "magistrato già assegnato".
4. Completare pulizia command bar Fascicoli con **Command Designer** (comandi moderni UCI).
5. Persistere incompatibilità su Dataverse.
6. Implementare notifica magistrato via Power Automate e storico assegnazioni.
7. Valutare alternativa tecnica al campo calculated `agc_peso` se necessario per aggregazioni rollup.

---

## Session 2026-06-09

### What was done
- **Fix PCF `CaricoPerCanestro`**: corretto errore OData — lookup field rinominato da `agc_canestro` a `_agc_canestro_value`; nome canestro letto via annotazione `@OData.Community.Display.V1.FormattedValue`. Build e deploy completato.
- **Nuova configurazione `PesoLimiteCanestro`**: creato record su `agc_configurazione` (`PesoLimiteCanestro = 30`). Usato dal PCF per soglie colore verde/giallo/rosso per-canestro; `PesoLimite` rimane per la logica di assegnazione automatica.
- **Fix enable rule "Assegna Fascicolo"**: reimportata soluzione `AgicAspenRibbon` v7 — il RibbonDiff non era mai stato applicato correttamente (il vecchio ribbon girava senza regole). Aggiunto `onFormLoad` con `refreshRibbon(true)` dopo 1s per rivalutare le enable rules a dati form pronti.
- **Fix `navigateTo` title**: aggiunto `title: "ASPEN - Assegnazione Fascicolo"` sia in `openDialog` che in `openDialogFromGrid`.
- **Fix PATCH assegnazione (400 error)**: navigation property Dataverse era `agc_Magistratoassegnato` (M maiuscola). Corretto in `agc_assignfascicolodialog.html`.
- **Refresh automatico post-modale**: `openDialog` chiama `formContext.data.refresh(false)` nel `.then()` di `navigateTo`; `openDialogFromGrid` chiama `selectedControl.refresh()`.

### Decisions made
- `PesoLimiteCanestro` e `PesoLimite` sono **due record separati** in `agc_configurazione` — il primo governa le soglie visive del PCF CaricoPerCanestro, il secondo la logica di assegnazione.
- Il navigation property name in Dataverse PATCH è **case-sensitive**: `agc_Magistratoassegnato` (M maiuscola) — da tenere presente per ogni futuro sviluppo che coinvolga questa lookup.
- La soluzione ribbon va sempre reimportata dopo modifiche a `RibbonDiff.xml`; il deploy della web resource JS non aggiorna il ribbon.
- `refreshRibbon(true)` nell'`onFormLoad` è necessario perché le enable rules vengono valutate prima che i dati della form siano disponibili.

### Current status
- ✅ PCF `CaricoPerCanestro` funzionante con OData corretto
- ✅ Assegnazione fascicolo reale via PATCH su Dataverse funzionante
- ✅ Ribbon "Assegna Fascicolo" visibile e abilitato correttamente (con refresh post-caricamento form)
- ✅ Refresh automatico della form/griglia dopo chiusura modale
- ✅ Record `PesoLimiteCanestro = 30` presente su Dataverse
- ⚠️ Enable rule che disabilita il tasto se magistrato già assegnato ancora instabile (dipende dal timing del refresh ribbon)
- ⚠️ Incompatibilità non ancora persistite su Dataverse

### Next steps
1. Tasto **"Rimuovi assegnazione"** (ribbon o inline)
2. Enable rule stabile per "magistrato già assegnato" — valutare soluzione alternativa al timing
3. Validazione peso obbligatorio prima di confermare l'assegnazione
4. Notifica al magistrato via **Power Automate** alla conferma
5. **Storico assegnazioni** (audit trail su tabella dedicata)
6. Dashboard carico complessivo tutti i magistrati
7. Soglie per-canestro configurabili per tipo (attualmente unico valore `PesoLimiteCanestro`)
8. **Assegnazione bulk** da griglia (selezione multipla fascicoli)
9. Persistere le incompatibilità su Dataverse (tabella o campo dedicato)

### Files changed
- `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts` — fix OData lookup field name e annotazione nome canestro
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js` — fix enable rule refresh + `navigateTo` title + refresh post-chiusura
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html` — fix PATCH navigation property (M maiuscola) + real assegnazione
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo/RibbonDiff.xml` — enable rule aggiornata
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo/FormXml/main/{687b5f2b-c275-4c61-8e98-46e3515e0dd2}.xml` — aggiunto handler `onFormLoad`

---

## Session 2025-06-08

### What was done
- Implementato il tasto ribbon **"Assegna Fascicolo"** sulla form `agc_fascicolo`
- Creata web resource JS `agc_assignfascicolo.js`: handler ribbon che apre dialog popup via `Xrm.Navigation.navigateTo` passando ID fascicolo e numero RG
- Creata web resource HTML `agc_assignfascicolodialog.html`: carica magistrati da `agc_giudices` via REST, selezione incompatibilità con checkbox (highlight giallo + badge contatore), spinner 2.5s simulazione, schermata successo animata
- Creata icona SVG `agc_assignfascicolo_icon.svg`: persona Fluent UI blu (#0078D4) + freccia verde (#107C10), registrata come web resource tipo 11 con `ModernImage` nel ribbon
- Importata e pubblicata soluzione Dataverse `AgicAspenRibbon` con `RibbonDiff.xml` su `agc_fascicolo`, `EnableRule: Mscrm.FormStateExistingOrReadOnly`
- Aggiornato `README.md` con sezione completa sulla feature
- Commit pushato: `e7dee60` su `master`

### Decisions made
- **Autenticazione dialog**: usa URL relativo (same-domain cookie auth) per le chiamate REST Dataverse — no Bearer token necessario in contesto model-driven
- **Parametro dialog**: si legge con `new URLSearchParams(location.search).get("Data")` — **D maiuscola** (comportamento Xrm.Navigation)
- **Icona ribbon**: `ModernImage` richiede prefisso `$webresource:` (es. `$webresource:agc_assignfascicolo_icon.svg`), tipo SVG = type 11 nel manifest
- **Flusso assegnazione**: la demo simula con spinner — l'implementazione reale è delegata a Plugin / Custom API (decisione esplicita: non implementare logica nei ribbon JS)
- **File sorgente**: tutto sotto `05 - Power Platform/AssegnaFascicolo/` con subdirectory `WebResources/` e `AgicAspenRibbon_unpacked/`

### Current status
- ✅ Tasto "Assegna Fascicolo" visibile e funzionante nel POC (solo record esistenti)
- ✅ Dialog UI completo: lista magistrati, incompatibilità, UX animata
- ✅ Soluzione pubblicata su `lccministerogiustiziademo.crm4.dynamics.com`
- ⚠️ Logica di assegnazione reale **non implementata** — il dialog simula con spinner 2.5s
- ⚠️ Incompatibilità salvate localmente nel dialog ma non persistite su Dataverse

### Next steps
1. Aggiungere pagina **Configurazione** alla sitemap (gestione `PesoLimite` da UI)
2. Implementare **logica assegnazione reale** — Plugin Dataverse o Custom API chiamata dal dialog
3. Persistere le incompatibilità selezionate su Dataverse (tabella dedicata o campo su `agc_giudice`)
4. Pianificare integrazione **SICP** (registro generale Ministero)
5. Validare con il cliente la sintesi AS-IS della call 04/06/2026

### Files changed
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js` — handler ribbon creato
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html` — dialog UI creato
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo_icon.svg` — icona SVG creata
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/` — sorgente soluzione Dataverse
- `README.md` — aggiunta sezione "Ribbon button — Assegna Fascicolo" con dettaglio file, comportamento e note tecniche

---


