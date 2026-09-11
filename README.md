# Ministero della Giustizia – ASPEN

**Cliente:** Ministero della Giustizia  
**Fornitore:** AGIC Technology  
**Data avvio:** Giugno 2026

---

## Obiettivo del progetto

Reingegnerizzazione del portafoglio applicativo **ASPEN** — famiglia di applicativi legacy per l'assegnazione automatica dei fascicoli giudiziari ai magistrati — su **Microsoft Power Platform** in logica model-driven (Dataverse).

---

## Portafoglio applicativo AS-IS

| Applicativo | Stato | Sede attiva | Stack | Database |
|---|---|---|---|---|
| ASPEN | **Dismesso** | — | Visual Basic 6 | SQL Server 2000 |
| ASPEN2 | **In produzione** | Palermo – Ufficio GIP | VB6 | SQL Server |
| ASPENCA | Installato, non usato | Palermo (pensato per Corte d'Appello) | Visual Basic 6 | Access |
| ASSPECA | — | Napoli | VB6 / Access | Access |

> La stessa struttura base è presente anche a Milano, Monza, Roma e Napoli con configurazioni locali.  
> Vedi analisi completa: [`02 - Analisi/AS-IS/ASPEN - Analisi AS-IS.md`](02%20-%20Analisi/AS-IS/ASPEN%20-%20Analisi%20AS-IS.md)

---

## Struttura della repository

```
📁 01 - Documentazione Input/
│   ├── AGIC/                        # Documenti interni AGIC (analisi preliminare, checklist)
│   ├── Cliente/                     # Documenti forniti dal Ministero / sedi giudiziarie
│   └── Politecnico di Milano/       # Studio di fattibilità Polimi (v.5, 02/08/2023)

📁 02 - Analisi/
│   ├── AS-IS/                       # Analisi stato attuale (modello dati, processi, algoritmi)
│   ├── TO-BE/                       # Architettura target, modello dati Dataverse
│   └── Sessioni con il Cliente/     # Note e output delle sessioni di analisi

📁 03 - Documentazione Prodotta/
│   ├── Funzionale/                  # Specifiche funzionali, analisi e documentazione principale
│   ├── Tecnica/                     # Specifiche tecniche, integrazioni (SICP, Entra ID)
│   └── Architettura/                # Diagrammi architetturali (Power Platform, Dataverse)

📁 04 - Riunioni e Call/             # Verbali, riassunti call, interlocutori

📁 05 - Power Platform/
│   ├── Dataverse/                   # Schema tabelle, relazioni, choice columns
│   ├── Model-Driven-App/            # File app model-driven
│   ├── Power-Automate/              # Flussi di automazione
│   ├── Plugin-Custom-API/           # Plugin Dataverse / Custom API per logica assegnazione
│   ├── PCF/                         # CaricoMagistratiChart — barre orizzontali carico magistrati
│   ├── PCF-Pie/                     # StatoFascicoliChart — torta fascicoli per stato
│   ├── AssegnaFascicolo/            # Ribbon button + dialog "Assegna Fascicolo" su agc_fascicolo2
│   └── Mockup/                      # Mockup visivi della UI (screenshot, bozze layout)

📁 06 - Riferimenti Normativi e Tecnici/   # Normativa, lettere istituzionali, docs tecnici
```

---

## Documenti di riferimento

| Documento | Percorso | Note |
|---|---|---|
| Analisi AS-IS | [`02 - Analisi/AS-IS/ASPEN - Analisi AS-IS.md`](02%20-%20Analisi/AS-IS/ASPEN%20-%20Analisi%20AS-IS.md) | Bozza da validare con il cliente |
| Analisi e documentazione principale | [`03 - Documentazione Prodotta/Funzionale/ASPEN - Analisi e documentazione.docx`](03%20-%20Documentazione%20Prodotta/Funzionale/ASPEN%20-%20Analisi%20e%20documentazione.docx) | Documento funzionale principale |
| Sintesi call 04/06/2026 | [`04 - Riunioni e Call/ASPEN - Sintesi call 04-06-2026.docx`](04%20-%20Riunioni%20e%20Call/ASPEN%20-%20Sintesi%20call%2004-06-2026.docx) | Prima call di analisi AS-IS |
| Script voiceover video demo | [`03 - Documentazione Prodotta/Video/ASPEN - Script Voiceover Demo.txt`](03%20-%20Documentazione%20Prodotta/Video/ASPEN%20-%20Script%20Voiceover%20Demo.txt) | Testo per TTS (~2,5 min), usato per il video dimostrativo dell'app |

---

## Architettura target

- **Piattaforma:** Microsoft Power Platform – Model-Driven App su Dataverse  
- **Sicurezza:** Business Units per sede, ruoli di sicurezza nativi, Entra ID  
- **Logica assegnazione:** Plugin Dataverse / Custom API (per robustezza transazionale)  
- **Integrazione:** SICP (registro generale Ministero)  
- **Reporting:** Dashboard model-driven + Power BI  

---

## POC — stato attuale (06/07/2026)

**Ambiente Dataverse:** `LCC-MINISTEROGIUSTIZIA-DEMO` (https://lccministerogiustiziademo.crm4.dynamics.com)  
**Publisher prefix:** `agc_`

### Modello dati POC

| Tabella Dataverse | LogicalName | Descrizione |
|---|---|---|
| Canestro | `agc_canestrofascicolo` | Materie/competenze (es. Stupefacenti, Omicidio…) — ex `agc_canestro` |
| Magistrato | `contact` (standard) | Contatti Dataverse con `agc_ismagistrato = true` — ex tabella custom `agc_giudice` |
| Fascicolo/Assegnazione | `agc_fascicolo2` | Fascicoli con peso calcolato e lookup a magistrato (contact)+canestro — ex `agc_fascicolo` |
| Configurazione | `agc_configurazione` | Parametri di sistema (`PesoLimite = 20`, `PesoLimiteCanestro = 30`) |

> **Migrazione 06/07/2026:** le tabelle originali `agc_fascicolo` e `agc_canestro` sono state sostituite da `agc_fascicolo2` e `agc_canestrofascicolo`. La causa era una ghost relationship corrotta (`agc_CanestroName`) sulla tabella `agc_fascicolo` che impediva la creazione di nuovi fascicoli. Sono stati migrati 20 record. Commit: `7ca5685`.
>
> ⚠️ **`agc_fascicolo` e `agc_canestro` sono DISMESSE — NON USARE.** Restano in ambiente solo come backup storico dei dati originali (read-only), ma non sono più referenziate da alcun componente applicativo (PCF, ribbon, plugin, custom page). Tutto il codice e la documentazione devono fare riferimento esclusivamente a `agc_fascicolo2` e `agc_canestrofascicolo`. Qualsiasi nuovo sviluppo, form, view o automazione va creato solo sulle nuove tabelle.
>
> ⚠️ **Migrazione Magistrati → Contatti (27/08/2026):** la tabella custom `agc_giudice` è stata **sostituita dalla tabella standard `contact`**, poiché i magistrati diventeranno gli utenti effettivi autenticati dell'applicazione. Nuova lookup su `agc_fascicolo2`: **`agc_magistratocontatto`** → `contact` (sostituisce `agc_magistratoassegnato` → `agc_giudice`, ora dismessa). Tutti i riferimenti nel codice (webresource JS/HTML, PCF, dashboard, sitemap, ribbon) sono stati aggiornati; il ruolo di sicurezza "Operatore ASPEN" ha ricevuto i privilegi mancanti su `contact`. Le occorrenze di `agc_giudice`/`agc_magistratoassegnato` più sotto in questo documento sono **storiche** (riferite allo stato precedente al 27/08/2026) — vedi `SESSION_NOTES.md`, sessione 2026-08-27, per il dettaglio completo della migrazione.
>
> ⚠️ **Decisione architetturale confermata (27/08/2026, sessione pomeriggio):** poiché i magistrati accedono con licenza personale via Entra ID (quindi come `systemuser` a livello Dataverse), l'uso "puro" di `contact` come utente applicativo è formalmente incompleto. **Opzione C approvata**: mantenere `contact` come anagrafica arricchita del magistrato, aggiungendo una lookup `contact → systemuser` (`agc_utenteapplicativo`, **non ancora implementata** — todo `fix-lookup-contact-usersu`) per il collegamento all'utente applicativo reale. Nessun rollback della migrazione a `contact` già effettuata.
>
> ⚠️ **Fix regressioni post-migrazione (27/08/2026, sessione pomeriggio):** risolte 3 delle 5 regressioni segnalate dopo la migrazione a `contact` — vista/colonna "Magistrato assegnato" stale, visibilità errata di "Assegna Fascicolo", e mancata possibilità di nascondere "Chiudi Caso" (in tutti i casi causa radice: webresource/ribbon non ripubblicati correttamente dopo la migrazione, più un Service Worker del browser che serviva risposte in cache). **Sbloccato in questa sessione** un workaround permanente per il redeploy della solution `AgicAspenRibbon`, il cui `pac solution export` restava bloccato da mesi da un errore di metadata cache orfana: si usa `pac solution pack` direttamente dalla cartella unpacked locale (bypassa la query rotta) seguito da `pac solution import`. Ancora aperti: fix PCF Cruscotto ASPEN (dati/canestro non aggiornati a `contact`) e PCF "Carico per Canestro" mancante sulla form Contatto. Vedi `SESSION_NOTES.md`, sessione 2026-08-27 (pomeriggio/sera).

**Colonne chiave `agc_fascicolo2`:**

| Colonna | LogicalName | Tipo | Obbligatorio |
|---|---|---|---|
| Numero RG | `agc_numeroregistrogenerale` | String | ✅ **Sì** (ApplicationRequired) |
| N. imputati | `agc_numeroimputati` | Integer | ✅ **Sì** (ApplicationRequired) |
| N. imputazioni | `agc_numeroimputazioni` | Integer | ✅ **Sì** (ApplicationRequired) |
| Canestro fascicolo | `agc_canestrofascicolo` | Lookup → agc_canestrofascicolo | ✅ **Sì** (ApplicationRequired) |
| Punti imputati | `agc_puntiimputati` | Integer | No |
| Punti imputazioni | `agc_puntiimputazioni` | Integer | No |
| Magistrato assegnato | `agc_magistratoassegnato` | Lookup → agc_giudice | No |
| Peso (dismesso) | `agc_peso` | Decimal — **NON PIÙ USATO** dal 07/07/2026: rimosso da form/viste, sostituito da `agc_pesocalcolato`. Rimane in schema solo come colonna storica | No |
| Peso calcolato | `agc_pesocalcolato` | Decimal — campo calcolato (formula), sostituisce `agc_peso` in tutti i PCF, dashboard e logiche di assegnazione automatica | No (calcolato) |
| Stato | `agc_statocaso` | OptionSet: 0=Validato, 1=Proposto, 2=Chiuso | No |
| Data | `agc_datacaso` | DateTime | No |

> **Obbligatorietà campi (07/07/2026):** su richiesta del cliente sono stati impostati come **ApplicationRequired** (obbligatori in form, bloccanti al salvataggio) i campi Numero RG, N. imputati, N. imputazioni e Canestro fascicolo. Verificato via metadati Dataverse (`EntityDefinitions(agc_fascicolo2)/Attributes`).

**Tabella `agc_canestrofascicolo` (13 record, popolati il 07/07/2026 da `agc_canestro`):**

| Colonna | LogicalName | Tipo |
|---|---|---|
| Nome | `agc_name` | String (primary) |
| Peso | `agc_peso` | Integer |

> **Popolamento 07/07/2026:** i 13 canestri sono stati copiati dalla vecchia tabella `agc_canestro` (campi `agc_tipodireato` → `agc_name`, `agc_pesocanestro` → `agc_peso`), usata come unico riferimento disponibile. 18 dei 20 fascicoli di `agc_fascicolo2` sono stati riassociati al canestro corretto recuperando il collegamento originale dalla vecchia tabella `agc_fascicolo` (campo `_agc_canestro_value`, ancora leggibile via Web API). I fascicoli `2024` e `RG-2026/11122` non avevano canestro nemmeno nella tabella storica e restano senza associazione — da chiarire con il cliente. Contestualmente sono stati eliminati 20 record duplicati da `agc_fascicolo2` (migrazione del 06/07/2026 eseguita per errore due volte). Dettagli in `SESSION_NOTES.md` — sessione 2026-07-07.

### Componenti PCF pubblicati

#### `AgicAspen.CaricoMagistratiChart` — `05 - Power Platform/PCF/`
Grafico a barre orizzontali del carico per magistrato.
- **Colori dinamici** dalla soglia `PesoLimite` in `agc_configurazione`:
  - 🟢 Verde `#107C10` — carico < 80% soglia
  - 🟡 Giallo `#FFB900` — carico ≥ 80% soglia
  - 🔴 Rosso `#D13438` — carico ≥ soglia
- 🟣 Barra dedicata per `(non assegnato)` con ordinamento forzato in fondo
- Esclude i fascicoli in stato **Chiuso** dal calcolo carico
- Refresh automatico one-shot a 2s dal primo caricamento per riallineare i colori
- **Legenda colori** inline sotto il grafico
- **Click su barra** → modal con elenco fascicoli assegnati al magistrato; colonna canestro letta da `agc_canestrofascicolo` / `agc_canestrofascicoloname`
- **Mapping nel designer:** `magistratoField` → `agc_magistratoassegnato`, `pesoField` → `agc_pesocalcolato` (aggiornato 07/07/2026, ex `agc_peso` — vedi nota migrazione sotto)
- **Dataset bindato al dashboard "Cruscotto ASPEN"** tramite view Dataverse (non hardcoded nel codice PCF). ⚠️ **Fix 07/07/2026:** la view era ancora puntata su `agc_fascicolo` (vecchia tabella dismessa) — vedi nota migrazione sotto

#### `AgicAspen.CaricoPerCanestro` — `05 - Power Platform/PCF/CaricoPerCanestro/`
Grafico a barre del carico per canestro (materia giudiziaria).
- **Colori dinamici** dalla soglia `PesoLimiteCanestro` in `agc_configurazione` (default = 30):
  - 🟢 Verde `#107C10` — carico < 80% soglia
  - 🟡 Giallo `#FFB900` — carico ≥ 80% soglia
  - 🔴 Rosso `#D13438` — carico ≥ soglia
- Esclude i fascicoli in stato **Chiuso** dal calcolo carico
- Empty state: `Nessun fascicolo aperto assegnato a questo magistrato.`
- **OData fix**: query su `agc_fascicolo2`; lookup field canestro letto come `_agc_canestrofascicolo_value`; nome canestro via annotazione `@OData.Community.Display.V1.FormattedValue`; peso letto da `agc_pesocalcolato` (aggiornato 07/07/2026, ex `agc_peso`)

#### `AgicAspen.StatoFascicoliChart` — `05 - Power Platform/PCF-Pie/`
Grafico a torta distribuzione fascicoli per stato.
- Verde = Validato, Blu = Proposto, Grigio = Chiuso
- Tooltip con valore assoluto e percentuale
- Selettore **Anno** (pill UI) con opzione `Tutti gli anni` + elenco annualità presenti nei dati
- **Click su fetta** → modal con elenco fascicoli di quello stato; colonna canestro letta da `agc_canestrofascicolo` / `agc_canestrofascicoloname`
- **Mapping nel designer:** `statoField` → `agc_statocaso`; colonna "Peso" nel modal drill-down letta da `agc_pesocalcolato` (aggiornato 07/07/2026, ex `agc_peso` — richiede che la view Dataverse bindata includa questa colonna)
- **Dataset bindato al dashboard "Cruscotto ASPEN"** tramite view Dataverse (non hardcoded nel codice PCF). ⚠️ **Fix 07/07/2026:** la view era ancora puntata su `agc_fascicolo` (vecchia tabella dismessa) — vedi nota migrazione sotto

> ⚠️ **Fix binding dashboard 07/07/2026:** il codice di `CaricoMagistratiChart` e `StatoFascicoliChart` era già aggiornato (06/07/2026) per leggere i campi `agc_canestrofascicolo`/`agc_canestrofascicoloname`, ma il **dashboard "Cruscotto ASPEN"** risultava ancora bindato — tramite le view Dataverse "Fascicoli aperti" e "Fascicoli (tutti)" — alla **vecchia tabella `agc_fascicolo`** (che non ha quei campi, causando canestro vuoto nel modal e dati non aggiornati). Risolto creando due nuove view pubbliche su `agc_fascicolo2` (`Fascicoli 2 aperti (Cruscotto)`, `Fascicoli 2 (tutti) (Cruscotto)`) e aggiornando il `formxml` del dashboard (`TargetEntityType` e `ViewId` di entrambi i controlli) per puntare a `agc_fascicolo2`. Pubblicazione eseguita con `PublishAllXml`. `CaricoPerCanestro` non era interessato dal problema perché interroga `agc_fascicolo2` direttamente via WebAPI nel codice, senza dipendere da una view del dashboard.
>
> ⚠️ **Migrazione Peso → Peso calcolato (07/07/2026):** il campo `agc_peso` (Decimal, manuale) è stato **rimosso da form e viste** di `agc_fascicolo2` e sostituito da un nuovo campo calcolato **`agc_pesocalcolato`** (Decimal, formula). `agc_peso` resta presente nello schema solo come colonna storica non più aggiornata — **non usarlo in nuovi sviluppi**. Componenti aggiornati per usare `agc_pesocalcolato`:
> - `CaricoPerCanestro` (PCF form Magistrato): query WebAPI aggiornata (`$select`/`$filter`/somma) — codice e build ridistribuiti via `pac pcf push` + `pac solution import`.
> - `StatoFascicoliChart` (PCF cruscotto): lettura `record.getValue(...)` aggiornata — codice e build ridistribuiti via `pac pcf push` + `pac solution import`.
> - `CaricoMagistratiChart` (PCF cruscotto): il campo `pesoField` è configurabile da designer, non hardcoded nel codice — aggiornato il binding `pesoField` nel `formxml` del dashboard "Cruscotto ASPEN" (3 occorrenze, una per `formFactor`) via Web API (`systemforms` + `PublishAllXml`).
> - Le due view del dashboard `Fascicoli 2 aperti (Cruscotto)` e `Fascicoli 2 (tutti) (Cruscotto)`: colonna `agc_peso` sostituita con `agc_pesocalcolato` in `fetchxml` e `layoutxml` via Web API (`savedqueries` + `PublishAllXml`).
> - `agc_assignfascicolodialog.html` (dialog "Assegnazione automatica"): la logica di bilanciamento del carico tra magistrati sommava `agc_peso` — aggiornata per sommare `agc_pesocalcolato`, altrimenti l'assegnazione automatica avrebbe usato dati non più mantenuti. Webresource aggiornato via Web API (`webresourceset` + `PublishXml`).
>
> Tutte le modifiche sono state applicate live nell'ambiente `LCC-MINISTEROGIUSTIZIA-DEMO` e verificate via Web API (rilettura post-update di view, formxml e webresource).

### Ribbon button — Assegna / Chiudi Fascicolo

Tasti custom **"Assegna Fascicolo"** e **"Chiudi Caso"** nella command bar della form `agc_fascicolo2`.  
Visibili su record esistenti. Soluzione Dataverse: `AgicAspenRibbon`.

**File sorgente: `05 - Power Platform/AssegnaFascicolo/`**

| File | Tipo | Descrizione |
|---|---|---|
| `WebResources/agc_assignfascicolo.js` | JS (type 3) | Handler ribbon: legge l'ID fascicolo e apre il dialog via `Xrm.Navigation.navigateTo` |
| `WebResources/agc_assignfascicolodialog.html` | HTML (type 1) | Dialog popup standalone |
| `WebResources/agc_assignfascicolo_icon.svg` | SVG (type 11) | Icona comando Assegna Fascicolo |
| `WebResources/agc_closefascicolo_icon.svg` | SVG (type 11) | Icona comando Chiudi Caso |
| `AgicAspenRibbon_unpacked/` | Solution unpacked | Sorgente soluzione con `RibbonDiff.xml` |

**Comportamento del dialog (implementazione reale):**
1. Carica lista magistrati da `agc_giudices` via REST (`/api/data/v9.2/agc_giudices`)
2. Permette selezione multipla di magistrati **incompatibili** (evidenziati in giallo con badge contatore)
3. **Conferma** → PATCH su `agc_fascicolo2s({id})` con navigation property `agc_Magistratoassegnato@odata.bind` → schermata successo → chiusura automatica
4. **Annulla** → chiude il dialog
5. **Refresh automatico**: alla chiusura, la form chiama `formContext.data.refresh(false)` e la griglia chiama `selectedControl.refresh()`
6. **Assegnazione automatica**: il calcolo del carico magistrato esclude i fascicoli in stato **Chiuso**

**Comportamento chiusura caso:**
1. Click su **Chiudi Caso** in form
2. Dialog di conferma
3. Se confermato: update `agc_statocaso = 2 (Chiuso)` + refresh form + refresh ribbon

**Note tecniche:**
- Il dialog usa URL relativo per le chiamate Dataverse (same-domain cookie auth — no Bearer token)
- Il parametro passato al dialog si legge con `new URLSearchParams(location.search).get("Data")` (D maiuscola)
- `ModernImage` nel `RibbonDiff.xml` richiede il prefisso `$webresource:` (es. `$webresource:agc_assignfascicolo_icon.svg`)
- Navigation property PATCH è **case-sensitive**: `agc_Magistratoassegnato` (M maiuscola)
- `refreshRibbon(true)` nell'`onFormLoad` (delay 1s) è necessario per rivalutare le enable rules dopo il caricamento dati della form
- La soluzione ribbon va **sempre reimportata** dopo modifiche a `RibbonDiff.xml`; il deploy della web resource JS non aggiorna il ribbon
- `agc_assignfascicolo.js` chiama `updateRecord("agc_fascicolo2")` e verifica la lookup `agc_canestrofascicolo` per il controllo di assegnazione
- `agc_assignfascicolodialog.html` interroga l'endpoint `agc_fascicolo2s` per il caricamento del record fascicolo

**Pulsanti standard nascosti in griglia** (`HideCustomAction` in `RibbonDiff.xml`, corretti il 07/07/2026): "Mostra questa visualizzazione", "Invia link tramite messaggio e-mail" (+ varianti OOB `SendDirectEmail`/`modern.SendDirectEmail`), "Flusso" (+ voce annidata `.Flows`), "Esegui report". "Mostra grafico" resta visibile su entrambe le tabelle: è un comando della command bar moderna, non presente nel `RibbonXml` classico e quindi non gestibile con `HideCustomAction`.
⚠️ La solution `AgicAspenRibbon` **non può essere reimportata includendo `agc_fascicolo`** (vecchia tabella): la ghost relationship storica (`agc_CanestroName`, vedi nota migrazione) fa fallire la rigenerazione della sua filtered view. Eventuali futuri aggiornamenti al ribbon vanno quindi pacchettizzati/importati **solo con `agc_fascicolo2`** nei `RootComponents` (vedi `SESSION_NOTES.md` — sessione 2026-07-07 sera per il dettaglio).

⚠️ **Importante — la griglia principale di `agc_fascicolo2` è governata dai comandi moderni (Command Designer / Power Fx), non dal `RibbonDiff.xml` classico.** Il `CommandDefinition Id="agc.HomepageGrid.agc_fascicolo2.Assegna.Command"` presente nel `RibbonDiff.xml` (con `EnableRule` JS `isEnabledGrid`) resta nel sorgente solution per compatibilità/storico ma **non è più quello che determina la visibilità del pulsante "Assegna Fascicolo" sulla vista principale**: quella vista usa i comandi moderni configurabili da Maker Portal → tabella `agc_fascicolo2` → vista → **Modifica comandi** (Command Designer), con formule Power Fx valutate dal component library canvas app `ASPEN_DefaultCommandLibrary` (app id `ca8c900c-4851-4c1a-8bdd-0badbb28c2ed`). Qualsiasi modifica futura alla visibilità/logica dei pulsanti di questa griglia va fatta lì, non in `RibbonDiff.xml`.

### Comandi moderni griglia `agc_fascicolo2` — "Assegna Fascicolo" e "Assegnazione massiva"

Configurati in **Command Designer** (Maker Portal → tabella `agc_fascicolo2` → vista principale → Modifica comandi), non nella solution ribbon classica.

| Comando | Formula `Visible` (Power Fx) | Azione |
|---|---|---|
| **Assegna Fascicolo** | `And(!IsBlank(Self.Selected.Item), IsBlank(Self.Selected.Item.'Magistrato assegnato'))` | JavaScript: `AgicAspen.AssegnaFascicolo.openDialogFromGrid` (apre il dialog di assegnazione con gestione incompatibilità, stessa logica del pulsante form) |
| **Assegnazione massiva** | `CountRows(Self.Selected.AllItems) = 0` | JavaScript: `AgicAspen.AssegnaFascicolo.openBulkAssignFromGrid` (assegna in sequenza tutti i fascicoli senza magistrato al magistrato con minor carico, **senza** richiedere selezione incompatibilità) |

**⚠️ Bug di piattaforma scoperto e workaround (rilevante per qualsiasi comando moderno futuro)**: `CountRows(Self.Selected.AllItems)` usato come operando di `And()`/`If()` insieme a un'altra condizione **valuta in modo scorretto** (il comando resta visibile anche con 0 righe selezionate), indipendentemente dall'altro operando, anche con `IfError()` o literal banali (`true`). Usato **da solo** (non composto), `CountRows(...)` funziona correttamente — infatti la formula di "Assegnazione massiva" sopra (standalone) è corretta e non va toccata. Quando serve combinare "esattamente 1 riga selezionata" con un'altra condizione tramite `And()`, usare invece `!IsBlank(Self.Selected.Item)` (blank solo quando 0 o >1 righe sono selezionate, equivalente a `CountRows(...) = 1` ma senza il bug). Diagnosticato tramite test sistematico di isolamento delle formule (vedi `SESSION_NOTES.md` — sessione 2026-07-07, notte tarda).

**Logica "Assegnazione massiva"** (`openBulkAssignFromGrid` in `agc_assignfascicolo.js`): identica a "Assegna Fascicolo" (magistrato con minor peso calcolato totale sui fascicoli non chiusi) ma applicata in sequenza a tutti i fascicoli attualmente senza magistrato assegnato, senza richiedere la selezione delle incompatibilità. Ogni assegnazione aggiorna il carico in memoria prima di calcolare il magistrato migliore per il fascicolo successivo (evita di sovraccaricare lo stesso magistrato). Al termine mostra un riepilogo ("Assegnati N fascicoli su M").

### Plugin — SetOwnerTeamPlugin

Plugin registrato su **`agc_fascicolo2`** per la gestione automatica del team proprietario del fascicolo alla creazione.

| Proprietà | Valore |
|---|---|
| Assembly | `SetOwnerTeamPlugin` |
| Tabella target | `agc_fascicolo2` |
| Messaggio | `Create` |
| Stage | `Pre-Operation (20)` |

**Directory:** `05 - Power Platform/Plugin-Custom-API/`

---

### App model-driven
- Sitemap: **Operatività** (Fascicoli, Cruscotto) · **Anagrafiche** (Magistrati, Canestri) · **Impostazioni** (Configurazioni, accesso vincolato da privilegi)
- Dashboard "Cruscotto ASPEN" con entrambi i PCF
- **Home page**: Custom Page "ASPEN Home" (vedi sotto)

### Custom Page — Home ASPEN

Custom page (canvas page) usata come **home** della Model-Driven App. Presenta 3 card operative e 4 KPI dinamici in un layout completamente responsivo.

#### Layout responsivo (AutoLayout containers)

La pagina è costruita con container AutoLayout annidati per adattarsi a qualsiasi larghezza dello schermo:

```
conRoot (Vertical, fills Parent.Width/Height, LayoutOverflowY: Scroll)
├── [Header — titolo e sottotitolo]
├── conCards (Horizontal, LayoutWrap: true)
│   ├── conCardDashboard  (Vertical, FillPortions: 1, LayoutMinWidth: 280)
│   ├── conCardList        (Vertical, FillPortions: 1, LayoutMinWidth: 280)
│   └── conCardCreate      (Vertical, FillPortions: 1, LayoutMinWidth: 280)
└── conStats (Horizontal, LayoutWrap: true)
    ├── [Fascicoli Attivi]
    ├── [Creati (7 giorni)]
    ├── [Peso medio]
    └── [Imputati totali]
```

- `conCards` usa `LayoutWrap: true` — le 3 card si dispongono su più righe quando lo schermo è stretto.
- Ogni card ha `FillPortions: 1` e `LayoutMinWidth: 280` per distribuzione equa e soglia minima di wrapping.
- `conStats` usa lo stesso pattern wrap per le 4 KPI stat box.

#### KPI dinamici da Dataverse

Data source: **Fascicoli** (`agc_fascicolo2`). I 4 indicatori si aggiornano in tempo reale:

| KPI | Formula Power Fx | Valore attuale (POC) |
|---|---|---|
| Fascicoli Attivi | `CountIf(Fascicoli, true)` | 21 |
| Creati (7 giorni) | `CountRows(Filter(Fascicoli, 'Data creazione' >= DateAdd(Today(), -7, TimeUnit.Days)))` | 21 |
| Peso medio | `Round(Average(Fascicoli, 'Peso calcolato'), 1)` | 13,9 |
| Imputati totali | `Sum(Fascicoli, 'N. imputati')` | 171 |

> ✅ **Fix 07/07/2026 — custom page ancora legata alla vecchia tabella `agc_fascicolo`:** dopo la migrazione a `agc_fascicolo2` la pagina Home continuava a interrogare (in produzione) `agc_fascicolo`/`Peso` invece di `agc_fascicolo2`/`Peso calcolato` (URL `Launch()` delle card e formula KPI "Peso medio"). Corretti sia il documento canvas (`DataSources/Fascicoli.json`, formula `Average(Fascicoli, 'Peso calcolato')`, URL delle 3 card) sia la cache di schema `pkgs/TableDefinitions/Fascicoli.json`.
>
> ⚠️ **Lezione tecnica importante:** per una custom page/canvas app embeddata in una Model-Driven App, **`pac solution import --publish-changes` NON è sufficiente** a rendere effettiva la modifica lato runtime. Il comando aggiorna correttamente il documento `.msapp` in Dataverse (verificato ispezionando il pacchetto ri-esportato), ma il **player pubblicato continua a servire la versione compilata precedente** — non è cache del browser (verificato svuotando Cache Storage/IndexedDB/Service Worker via CDP), ma una cache lato piattaforma legata alla compilazione. L'unico modo per invalidarla è aprire la pagina nel **vero editor di Power Apps Studio** (App Designer della Model-Driven App → hover sulla pagina "Home" nell'albero → icona a matita "Modifica pagina personalizzata" — **non** il semplice click sul nome pagina, che mostra solo un'anteprima in sola lettura del player pubblicato) e cliccare **Pubblica → "Pubblica questa versione"**. Solo questa azione ricompila e invalida la cache del player pubblicato. Verificato post-fix: tutte le query di rete della pagina ora puntano a `agc_fascicolo2s` (incluso `RetrieveTotalRecordCount`, `$apply=aggregate(agc_pesocalcolato ...)`) e i 4 KPI mostrano valori coerenti; i pulsanti "Apri elenco" e "Crea ora" navigano correttamente su `agc_fascicolo2`.
>
> ✅ **Fix 07/07/2026 — KPI "Fascicoli Attivi" bloccato su un conteggio stale (40 invece di 21):** dopo la pulizia dei duplicati in `agc_fascicolo2` (40 → 21 record reali), il KPI continuava a mostrare **40**. Causa: la formula `CountRows(Fascicoli)`, su un data source Dataverse **senza filtro**, viene ottimizzata da Power Fx in una chiamata `RetrieveTotalRecordCount(EntityNames=["agc_fascicolo2"])`, che restituisce una **statistica SQL aggiornata in modo asincrono/periodico da Dataverse**, non un conteggio in tempo reale — confermato interrogando direttamente l'endpoint (`Count: 40`) mentre una query `$select` diretta sulla tabella restituiva esattamente 21 righe. **Fix:** sostituita la formula con `CountIf(Fascicoli, true)`, che forza sempre una query aggregata live (`$apply=aggregate($count as result)`), verificata via network tab dopo la pubblicazione. Power Apps Studio stesso segnala nativamente questo rischio con un tooltip informativo sulla formula `CountRows`: *"CountRows può restituire un valore memorizzato nella cache. Usa CountIf(DataSource, true) per ottenere il conteggio più recente."* — **qualsiasi `CountRows()` futuro su un data source Dataverse senza filtro va considerato a rischio della stessa staleness** e va preferibilmente sostituito con `CountIf(DataSource, true)`.

#### Icone SVG inline

Ogni card operativa ha un'icona SVG inline (Image control con data URI, 48×48 px, colore primario `#003366`):

| Controllo | Card | Icona |
|---|---|---|
| `imgIconDashboard` | Cruscotto | Grafico a barre |
| `imgIconList` | Lista Fascicoli | Documento con righe |
| `imgIconCreate` | Nuovo Fascicolo | Cerchio con segno + |

> **Nota:** le icone usano controlli `Image` con SVG data URI anziché il tipo `Icon` nativo, che non è supportato nel formato `.pa.yaml` e quindi non è utilizzabile via paste/import YAML.

#### Pulsanti di navigazione

| Pulsante | Azione | Navigazione Power Fx |
|---|---|---|
| **Nuovo fascicolo** | Apre la form di creazione di un nuovo `agc_fascicolo2` nella stessa scheda | `Launch("https://...&pagetype=entityrecord&etn=agc_fascicolo2", {}, LaunchTarget.Replace)` |
| **Lista fascicoli** | Apre la vista operativa dei fascicoli nella stessa scheda | `Launch("https://...&pagetype=entitylist&etn=agc_fascicolo2&viewid=66ef2ecc-32ca-4275-901c-80f0637f1003&viewType=1039", {}, LaunchTarget.Replace)` |
| **Cruscotto ASPEN** | Redirect alla dashboard "Cruscotto ASPEN" nella stessa scheda | `Launch("https://...&pagetype=dashboard&id=d4cd81e8-5963-f111-ab0c-7ced8d72f54e&type=system&_canOverride=true", {}, LaunchTarget.Replace)` |

#### File sorgente

**Directory:** `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/`

| File | Tipo | Descrizione |
|---|---|---|
| `Source/agc_aspenhome.pa.yaml` | Power Apps source (Power Fx YAML) | ⚠️ **Riferimento storico** — contiene la versione iniziale (header + 3 pulsanti), aggiornata il 07/07/2026 solo nei riferimenti a tabella/campo (`agc_fascicolo2`, `Peso calcolato`, viewid). La versione live in Power Apps Studio è stata significativamente evoluta con layout responsivo, KPI dinamici e icone SVG che non sono rappresentati in questo file |

> **⚠️ Divergenza sorgente locale / versione live:** Il file `.pa.yaml` nel repository rappresenta lo stato iniziale della custom page. La versione attualmente pubblicata in Power Apps Studio include container AutoLayout responsivi, KPI dinamici dalla tabella `agc_fascicolo2` e icone SVG inline che non possono essere completamente rappresentati nel formato YAML flat. Per modifiche future, operare direttamente in **Power Apps Studio**; il file locale va considerato come riferimento storico.

**Placeholder presenti nel file `.pa.yaml` (riferimento storico):**

| Placeholder | Significato | Dove recuperarlo |
|---|---|---|
| ~~`__DASHBOARD_ID__`~~ | ✅ Valorizzato: `d4cd81e8-5963-f111-ab0c-7ced8d72f54e` (dashboard "Cruscotto ASPEN") | Recuperato dall'URL del dashboard editor |
| `__APP_ID__` | GUID della Model-Driven App ASPEN (`appid`), opzionale in navigazione in-app | Maker portal > Apps > ASPEN > Details > App ID |
| `__ASSEGNA_PAGE__` | Nome logico della custom page di Assegnazione (solo se si usa una pagina dedicata) | Nome della custom page nella soluzione |

**Note tecniche:**
- Per evitare l'apertura di una nuova scheda, i pulsanti usano `Launch(..., {}, LaunchTarget.Replace)`, che sostituisce la scheda corrente del browser.
- La funzione `Navigate(...)` supporta navigazione inline verso tabelle, viste e form supportate, ma **non** supporta dashboard; per questo il pulsante Cruscotto usa `LaunchTarget.Replace`.
- La versione live della pagina è stata costruita e iterata in **Power Apps Studio** con automazione Playwright; future modifiche vanno apportate direttamente nello Studio.
- Con il PAC CLI attualmente disponibile, il rilascio della custom page non risulta fully automated end-to-end: è richiesto un **primo publish dal Maker Portal**.

---

## Prossimi passi

1. Validare con il cliente la sintesi AS-IS emersa dalla call del 04/06/2026
2. Approfondire il modello dati – richiedere dump anonimizzato
3. Pianificare sessioni su: sicurezza, incompatibilità, reportistica, migrazione dati
4. Tasto **"Rimuovi assegnazione"** e enable rule stabile "magistrato già assegnato"
5. ✅ **Risolto (07/07/2026)** — command bar griglia `agc_fascicolo2` allineata a `agc_fascicolo`: nascosti via `RibbonDiff.xml` (Location corrette) i comandi standard "Mostra questa visualizzazione", "Invia link tramite messaggio e-mail" e "Flusso" (compresi i controlli OOB duplicati/annidati) ed "Esegui report". "Mostra grafico" (`ShowChartPane`) resta visibile su **entrambe** le tabelle: è un comando della command bar moderna non presente nel `RibbonXml` classico, quindi non nascondibile con `HideCustomAction` — limite noto della piattaforma, non una differenza tra le due tabelle. Confermato inoltre che "Assegna Fascicolo"/"Chiudi Caso" erano già a parità e che "assegnazione automatica" coincide con il pulsante "Assegna Fascicolo" esistente. Vedi `SESSION_NOTES.md` — sessione 2026-07-07 (sera).
6. **Notifica al magistrato** via Power Automate alla conferma assegnazione
7. **Storico assegnazioni** (audit trail su tabella dedicata)
8. ✅ **Risolto (07/07/2026)** — assegnazione **bulk** da griglia: nuovo comando moderno "Assegnazione massiva" (visibile solo con 0 righe selezionate) che assegna in sequenza tutti i fascicoli senza magistrato al magistrato con minor carico, senza richiedere incompatibilità. Corretto anche il comando "Assegna Fascicolo" in griglia, che non compariva mai selezionando un fascicolo non assegnato a causa di un bug di piattaforma (`CountRows(Self.Selected.AllItems)` in `And()`/`If()` composti). Vedi sezione "Comandi moderni griglia `agc_fascicolo2`" sopra e `SESSION_NOTES.md` — sessione 2026-07-07 (notte tarda).
9. Persistere le **incompatibilità** su Dataverse (tabella o campo dedicato)
10. ✅ **Risolto (06/07/2026)** — errore SQL `0x80044150` su record Canestro: causa identificata in ghost relationship `agc_CanestroName` sulla tabella `agc_fascicolo`; risolto con migrazione a `agc_fascicolo2` + `agc_canestrofascicolo` (20 record migrati, commit `7ca5685`).
11. Strategia migrazione storico + integrazione **SICP**
12. ✅ **Risolto (07/07/2026)** — pulizia dati post-migrazione: rimossi 20 record duplicati da `agc_fascicolo2` (migrazione era stata eseguita due volte), popolata `agc_canestrofascicolo` con i 13 canestri storici (da `agc_canestro`), riassociati 18/20 fascicoli al rispettivo canestro (2 fascicoli — `2024` e `RG-2026/11122` — non avevano canestro nemmeno nella tabella storica, restano senza associazione). Vedi `SESSION_NOTES.md` — sessione 2026-07-07.
13. Dismissione definitiva (disattivazione/hide) delle tabelle legacy `agc_fascicolo` e `agc_canestro`, ora **non più utilizzate** e mantenute solo come backup storico
14. ✅ **Risolto (07/07/2026)** — migrazione campo Peso → Peso calcolato su `agc_fascicolo2`: `agc_peso` rimosso da form/viste e sostituito da `agc_pesocalcolato` (campo formula). Aggiornati `CaricoPerCanestro`, `StatoFascicoliChart`, il binding `pesoField` di `CaricoMagistratiChart` nel dashboard, le 2 view del cruscotto e la logica di assegnazione automatica (`agc_assignfascicolodialog.html`). Vedi `SESSION_NOTES.md` — sessione 2026-07-07.
15. ✅ **Risolto (07/07/2026)** — obbligatorietà campi `agc_fascicolo2`: impostati come **ApplicationRequired** Numero RG, N. imputati, N. imputazioni e Canestro fascicolo (vedi tabella "Colonne chiave" sopra).
16. ✅ **Risolto (07/07/2026)** — custom page "ASPEN Home" ancora legata alla vecchia tabella `agc_fascicolo`/`Peso`: corretta e ripubblicata via Power Apps Studio (non solo `pac solution import`). Vedi nota tecnica nella sezione "Custom Page — Home ASPEN" sopra e `SESSION_NOTES.md` — sessione 2026-07-07.
17. ✅ **Risolto (07/07/2026)** — KPI "Fascicoli Attivi" mostrava 40 invece di 21 a causa di un conteggio Dataverse (`RetrieveTotalRecordCount`) cache/stale usato da `CountRows()`: sostituita la formula con `CountIf(Fascicoli, true)` per forzare un conteggio live. Vedi nota tecnica nella sezione "Custom Page — Home ASPEN" sopra e `SESSION_NOTES.md` — sessione 2026-07-07.
18. ✅ **Risolto (27/08/2026)** — pulsante "Chiudi Caso" ora correttamente **nascosto** (non solo disabilitato) quando non applicabile, tramite nuovo `HideCustomAction` in `RibbonDiff.xml`. Sbloccato in via permanente il redeploy della solution `AgicAspenRibbon` (`pac solution export` era bloccato da tempo da un errore di metadata cache orfana): ora si usa `pac solution pack` dalla cartella unpacked + `pac solution import`. Vedi `SESSION_NOTES.md` — sessione 2026-08-27 (pomeriggio/sera).
19. **Aperto** — lookup `contact → systemuser` (Opzione C, `agc_utenteapplicativo`) da implementare per collegare l'anagrafica magistrato (contact) all'utente applicativo reale autenticato via Entra ID.
20. ✅ **Risolto (28/08/2026)** — PCF Cruscotto ASPEN: risolto il canestro vuoto nei drill-down di entrambi i grafici (`CaricoMagistratiChart` e `StatoFascicoliChart`, causato da view con colonna mancante nel `layoutxml` e, per `StatoFascicoliChart`, da un bundle.js non ripubblicato dopo la migrazione a `contact`); PCF **"Carico per Canestro"** riaggiunto sulla form Contatto (magistrato). Vedi `SESSION_NOTES.md` — sessioni 2026-08-28 e 2026-08-28 (sera).
21. **Aperto** — regola di business "carico magistrato monotono": il carico non deve mai diminuire per chiusura fascicolo (solo la riassegnazione ad altro magistrato lo decrementa sul magistrato d'origine); regola di partenza per i nuovi magistrati e baseline iniziale ancora da definire col cliente. Da implementare quando si riprende l'analisi puntuale di `aspen_resoconto_modifiche.pdf`.
22. ✅ **Risolto (09/09/2026)** — tasto **"Modifica Carico"** sul form Contatto/Magistrato, visibile e utilizzabile solo dal ruolo "System Administrator": corregge manualmente `agc_caricoattuale` con nota di giustificazione obbligatoria, tracciando ogni modifica (magistrato, valore precedente, nuovo valore, nota, utente, data) nella nuova tabella `agc_modificacarico`. Implementato con Custom API `agc_ModificaCaricoMagistrato` (validazione e ruolo verificati anche server-side) e tasto in command bar via `RibbonDiffXml` (la moderna Command Designer non supporta visibilità condizionata da JS/ruolo — solo Power Fx, che non espone `User()` nelle app model-driven). Vedi `SESSION_NOTES.md` — sessione 2026-09-09.
23. ✅ **Risolto (09/09/2026)** — **riallineamento punteggio al rientro da esonero Totale**: alla chiusura di un esonero **Totale** il carico reale del magistrato (`contact.agc_caricoattuale`) viene riallineato al carico attuale del "collega più simile", cioè il collega magistrato il cui carico all'attivazione dell'esonero era il più vicino al carico del magistrato in quel momento (a parità di distanza vince il carico più basso), tracciato in `agc_esonero.agc_collegariferimento` per audit. Sono esclusi dal confronto sia il magistrato in esonero sia chiunque avesse a sua volta un esonero attivo (Totale o Parziale) in quel momento. Gli esoneri **Parziali** mantengono il comportamento invariato di solo log (`agc_punteggioalrientro`, nessuna modifica al carico reale). Nuova tabella `agc_fotocaricoesonero` (fotografia carico colleghi eleggibili all'attivazione) e nuovo campo lookup `agc_esonero.agc_collegariferimento`; logica estesa in `EsoneroRientroPlugin.cs`, registrata sia su **Update** (transizione di stato) sia su **Create** (caso comune: l'esonero nasce direttamente in stato Attivo, senza un "prima" da confrontare). Eseguito backfill per l'esonero Totale già attivo di Chiara Marini (fotografie approssimate con i carichi attuali dei colleghi eleggibili, poiché il record era stato creato direttamente in stato Attivo). Verificato end-to-end sia con transizione Update sia con creazione diretta in Attivo (caso reale), poi ripulito. Migliorie form `agc_esonero`: **"Attivo"** impostato come valore di default per "Stato Esonero" in creazione; i campi calcolati dal plugin ("Punteggio al momento esonero", "Punteggio al rientro", "Collega di Riferimento") resi **di sola lettura** in form (visibili per audit, non editabili manualmente). Vedi `SESSION_NOTES.md` — sessione 2026-09-09 (cont.).
24. ✅ **Risolto (11/09/2026)** — tasto **"Modifica Carico"** riposizionato nella command bar del form Contatto/Magistrato subito dopo "Nuovo" (era in coda, prima di "Processo"): `Sequence` abbassata da `15` a `11` in `RibbonDiff.xml`. Solution `ContactRibbonOnly` ripacchettizzata (`pac solution pack`) e reimportata live (`pac solution import --publish-changes`) nell'ambiente `LCC-MINISTEROGIUSTIZIA-DEMO`, import e publish riusciti. Posizione stimata: da verificare visivamente sul form e regolare la `Sequence` se non risultasse esattamente dopo "Nuovo".
25. ✅ **Risolto (11/09/2026)** — dialog "Assegnazione automatica" (`agc_assignfascicolodialog.html`): aggiunto un campo di ricerca sopra l'elenco dei magistrati per filtrare per nome in tempo reale, utile quando l'elenco delle incompatibilità è lungo.
26. ✅ **Verificato/Corretto (11/09/2026)** — regola di **continuità RGNR** (assegnare allo stesso magistrato un secondo fascicolo dello stesso PGNR/RGNR): nel flusso di **assegnazione massiva** (`agc_assignfascicolo.js`) il magistrato di continuità in esonero Totale era già correttamente escluso. Nel flusso di **assegnazione singola da dialog** (`agc_assignfascicolodialog.html`) mancava invece il controllo: aggiunta la verifica esonero Totale anche sul ramo di continuità, con fallback alla regola classica (minor carico) se il magistrato risulta in esonero Totale.
27. ✅ **Risolto (11/09/2026)** — **sovrapposizione di esoneri sullo stesso magistrato** (due Parziali sovrapposti, o un Parziale e un Totale sovrapposti): nessuna validazione impediva la creazione di esoneri sovrapposti. **Decisione presa col cliente: si blocca la sovrapposizione tra esoneri entrambi Attivi contemporaneamente**, indipendentemente dal tipo (Parziale/Parziale, Parziale/Totale, Totale/Totale); confermato con l'utente che la sovrapposizione con un esonero già **Chiuso** non va invece bloccata (nessun impatto reale sull'assegnazione). Creato nuovo plugin `EsoneroOverlapValidationPlugin.cs` (Pre-Operation, stage 20, su Create/Update di `agc_esonero`): confronta l'intervallo `[agc_datainizio, agc_datafine]` del record in salvataggio con quello di ogni altro esonero **Attivo** dello stesso `agc_magistrato` e blocca con `InvalidPluginExecutionException` (messaggio include il periodo dell'esonero in conflitto, es. *"...esonero Attivo (Ferie) dal 02/09/2026 al 16/09/2026..."*) in caso di sovrapposizione. Registrazione effettuata interamente via Web API dirette (`az account get-access-token` + `Invoke-RestMethod`/`Invoke-WebRequest`, stesso pattern usato in tutte le sessioni precedenti — non serve il Plugin Registration Tool): assembly `Plugin-Custom-API` aggiornato (PATCH `content` base64), plugintype `AgicAspen.Plugins.EsoneroOverlapValidationPlugin` creato, step Create e Update (Pre-Operation, stage 20) registrati con PreImage `PreImage` (`agc_datainizio,agc_datafine,agc_statoesonero,agc_magistrato`) sullo step di Update. **Testato end-to-end**: creazione con sovrapposizione bloccata (messaggio con date verificato), creazione senza sovrapposizione consentita, sovrapposizione con esonero già Chiuso correttamente non bloccata.
28. 🔴 **Bug aperto (11/09/2026)** — pulsante **"Assegna Fascicolo"** in griglia (`agc_fascicolo2`, comando moderno Command Designer) resta visibile/abilitato anche se il fascicolo ha già un magistrato assegnato (screenshot: riga `RG-2026/0113` con "Laura Verdi" già assegnata, pulsante comunque attivo), mentre nel form la visibilità è corretta. **Causa individuata**: la formula Power Fx del comando in griglia (documentata sopra: `And(!IsBlank(Self.Selected.Item), IsBlank(Self.Selected.Item.'Magistrato assegnato'))`) referenzia il campo legacy **`agc_magistratoassegnato`** ("Magistrato assegnato", lookup mai popolato dal codice attuale), mentre l'assegnazione reale scrive sul campo **`agc_magistratocontatto`** ("Magistrato Contatto", quello mostrato in colonna nella vista). Di conseguenza `IsBlank(...'Magistrato assegnato')` è sempre vero e il pulsante non si nasconde mai. **Fix da applicare in Maker Portal** (non versionabile via file, il comando moderno non è nel `RibbonDiff.xml`): in **Tabella `agc_fascicolo2` → vista → Modifica comandi (Command Designer) → comando "Assegna Fascicolo"**, sostituire nella formula di visibilità il riferimento a `'Magistrato assegnato'` con `'Magistrato Contatto'` (campo `agc_magistratocontatto`).
29. ⏳ **Da fare manualmente (11/09/2026)** — spostare il PCF **"Carico per Canestro"** dalla tab "Generale" alla tab "Fascicoli" del form Contatto/Magistrato (primo campo, sotto la subgrid fascicoli). Il FormXml del Contatto non è tracciato nel repo (in `ContactRibbonOnly_unpacked` sono presenti solo `RibbonDiff.xml`/`Entity.xml`, non il FormXml completo): intervento da fare in Maker Portal (Form Designer), oppure da valutare via Web API diretta su `systemform` in una sessione dedicata.

---

## Interlocutori

| Ruolo | Nominativo | Ente |
|---|---|---|
| Referente Ufficio GIP | Dott.ssa Maccora | Tribunale di Milano |
| Referente tecnico | Dott. Crepaldi | Tribunale di Milano |
| Referente operativo | Sig. Cortese | Tribunale di Milano |

**Partecipanti call 04/06/2026 (AGIC):** Chiara D'Innocenzi, Linda Tomasello, Vincenzo Picone, Giuseppe Scalabrino, Riccardo Vedovato, Luca Campoglioni  
**Microsoft:** Daiana D'Agostino

