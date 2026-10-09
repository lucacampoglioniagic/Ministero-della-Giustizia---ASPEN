# Changelog — ASPEN (Ministero della Giustizia)

Registro delle modifiche principali applicate alla solution `ASPEN` e alla documentazione di progetto. Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.0.0/). Per il dettaglio operativo di ogni intervento vedi `SESSION_NOTES.md`.

## [Non rilasciato] — Fase 12: validazione finale e parità funzionale

### Aggiornato (09/10/2026, `Tribunali-dev`) — pubblicato
- PCF `CaricoMagistratiChart` 1.0.1 → 1.0.2: rimossa la colonna Stato dalla modale.
- PCF `FascicoliPerCanestroChart` 1.0.1 → 1.0.4, rinominato "Fascicoli per Peso":
  - selettore Peso 1/Peso 2 sotto il filtro Anno;
  - rimossa la colonna Stato dalla modale;
  - il Peso risultava sempre 0 perché `agc_pesocalcolato2` non è tra le colonne della view del dataset → i fascicoli sono ora letti via Web API (`retrieveMultipleRecords` su `agc_fascicolo2`); nel manifest è dichiarato il `feature-usage` `WebAPI` (senza, errore "Feature WebAPI.retrieveMultipleRecords is required...");
  - fix layout: torta schiacciata, risolto con `min-height: 420px` sul holder del canvas.
- PCF `EsoneriAttiviChart`: invariato. I 2 esoneri "Attivi" su dev iniziano il 10/10 e il 12/10 (date future), quindi correttamente non compaiono.
- Pubblicazione: solo i PCF, senza reimportare la solution. `pac pcf push` fallisce con `MSB3231`, quindi è stato importato lo zip `PowerAppsToolsTemp_agc`.

