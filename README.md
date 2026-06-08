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

## POC — stato attuale (08/06/2026)

**Ambiente Dataverse:** `LCC-MINISTEROGIUSTIZIA-DEMO` (https://lccministerogiustiziademo.crm4.dynamics.com)  
**Publisher prefix:** `agc_`

### Modello dati POC

| Tabella Dataverse | LogicalName | Descrizione |
|---|---|---|
| Canestro | `agc_canestro` | Materie/competenze (es. Stupefacenti, Omicidio…) |
| Magistrato | `agc_giudice` | Giudici GIP/GUP con ruolo e stato attivo |
| Fascicolo/Assegnazione | `agc_fascicolo` | Fascicoli con peso calcolato e lookup a magistrato+canestro |
| Configurazione | `agc_configurazione` | Parametri di sistema (es. `PesoLimite = 20`) |

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
| Stato | `agc_statocaso` | OptionSet: 0=Validato, 1=Proposto |
| Data | `agc_datacaso` | DateTime |

### Componenti PCF pubblicati

#### `AgicAspen.CaricoMagistratiChart` — `05 - Power Platform/PCF/`
Grafico a barre orizzontali del carico per magistrato.
- **Colori dinamici** dalla soglia `PesoLimite` in `agc_configurazione`:
  - 🟢 Verde `#107C10` — carico < 80% soglia
  - 🟡 Giallo `#FFB900` — carico ≥ 80% soglia
  - 🔴 Rosso `#D13438` — carico ≥ soglia
- **Legenda colori** inline sotto il grafico
- **Click su barra** → modal con elenco fascicoli assegnati al magistrato
- **Mapping nel designer:** `magistratoField` → `agc_magistratoassegnato`, `pesoField` → `agc_peso`

#### `AgicAspen.StatoFascicoliChart` — `05 - Power Platform/PCF-Pie/`
Grafico a torta distribuzione fascicoli per stato.
- Verde = Validato, Blu = Proposto
- Tooltip con valore assoluto e percentuale
- **Click su fetta** → modal con elenco fascicoli di quello stato
- **Mapping nel designer:** `statoField` → `agc_statocaso`

### Ribbon button — Assegna Fascicolo

Tasto custom **"Assegna Fascicolo"** nella command bar della form `agc_fascicolo`.  
Visibile solo su record esistenti. Soluzione Dataverse: `AgicAspenRibbon`.

**File sorgente: `05 - Power Platform/AssegnaFascicolo/`**

| File | Tipo | Descrizione |
|---|---|---|
| `WebResources/agc_assignfascicolo.js` | JS (type 3) | Handler ribbon: legge l'ID fascicolo e apre il dialog via `Xrm.Navigation.navigateTo` |
| `WebResources/agc_assignfascicolodialog.html` | HTML (type 1) | Dialog popup standalone |
| `WebResources/agc_assignfascicolo_icon.svg` | SVG (type 11) | Icona Fluent UI: persona blu + freccia verde |
| `AgicAspenRibbon_unpacked/` | Solution unpacked | Sorgente soluzione con `RibbonDiff.xml` |

**Comportamento del dialog:**
1. Carica lista magistrati da `agc_giudices` via REST (`/api/data/v9.2/agc_giudices`)
2. Permette selezione multipla di magistrati **incompatibili** (evidenziati in giallo con badge contatore)
3. **Conferma** → spinner 2.5s (simulazione flusso assegnazione) → schermata successo animata → chiusura automatica
4. **Annulla** → chiude il dialog

**Note tecniche:**
- Il dialog usa URL relativo per le chiamate Dataverse (same-domain cookie auth — no Bearer token)
- Il parametro passato al dialog si legge con `new URLSearchParams(location.search).get("Data")` (D maiuscola)
- `ModernImage` nel `RibbonDiff.xml` richiede il prefisso `$webresource:` (es. `$webresource:agc_assignfascicolo_icon.svg`)
- Il flusso di assegnazione effettivo **non è implementato** — la demo simula con spinner

### App model-driven
- Sitemap: **Operatività** (Fascicoli, Cruscotto) · **Anagrafiche** (Magistrati, Canestri)
- Dashboard "Cruscotto ASPEN" con entrambi i PCF

---

## Prossimi passi

1. Validare con il cliente la sintesi AS-IS emersa dalla call del 04/06/2026
2. Approfondire il modello dati – richiedere dump anonimizzato
3. Aggiungere pagina **Configurazione** alla sitemap per gestire `PesoLimite` dall'app
4. Pianificare sessioni su: sicurezza, incompatibilità, reportistica, migrazione dati
5. Implementare logica assegnazione reale (Plugin / Custom API) collegata al tasto "Assegna Fascicolo"
6. Strategia migrazione storico + integrazione SICP

---

## Interlocutori

| Ruolo | Nominativo | Ente |
|---|---|---|
| Referente Ufficio GIP | Dott.ssa Maccora | Tribunale di Milano |
| Referente tecnico | Dott. Crepaldi | Tribunale di Milano |
| Referente operativo | Sig. Cortese | Tribunale di Milano |

**Partecipanti call 04/06/2026 (AGIC):** Chiara D'Innocenzi, Linda Tomasello, Vincenzo Picone, Giuseppe Scalabrino, Riccardo Vedovato, Luca Campoglioni  
**Microsoft:** Daiana D'Agostino
