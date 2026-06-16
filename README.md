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
│   └── AssegnaFascicolo/            # Ribbon button + dialog "Assegna Fascicolo" su agc_fascicolo

📁 06 - Riferimenti Normativi e Tecnici/   # Normativa, lettere istituzionali, docs tecnici
```

---

## Documenti di riferimento

| Documento | Percorso | Note |
|---|---|---|
| Analisi AS-IS | [`02 - Analisi/AS-IS/ASPEN - Analisi AS-IS.md`](02%20-%20Analisi/AS-IS/ASPEN%20-%20Analisi%20AS-IS.md) | Bozza da validare con il cliente |
| Analisi e documentazione principale | [`03 - Documentazione Prodotta/Funzionale/ASPEN - Analisi e documentazione.docx`](03%20-%20Documentazione%20Prodotta/Funzionale/ASPEN%20-%20Analisi%20e%20documentazione.docx) | Documento funzionale principale |
| Sintesi call 04/06/2026 | [`04 - Riunioni e Call/ASPEN - Sintesi call 04-06-2026.docx`](04%20-%20Riunioni%20e%20Call/ASPEN%20-%20Sintesi%20call%2004-06-2026.docx) | Prima call di analisi AS-IS |

---

## Architettura target

- **Piattaforma:** Microsoft Power Platform – Model-Driven App su Dataverse  
- **Sicurezza:** Business Units per sede, ruoli di sicurezza nativi, Entra ID  
- **Logica assegnazione:** Plugin Dataverse / Custom API (per robustezza transazionale)  
- **Integrazione:** SICP (registro generale Ministero)  
- **Reporting:** Dashboard model-driven + Power BI  

---

## POC — stato attuale (09/06/2026)

**Ambiente Dataverse:** `LCC-MINISTEROGIUSTIZIA-DEMO` (https://lccministerogiustiziademo.crm4.dynamics.com)  
**Publisher prefix:** `agc_`

### Modello dati POC

| Tabella Dataverse | LogicalName | Descrizione |
|---|---|---|
| Canestro | `agc_canestro` | Materie/competenze (es. Stupefacenti, Omicidio…) |
| Magistrato | `agc_giudice` | Giudici GIP/GUP con ruolo e stato attivo |
| Fascicolo/Assegnazione | `agc_fascicolo` | Fascicoli con peso calcolato e lookup a magistrato+canestro |
| Configurazione | `agc_configurazione` | Parametri di sistema (`PesoLimite = 20`, `PesoLimiteCanestro = 30`) |

**Colonne chiave `agc_fascicolo`:**

| Colonna | LogicalName | Tipo |
|---|---|---|
| Numero RG | `agc_numeroregistrogenerale` | String |
| N. imputati | `agc_numeroimputati` | Integer |
| N. imputazioni | `agc_numeroimputazioni` | Integer |
| Punti imputati | `agc_puntiimputati` | Integer |
| Punti imputazioni | `agc_puntiimputazioni` | Integer |
| Canestro | `agc_canestro` | Lookup → agc_canestro |
| Magistrato assegnato | `agc_magistratoassegnato` | Lookup → agc_giudice |
| Peso | `agc_peso` | Decimal (calcolato) |
| Stato | `agc_statocaso` | OptionSet: 0=Validato, 1=Proposto, 2=Chiuso |
| Data | `agc_datacaso` | DateTime |

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
- **Click su barra** → modal con elenco fascicoli assegnati al magistrato
- **Mapping nel designer:** `magistratoField` → `agc_magistratoassegnato`, `pesoField` → `agc_peso`

#### `AgicAspen.CaricoPerCanestro` — `05 - Power Platform/PCF/CaricoPerCanestro/`
Grafico a barre del carico per canestro (materia giudiziaria).
- **Colori dinamici** dalla soglia `PesoLimiteCanestro` in `agc_configurazione` (default = 30):
  - 🟢 Verde `#107C10` — carico < 80% soglia
  - 🟡 Giallo `#FFB900` — carico ≥ 80% soglia
  - 🔴 Rosso `#D13438` — carico ≥ soglia
- Esclude i fascicoli in stato **Chiuso** dal calcolo carico
- Empty state: `Nessun fascicolo aperto assegnato a questo magistrato.`
- **OData fix**: lookup field letto come `_agc_canestro_value`; nome canestro via annotazione `@OData.Community.Display.V1.FormattedValue`

#### `AgicAspen.StatoFascicoliChart` — `05 - Power Platform/PCF-Pie/`
Grafico a torta distribuzione fascicoli per stato.
- Verde = Validato, Blu = Proposto, Grigio = Chiuso
- Tooltip con valore assoluto e percentuale
- Selettore **Anno** (pill UI) con opzione `Tutti gli anni` + elenco annualità presenti nei dati
- **Click su fetta** → modal con elenco fascicoli di quello stato
- **Mapping nel designer:** `statoField` → `agc_statocaso`

### Ribbon button — Assegna / Chiudi Fascicolo

Tasti custom **"Assegna Fascicolo"** e **"Chiudi Caso"** nella command bar della form `agc_fascicolo`.  
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
3. **Conferma** → PATCH su `agc_fascicolos({id})` con navigation property `agc_Magistratoassegnato@odata.bind` → schermata successo → chiusura automatica
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

