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
| Script voiceover video demo (storico) | [`03 - Documentazione Prodotta/Video/ASPEN - Script Voiceover Demo.txt`](03%20-%20Documentazione%20Prodotta/Video/ASPEN%20-%20Script%20Voiceover%20Demo.txt) | Testo per TTS (~2,5 min), usato per il video dimostrativo dell'app |
| Script voiceover video demo (16/09/2026) | [`03 - Documentazione Prodotta/Video/ASPEN - Script Voiceover Demo (16-09-2026).txt`](03%20-%20Documentazione%20Prodotta/Video/ASPEN%20-%20Script%20Voiceover%20Demo%20%2816-09-2026%29.txt) | Versione aggiornata, non tecnica, allineata alle funzionalità attuali (assegnazione, esoneri, cruscotto) |

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
| Peso 1 (ex Canestro) | `agc_canestrofascicolo` | Materie/competenze (es. Stupefacenti, Omicidio…) — ex `agc_canestro`; rinominata "Peso 1" l'11/09/2026 |
| Peso 2 | `agc_peso2` | Nuova tabella (11/09/2026), stessa struttura di Peso 1 (Nome + Peso Integer), popolata liberamente da ogni tribunale |
| Magistrato | `contact` (standard) | Contatti Dataverse con `agc_ismagistrato = true` — ex tabella custom `agc_giudice` |
| Fascicolo/Assegnazione | `agc_fascicolo2` | Fascicoli con peso calcolato e lookup a magistrato (contact) + Peso 1 + Peso 2 — ex `agc_fascicolo` |
| Configurazione | `agc_configurazione` | Parametri di sistema (`PesoLimite = 20`, `PesoLimiteCanestro = 30`) |

> **Split Canestro → Peso 1 / Peso 2 (11/09/2026):** su richiesta del cliente, il peso "a canestro" è stato reso bidimensionale. La tabella `agc_canestrofascicolo` (in uso) è stata **rinominata "Peso 1"** (entità, campo lookup, 7 viste di sistema, sezione dashboard "Fascicoli per Canestro"→"Fascicoli per Peso 1", grafici PCF); è stata creata una **nuova tabella `agc_peso2`** con la stessa struttura (Nome + Peso Integer), collegata a `agc_fascicolo2` tramite una nuova lookup **`agc_peso2`** (entrambe le lookup sono opzionali, non obbligatorie, e ogni tribunale può popolare liberamente i propri record in entrambe le tabelle). Il campo formula `agc_pesocalcolato` è stato aggiornato per sommare anche il peso di Peso 2 se valorizzato: `agc_numeroimputati + agc_numeroimputazioni + agc_Canestrofascicolo.agc_peso + If(IsBlank(agc_Peso2), 0, agc_Peso2.agc_peso) + 1`. Testato end-to-end (verificato ricalcolo automatico aggiungendo/rimuovendo un Peso 2 su un fascicolo esistente). Il ruolo "Operatore ASPEN" ha ricevuto privilegi Create/Write (Local) su entrambe le tabelle Peso 1 e Peso 2, oltre a Read/Append/AppendTo/Assign (Global) già presenti su Peso 1. **Nota:** esiste in ambiente una tabella omonima ma dismessa/corrotta `agc_canestro` (diversa da `agc_canestrofascicolo`/Peso 1), risultato di un'operazione di pulizia incompleta — vedi `06 - Riferimenti Normativi e Tecnici/Risposta_MS_Support_EntityMap_Corruption.md`; non impatta il funzionamento, va solo ignorata.