### Aggiornato (08/10/2026, `Tribunali-dev`)
- PCF `CaricoMagistratiChart`: aggiunto scroll verticale (contenitore `.chart-scroll`, 34px per barra + 60px per l'asse; costanti `ROW_HEIGHT_PX`/`AXIS_HEIGHT_PX` in `index.ts`, regole in `css/chart.css`) per evitare barre schiacciate con molti magistrati.
- PCF `EsoneriAttiviChart` 1.0.1 → 1.0.2: nel giorno di inizio dell'esonero il grafico risultava vuoto. Causa: `agc_datainizio` è un campo solo-data e la stringa `YYYY-MM-DD` parsata con `new Date()` è mezzanotte UTC (02:00 locale), quindi maggiore di "oggi a mezzanotte locale" → esonero considerato "non ancora iniziato". Fix: `toDateOrNull` normalizza al giorno locale. Verificato (canvas visibile).
- Custom page **ASPEN Home** (`cr248_aspenhome_1750e`): i pulsanti "Vai alla dashboard", "Apri elenco", "Crea ora" puntavano a `https://main.aspx/...`. Causa: `Src/Screen1.pa.yaml` nel `.msapp` conservava `Launch("/main.aspx?appid=" & Param("appid")...)` (appid vuoto, URL relativo non risolto dal runtime), mentre `Controls/4.json` aveva già URL assoluti; il runtime usa il `pa.yaml`. Fix: 3 `Launch` sostituiti con URL assoluti di dev (`https://org8e819d4a.crm4.dynamics.com/main.aspx?appid=7c769e36-f2b7-f111-aaab-000d3a697f24&...`) in `Src/Screen1.pa.yaml` (aggiornato in `Solution/ASPEN_unpacked/CanvasApps`) e in `Model-Driven-App/AspenHomeCustomPage/Source/Screen1.fx.yaml`. **Nota:** URL specifici dell'ambiente dev; per `Tribunali-test` vanno adattati.
- Pubblicazione **senza reimportare la solution ASPEN** (per non perdere le modifiche manuali al ribbon fatte con Ribbon Workbench):
  - PCF: `pac pcf push --publisher-prefix agc` da una copia temporanea con solo la cartella del controllo + `package.json`/`tsconfig`/`PCF.pcfproj`/`pcfconfig.json` e junction `node_modules` (il `PCF.pcfproj` multi-controllo fa fallire `pcf push` con "more than one ControlManifest").
  - Custom page: solution temporanea via Web API (es. `AspenHomeTmp`) con solo il canvasapp (`AddSolutionComponent`, `ComponentType` 300) → `pac solution export`/`unpack` → modifica del `.msapp` (**patchare sia `Controls/*.json` sia `Src/*.pa.yaml`**: il runtime usa il `pa.yaml`) → pack → import con `--publish-changes` → cancellazione della solution temporanea.
- Auth: il device code è bloccato dalla conditional access (AADSTS 53003); usare `pac auth create --name TribunaliDevCli2 --environment https://org8e819d4a.crm4.dynamics.com/` (login interattivo nel browser) e selezionare TribunaliDevCli2 se `pac auth list` ha un altro profilo attivo.

### Aggiornato (07/10/2026, `Tribunali-dev`)
- Web resource `agc_esoneroform.js`: `agc_percentualeesonero` obbligatorio quando `agc_tipoesonero` ≠ Totale; nascosto/azzerato/non obbligatorio se Totale (nessun plugin di validazione aggiuntivo).
- PCF `CaricoMagistratiChart` 1.0.0 → 1.0.1: barre basate su `contact.agc_caricoattuale` (ricarica max ogni 5s); `(non assegnato)` invariato; modale con "Carico attuale" e "Peso totale fascicoli".

### Corretto (07/10/2026)
- 70 contatti magistrati importati da `Lista Magistrati 07-10-2026 13-15-11.xlsx` avevano `agc_ismagistrato=No` (invisibili nella vista "Lista Magistrati"): impostato a Sì via `pac data import`.
- Riattivati via Web API i 10 step SDK plugin ASPEN disabilitati dal 05/10 18:38 (pattern ricorrente post `pac solution import`; ricontrollare gli step dopo ogni import). Le assegnazioni dal 05/10 non hanno aggiornato `agc_caricoattuale`: eventuale riallineamento manuale con "Modifica carico".

### Aggiunto
- Nuova colonna Choice `agc_appscope` su `agc_configurazione` per classificare i record di configurazione per applicazione (`ASPEN`, `ASSPECA`).
- Campo `agc_appscope` aggiunto alla form principale di `agc_configurazione`.
- Configurazioni BU-specifiche ASPEN per i 3 tribunali censiti (Milano, Messina, Roma):
  - `ASPEN_PesoLimite_<BUId>`
  - `ASPEN_PesoLimiteCanestro_<BUId>`

### Aggiornato
- Viste `agc_configurazione` usate da ASPEN (`Lista Configurazioni` e `Configurazioni`) filtrate su `agc_appscope = ASPEN`.
- PCF `CaricoMagistratiChart` e `CaricoPerCanestro` aggiornati per leggere configurazioni con priorità su scope `ASPEN` e fallback ai record legacy senza scope.
- UX tabella/form `agc_configurazione`: introdotta la colonna utente **"Tipologia configurazione"** (valori esposti: "Peso limite" / "Peso limite canestro") e rimosso dalla UI il campo tecnico `agc_nome` (rinominato "Nome configurazione", mantenuto popolato come chiave interna per compatibilità runtime PCF e lookup BU-specifici).
- Riordino repository (non funzionale): introdotta convenzione operativa "sorgente autorevole" nel README (incluse sezioni "Stato corrente" e "Percorso rapido"); archiviate le versioni storiche `AgicAspenRibbon_v2..v8`/`_exported` in `05 - Power Platform/AssegnaFascicolo/_archive/` con README dedicato; marcata `AssegnaFascicolo/WebResources` come copia derivata; rimosso debug logging `console.log` residuo da `agc_assignfascicolo.js` (sorgente solution e copia derivata).
- Dati configurazione base riallineati in Dev/Test:
  - `PesoLimite=48` (`ASPEN`)
  - `PesoLimiteCanestro=15` (`ASPEN`)
  - `IndiceTurnoSezione=0` (`ASSPECA`)

### Operativo (ambienti)
- In `Tribunali-test` create le BU mancanti (`Tribunale di Milano`, `Tribunale di Messina`, `Tribunale di Roma`) per allineamento con `Tribunali-dev`.
- Verificata presenza della colonna `agc_appscope` e dei record configurazione attesi in entrambi gli ambienti.

### Corretto
- **ASPEN Home custom page**: risolto errore runtime su datasource `Fascicoli` in ambiente `Tribunali-dev` (`400 Could not find a property named 'agc_pesocalcolato'...`) aggiornando il mapping al campo live `agc_pesocalcolato2` nel pacchetto canvas app `cr248_aspenhome_1750e_DocumentUri.msapp`.

### Aggiornato
- Riallineati in repository i sorgenti **live** delle solution Ribbon modificate da Ribbon Workbench, esportate da `Tribunali-dev` e unpacked in:
  - `05 - Power Platform/AssegnaFascicolo/ASPENRibbon_unpacked_live/`
  - `05 - Power Platform/AssegnaFascicolo/ASPENRibbon2_unpacked_live/`

### Aggiunto
- Export/unpack della solution `ASPEN` (unmanaged) in `05 - Power Platform/Solution/ASPEN_unpacked/`, versionata in repo per tracciabilità e test di restorability.
- Nuova sezione README "Ambiente di destinazione — Tribunali-dev" con GUID chiave, procedura di re-point della Custom Page "ASPEN Home" e formule Command Designer.
- Questo file `CHANGELOG.md`.

### Verificato
- Checklist §7 del piano di migrazione aggiornata: E2E-39 (link Home "Cruscotto ASPEN"/"Nuovo Fascicolo") ed E2E-40 (layout responsive a 1400/1000/600px) confermati eseguiti e chiusi.
- Export managed di prova: nessun errore bloccante; presenti 142 `MissingDependencies` attese/note (form OOB `contact` su app Microsoft non incluse; tabelle legacy `agc_canestrofascicolo`/`agc_peso2`), non bloccanti per il go-live.
- `pac solution checker`: 0 Critical, 0 High, 39 Medium, 0 Low — criterio di Fase 12 "nessun errore High" soddisfatto.
- Audit di completezza della solution (app, PCF, web resource, tabelle, flussi, ruoli, plugin): individuata e corretta l'assenza del ruolo di sicurezza **"Amministratore ASPEN"** dai RootComponents, aggiunto con `pac solution add-solution-component --solutionUniqueName ASPEN --component 9fb62eb8-4fb7-f111-aaab-7ced8d763868 --componentType 20`.

### Rimosso
- Tabella legacy **`agc_canestrofascicolo`** ("Peso 1" storica) eliminata fisicamente dall'ambiente `Tribunali-dev` — dismissione completata (in precedenza fermata per dipendenze residue, vedi sessione 26-27/09/2026). Rimossa dai RootComponents della solution e dai `MissingDependencies`.
- Tabella legacy **`agc_peso2`** ("Peso 2" storica) eliminata fisicamente dall'ambiente `Tribunali-dev` — dismissione completata a seguire, stesso giorno. Export managed di prova ripetuto: **0 MissingDependencies** (nodo assente). `pac solution checker`: 0 Critical, 0 High, **21 Medium** (in calo da 39), 0 Low — i 21 residui sono pre-esistenti (console.log, "use strict", 2 dipendenze minori non correlate, 1 nome schermata canvas), nessuno riferito alle tabelle legacy.

### Noto/residuo (non bloccante)
- Layout Home privo di scroll verticale su viewport stretti/bassi (item aperto, richiede wrapping in Container scrollabile da Power Apps Studio).
- Fase 9 (governance Power Automate, service account con licenza Premium per il flow "Chiusura automatica esoneri scaduti") saltata su richiesta esplicita del cliente, da pianificare separatamente.

## Storico (Fasi 0-11)

Per il dettaglio di tutte le migrazioni, fix e verifiche E2E delle Fasi 0-11 (datamodel, sicurezza, plugin, UI, dashboard/Home, Power Automate, dati di test, 42 scenari E2E Playwright), vedere `SESSION_NOTES.md` (ordine cronologico inverso) e `03 - Documentazione Prodotta/Tecnica/ASPEN - Piano di Migrazione Ambiente Destinazione.md` §7.