### App model-driven
- Sitemap: **Operatività** (Fascicoli, Cruscotto) · **Anagrafiche** (Magistrati, Canestri) · **Impostazioni** (Configurazioni, accesso vincolato da privilegi)
- Dashboard "Cruscotto ASPEN" con entrambi i PCF
- **Home page**: Custom Page "ASPEN Home" (vedi sotto)

### Custom Page — Home ASPEN

Custom page (canvas page) usata come **home** della Model-Driven App, con 3 pulsanti operativi:

| Pulsante | Azione | Navigazione Power Fx |
|---|---|---|
| **Creazione fascicolo** | Apre la form di creazione di un nuovo `agc_fascicolo` | `Launch("main.aspx", { pagetype: "entityrecord", etn: "agc_fascicolo" })` |
| **Assegnazione fascicolo** | Apre l'area di Assegnazione (vista elenco fascicoli; variante: custom page dedicata) | `Launch("main.aspx", { pagetype: "entitylist", etn: "agc_fascicolo" })` |
| **Cruscotto** | Redirect alla dashboard "Cruscotto ASPEN" | `Launch("main.aspx", { pagetype: "dashboard", dashboardId: "__DASHBOARD_ID__" })` |

**File sorgente: `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/`**

| File | Tipo | Descrizione |
|---|---|---|
| `Source/agc_aspenhome.pa.yaml` | Power Apps source (Power Fx YAML) | Definizione della custom page: header + 3 pulsanti con formule `OnSelect` di navigazione in-app |

**Placeholder da valorizzare in ambiente** (documentati anche in testa al file `.pa.yaml`):

| Placeholder | Significato | Dove recuperarlo |
|---|---|---|
| `__DASHBOARD_ID__` | GUID della dashboard "Cruscotto ASPEN" | Designer dashboard (formId nell'URL) o tabella `systemform`/`savedquery` |
| `__APP_ID__` | GUID della Model-Driven App ASPEN (`appid`), opzionale in navigazione in-app | Maker portal > Apps > ASPEN > Details > App ID |
| `__ASSEGNA_PAGE__` | Nome logico della custom page di Assegnazione (solo se si usa una pagina dedicata) | Nome della custom page nella soluzione |

**Note tecniche:**
- La navigazione da una custom page verso pagine model-driven usa la funzione Power Fx `Launch("main.aspx", { … })`, i cui parametri ricalcano `Xrm.Navigation.navigateTo` (`pagetype`, `etn`, `dashboardId`, `name`).
- Il file `.pa.yaml` è il **sorgente versionabile** della pagina; per pubblicarlo va impacchettato in `.msapp` (`pac canvas pack`) e importato nella soluzione target `ASPENPOC`, oppure i 3 pulsanti vanno ricreati nel designer copiando le formule `OnSelect`.
- Con il PAC CLI attualmente disponibile, il rilascio della custom page non risulta fully automated end-to-end: è richiesto un **primo publish dal Maker Portal**.

**Passi manuali residui (maker portal)** — necessari perché non esistono nel repo né l'App Module né il `.msapp` impacchettato:
1. **Creare/importare la custom page** `agc_aspenhome` nella soluzione `ASPENPOC` (designer canvas o `pac canvas pack` del sorgente `.pa.yaml`; primo publish da Maker Portal).
2. **Valorizzare i placeholder** (`__DASHBOARD_ID__`, ecc.) nelle formule `OnSelect` dei pulsanti.
3. **Aggiungere la custom page alla Model-Driven App** dall'app designer (Pages > + New page > Custom page).
4. **Impostarla come home**: nell'app designer selezionare la pagina e attivare **"Set as default"** (oppure ordinarla come prima voce di navigazione), quindi **Save & Publish**.

---

## Prossimi passi

1. Validare con il cliente la sintesi AS-IS emersa dalla call del 04/06/2026
2. Approfondire il modello dati – richiedere dump anonimizzato
3. Pianificare sessioni su: sicurezza, incompatibilità, reportistica, migrazione dati
4. Tasto **"Rimuovi assegnazione"** e enable rule stabile "magistrato già assegnato"
5. Rifinire la command bar di **Fascicoli** con **Command Designer** (nascondere: Mostra grafico, Mostra questa visualizzazione, Invia link e-mail, Flusso, Esegui report)
6. **Notifica al magistrato** via Power Automate alla conferma assegnazione
7. **Storico assegnazioni** (audit trail su tabella dedicata)
8. Assegnazione **bulk** da griglia (selezione multipla fascicoli)
9. Persistere le **incompatibilità** su Dataverse (tabella o campo dedicato)
10. Risolvere in ambiente l'errore SQL `0x80044150` su apertura/assegnazione record **Canestro** (riallineamento metadati e, se necessario, escalation Microsoft)
11. Strategia migrazione storico + integrazione **SICP**

---

## Interlocutori

| Ruolo | Nominativo | Ente |
|---|---|---|
| Referente Ufficio GIP | Dott.ssa Maccora | Tribunale di Milano |
| Referente tecnico | Dott. Crepaldi | Tribunale di Milano |
| Referente operativo | Sig. Cortese | Tribunale di Milano |

**Partecipanti call 04/06/2026 (AGIC):** Chiara D'Innocenzi, Linda Tomasello, Vincenzo Picone, Giuseppe Scalabrino, Riccardo Vedovato, Luca Campoglioni  
**Microsoft:** Daiana D'Agostino