> **Migrazione 06/07/2026:** le tabelle originali `agc_fascicolo` e `agc_canestro` sono state sostituite da `agc_fascicolo2` e `agc_canestrofascicolo`. La causa era una ghost relationship corrotta (`agc_CanestroName`) sulla tabella `agc_fascicolo` che impediva la creazione di nuovi fascicoli. Sono stati migrati 20 record. Commit: `7ca5685`.
>
> ⚠️ **`agc_fascicolo` e `agc_canestro` sono DISMESSE — NON USARE.** Restano in ambiente solo come backup storico dei dati originali (read-only), ma non sono più referenziate da alcun componente applicativo (PCF, ribbon, plugin, custom page). Tutto il codice e la documentazione devono fare riferimento esclusivamente a `agc_fascicolo2` e `agc_canestrofascicolo`. Qualsiasi nuovo sviluppo, form, view o automazione va creato solo sulle nuove tabelle.
>
> ⚠️ **Migrazione Magistrati → Contatti (27/08/2026):** la tabella custom `agc_giudice` è stata **sostituita dalla tabella standard `contact`**, poiché i magistrati diventeranno gli utenti effettivi autenticati dell'applicazione. Nuova lookup su `agc_fascicolo2`: **`agc_magistratocontatto`** → `contact` (sostituisce `agc_magistratoassegnato` → `agc_giudice`, ora dismessa). Tutti i riferimenti nel codice (webresource JS/HTML, PCF, dashboard, sitemap, ribbon) sono stati aggiornati; il ruolo di sicurezza "Operatore ASPEN" ha ricevuto i privilegi mancanti su `contact`. Le occorrenze di `agc_giudice`/`agc_magistratoassegnato` più sotto in questo documento sono **storiche** (riferite allo stato precedente al 27/08/2026) — vedi `SESSION_NOTES.md`, sessione 2026-08-27, per il dettaglio completo della migrazione.
>
> ⚠️ **Decisione architetturale confermata (27/08/2026, sessione pomeriggio):** poiché i magistrati accedono con licenza personale via Entra ID (quindi come `systemuser` a livello Dataverse), l'uso "puro" di `contact` come utente applicativo è formalmente incompleto. **Opzione C approvata**: mantenere `contact` come anagrafica arricchita del magistrato, aggiungendo una lookup `contact → systemuser` per il collegamento all'utente applicativo reale. Nessun rollback della migrazione a `contact` già effettuata. **Aggiornamento (28/08/2026):** verificato che questa lookup **esiste già** in produzione con il nome `agc_utenteassociato` ("Utente associato", presente sulla form Contatto - Magistrato); il nome `agc_utenteapplicativo` ipotizzato in questa sessione era impreciso. Todo `fix-lookup-contact-usersu` **chiuso, nessuna implementazione necessaria** — vedi `SESSION_NOTES.md`, sessione 2026-08-28.
>
> ⚠️ **Fix regressioni post-migrazione (27/08/2026, sessione pomeriggio):** risolte 3 delle 5 regressioni segnalate dopo la migrazione a `contact` — vista/colonna "Magistrato assegnato" stale, visibilità errata di "Assegna Fascicolo", e mancata possibilità di nascondere "Chiudi Caso" (in tutti i casi causa radice: webresource/ribbon non ripubblicati correttamente dopo la migrazione, più un Service Worker del browser che serviva risposte in cache). **Sbloccato in questa sessione** un workaround permanente per il redeploy della solution `AgicAspenRibbon`, il cui `pac solution export` restava bloccato da mesi da un errore di metadata cache orfana: si usa `pac solution pack` direttamente dalla cartella unpacked locale (bypassa la query rotta) seguito da `pac solution import`. Ancora aperti: fix PCF Cruscotto ASPEN (dati/canestro non aggiornati a `contact`) e PCF "Carico per Canestro" mancante sulla form Contatto. Vedi `SESSION_NOTES.md`, sessione 2026-08-27 (pomeriggio/sera).

**Colonne chiave `agc_fascicolo2`:**

| Colonna | LogicalName | Tipo | Obbligatorio |
|---|---|---|---|
| Numero RG | `agc_numeroregistrogenerale` | String | ✅ **Sì** (ApplicationRequired) |
| N. imputati | `agc_numeroimputati` | Integer | ✅ **Sì** (ApplicationRequired) |
| N. imputazioni | `agc_numeroimputazioni` | Integer | ✅ **Sì** (ApplicationRequired) |
| Canestro fascicolo (ora "Peso 1") | `agc_canestrofascicolo` | Lookup → agc_canestrofascicolo (Peso 1) | ✅ **Sì** (ApplicationRequired) |
| Peso 2 | `agc_peso2` | Lookup → agc_peso2 (Peso 2) | No (opzionale) |
| Punti imputati | `agc_puntiimputati` | Integer | No |
| Punti imputazioni | `agc_puntiimputazioni` | Integer | No |
| Magistrato assegnato | `agc_magistratoassegnato` | Lookup → agc_giudice | No |
| Peso (dismesso) | `agc_peso` | Decimal — **NON PIÙ USATO** dal 07/07/2026: rimosso da form/viste, sostituito da `agc_pesocalcolato`. Rimane in schema solo come colonna storica | No |
| Peso calcolato | `agc_pesocalcolato` | Decimal — campo calcolato (formula), sostituisce `agc_peso` in tutti i PCF, dashboard e logiche di assegnazione automatica | No (calcolato) |
| Stato | `agc_statocaso` | OptionSet: 0=Validato, 1=Proposto, 2=Chiuso | No |
| Data | `agc_datacaso` | DateTime | No |

> **Obbligatorietà campi (07/07/2026):** su richiesta del cliente sono stati impostati come **ApplicationRequired** (obbligatori in form, bloccanti al salvataggio) i campi Numero RG, N. imputati, N. imputazioni e Canestro fascicolo. Verificato via metadati Dataverse (`EntityDefinitions(agc_fascicolo2)/Attributes`).

**Tabella `agc_canestrofascicolo` / "Peso 1" (13 record, popolati il 07/07/2026 da `agc_canestro`; rinominata "Peso 1" l'11/09/2026):**

| Colonna | LogicalName | Tipo |
|---|---|---|
| Nome | `agc_name` | String (primary) |
| Peso | `agc_peso` | Integer |

**Tabella `agc_peso2` / "Peso 2" (nuova, 11/09/2026 — struttura identica a Peso 1, entità generica popolata liberamente da ogni tribunale):**

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
| **Assegna Fascicolo** | `CountRows(Self.Selected.AllItems) >= 1` (o equivalente) | JavaScript: `AgicAspen.AssegnaFascicolo.openDialogFromGrid`, router: 1 record non assegnato → dialog interattivo invariato; selezione multipla o record già assegnato → assegnazione batch dei soli selezionati con avviso di conferma se alcuni sono già assegnati (vedi punto 43) |
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

Custom page (canvas page) usata come **home** della Model-Driven App. Presenta 3 card operative e 4 KPI dinamici in un layout responsivo a piena larghezza, sfondo `#FAFAFA` e riquadri con angoli arrotondati (12px per card/pannello statistiche, 10px per i quadrati icona).

#### Layout responsivo (Named Formulas + posizionamento calcolato)

Il controllo `rectangle` disponibile in questa app **non supporta il posizionamento in container AutoLayout/Fluid Grid** (versione del control template non aggiornata) né proprietà di raggio; il layout reale (`Src/Screen1.fx.yaml`, vedi `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/`) resta quindi a posizionamento assoluto (`X`/`Y`/`Width`/`Height`), ma tutte le coordinate sono calcolate dinamicamente tramite **Named Formulas** dichiarate in `App.fx.yaml`, basate su `App.Width` (la larghezza reale del contenitore host, aggiornata automaticamente al resize):

| Formula | Scopo |
|---|---|
| `HomeMargin` | Margine laterale (16px sotto i 700px, 24px altrove) |
| `HomeNumCols` | Numero di colonne delle 3 card: 3 (≥1150px) → 2 (700-1150px) → 1 (<700px) |
| `HomeCardWidth` | Larghezza calcolata delle card in base a `HomeNumCols`, per riempire tutta la larghezza disponibile |
| `HomeStatsCols` | Colonne del pannello statistiche: 4 (≥700px) → 2 (<700px), con divisori verticali nascosti quando a 2 colonne |
| `HomeStatsItemW`, `HomeStatsHeight`, `HomeStatsY` | Dimensioni/posizione del pannello statistiche in base al numero di righe delle card e delle statistiche |

Le 3 card usano `Mod()`/`RoundDown()` sull'indice per calcolare colonna/riga in base a `HomeNumCols`, per cui sotto i 1150px la terza card va a capo, e sotto i 700px tutte e 3 le card si dispongono in colonna singola a piena larghezza. Il pannello KPI si estende sempre su tutta la larghezza disponibile (`App.Width - 2*HomeMargin`).

I riquadri (card, quadrati icona, pannello statistiche) sono implementati come controlli `button` con `DisplayMode.Disabled` e `Text=""` (anziché `rectangle`) per poter usare le proprietà `RadiusTopLeft/TopRight/BottomLeft/BottomRight`, non disponibili sul controllo rectangle in questa versione dell'app.

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
19. ✅ **Risolto/non necessario (28/08/2026)** — lookup `contact → systemuser` (Opzione C): verificato che **esiste già** in produzione con il nome `agc_utenteassociato` ("Utente associato", form Contatto - Magistrato); nessuna nuova implementazione richiesta. Prossimo passo: verificare che sia correttamente valorizzata sui magistrati esistenti (vedi `fix-dashboard-magistrati-contact`). Vedi `SESSION_NOTES.md` — sessione 2026-08-28.
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
30. ✅ **Risolto (11/09/2026)** — campo **`agc_rgnr.agc_annoregistro`** ("Anno Registro") convertito da **Intero** a **Testo** (MaxLength 4), con validazione server-side che impone esattamente 4 cifre numeriche comprese tra **1900 e 2200** (non obbligatorio: se lasciato vuoto nessuna validazione). Poiché Dataverse non consente di cambiare tipo a una colonna esistente, il campo è stato **eliminato e ricreato** (rimosso prima da form "Informazioni" e vista "RGNR attivi/e" per sbloccare la dipendenza, poi ripubblicato e riaggiunto identico); i 2 record già presenti sono stati migrati correggendo il valore fuori range (`1040` → `2020`, concordato col cliente). Creato nuovo plugin `AnnoRegistroValidationPlugin.cs` (Pre-Operation, stage 20, su Create/Update di `agc_rgnr`), registrato via Web API dirette nello stesso assembly `Plugin-Custom-API`. Testato end-to-end: valori validi (1900, 2024, 2200) accettati, valori non numerici/lunghezza errata e fuori range bloccati con messaggio esplicito.
31. ✅ **Risolto (11/09/2026)** — ridisegno dashboard **"Cruscotto ASPEN"**: sostituito il grafico a torta **"Fascicoli per Stato"** (non più significativo dato che il carico del magistrato non diminuisce alla chiusura di un fascicolo — regola di business punto 21) con **"Fascicoli per Canestro"** (nuovo PCF `FascicoliPerCanestroChart`, raggruppa per `agc_canestrofascicolo`); aggiunti i 2 grafici nelle celle finora vuote (placeholder) della griglia 2×2 già presente nel form: **"Esoneri Attivi"** (nuovo PCF `EsoneriAttiviChart`, bar chart per magistrato colorato per tipo Totale/Parziale, con lo stesso filtro lato client — stato Attivo + intervallo date corrente — già usato in `agc_assignfascicolodialog.html`/`agc_assignfascicolo.js`) e **"Andamento Carico Mensile"** (nuovo PCF `AndamentoCaricoMensileChart`, line chart del carico cumulato per magistrato mese su mese, calcolato da `agc_pesocalcolato`/`agc_datacaso`). I 3 nuovi controlli sono stati sviluppati clonando/estendendo `StatoFascicoliChart`/`CaricoMagistratiChart` come template, compilati con `npm run build` e **pushati singolarmente in Dataverse** spostando temporaneamente fuori dall'albero le cartelle dei controlli "fratelli" nello stesso progetto `.pcfproj` (necessario perché `pac pcf push` supporta solo un `ControlManifest.Input.xml` per cartella di progetto; per due dei tre controlli il comando ha fallito in fase di cleanup per file lock ma ha comunque generato lo zip in `obj/PowerAppsToolsTemp_agc/bin/Debug/`, importato poi manualmente con `pac solution import --force-overwrite --publish-changes`). FormXml della dashboard (`systemform` "Cruscotto ASPEN") aggiornato via Web API diretta (PATCH + `PublishAllXml`) per referenziare i 3 nuovi controlli nelle `controlDescriptions` (tutti e 3 i formFactor).
32. ✅ **Risolto (11/09/2026)** — grafico **"Esoneri Attivi per Magistrato"** restava vuoto (canvas presente nel DOM ma bloccato a 300×150px, nessuna barra) anche dopo aver corretto il `fetchxml` della vista con l'attributo `agc_statoesonero` mancante (fix precedente, necessario ma non sufficiente). **Causa reale**: `record.getValue("dataInizioField")` nel dataset PCF della dashboard non restituisce sempre un oggetto `Date` nativo, causando un'eccezione silenziosa (`inizio.getTime is not a function`, inghiottita dal PCF host senza log in console) che interrompeva `updateView` prima di rendere visibile il canvas. Individuata tramite debug live con Playwright (navigazione diretta autenticata alla dashboard, istrumentazione temporanea con cattura dello stack in `window`). **Fix**: aggiunta funzione di utilità `toDateOrNull()` in `EsoneriAttiviChart/index.ts` che converte in modo sicuro il valore di `getValue()` in `Date` prima di operarci; mantenuto anche un fix difensivo sul timing Chart.js (creazione/resize del grafico rimandati a `requestAnimationFrame`, per evitare che il canvas resti bloccato alle dimensioni di default se passa da `display:none` a `display:block` nello stesso tick). Verificato via Playwright: canvas correttamente dimensionato, barre visibili con i colori corretti. **Nota**: scoperto che il client Dynamics 365 cachea i web resource con URL "version-stamped" non invalidati automaticamente da `PublishAllXml` — per testare una nuova build può essere necessario cancellare IndexedDB/localStorage/Cache Storage del browser oltre a un normale refresh.
33. ✅ **Risolto (11/09/2026)** — grafico "Esoneri Attivi per Magistrato" ora visibile ma con **dati mancanti**: i magistrati con esonero di tipo **Totale** (Chiara Marini, Alessia Gialli) non comparivano con una barra visibile, benché correttamente attivi. **Causa**: per il tipo Totale il campo `agc_percentualeesonero` non è valorizzato (coerente con `agc_assignfascicolo.js`, che per il tipo Totale ignora la percentuale — l'esonero è per definizione al 100%); il codice leggeva il campo come `0` in sua assenza, producendo una barra di altezza nulla. **Fix**: in `EsoneriAttiviChart/index.ts` la percentuale per il tipo Totale viene ora forzata a `100` anziché letta dal campo. Verificato via Playwright: tutti i magistrati con esonero attivo mostrano correttamente la barra.
34. ✅ **Risolto (11/09/2026)** — implementata la **soluzione "canestro a due dimensioni"** concordata col cliente: la tabella `agc_canestrofascicolo` (in uso, campo lookup su `agc_fascicolo2`) è stata **rinominata "Peso 1"** (entità, lookup, 7 viste di sistema, sezione dashboard, grafici PCF); creata ex-novo la tabella **`agc_peso2`** ("Peso 2", stessa struttura Nome+Peso, entità generica popolabile liberamente da ogni tribunale) e collegata a `agc_fascicolo2` tramite nuova lookup opzionale `agc_peso2`; formula `agc_pesocalcolato` estesa per sommare anche il peso di Peso 2 quando presente. Aggiornati: form Peso 2 (campi Nome/Peso resi visibili, richiesta l'aggiunta di un `<header>` altrimenti il campo primario `agc_name` risultava invisibile pur presente nel FormXml), form Fascicolo (etichetta "Peso 1" + nuova riga lookup "Peso 2"), le 2 viste del Cruscotto (colonna `agc_peso2`), i 3 controlli PCF che citavano "Canestro" (`FascicoliPerCanestroChart`, `CaricoPerCanestro`, `CaricoMagistratiChart`) e `agc_assignfascicolo.js` (simmetria di abilitazione controllo). **Verificato end-to-end**: Peso1=5 + Peso2=5 → peso calcolato = 10; rimozione Peso2 → torna a 5; drill-down "Fascicoli di [magistrato]" mostra correttamente la colonna "Peso 1". **Scoperta critica**: nell'ambiente esiste una tabella **`agc_canestro`** (diversa da `agc_canestrofascicolo`) orfana/corrotta da un'operazione di pulizia incompleta (vedi `06 - Riferimenti Normativi e Tecnici/Risposta_MS_Support_EntityMap_Corruption.md`) — non va mai confusa con la tabella realmente in uso; va sempre verificato il `Targets` della lookup su `agc_fascicolo2` prima di modificare metadati di entità con nomi simili. **Non modificato** (scelta esplicita): il campo Peso 1 resta **opzionale** (non reso `ApplicationRequired`) per non impattare i fascicoli già esistenti privi di Peso 2.
35. 🔴 **Bug aperto (14/09/2026)** — verificato su richiesta del supporto Microsoft che la corruzione di `agc_canestro`/`agc_fascicolo` (vedi punto 34 e `Risposta_MS_Support_EntityMap_Corruption.md`) **non è stata risolta**: `RetrieveDependenciesForDelete` su `agc_canestro` restituisce ancora gli stessi 2 record bloccanti di prima. Raccolte 2 nuove evidenze e inviate a Microsoft: (1) l'esportazione della solution "ASPEN POC 1.0.0.4" fallisce con `The Entity Relationship with EntityRelationshipId '1e8be637-4f63-f111-ab0c-7ced8d4558ae' was not found in the MetadataCache` — questo GUID coincide esattamente con il `dependentcomponentobjectid` (componente EntityRelationship) restituito dalla query API come dipendenza bloccante; (2) il tentativo di eliminazione manuale della tabella legacy `agc_fascicolo` non mostra errori a schermo ma fallisce in console con `POST .../%24batch` → 500, `"This EntityMap cannot be deleted because it has at least one system AttributeMap."` (`serverErrorCode: 0x80046202`). Risposta inviata al ticket Microsoft con questi dettagli, in attesa di riscontro.
36. ✅ **Risolto (15/09/2026)** — **Ribbon Workbench non caricava la solution "ASPEN POC Ribbon" (`ASPENPOCRibbon`)**: causa il system form "Informazioni" (header/sidebar della tabella standard `contact`, proveniente da `msdynce_AppCommon`) incluso automaticamente nonostante il RootComponent `contact` fosse impostato a "solo metadati" (`behavior=2`) — rimosso `contact` dalla solution, risolto. Il successivo tentativo di pubblicazione falliva poi con `Cannot have object with no publish instances` (`ComponentState=255`): causa lo stesso pattern di corruzione già noto sulla tabella orfana `agc_canestro` (vedi punto 35); risolto rimuovendo anche `agc_canestro` dalla solution ribbon.
37. ✅ **Risolto (15/09/2026)** — regola **3.11 "carico monotono"**: la rimozione dell'assegnazione di un fascicolo (campo Magistrato svuotato sul form, senza riassegnarlo a un altro magistrato) non decrementava il carico (`agc_caricoattuale`) del magistrato precedente, a differenza della riassegnazione (già gestita). **Fix** in `agc_assignfascicolo.js` (`onFormLoad`/`addOnSave`): nuova funzione `decrementaCaricoRimozione()` che sottrae il `agc_pesocalcolato` del fascicolo dal carico del magistrato originario (mai sotto zero) quando il nuovo valore del campo è vuoto; guardia `if (!newMagId || newMagId === origMagId) return;` sostituita con un ramo dedicato per il caso di svuotamento. Aggiornamento del web resource eseguito manualmente da Maker Portal (l'export della solution `ASPENPOC` che lo contiene fallisce per lo stesso bug di corruzione metadati del punto 35, quindi non è stato possibile automatizzare il deploy via `pac solution`). Verificato end-to-end dall'utente.
38. ✅ **Risolto (16/09/2026)** — **esoneri disattivati (`statecode`) ancora considerati durante l'assegnazione**: tutte le query lato client (`agc_assignfascicolo.js`, `agc_assignfascicolodialog.html`) e lato server (`EsoneroRientroPlugin.cs`, `EsoneroOverlapValidationPlugin.cs`) filtravano già lo stato business (`agc_statoesonero eq 1`) ma non lo stato record Dataverse: aggiunto `statecode eq 0` a tutte le query di recupero esoneri.
39. ✅ **Risolto (16/09/2026)** — **il carico del magistrato non aumentava mai in alcuni percorsi di assegnazione** (es. creazione da subgrid, "Aggiungi fascicolo esistente", assegnazione manuale dal form): causa strutturale, tutta la logica di incremento/decremento carico viveva solo in JS lato client (`agc_assignfascicolo.js`), che non viene eseguito quando il magistrato viene associato senza aprire il form del fascicolo (es. subgrid "Aggiungi esistente"), e leggeva `agc_pesocalcolato` (campo calcolato cross-entity) lato client, dove può risultare non ancora aggiornato/stale. **Fix architetturale**: creato nuovo plugin server-side `CaricoMagistratoAssegnazionePlugin.cs` (Post-Operation, stage 40, su Create/Update di `agc_fascicolo2`), che ricalcola sempre `agc_pesocalcolato` fresco via `service.Retrieve` e gestisce incremento/decremento in modo centralizzato per **tutti** i percorsi di assegnazione; rimossa la logica di scrittura diretta del carico da `agc_assignfascicolo.js`/`agc_assignfascicolodialog.html` (mantenute solo le validazioni interattive: blocco esonero Totale, conferma riserva GUP). Registrazione plugin (assembly, plugin type, step Create/Update, PreImage) effettuata interamente via Web API dirette. Necessario anche aggiungere il privilegio `prvWriteContact` al ruolo radice "Operatore ASPEN" (il plugin scrive `contact.agc_caricoattuale` nel contesto dell'utente chiamante, non elevato).
40. ✅ **Risolto (16/09/2026)** — **analisi di code review approfondita** (con modello dedicato "Astra") su tutti i plugin Dataverse e le web resource di assegnazione/carico, per verificare conflitti, duplicazioni, buchi funzionali e problemi di sicurezza. Tutti i **6 rilievi di gravità Alta** sono stati corretti:
    - **#1** — l'esonero **Totale** non era bloccato lato server (solo lato client, aggirabile da subgrid/import/API dirette): aggiunto controllo bloccante in `CaricoMagistratoAssegnazionePlugin` (Create e Update) prima di qualunque scrittura sul carico.
    - **#2** — incremento e decremento del carico non erano simmetrici per l'esonero Parziale (l'incremento applica il coefficiente, il decremento sottraeva solo il peso base, lasciando un residuo permanente): aggiunta nuova colonna `agc_fascicolo2.agc_contributocaricoassegnato` che salva il contributo esatto applicato a ogni assegnazione, riletto (e azzerato alla rimozione) per un decremento sempre esatto.
    - **#3** — assegnazione singola (dialog) e massiva usavano criteri diversi per il calcolo del "minor carico" quando un magistrato è in esonero Parziale: allineati sullo stesso criterio.
    - **#4** — tre processi (`CaricoMagistratoAssegnazionePlugin`, `EsoneroRientroPlugin`, `ModificaCaricoMagistratoPlugin`) scrivevano `contact.agc_caricoattuale` senza alcun protocollo di concorrenza: creato helper condiviso `CaricoConcurrencyHelper.cs` con concorrenza ottimistica basata su `RowVersion` (retry automatico fino a 5 tentativi in caso di conflitto), adottato da tutti e tre.
    - **#5** — alcuni errori HTTP/di verifica lato client venivano interpretati come "nessun esonero attivo" (mappa vuota su risposta non-ok) oppure consentivano esplicitamente il salvataggio del fascicolo nonostante un errore di verifica: in `agc_assignfascicolodialog.html` aggiunto un helper `parseJsonOrThrow` che rigetta esplicitamente le risposte non-ok; in `agc_assignfascicolo.js` l'errore di verifica ora blocca il salvataggio con un avviso dedicato, distinto da un eventuale errore di salvataggio vero e proprio (che mostra il messaggio reale, senza retry cieco).
    - **#6** — HTML injection/XSS nel dialog di assegnazione: il nome del magistrato veniva concatenato in `innerHTML` senza escaping; sostituito con creazione di elementi DOM e assegnazione del nome via `textContent`.
    - I rilievi di gravità Media/Bassa residui (ottimizzazioni query N+1, paginazione, validazione formato GUID, controllo ruolo admin basato su GUID hardcoded, garanzia dell'autore in audit, edge case su date/valori) sono stati **valutati e volutamente non implementati** per questo POC: rischio/impatto giudicato basso rispetto al costo, nessuna evidenza di sfruttamento nell'uso reale attuale. Report completo dell'analisi non versionato (output temporaneo di sessione).
41. ✅ **Risolto (17/09/2026)** — **"problema dell'orario" sul controllo esonero Totale**: le query che verificano se un esonero Totale è attivo "oggi" (`CaricoMagistratoAssegnazionePlugin.HaEsoneroTotaleAttivo`/`OttieniCoefficienteCarico`, `agc_assignfascicolo.js#verificaEsoneroTotale` e assegnazione massiva, `agc_assignfascicolodialog.html#getEsoneriAttivi`) confrontavano `agc_datainizio`/`agc_datafine` (campi Data, senza componente ora significativa) con l'**istante esatto** corrente (`DateTime.UtcNow` / `new Date().toISOString()`): di conseguenza l'esonero risultava scaduto già dalle 00:00 del giorno di fine, invece di restare attivo per l'intera giornata, permettendo assegnazioni indebite nel giorno stesso della fine esonero. **Fix**: confronto normalizzato a sola data (mezzanotte UTC) — `DateTime.UtcNow.Date` lato server, nuovo helper `oggiDataIso()` (duplicato nei due web resource, che sono script standalone) lato client. Rilevato durante l'analisi di un caso reale (esonero Totale di Emilio Palmieri, assegnazione avvenuta nel giorno di fine esonero). Assembly `Plugin-Custom-API` e i due web resource ricompilati/aggiornati e pubblicati via Web API dirette, verificato che il contenuto live combacia col sorgente locale.
42. ✅ **Risolto (17/09/2026)** — 2 bug segnalati dal tester su `agc_assignfascicolo.js` (nessuna modifica al comando moderno di griglia, vedi punto 43):
    - **Dialog "Salvataggio in corso" bloccato (`0x83215603`)**: collisione tra il re-save programmatico (`formContext.data.save()` innescato dall'handler stesso dopo la verifica esonero/riserva GUP) e un salvataggio concorrente (autosave, doppio click). **Fix**: skip completo di validazioni/dialog durante l'autosave (`saveMode === 70`, si limita a `preventDefault` se c'è una modifica non ancora validata); guardia di re-entrancy `salvataggioInCorso` (va posizionata **dopo** il controllo `magistratoGiaValidato === newMagId`, altrimenti blocca anche il proprio re-save legittimo — errore reintrodotto e poi corretto nella stessa sessione); re-save differito con `setTimeout(...,0)`; aggiunto il `return` mancante sulla catena di promise di `verificaEsoneroTotale` (non veniva propagata).
    - **"Verifica non riuscita" su magistrati specifici (Barbara Fabbri, Carla Villa) in un fascicolo nuovo con RGNR e ruolo GIP**: in `verificaRiservaGup`, quando `fascicoloId` è nullo (record non ancora salvato) veniva comunque tentata una `retrieveRecord` su un ID inesistente, sempre fallita → messaggio generico che mascherava l'errore reale, indipendente dal magistrato selezionato (confermato: stessa combinazione RGNR+ruolo+record nuovo falliva anche con altri magistrati). **Fix**: se `fascicoloId` è nullo si usa la business unit dell'utente corrente (via query su `systemuser`, **non** `userSettings.businessUnitId` — proprietà inesistente nella Client API, causa di un errore introdotto e poi corretto nella stessa sessione) invece di leggerla dal fascicolo. Aggiunto anche il dettaglio tecnico dell'errore reale nel dialog "Verifica non riuscita", per diagnosticabilità futura.
    - Deploy del web resource eseguito manualmente da Maker Portal (stesso limite di corruzione metadati del punto 35).
43. ✅ **Risolto — bug #28 superato da nuova feature (17/09/2026)** — inizialmente si voleva nascondere il pulsante **"Assegna Fascicolo"** in griglia con selezione multipla (vedi bug #28), ma i tentativi di correggere la sola formula `Visible` in Maker Portal non hanno dato risultati affidabili (probabile mismatch tra il nome campo usato in formula e il Display Name reale di `agc_magistratocontatto`, da confermare via autocomplete Power Fx). **Decisione presa**: invece di limitare la selezione, il pulsante ora gestisce esplicitamente sia la selezione singola sia quella multipla, delegando in `agc_assignfascicolo.js` (`openDialogFromGrid` come router):
    - **1 record selezionato, senza magistrato** → comportamento invariato: apre il dialog interattivo di assegnazione assistita (`apriDialogAssegnazioneSingola`, ex corpo di `openDialogFromGrid`).
    - **Qualunque altro caso** (selezione multipla, oppure singolo record già assegnato) → `apriAssegnazioneSelezionati`: assegna in sequenza **tutti e soli i fascicoli selezionati** (non tutti i non assegnati di sistema, che resta la funzione separata "Assegnazione massiva"/`openBulkAssignFromGrid`) applicando le stesse regole (continuità RGNR, minor carico, coefficiente esonero parziale, verifica riserva GUP). Se tra i selezionati ci sono fascicoli **già assegnati**, viene mostrato un dialog di conferma che avvisa quanti sono e chiede conferma prima di sovrascriverne l'assegnazione; se l'utente annulla, nessun fascicolo viene toccato.
    - La logica di assegnazione sequenziale (continuità, carico, esonero, riserva GUP) è stata estratta in una funzione condivisa `eseguiAssegnazioneSequenziale(fascicoli)`, usata sia da `apriAssegnazioneSelezionati` sia da `openBulkAssignFromGrid` (quest'ultimo ora la richiama invece di duplicarne la logica inline). La mappa di continuità RGNR esclude esplicitamente i fascicoli del batch corrente, per non usare l'assegnazione pre-esistente di un fascicolo come "continuità" per sé stesso quando viene riassegnato.
    - Deployato manualmente in Maker Portal (stesso vincolo di corruzione metadati del punto 35).
    - Formula `Visible` del comando "Assegna Fascicolo" aggiornata in Command Designer per permettere qualunque selezione ≥ 1. **Testato end-to-end dall'utente e confermato funzionante**: (a) singolo non assegnato → dialog invariato; (b) singolo già assegnato → avviso e riassegnazione; (c) selezione mista assegnati/non assegnati → avviso con conteggio corretto, annulla non tocca nulla, conferma riassegna tutti con carico/continuità/riserva GUP coerenti.
    - Nota: il dialog di assegnazione singola (`agc_assignfascicolodialog.html`) continua a **non avere** un avviso "già assegnato — riassegnare?": è stato chiesto solo per il flusso batch, quindi resta così finché non richiesto diversamente.

---

## Interlocutori

| Ruolo | Nominativo | Ente |
|---|---|---|
| Referente Ufficio GIP | Dott.ssa Maccora | Tribunale di Milano |
| Referente tecnico | Dott. Crepaldi | Tribunale di Milano |
| Referente operativo | Sig. Cortese | Tribunale di Milano |

**Partecipanti call 04/06/2026 (AGIC):** Chiara D'Innocenzi, Linda Tomasello, Vincenzo Picone, Giuseppe Scalabrino, Riccardo Vedovato, Luca Campoglioni  
**Microsoft:** Daiana D'Agostino

