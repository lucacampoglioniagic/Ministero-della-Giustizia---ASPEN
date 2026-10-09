# ASPEN — Piano di Migrazione verso il Nuovo Ambiente Dataverse

| Campo | Valore |
|---|---|
| Progetto | ASPEN — Ministero della Giustizia (POC assegnazione fascicoli / carico magistrati) |
| Ambiente sorgente | `LCC-MINISTEROGIUSTIZIA-DEMO` — `https://lccministerogiustiziademo.crm4.dynamics.com` (publisher `Agic`, prefix `agc_`, option value prefix `10000`) |
| Ambiente destinazione | `https://org8e819d4a.crm4.dynamics.com/` — solution **ASPEN** già creata (utente `luca.campoglioni@giustizia.it`) |
| Motivo | Corruzione irreversibile EntityMap/EntityRelationship nell'ambiente sorgente (ticket Microsoft aperto, non risolto al 14/09/2026): export/import standard della solution impossibile |
| Strategia | Ricostruzione manuale "clean slate" componente per componente, con pulizia del datamodel e del debito tecnico, validazione con dati di test realistici e suite E2E Playwright |
| Fonti analizzate | `README.md`, `SESSION_NOTES.md` (sessioni 06/2025 → 17/09/2026), `05 - Power Platform/**` (plugin C#, web resources, RibbonDiff, PCF, custom page), `06 - Riferimenti Normativi e Tecnici/Risposta_MS_Support_EntityMap_Corruption.md` |

> **Principio guida**: nulla viene "esportato" dalla sorgente a livello di solution. Tutto viene **ricreato** nella destinazione a partire dai sorgenti versionati in repository (codice, XML, YAML) e dalla documentazione; i soli artefatti trasferiti dalla sorgente sono i **dati** (via Web API / CSV), previa bonifica.

---

## Indice

1. [Inventario completo dei componenti da migrare](#1-inventario-completo-dei-componenti-da-migrare)
2. [Bug e problemi noti della sorgente da NON portare](#2-bug-e-problemi-noti-della-sorgente-da-non-portare)
3. [Proposta di datamodel pulito (clean slate)](#3-proposta-di-datamodel-pulito-clean-slate)
4. [Piano di migrazione a fasi (0–12)](#4-piano-di-migrazione-a-fasi-012)
5. [Rischi e mitigazioni](#5-rischi-e-mitigazioni)
6. [Strategia dati di test](#6-strategia-dati-di-test)
7. [Checklist di parità funzionale finale](#7-checklist-di-parità-funzionale-finale)
8. [Appendici](#8-appendici)

---

## 1. Inventario completo dei componenti da migrare

### 1.1 Tabelle custom (stato attuale in sorgente)

Legenda obbligatorietà: **R** = ApplicationRequired, **O** = opzionale, **S** = System/Read-only, **F** = formula/calcolato, **P** = valorizzato da plugin.

#### 1.1.1 `agc_fascicolo2` — Fascicolo (User/Team owned)

Tabella "workaround" creata a luglio 2026 in sostituzione di `agc_fascicolo` corrotta. È la tabella operativa di riferimento.

| Colonna logica | Schema name | Display | Tipo | Obbl. | Note |
|---|---|---|---|---|---|
| `agc_fascicolo2id` | `agc_Fascicolo2Id` | ID | Uniqueidentifier | S | PK |
| `agc_numeroregistrogenerale` | `agc_NumeroRegistroGenerale` | Numero Registro Generale | String(850) | **R** | Primary name. Formato usato nei dati: `RG-2026/0111` |
| `agc_numeroimputati` | `agc_NumeroImputati` | N. imputati | Whole number | **R** | Usato nella formula peso e nella KPI Home |
| `agc_numeroimputazioni` | `agc_NumeroImputazioni` | N. imputazioni | Whole number | **R** | Usato nella formula peso |
| `agc_canestrofascicolo` | `agc_Canestrofascicolo` | Peso 1 | Lookup → `agc_canestrofascicolo` | O (*) | README lo indica Required ma il 11/09 si è deciso esplicitamente di lasciarlo opzionale (vedi §2, #12). Relazione `agc_fascicolo2_Canestrofascicolo_agc_canestrofascicolo` |
| `agc_peso2` | `agc_Peso2` | Peso 2 | Lookup → `agc_peso2` | O | Relazione `agc_fascicolo2_Peso2_agc_peso2` (nome dedotto) |
| `agc_puntiimputati` | `agc_PuntiImputati` | Punti imputati | Whole number | O | Introdotto 11/09; attualmente non usato dalla formula |
| `agc_puntiimputazioni` | `agc_PuntiImputazioni` | Punti imputazioni | Whole number | O | Idem |
| `agc_magistratocontatto` | `agc_magistratocontatto` (nav prop **minuscola**, verificare su `$metadata`) | Magistrato | Lookup → `contact` | O | Relazione `agc_fascicolo2_magistratocontatto_contact`. Trigger del plugin carico |
| `agc_pesocalcolato` | `agc_PesoCalcolato` | Peso calcolato | Decimal (Formula) | **F** | `agc_numeroimputati + agc_numeroimputazioni + agc_Canestrofascicolo.agc_peso + If(IsBlank(agc_Peso2), 0, agc_Peso2.agc_peso) + 1` |
| `agc_statocaso` | `agc_StatoCaso` | Stato caso | Choice locale | O | 0 = Validato, 1 = Proposto, 2 = Chiuso |
| `agc_datacaso` | `agc_DataCaso` | Data caso | DateTime (Date only, User local) | O | Asse temporale grafico Andamento |
| `agc_rgnr` | `agc_RGNR` | RGNR | Lookup → `agc_rgnr` | O | Relazione `agc_rgnr_agc_fascicolo2_RGNR`; usata per la continuità di assegnazione |
| `agc_ruoloassegnazione` | `agc_RuoloAssegnazione` | Ruolo assegnazione | Choice locale | O | 0 = GIP, 1 = GUP. Alimenta la "riserva GUP" |
| `agc_contributocaricoassegnato` | `agc_ContributoCaricoAssegnato` | Contributo carico assegnato | Decimal | **P** | Scritto da `CaricoMagistratoAssegnazionePlugin`; read-only su form |
| `agc_magistratoassegnato` | `agc_Magistratoassegnato` | Magistrato (legacy) | Lookup → `agc_giudice` | O | **LEGACY — non migrare** |
| `agc_peso` | `agc_Peso` | Peso (legacy) | Decimal | O | **LEGACY — non migrare** (sostituito da `agc_pesocalcolato` il 07/07/2026) |
| `statecode`/`statuscode` | | Stato | | S | Attivo/Inattivo standard |
| `ownerid` | | Proprietario | Owner | S | Forzato da `SetOwnerTeamPlugin` al default team della BU dell'utente |

**Viste** (sorgente): "Fascicoli 2" (public, default), "Fascicoli 2 aperti (Cruscotto)" e "Fascicoli 2 (tutti) (Cruscotto)" (includono `agc_pesocalcolato`, `agc_canestrofascicolo`, `agc_peso2`, `agc_magistratocontatto`, `agc_numeroregistrogenerale`, `agc_statocaso`, `agc_datacaso`), ricerca rapida, associata, lookup, ricerca avanzata. La vista "Fascicoli 2" è quella puntata dalla Home (`viewid=66ef2ecc-32ca-4275-901c-80f0637f1003` in sorgente).

**Form**: main form "Informazioni" — tab Generale con sezione Generale (RG, Owner, N. imputati, N. imputazioni, Peso 1, Peso 2, Magistrato, Peso calcolato [ro], Stato caso, Data caso, RGNR, Ruolo assegnazione, Contributo carico [ro], Punti imputati/imputazioni). Libreria `agc_assignfascicolo.js`, evento `onload → AgicAspen.AssegnaFascicolo.onFormLoad` (passa execution context). **Attenzione**: in sorgente esistono due form "Informazioni" duplicate (una sola effettivamente renderizzata) — nella destinazione crearne **una sola**.

#### 1.1.2 `agc_canestrofascicolo` — Peso 1 (ex "Canestro")

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_name` | String(100) | R | Primary name (es. "Stupefacenti", "Omicidio") |
| `agc_peso` | Whole number | R | Peso della categoria, sommato nella formula |

13 record in sorgente. Display name rinominato "Peso 1" il 11/09/2026 (logical name rimasto `agc_canestrofascicolo`). Viste: attivi/inattivi/ricerca/lookup. Form: name + peso.

#### 1.1.3 `agc_peso2` — Peso 2

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_name` | String(100) | R | Primary name |
| `agc_peso` | Whole number | R | Sommato nella formula se il lookup è valorizzato |

Creata 11/09/2026. Organization owned (verificare; proposta: Organization owned).

#### 1.1.4 `contact` — Magistrato (tabella standard estesa)

| Colonna custom | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_ismagistrato` | Yes/No | O (default No) | Filtro principale in tutti i dialog/PCF (`agc_ismagistrato eq true`) |
| `agc_ruolomagistrato` | Choice | O | **Legacy** (GIP/GUP a livello anagrafico); non usato dal motore ma `EsoneroRientroPlugin` lo usa come filtro `NotNull` sui colleghi candidati |
| `agc_caricoattuale` | Decimal (min 0) | O | Carico corrente (contributi cumulati); scritto da plugin e da Custom API |
| `agc_utenteassociato` | Lookup → `systemuser` | O | Associazione contatto ↔ utente Dataverse |

Form "Contatto - Magistrato" (FormXml **non versionato** in repo): campi anagrafici, `agc_ismagistrato`, `agc_ruolomagistrato`, `agc_caricoattuale` (ro), `agc_utenteassociato`; tab "Fascicoli" con subgrid `agc_fascicolo2` (vista associata, `agc_magistratocontatto`); tab "Esoneri" con subgrid `agc_esonero`; PCF `CaricoPerCanestro` (field control ancorato a un campo testo qualsiasi). Vista pubblica "Magistrati attivi" (`agc_ismagistrato eq true`, `statecode eq 0`; colonne fullname, caricoattuale, ruolo, utente associato). Nella sitemap l'area "Magistrati" usa `contact` con title override.

#### 1.1.5 `agc_esonero` — Esonero

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_name` | String | R | Primary name (es. "Ferie", "Esonero test") |
| `agc_magistrato` (nav `agc_Magistrato`) | Lookup → contact | **R** | Relazione `agc_contact_agc_esonero_Magistrato` |
| `agc_tipoesonero` | Choice | R | 1 = Totale, 2 = Parziale |
| `agc_percentualeesonero` | Decimal | O | Solo se Parziale; business rule nasconde il campo se Totale |
| `agc_datainizio` | DateOnly | R | |
| `agc_datafine` | DateOnly | O | Null = a tempo indeterminato |
| `agc_statoesonero` | Choice | R | 1 = Attivo (default form), 2 = Chiuso, 3 = Annullato |
| `agc_note` | Memo | O | |
| `agc_punteggioalmomentoesonero` | Decimal | P/ro | Snapshot carico all'attivazione |
| `agc_punteggioalrientro` | Decimal | P/ro | Snapshot carico alla chiusura |
| `agc_collegariferimento` | Lookup → contact | P/ro | Collega "più simile" usato per il riallineamento |

Business rule: "Nascondi Percentuale Esonero se Totale" (scope form). Viste: "Esoneri attivi/e" (deve includere `agc_statoesonero`, `agc_tipoesonero`, `agc_percentualeesonero`, `agc_datainizio`, `agc_datafine`, `agc_magistrato` per il PCF), "Esoneri inattivi/e", associata, lookup.

#### 1.1.6 `agc_fotocaricoesonero` — Foto carico esonero

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_name` | String | R | Generato dal plugin (`"<Fullname> — <data>"`) |
| `agc_esonero` | Lookup → agc_esonero | R | Relazione parental/referential restrict (proposta: **Parental**, così la cancellazione dell'esonero pulisce le foto) |
| `agc_magistrato` | Lookup → contact | R | Collega fotografato |
| `agc_carico` | Decimal | R | Carico del collega al momento dell'esonero Totale |

Creata in contesto utente dal plugin `EsoneroRientroPlugin` → il ruolo Operatore deve avere Create/Read.

#### 1.1.7 `agc_modificacarico` — Audit modifica carico

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_name` | String | R | Generato dalla Custom API |
| `agc_magistrato` | Lookup → contact | R | |
| `agc_valoreprecedente` | Decimal | R | |
| `agc_valorenuovo` | Decimal | R | |
| `agc_nota` | Memo | O | Motivazione |

`createdby`/`createdon` usati come "chi/quando". Vista associata sul contatto (tab facoltativa "Storico carico").

#### 1.1.8 `agc_rgnr` — RGNR (Registro Generale Notizie di Reato)

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_name` | String | R | Numero RGNR (es. "111111") |
| `agc_annoregistro` | String(4) | R | Validato 1900–2200 da `AnnoRegistroValidationPlugin` |
| `agc_note` | Memo | O | |

User/Team owned (soggetto a `SetOwnerTeamPlugin`). Form con tab "Fascicoli" (subgrid `agc_fascicolo2` via `agc_rgnr`). Viste standard.

#### 1.1.9 `agc_configurazione` — Configurazione

| Colonna | Tipo | Obbl. | Note |
|---|---|---|---|
| `agc_nome` | String | R | Primary name (chiave) |
| `agc_valore` | String | R | Valore (parsato a numero dai PCF) |

Record: `PesoLimite = 20` (soglia carico per magistrato, PCF CaricoMagistratiChart), `PesoLimiteCanestro = 30` (PCF CaricoPerCanestro). Voce sitemap "Configurazioni" in area Impostazioni con privilege rule (visibile solo a chi ha privilegio di Write sulla tabella / admin).

#### 1.1.10 Tabelle legacy da NON ricreare

| Tabella | Motivo |
|---|---|
| `agc_fascicolo` | Corrotta (lookup orfano `agc_canestro`, ghost `agc_CanestroName`), sostituita da `agc_fascicolo2` |
| `agc_canestro` | Zombie ("Reserve entity 22a6bb1e6a"): metadata senza tabella SQL |
| `agc_giudice` | Anagrafica Magistrato legacy sostituita da `contact`; non cancellabile in sorgente per relazione orfana |
| Colonne `agc_magistratoassegnato`, `agc_peso` su fascicolo | Sostituite da `agc_magistratocontatto` e `agc_pesocalcolato` |

### 1.2 Relazioni (stato attuale e proposta di pulizia)

| Relazione (sorgente) | Da → A | Tipo | Azione nella destinazione |
|---|---|---|---|
| `agc_fascicolo2_Canestrofascicolo_agc_canestrofascicolo` | fascicolo2.agc_canestrofascicolo → Peso 1 | N:1 referential | **Ricreare** (Referential, Restrict Delete) |
| `agc_fascicolo2_Peso2_agc_peso2` | fascicolo2.agc_peso2 → Peso 2 | N:1 referential | **Ricreare** (Referential, Restrict Delete) |
| `agc_fascicolo2_magistratocontatto_contact` | fascicolo2.agc_magistratocontatto → contact | N:1 referential | **Ricreare** (Referential, Remove Link) — display "Magistrato" |
| `agc_rgnr_agc_fascicolo2_RGNR` | fascicolo2.agc_rgnr → agc_rgnr | N:1 referential | **Ricreare** (Referential, Restrict Delete) |
| `agc_contact_agc_esonero_Magistrato` | esonero.agc_magistrato → contact | N:1 | **Ricreare** (Referential, Restrict Delete) |
| `agc_contact_agc_esonero_CollegaRiferimento` | esonero.agc_collegariferimento → contact | N:1 | **Ricreare** (Referential, Remove Link) |
| `agc_esonero_agc_fotocaricoesonero_Esonero` | foto.agc_esonero → esonero | N:1 | **Ricreare come Parental** (cascade delete) |
| `agc_contact_agc_fotocaricoesonero_Magistrato` | foto.agc_magistrato → contact | N:1 | **Ricreare** (Referential, Restrict Delete) |
| `agc_contact_agc_modificacarico_Magistrato` | modificacarico.agc_magistrato → contact | N:1 | **Ricreare** (Referential, Restrict Delete — l'audit non deve perdersi) |
| `agc_contact_systemuser_utenteassociato` | contact.agc_utenteassociato → systemuser | N:1 | **Ricreare** (Referential, Remove Link) |
| `agc_fascicolo2_Magistratoassegnato_agc_giudice` | fascicolo2 → agc_giudice | N:1 | **NON ricreare** |
| `agc_fascicolo_Magistratoassegnato_agc_giudice`, `agc_fascicolo_Canestro_agc_canestro` | fascicolo legacy | | **NON ricreare** |
| Relazioni di sistema (owner/BU/createdby…) | | | automatiche |

Nessuna relazione N:N è in uso. Non usare **mai** la cancellazione/ricreazione rapida di tabelle con lookup in ingresso nella destinazione (è la sequenza che ha innescato la corruzione in sorgente — vedi §2 #1).

### 1.3 Option set (tutti locali)

| Tabella.colonna | Valori |
|---|---|
| `agc_fascicolo2.agc_statocaso` | 0 Validato · 1 Proposto · 2 Chiuso |
| `agc_fascicolo2.agc_ruoloassegnazione` | 0 GIP · 1 GUP |
| `agc_esonero.agc_tipoesonero` | 1 Totale · 2 Parziale |
| `agc_esonero.agc_statoesonero` | 1 Attivo · 2 Chiuso · 3 Annullato |
| `contact.agc_ruolomagistrato` | (legacy — vedi §3: da non ricreare o ricreare come GIP/GUP/Entrambi solo se richiesto) |

I valori sono **hard-coded** in plugin (`TipoEsonero.Totale=1`, `StatoEsonero.Attivo=1/Chiuso=2`, `StatoCaso.Chiuso=2`, `RuoloAssegnazione.GUP=1`), JS e PCF: devono essere **identici** nella destinazione. Nota: gli option set locali creati da UI userebbero il prefix `10000xxxx`; per compatibilità con il codice vanno creati specificando i valori espliciti 0/1/2 (via Maker Portal è consentito modificare il valore prima del salvataggio, oppure via Web API `CreateAttribute`).

### 1.4 Viste, form, dashboard, custom page

| Componente | Dettaglio |
|---|---|
| Dashboard "Cruscotto ASPEN" | Layout **2 colonne × 2 righe** (corretto il 25/09/2026, vedi §7.7 — in precedenza era 3 grafici in riga 1 + 1 in riga 2): (1) PCF `CaricoMagistratiChart` su vista "Fascicoli 2 aperti (Cruscotto)"; (2) PCF `FascicoliPerCanestroChart` su stessa vista; (3) PCF `EsoneriAttiviChart` su vista "Esoneri attivi/e"; (4) PCF `AndamentoCaricoMensileChart` su vista "Fascicoli 2 (tutti) (Cruscotto)". Id form nella destinazione (`Tribunali-dev`): `4ff56c67-5fb7-f111-aaab-000d3a697f24` (non versionato in repo, come il form "Contatto - Magistrato") |
| Custom page "ASPEN Home" (`agc_home_629be`) | Sorgente in `Model-Driven-App/AspenHomeCustomPage/Source/{App.fx.yaml,Screen1.fx.yaml}`. Named Formulas responsive (`HomeMargin`, `HomeGap`, `HomeNumCols`, `HomeCardWidth`, `HomeCardHeight`, `HomeHeroBottom`, `HomeCardsRows`, `HomeStatsY`, `HomeStatsCols`, `HomeStatsRowH`, `HomeStatsRows`, `HomeStatsHeight`, `HomeStatsItemW`). Tre card (Cruscotto → `Launch(".../main.aspx?appid=…&pagetype=dashboard&id=…&type=system&_canOverride=true", {}, LaunchTarget.Replace)`; Lista Fascicoli → `pagetype=entitylist&etn=agc_fascicolo2&viewid=…&viewType=1039`; Nuovo Fascicolo → `pagetype=entityrecord&etn=agc_fascicolo2`). Pannello statistiche: `Text(CountIf(Fascicoli, true), "#,##0")`, `Text(CountRows(Filter(Fascicoli, 'Data creazione' >= DateAdd(Today(), -7, TimeUnit.Days))), "#,##0")`, `Text(Round(Average(Fascicoli, 'Peso calcolato'), 1), "#,##0.0")`, `Text(Sum(Fascicoli, 'N. imputati'), "#,##0")`. Data source: tabella Fascicoli (`agc_fascicolo2`). Sfondo `RGBA(250,250,250,1)`; card realizzate con `button` disabilitati per il border radius |
| Form `agc_fascicolo2` main | Vedi §1.1.1 |
| Form `contact` "Contatto - Magistrato" | Vedi §1.1.4 (da ricostruire a mano: FormXml non versionato) |
| Form `agc_esonero`, `agc_rgnr`, `agc_canestrofascicolo`, `agc_peso2`, `agc_configurazione`, `agc_fotocaricoesonero`, `agc_modificacarico` | Form standard a una sezione |
| Business rule | `agc_esonero`: "Nascondi Percentuale Esonero se Totale" |

### 1.5 Plugin e Custom API (assembly `Plugin-Custom-API`, .NET Framework 4.6.2, firmato, namespace `AgicAspen.Plugins`)

| Classe | Messaggio | Tabella | Stage | Mode | Filtering attributes | Immagini | Logica |
|---|---|---|---|---|---|---|---|
| `SetOwnerTeamPlugin` | Create | `agc_fascicolo2`, `agc_rgnr` | PreOperation (20) | Sync | — | — | Imposta `ownerid` = default team della BU dell'utente iniziatore |
| `CaricoMagistratoAssegnazionePlugin` | Create | `agc_fascicolo2` | PostOperation (40) | Sync | — | — | Se magistrato valorizzato: blocca se esonero Totale attivo (`InvalidPluginExecutionException`), calcola contributo = `agc_pesocalcolato × (1 + perc/100)` se Parziale attivo, incrementa `contact.agc_caricoattuale` con concorrenza ottimistica, scrive `agc_contributocaricoassegnato` |
| idem | Update | `agc_fascicolo2` | PostOperation (40) | Sync | `agc_magistratocontatto` | PreImage `PreImage` (`agc_magistratocontatto`, `agc_contributocaricoassegnato`) | Decrementa il contributo precedente dal vecchio magistrato, incrementa il nuovo; blocco esonero Totale |
| `EsoneroOverlapValidationPlugin` | Create, Update | `agc_esonero` | PreOperation (20) | Sync | (Update: `agc_datainizio, agc_datafine, agc_statoesonero, agc_magistrato`) | PreImage su Update | Blocca esoneri Attivi sovrapposti per lo stesso magistrato |
| `EsoneroRientroPlugin` | Create | `agc_esonero` | PostOperation (40) | Sync | — | — | Se Attivo: snapshot `agc_punteggioalmomentoesonero`; se Totale crea `agc_fotocaricoesonero` per tutti i colleghi magistrati |
| idem | Update | `agc_esonero` | PostOperation (40) | Sync | `agc_statoesonero` | PreImage `PreImage` (`agc_statoesonero`, `agc_magistrato`) | Attivo→Chiuso: scrive `agc_punteggioalrientro`; se Totale riallinea `agc_caricoattuale` al collega più simile (min \|foto − punteggio\|, tie → carico inferiore) e imposta `agc_collegariferimento` |
| `AnnoRegistroValidationPlugin` | Create, Update | `agc_rgnr` | PreOperation (20) | Sync | (Update: `agc_annoregistro`) | — | `agc_annoregistro` numerico 4 cifre in [1900, 2200] |
| `ModificaCaricoMagistratoPlugin` | Custom API `agc_ModificaCaricoMagistrato` | bound a `contact` | (Custom API step, sync) | | | | Verifica ruolo Sys Admin (GUID **hard-coded** `5eaeacb4-735a-f111-a825-000d3ade6bac` → da parametrizzare), aggiorna `agc_caricoattuale`, crea `agc_modificacarico`, ritorna `AuditId` |
| `CaricoConcurrencyHelper` | helper | | | | | | Retry (5) su `RowVersion` / errore `-2147088254` |

**Custom API `agc_ModificaCaricoMagistrato`**: Binding Entity (`contact`), Allowed custom processing step type = None, IsFunction = false, IsPrivate = false; request parameters `NuovoValore` (Decimal, type 2 — **non** Money), `Nota` (String, opzionale); response property `AuditId` (Guid). Chiamata dal client: `POST /api/data/v9.2/contacts(<id>)/Microsoft.Dynamics.CRM.agc_ModificaCaricoMagistrato`.

Prerequisiti di sicurezza dedotti dal codice: i plugin girano nel contesto dell'utente chiamante → il ruolo Operatore necessita **Write su contact** (Local/BU), **Create/Read su agc_fotocaricoesonero**, **Read su agc_esonero** di altri magistrati (Global o almeno BU), Read su `agc_configurazione`.

### 1.6 Web resources

| Nome | Tipo | Funzione |
|---|---|---|
| `agc_assignfascicolo.js` | JScript | Namespace `AgicAspen.AssegnaFascicolo`: `openDialog` (form), `openDialogFromGrid` (router griglia: 1 selezionato → dialog singolo, N → assegnazione sequenziale con esclusione esonerati/riserva GUP), `apriDialogAssegnazioneSingola`, `apriAssegnazioneSelezionati`, `eseguiAssegnazioneSequenziale`, `openBulkAssignFromGrid` / `isBulkAssignVisible` (massiva su tutti i non assegnati), `openCloseDialog` (Chiudi Caso), `onFormLoad` (addOnSave: skip autosave saveMode 70, guardia re-entrancy, blocco esonero Totale lato client, warning riserva GUP, fallback BU via query systemuser), `isEnabledForm`, `isEnabledGrid`, `isCloseEnabledForm` |
| `agc_assignfascicolodialog.html` | HTML | Dialog assegnazione: parametro via `URLSearchParams.get("Data")`, ricerca magistrati (`contacts?$filter=agc_ismagistrato eq true and statecode eq 0`), checkbox incompatibilità, continuità RGNR (stesso RGNR → stesso magistrato, con verifica esonero), criterio minor carico (`agc_caricoattuale`), riserva GUP con `window.confirm`, `PATCH agc_fascicolo2s(id)` con `agc_magistratocontatto@odata.bind: /contacts(id)`; hardening `parseJsonOrThrow`, `textContent` |
| `agc_modificacarico.js` | JScript | Namespace `AgicAspen.ModificaCarico`: `openDialog` (form contact), `isSystemAdministrator` (DisplayRule — controlla `Xrm.Utility.getGlobalContext().userSettings.roles` contro GUID/nome "System Administrator") |
| `agc_modificacaricodialog.html` | HTML | Dialog: valore attuale, nuovo valore, nota → `POST contacts(id)/Microsoft.Dynamics.CRM.agc_ModificaCaricoMagistrato` |
| `agc_assignfascicolo_icon.svg`, `agc_closefascicolo_icon.svg`, `agc_modificacarico_icon.svg` | SVG | Icone comandi |

### 1.7 Ribbon classico (RibbonDiff) e comandi moderni (Command Designer)

**RibbonDiff `agc_fascicolo2`** (form):

| Bottone | Id | Location | Sequence | Command | Enable rules | Display rules | Azione |
|---|---|---|---|---|---|---|---|
| Assegna Fascicolo | `agc.agc_fascicolo2.Form.AssegnaFascicolo.Button` | `Mscrm.Form.agc_fascicolo2.MainTab.Save.Controls._children` | 21 | `agc.agc_fascicolo2.Form.AssegnaFascicolo.Command` | `Mscrm.FormStateExistingOrReadOnly`, CustomRule `AgicAspen.AssegnaFascicolo.isEnabledForm` (PrimaryControl) | — | JS `openDialog` (PrimaryControl), icona `$webresource:agc_assignfascicolo_icon.svg` |
| Chiudi Caso | `agc.agc_fascicolo2.Form.ChiudiCaso.Button` | idem | 22 | `agc.agc_fascicolo2.Form.ChiudiCaso.Command` | `Mscrm.FormStateExistingOrReadOnly`, CustomRule `isCloseEnabledForm` | — | JS `openCloseDialog`, icona `$webresource:agc_closefascicolo_icon.svg` |

HideCustomActions (homepage grid `agc_fascicolo2`): `Mscrm.HomepageGrid.agc_fascicolo2.MainTab.QuickPowerBI.Button` (ShowThisView), `…MainTab.Collaborate.Controls.Mscrm.HomepageGrid.agc_fascicolo2.Send`, `…SendDirectEmail`, `…modern.SendDirectEmail`, `Mscrm.HomepageGrid.agc_fascicolo2.Flows.RefreshCommandBar` (+ `…Flows.Flows`), `Mscrm.HomepageGrid.agc_fascicolo2.RunReport`. In sorgente il file `AgicAspenRibbon_unpacked/.../agc_Fascicolo2/RibbonDiff.xml` non contiene "Chiudi Caso" (presente solo nei RibbonDiff della legacy `agc_fascicolo`): ricostruire da quelli.

**Comandi moderni (Command Designer, component library `ASPEN_DefaultCommandLibrary`) — griglia `agc_fascicolo2`, non versionati in repo:**

| Comando | Visible (Power Fx) | Azione | Note |
|---|---|---|---|
| Assegna Fascicolo | `CountRows(Self.Selected.AllItems) >= 1` | JavaScript `AgicAspen.AssegnaFascicolo.openDialogFromGrid`, parametri: `SelectedControl`, `SelectedControlSelectedItemReferences` | Icona `agc_assignfascicolo_icon.svg` |
| Assegnazione massiva | `CountRows(Self.Selected.AllItems) = 0` | JavaScript `openBulkAssignFromGrid` (SelectedControl) | Bug piattaforma: `CountRows(Self.Selected.AllItems)` dentro `And()/If()` è inaffidabile → se serve comporre usare `!IsBlank(Self.Selected.Item)` |

**RibbonDiff `contact`** (solution `AgicModificaCaricoRibbon`, root component `contact` behavior=2):

| Bottone | Location | Sequence | Enable/Display | Azione |
|---|---|---|---|---|
| Modifica Carico | `Mscrm.Form.contact.MainTab.Actions.Controls._children` | 11 | DisplayRule CustomRule `AgicAspen.ModificaCarico.isSystemAdministrator` (PrimaryControl); EnableRule `Mscrm.FormStateExistingOrReadOnly` | JS `AgicAspen.ModificaCarico.openDialog`, icona `agc_modificacarico_icon.svg` |

Ribbon classico obbligatorio per il contatto perché Power Fx del Command Designer non espone `User()`/ruoli in MDA.

### 1.8 PCF (namespace `AgicAspen`, Chart.js ^4.5.1, pcf-scripts 1.x, TypeScript 5.8)

| Controllo | Tipo | Progetto sorgente | Proprietà | Dipendenze runtime | Uso |
|---|---|---|---|---|---|
| `CaricoMagistratiChart` v1.0.2 (09/10/2026: rimossa la colonna Stato dalla modale) | dataset (`fascicoliDataSet`) | `PCF/` | `magistratoField` (Lookup.Simple → `agc_magistratocontatto`), `pesoField` (Whole/FP/Decimal → `agc_pesocalcolato`); legge `agc_statocaso` e `agc_numeroregistrogenerale` dalla vista | WebAPI: `agc_configurazione?$select=agc_valore&$filter=agc_nome eq 'PesoLimite'` | Dashboard |
| `EsoneriAttiviChart` v1.0.2 (08/10/2026: `toDateOrNull` normalizza `agc_datainizio` al giorno locale) | dataset (`esoneriDataSet`) | `PCF/` | `magistratoField`, `tipoField` (OptionSet), `statoField` (OptionSet), `percentualeField` (opt), `dataInizioField`, `dataFineField` (opt) | — | Dashboard (vista "Esoneri attivi/e") |
| `AndamentoCaricoMensileChart` v1.0.0 | dataset | `PCF/` | `magistratoField`, `pesoField`, `dataField` (`agc_datacaso`) | — | Dashboard |
| `CaricoPerCanestro` v1.0.1 | field (`dummyBind` SingleLine.Text) | `PCF/CaricoPerCanestro/` (pcfproj separato, escluso dal primo) | nessuna bound utile; legge `context.page.entityId` | WebAPI: `agc_configurazione` (`PesoLimiteCanestro`), `agc_fascicolo2s?$select=agc_fascicolo2id,agc_pesocalcolato,agc_statocaso,_agc_canestrofascicolo_value&$filter=_agc_magistratocontatto_value eq <id> and agc_pesocalcolato ne null` | Form contact |
| `FascicoliPerCanestroChart` v1.0.4 (09/10/2026: titolo "Fascicoli per Peso"; selettore Peso 1/Peso 2 sotto il filtro Anno; modale senza colonna Stato; layout con holder canvas `min-height` 420px) | dataset | `PCF-Pie/` | `canestroField` (Lookup.Simple → `agc_canestrofascicolo`); dalla vista legge `agc_numeroregistrogenerale`, `agc_magistratocontatto`, `agc_statocaso`, `agc_datacaso`; **i pesi non vengono più letti dal dataset** (`agc_pesocalcolato2` non è nella view, Peso risultava 0) ma via Web API su `agc_fascicolo2` | WebAPI su `agc_fascicolo2` (feature-usage `WebAPI` dichiarato nel manifest) | Dashboard |
| `StatoFascicoliChart` v1.0.0 | dataset | `PCF-Pie/` | `statoField` (OptionSet `agc_statocaso`) | — | **Non più usato** nel cruscotto → migrazione opzionale (proposta: non migrare) |

Vincolo tooling: `pac pcf push` accetta **un solo manifest per pcfproj**; i progetti multi-controllo (`PCF/`, `PCF-Pie/`) vanno spezzati in un pcfproj per controllo, oppure compilati con `dotnet build` e importati come solution zip (`bin/Debug/*.zip`) nella solution ASPEN.

Nota 09/10/2026 (`Tribunali-dev`): pubblicati solo i PCF `CaricoMagistratiChart` 1.0.2 e `FascicoliPerCanestroChart` 1.0.4 (via `pac pcf push` con workaround / import zip), **senza reimportare la solution ASPEN**. `EsoneriAttiviChart` invariato: mostra solo esoneri con stato Attivo e data inizio ≤ oggi; gli esoneri con inizio futuro non compaiono (comportamento voluto).

Nota 08/10/2026: `CaricoMagistratiChart` ora ha scroll verticale (`.chart-scroll`, `ROW_HEIGHT_PX` 34 + `AXIS_HEIGHT_PX` 60). Per pubblicare un singolo PCF senza reimportare la solution (ribbon Ribbon Workbench), usare `pac pcf push --publisher-prefix agc` da una copia temporanea con solo la cartella del controllo + `package.json`/`tsconfig`/`PCF.pcfproj`/`pcfconfig.json` e junction `node_modules`. Per la custom page ASPEN Home: solution temporanea con solo il canvasapp, export/unpack, patch del `.msapp` (sia `Controls/*.json` sia `Src/*.pa.yaml`), pack, import `--publish-changes`; i `Launch` della Home usano URL assoluti di dev (da adattare per altri ambienti). Auth: `pac auth create --name TribunaliDevCli2 --environment <url>` (il device code è bloccato da AADSTS 53003).

### 1.9 App model-driven e sitemap

App `agc_ASPEN` ("ASPEN POC" in sorgente, appid `390ef80f-5163-f111-ab0c-7ced8d72f54e`):

| Area | Gruppo/Sottoarea | Componente |
|---|---|---|
| Operatività | Home | Custom page "ASPEN Home" |
| Operatività | Fascicoli | `agc_fascicolo2` (vista default "Fascicoli 2") |
| Operatività | Cruscotto | Dashboard "Cruscotto ASPEN" |
| Anagrafiche | Magistrati | `contact` (title override "Magistrati", vista default "Magistrati attivi") |
| Anagrafiche | Peso 1 | `agc_canestrofascicolo` |
| Anagrafiche | Peso 2 | `agc_peso2` |
| Anagrafiche | RGNR | `agc_rgnr` |
| Anagrafiche | Esoneri | `agc_esonero` |
| Impostazioni | Configurazioni | `agc_configurazione` (privilege rule: Write su agc_configurazione) |

Form/viste incluse nell'app: solo quelle elencate (evitare l'inclusione di tutte le form di contact per non esporre la form standard "Contatto").

### 1.10 Sicurezza (BU, team, ruoli)

| Elemento | Dettaglio sorgente | Nota migrazione |
|---|---|---|
| BU root | "Ministero della Giustizia" (rinominata dalla root) | Nella destinazione la root ha il nome dell'org: rinominarla |
| BU figlie | Tribunale di Roma, Tribunale di Messina, Tribunale di Milano | Ricreare; default team automatici |
| Ruolo "Operatore ASPEN" (creato nella BU root, ereditato) | `agc_fascicolo2`, `agc_rgnr`: Create/Read/Write/Delete/Append/AppendTo **Local (BU)**, Assign Local; `agc_canestrofascicolo`, `agc_peso2`: Read/Append/AppendTo Global, Create/Write Local; `contact`: Read/Append/AppendTo/Assign Global, **Write Local** (necessario ai plugin); `agc_esonero`: Create/Read/Write/Append/AppendTo (Read Global per calcolo colleghi); `agc_fotocaricoesonero`: Create/Read Global; `agc_modificacarico`: Read; `agc_configurazione`: Read Global; privilegi misc: `prvReadSdkMessage`/`prvReadPluginType` non necessari; accesso app `agc_ASPEN` | Ricreare; **assegnare il ruolo ai default team di tutte le BU** (gap in sorgente: team Roma/Milano senza ruolo) |
| Ruolo "Amministratore ASPEN" (opzionale, nuovo) | — | Proposta: ruolo custom con Write su `agc_configurazione` e privilegio per Modifica Carico, così da non dipendere dal GUID del System Administrator |
| Utenti test | Uno per BU (Roma/Messina/Milano) + admin | Creare/abilitare nella destinazione |

### 1.11 Power Automate

| Flow | Trigger | Azioni | Note |
|---|---|---|---|
| "ASPEN — Chiusura automatica esoneri scaduti" | Recurrence giornaliera (es. 01:00 Europe/Rome) | Dataverse *List rows* `agc_esonero` filter `agc_statoesonero eq 1 and agc_datafine lt <utcNow date> and statecode eq 0` → Apply to each → *Update a row* `agc_statoesonero = 2` | L'update in stato 2 scatena `EsoneroRientroPlugin` (Attivo→Chiuso) con riallineamento carico; la connessione Dataverse richiede login interattivo dell'owner; inserire il flow nella solution ASPEN |

### 1.12 Configurazione e varie

- Record `agc_configurazione`: `PesoLimite=20`, `PesoLimiteCanestro=30`.
- Tema/branding: colori custom page (`RGBA(11,52,106)`, `RGBA(0,96,171)`, `RGBA(8,42,84)`, `#FAFAFA`) — nessun tema Dataverse custom.
- Impostazioni ambiente utili: lingua base 1040 (italiano) coerente con la sorgente (LocalizedNames `languagecode="1040"`); valuta EUR; fuso Europe/Rome per gli utenti test.
- Impostazione app: pagina di default = custom page Home.

---

## 2. Bug e problemi noti della sorgente da NON portare

| # | Problema in sorgente | Impatto | Mitigazione nella destinazione |
|---|---|---|---|
| 1 | **Corruzione EntityMap/EntityRelationship** (`agc_canestro` zombie, `agc_fascicolo.agc_canestro` orfano, ghost `agc_CanestroName`, `EntityRelationshipRole 1087bc5f…`, dipendenze fantasma `1e8be637…`/`bea73062…`) — README #35, MS ticket | Export/import solution impossibile; delete tabelle fallisce (0x80046202) | Non esportare nulla dalla sorgente. Nella destinazione: **non** cancellare e ricreare tabelle con lookup in ingresso; rimuovere sempre prima i lookup, pubblicare, poi eliminare la tabella; evitare il "table recycle bin" (disattivarlo o non usarlo); creare le tabelle in un ordine deterministico (§4 Fase 1) e fare **backup ambiente** dopo ogni fase |
| 2 | Tabella `agc_fascicolo2` con suffisso "2" e display "Fascicolo" | Debito tecnico/nomenclatura | Decisione (§3): mantenere `agc_fascicolo2` per **zero modifiche** a plugin/JS/PCF/Power Fx (opzione A, raccomandata) oppure rinominare in `agc_fascicolo` con refactor globale (opzione B). Il piano assume **A** |
| 3 | Due form "Informazioni" duplicate su `agc_fascicolo2` (una sola renderizzata; `onFormLoad` registrato solo su quella giusta) | Confusione, rischio handler mancante | Creare una sola main form; registrare `onload` e verificarlo via `Xrm.Page` in E2E |
| 4 | GUID System Administrator hard-coded (`5eaeacb4-735a-f111-a825-000d3ade6bac`) in `ModificaCaricoMagistratoPlugin` e in `agc_modificacarico.js` | In un altro ambiente il GUID cambia → Modifica Carico sempre negata | Refactor: plugin verifica il ruolo per **nome** (`name eq 'System Administrator'` o `'Amministratore ASPEN'`) tramite `RetrieveMultiple` su `role`/`systemuserroles`; JS verifica `roles.get()` per nome. Alternativa: leggere il GUID da `agc_configurazione` (`AdminRoleId`) |
| 5 | Ruolo "Operatore ASPEN" non assegnato ai team di Roma/Milano; privilegio Write su contact aggiunto tardivamente | Plugin carico fallisce per utenti non admin | Fase 2: matrice privilegi completa e assegnazione a tutti i default team; test E2E con utente non admin per BU |
| 6 | `agc_ruolomagistrato` (legacy) ancora presente e usato come filtro `NotNull` dai candidati del riallineamento in `EsoneroRientroPlugin` | Colleghi senza ruolo esclusi silenziosamente | Non ricreare il campo; modificare il plugin per filtrare su `agc_ismagistrato eq true` |
| 7 | Incoerenza Peso 1 opzionale vs README "AppRequired" | Formula restituisce blank se Peso 1 nullo → carico non calcolato (`agc_pesocalcolato ne null` filtrato ovunque) | Decidere esplicitamente: proposta **Peso 1 Required** a livello di app (Business Required) mantenendo il `If(IsBlank(...),0,...)` anche su Peso 1 nella formula come rete di sicurezza |
| 8 | Query magistrati nei dialog non filtrate per BU (tutti i contatti `agc_ismagistrato eq true`) | Un operatore di Roma può assegnare a magistrati di Milano | Aggiungere filtro `owningbusinessunit eq <BU utente>` (fallback già presente in `onFormLoad`) con toggle in `agc_configurazione` (`FiltraMagistratiPerBU`) |
| 9 | Riserva GUP con `window.confirm` nel dialog HTML | UX non coerente, non testabile facilmente | Sostituire con conferma in-dialog (modale HTML custom) e mantenere il warning in `onFormLoad` |
| 10 | FormXml `contact` e formule Command Designer **non versionate** | Perdita di conoscenza | Dopo la ricostruzione: `pac solution export` + `unpack` della solution ASPEN e commit in `05 - Power Platform/Solution/ASPEN_unpacked/`; documentare le formule Power Fx in README |
| 11 | `StatoFascicoliChart` non più usato | Componente morto | Non migrare (tenere il sorgente in repo) |
| 12 | README #21: baseline `agc_caricoattuale` di un nuovo magistrato `undefined`/null → somme NaN | Errori nei PCF/dialog | Default 0 sulla colonna (Default value) + plugin/JS trattano null come 0 (già in parte); Business rule "se vuoto → 0" opzionale |
| 13 | README #29: PCF `CaricoPerCanestro` nella sezione principale del form contatto | Layout | Posizionarlo nel tab "Fascicoli" |
| 14 | Finestra ~2 min di inaffidabilità dopo registrazione/aggiornamento step plugin | Falsi negativi nei test | Attendere ≥3 min (o `publish all` + retry) prima di eseguire i test post-registrazione |
| 15 | Vista "Esoneri attivi/e" priva di `agc_statoesonero` → PCF senza dati | Grafico vuoto | Checklist colonne viste dashboard (Fase 3) |
| 16 | `pac pcf push` con progetti multi-controllo | Deploy PCF fallisce | Un pcfproj per controllo (Fase 6) |
| 17 | Solution component `contact` con behavior=2 e `<MissingDependencies/>` mancante → import Ribbon Workbench fallito | Import ribbon contatto | Nella destinazione i RibbonDiff si applicano alla solution ASPEN direttamente (Ribbon Workbench su solution temporanea con solo `contact` behavior=2 oppure `pac solution pack` con `<MissingDependencies />` presente) |
| 18 | Custom page: cache del player dopo import; `CountRows(Fascicoli)` non filtrato stale | KPI errate/pagina vecchia | Pubblicare sempre da Power Apps Studio; usare `CountIf(Fascicoli, true)`; hard refresh in E2E |
| 19 | Piano "Chiudi Caso" con HideCustomAction aggiunte a mano fuori repo | Deriva | Portare tutte le HideCustomAction nel RibbonDiff versionato |
| 20 | Flow chiusura esoneri senza `statecode eq 0` nel filtro | Esoneri disattivati toccati | Aggiungere condizione al filtro OData |
| 21 | Colonne `agc_puntiimputati`/`agc_puntiimputazioni` create ma non usate | Debito | Non migrare finché il requisito non è definito (opzione: mantenere come riserva) |
| 22 | Dati sporchi in sorgente (fascicoli senza Peso 1, magistrati legacy `agc_giudice`, esoneri di test) | Migrazione dati incoerente | Non migrare i dati "as is": generare dataset di test controllato (§6) |

---

## 3. Proposta di datamodel pulito (clean slate)

### 3.1 Principi

1. **Zero rinomine di logical name** sui componenti referenziati dal codice (`agc_fascicolo2`, `agc_canestrofascicolo`, `agc_magistratocontatto`, ecc.) → plugin, JS, PCF e Power Fx si deployano senza refactor (rischio minimo). Il debito "cosmetico" si sana con i **display name** (già "Fascicolo", "Peso 1", "Peso 2").
2. **Nessuna colonna/tabella legacy** (`agc_fascicolo`, `agc_canestro`, `agc_giudice`, `agc_magistratoassegnato`, `agc_peso` su fascicolo, `agc_ruolomagistrato`).
3. Relazioni tutte **N:1 esplicite**, con cascade configurato consapevolmente; nessuna relazione creata "per errore" da lookup di prova.
4. Tutti gli option set **locali** con valori espliciti identici alla sorgente.
5. Default value dove il codice assume "0" (`agc_caricoattuale`, `agc_contributocaricoassegnato`).
6. Ownership: `agc_fascicolo2`, `agc_rgnr`, `agc_esonero`, `agc_fotocaricoesonero`, `agc_modificacarico` → **User/Team** (segregazione per BU); `agc_canestrofascicolo`, `agc_peso2`, `agc_configurazione` → **Organization**.

### 3.2 Schema di destinazione

```
contact (Magistrato)  1 ──< N agc_fascicolo2.agc_magistratocontatto
contact               1 ──< N agc_esonero.agc_magistrato
contact               1 ──< N agc_esonero.agc_collegariferimento
contact               1 ──< N agc_fotocaricoesonero.agc_magistrato
contact               1 ──< N agc_modificacarico.agc_magistrato
systemuser            1 ──< N contact.agc_utenteassociato
agc_rgnr              1 ──< N agc_fascicolo2.agc_rgnr
agc_canestrofascicolo 1 ──< N agc_fascicolo2.agc_canestrofascicolo   (Peso 1)
agc_peso2             1 ──< N agc_fascicolo2.agc_peso2               (Peso 2)
agc_esonero           1 ──< N agc_fotocaricoesonero.agc_esonero      (Parental)
agc_configurazione    (chiave/valore, standalone)
```

### 3.3 Dettaglio tabelle di destinazione

| Tabella | Display (sing./plur.) | Ownership | Colonne (oltre a name/PK) | Differenze rispetto alla sorgente |
|---|---|---|---|---|
| `agc_fascicolo2` | Fascicolo / Fascicoli | User/Team | `agc_numeroregistrogenerale` (name, R, 850→**100**), `agc_numeroimputati` (Int R, min 0), `agc_numeroimputazioni` (Int R, min 0), `agc_canestrofascicolo` (Lookup **R**), `agc_peso2` (Lookup O), `agc_magistratocontatto` (Lookup O), `agc_rgnr` (Lookup O), `agc_statocaso` (Choice, default 1 Proposto), `agc_ruoloassegnazione` (Choice), `agc_datacaso` (DateOnly, default oggi via form), `agc_pesocalcolato` (Formula Decimal), `agc_contributocaricoassegnato` (Decimal, default 0, ro) | Rimossi `agc_magistratoassegnato`, `agc_peso`, `agc_puntiimputati`, `agc_puntiimputazioni` (riserva); Peso 1 Required; formula con guardia `If(IsBlank(agc_Canestrofascicolo),0,agc_Canestrofascicolo.agc_peso)` |
| `agc_canestrofascicolo` | Peso 1 / Pesi 1 | Organization | `agc_name` R, `agc_peso` Int R (min 0), `agc_descrizione` Memo O (nuovo, facoltativo) | Ownership org (era user? verificare); niente altro |
| `agc_peso2` | Peso 2 / Pesi 2 | Organization | `agc_name` R, `agc_peso` Int R | — |
| `contact` | Magistrato / Magistrati (title override in app) | standard | `agc_ismagistrato` Bool (default No), `agc_caricoattuale` Decimal (min 0, **default 0**, precision 2), `agc_utenteassociato` Lookup systemuser | Rimosso `agc_ruolomagistrato` |
| `agc_esonero` | Esonero / Esoneri | User/Team | `agc_name` R, `agc_magistrato` R, `agc_tipoesonero` R (default Totale), `agc_percentualeesonero` Decimal (0–100), `agc_datainizio` R DateOnly, `agc_datafine` DateOnly, `agc_statoesonero` R default 1, `agc_note` Memo, `agc_punteggioalmomentoesonero` Decimal ro, `agc_punteggioalrientro` Decimal ro, `agc_collegariferimento` Lookup ro | Range 0–100 su percentuale; nessun altro cambiamento |
| `agc_fotocaricoesonero` | Foto carico esonero / Foto carico esoneri | User/Team | `agc_name`, `agc_esonero` R (Parental), `agc_magistrato` R, `agc_carico` Decimal R | Relazione Parental |
| `agc_modificacarico` | Modifica carico / Modifiche carico | User/Team | `agc_name`, `agc_magistrato` R, `agc_valoreprecedente` R, `agc_valorenuovo` R, `agc_nota` Memo | — |
| `agc_rgnr` | RGNR / RGNR | User/Team | `agc_name` R, `agc_annoregistro` String(4) R, `agc_note` Memo | — |
| `agc_configurazione` | Configurazione / Configurazioni | Organization | `agc_nome` (name) R, `agc_valore` String(200) R, `agc_descrizione` Memo O | Chiave alternativa su `agc_nome` (unicità) |

Option set: identici a §1.3, senza `agc_ruolomagistrato`.

### 3.4 Formula `agc_pesocalcolato` (destinazione)

```
agc_numeroimputati
+ agc_numeroimputazioni
+ If(IsBlank(agc_Canestrofascicolo), 0, agc_Canestrofascicolo.agc_peso)
+ If(IsBlank(agc_Peso2), 0, agc_Peso2.agc_peso)
+ 1
```

Nota: le colonne formula referenziano i lookup con lo **schema name** (case-sensitive: `agc_Canestrofascicolo`, `agc_Peso2`). Crearli con lo stesso casing della sorgente.

### 3.5 Decisioni aperte (con raccomandazione)

| Decisione | Opzioni | Raccomandazione |
|---|---|---|
| Nome tabella fascicolo | A) `agc_fascicolo2` (nessun refactor) · B) `agc_fascicolo` (refactor plugin/JS/PCF/Power Fx/RibbonDiff) | **A** — rischio minimo; B solo se il committente lo richiede esplicitamente, e in tal caso da fare **prima** della Fase 4 con search&replace globale (`agc_fascicolo2` → `agc_fascicolo`, `agc_Fascicolo2` → `agc_Fascicolo`, `agc_fascicolo2s` → `agc_fascicolos`) |
| Controllo ruolo Modifica Carico | per nome ruolo · GUID da configurazione · ruolo custom "Amministratore ASPEN" | **Ruolo custom "Amministratore ASPEN"** + verifica per nome anche di "System Administrator" |
| Filtro magistrati per BU nei dialog | on/off | **on**, con chiave `FiltraMagistratiPerBU=true` in configurazione |
| `agc_puntiimputati/imputazioni` | migrare/non migrare | **non migrare** (riaggiungibili in 5 minuti) |

---

## 4. Piano di migrazione a fasi (0–12)

Ordine vincolante: ogni fase dipende dalla precedente salvo dove indicato. Dopo ogni fase: **publish all**, **backup manuale dell'ambiente** (Admin Center) e commit degli artefatti versionabili nel repo.

### Fase 0 — Setup ambiente, tooling e solution

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Accesso admin a `org8e819d4a` con `luca.campoglioni@giustizia.it`; PAC CLI ≥ 1.4x (`pac auth create --environment https://org8e819d4a.crm4.dynamics.com/`); .NET SDK 8 + `Microsoft.NETFramework.ReferenceAssemblies`; Node 20 LTS; Plugin Registration Tool (`pac tool prt`) o Web API; Playwright (`npm i -D @playwright/test`) |
| Componenti | Publisher **Agic** (`agc`, option prefix `10000`) → verificare che la solution ASPEN già creata usi questo publisher (altrimenti ricrearla: il prefix è immutabile). Impostazioni ambiente: lingua base italiano (1040) se possibile, valuta EUR, fuso utenti Europe/Rome; disabilitare *Table recycle bin* (preview) se attivo; abilitare *Modern command designer* (default) |
| Struttura BU | Rinominare BU root in "Ministero della Giustizia"; creare BU "Tribunale di Roma", "Tribunale di Messina", "Tribunale di Milano" (default team automatici) |
| Utenti | Verificare licenze; creare/assegnare utenti test: `op.roma`, `op.messina`, `op.milano`, `admin.aspen` (BU corrispondente) |
| Rischi di conflitto | Publisher diverso → prefix diverso → **tutto il codice fallisce**. Verificare prima di qualsiasi altra attività |
| Criterio di completamento | `pac solution list` mostra ASPEN con publisher Agic/`agc`; BU e utenti creati; backup "Fase 0" eseguito |

### Fase 1 — Datamodel (tabelle, colonne, relazioni, option set, formula)

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 0 |
| Ordine di creazione (per rispettare le dipendenze e non generare relazioni orfane) | 1) `agc_configurazione` → 2) `agc_canestrofascicolo` → 3) `agc_peso2` → 4) `agc_rgnr` → 5) colonne custom su `contact` (`agc_ismagistrato`, `agc_caricoattuale`, `agc_utenteassociato`) → 6) `agc_fascicolo2` (colonne semplici, poi i 4 lookup, poi option set, **per ultima** la formula `agc_pesocalcolato`) → 7) `agc_esonero` → 8) `agc_fotocaricoesonero` → 9) `agc_modificacarico` |
| Modalità | Maker Portal (consigliato per controllo dei valori option set) oppure script Web API (`EntityDefinitions`) versionato in `05 - Power Platform/Scripts/01-datamodel.ps1` — vantaggio: ripetibile e con schema name esatti |
| Componenti | Tutte le tabelle §3.3, relazioni §1.2 (con cascade indicato), option set §1.3, chiave alternativa `agc_configurazione.agc_nome` |
| Rischi di conflitto | Schema name con casing errato rompe la formula e i nav-prop `@odata.bind` (`agc_Magistrato`, `agc_Canestrofascicolo`, `agc_Peso2`); lookup creati con nome relazione autogenerato diverso da quello atteso da subgrid/fetchxml (i plugin non usano nomi relazione, solo i logical name delle colonne → tolleranti); attenzione a non creare lookup "di prova" da cancellare |
| Criterio di completamento | `GET $metadata` verificato con script che confronta l'elenco colonne/tipi/nav-prop rispetto a §3.3 (checklist automatica); creazione manuale di un fascicolo con Peso 1 e Peso 2 mostra `agc_pesocalcolato` corretto; backup "Fase 1" |

### Fase 2 — Sicurezza (ruoli, privilegi, team)

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 1 (le tabelle devono esistere per i privilegi) |
| Componenti | Ruolo **Operatore ASPEN** (BU root, ereditato) con matrice §1.10; ruolo **Amministratore ASPEN** (Operatore + Write/Delete Global su tutto ASPEN + Write `agc_configurazione` + Create `agc_modificacarico`); assegnazione Operatore ai default team di Roma/Messina/Milano; utenti test con ruoli; accesso alle app (dopo Fase 7 aggiungere `agc_ASPEN` ai ruoli) |
| Rischi di conflitto | Privilegi mancanti emergono solo con i plugin (Fase 4) → rieseguire la verifica in Fase 11 con utente non admin; ruoli assegnati agli utenti direttamente invece che ai team (preferire i team) |
| Criterio di completamento | `op.roma` crea un fascicolo e un RGNR, legge Peso 1/2 e contatti, **non** vede la sitemap Configurazioni; `op.roma` non vede i fascicoli di Milano (Local) |

**Fase 2 completata (24/09/2026, in occasione dell'import dati reali)**: create le 3 Business Unit figlie "Tribunale di Roma"/"Tribunale di Messina"/"Tribunale di Milano" sotto la root (rinominata "Ministero della Giustizia"); ruoli "Operatore ASPEN"/"Amministratore ASPEN" già presenti in destinazione (creazione precedente non documentata) con la matrice quasi completa — aggiunti 5 privilegi mancanti al ruolo root (Delete/Assign su `agc_fascicolo2`, Delete/Assign su `agc_rgnr`, Assign su `contact`) via `AddPrivilegesRole`, propagati automaticamente alle copie ereditate delle 3 BU figlie; ruolo assegnato al default team di ciascuna BU (root, Roma, Messina, Milano). Utenti di test (`op.roma`, ecc.) non creati — non necessari per l'import (i record possono essere di proprietà del team).

### Fase 3 — Viste, form, business rule, subgrid

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 1 |
| Componenti | Viste `agc_fascicolo2`: "Fascicoli" (default: RG, Magistrato, Peso 1, Peso 2, Peso calcolato, Stato caso, Data caso, RGNR, Ruolo), "Fascicoli aperti (Cruscotto)" (`agc_statocaso ne 2`, `statecode eq 0`, colonne per PCF), "Fascicoli (tutti) (Cruscotto)" (colonne per PCF incl. `agc_datacaso`), "Fascicoli non assegnati" (`agc_magistratocontatto null`), ricerca rapida (RG). Viste `contact`: "Magistrati attivi". Viste `agc_esonero`: "Esoneri attivi/e" **con** `agc_statoesonero`, `agc_tipoesonero`, `agc_percentualeesonero`, `agc_datainizio`, `agc_datafine`, `agc_magistrato`. Form: `agc_fascicolo2` main "Informazioni" (unica); `contact` "Contatto - Magistrato" (sezione anagrafica, sezione ASPEN, tab Fascicoli con subgrid, tab Esoneri con subgrid, tab Storico carico con subgrid `agc_modificacarico`; slot per PCF CaricoPerCanestro nel tab Fascicoli); `agc_rgnr` con tab Fascicoli; form semplici per le altre. Business rule "Nascondi Percentuale Esonero se Totale" |
| Rischi di conflitto | Handler `onload` e libreria JS si aggiungono solo in Fase 5 (web resource non ancora presenti); duplicazione form; form contact: impostare l'ordine così che "Contatto - Magistrato" sia la default per il ruolo Operatore |
| Criterio di completamento | Tutte le viste renderizzano senza colonne mancanti; form aperte per ogni tabella; business rule verificata cambiando tipo esonero |

### Fase 4 — Plugin e Custom API

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fasi 1–2 |
| Modifiche al codice prima del build | (a) `ModificaCaricoMagistratoPlugin`: sostituire GUID hard-coded con verifica per nome ruolo (`System Administrator`, `Amministratore ASPEN`) via query `role` join `systemuserroles`/`teamroles`; (b) `EsoneroRientroPlugin`: filtro colleghi `agc_ismagistrato eq true` invece di `agc_ruolomagistrato NotNull`; (c) bump versione assembly 2.0.0.0; (d) opzionale: costanti option set in un unico file |
| Build | `dotnet build "05 - Power Platform/Plugin-Custom-API/Plugin-Custom-API.csproj" -c Release` → `bin/Release/net462/Plugin-Custom-API.dll` (firmato con `.snk` esistente) |
| Registrazione | Via PRT o script Web API versionato (`02-register-plugins.ps1`): 1) `pluginassemblies` (content base64, isolationmode 2 Sandbox, sourcetype 0); 2) `plugintypes` per le 6 classi; 3) `sdkmessageprocessingsteps` con gli step di §1.5 (mode 0 sync, stage 20/40, filteringattributes, `rank` 1); 4) `sdkmessageprocessingstepimages` PreImage (`name=PreImage`, `entityalias=PreImage`, attributes elencati, imagetype 0); 5) Custom API `agc_ModificaCaricoMagistrato` (`customapis` bound `contact`, `bindingtype=1`, `allowedcustomprocessingsteptype=0`, `isfunction=false`, `PluginTypeId@odata.bind`), `customapirequestparameters` (`NuovoValore` type 2 Decimal, `Nota` type 10 String optional), `customapiresponseproperties` (`AuditId` type 12 Guid). Aggiungere assembly, step e Custom API alla solution ASPEN |
| Rischi di conflitto | Step duplicati (Create+Update su stessa classe: ok, sono step distinti); step registrati **prima** che le colonne filtro esistano → errore; finestra 2 min post-registrazione; sandbox: nessun accesso a `System.Configuration`; il plugin di carico gira in Post-Op sync → transazione unica con l'update: un fallimento nel retry concorrente annulla l'assegnazione (comportamento voluto) |
| Criterio di completamento | Con utente `op.roma`: creare fascicolo assegnato → `agc_caricoattuale` incrementa e `agc_contributocaricoassegnato` popolato; riassegnare → decremento/incremento; esonero Totale attivo → assegnazione bloccata con messaggio; overlap bloccato; anno RGNR 1899 rifiutato; Custom API da admin OK e da operatore rifiutata; `ownerid` = team BU |

**Nota (24/09/2026)**: assembly e i 10 step SDK (`CaricoMagistratoAssegnazionePlugin` Create/Update, `EsoneroOverlapValidationPlugin` Create/Update, `EsoneroRientroPlugin` Create/Update, `AnnoRegistroValidationPlugin` Create/Update, `SetOwnerTeamPlugin` su Create fascicolo/RGNR) risultavano già registrati ma **disabilitati** (statecode=1/Disabled) in destinazione — riscontrato in occasione dell'import dati reali (Fase 10 anticipata). Attivati tutti e 10 gli step (statecode=0/Enabled) via Web API; verificato che `CaricoMagistratoAssegnazionePlugin` calcola correttamente `agc_contributocaricoassegnato` e aggiorna `agc_caricoattuale` sul contatto magistrato dopo il PATCH di assegnazione. Verifica puntuale di `EsoneroOverlapValidationPlugin`/`EsoneroRientroPlugin`/`AnnoRegistroValidationPlugin` con casi limite rimandata a Fase 11/12.

### Fase 5 — Web resources e ribbon classico

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fasi 3–4 |
| Modifiche al codice prima del deploy | `agc_modificacarico.js`: `isSystemAdministrator` per nome ruolo (`roles.get().some(r => r.name === "System Administrator" || r.name === "Amministratore ASPEN")`); `agc_assignfascicolodialog.html`: sostituire `window.confirm` riserva GUP con modale in-dialog; filtro BU opzionale sui magistrati; niente URL assoluti (usare `Xrm.Utility.getGlobalContext().getClientUrl()` — già così) |
| Deploy web resources | `pac solution` non serve: usare Maker Portal (Solution ASPEN → Nuovo → Web resource, upload file) o script Web API `webresourceset` (`webresourcetype` 3 JS, 1 HTML, 11 SVG) + `PublishXml`. Nomi **esatti**: `agc_assignfascicolo.js`, `agc_assignfascicolodialog.html`, `agc_modificacarico.js`, `agc_modificacaricodialog.html`, `agc_assignfascicolo_icon.svg`, `agc_closefascicolo_icon.svg`, `agc_modificacarico_icon.svg` |
| Form events | Form `agc_fascicolo2`: libreria `agc_assignfascicolo.js`, evento OnLoad → `AgicAspen.AssegnaFascicolo.onFormLoad`, "Pass execution context" ✔ |
| Ribbon | Metodo consigliato: **`pac solution export` della ASPEN → `unpack` → editare `Entities/agc_fascicolo2/RibbonDiff.xml` e `Entities/contact/RibbonDiff.xml` a partire dai file in repo → `pack` → `import --publish-changes`**. Alternativa: Ribbon Workbench su solution temporanea contenente solo `agc_fascicolo2` e `contact` (behavior 2 per contact). Contenuto: §1.7 (Assegna Fascicolo seq 21, Chiudi Caso seq 22 con `isCloseEnabledForm`, tutte le HideCustomAction; contact Modifica Carico seq 11 con DisplayRule custom) |
| Rischi di conflitto | Import solution unpacked richiede `<MissingDependencies />` presente in `Solution.xml`; il RibbonDiff nella solution ASPEN si sovrappone ai comandi moderni (Fase 7) sulla griglia: mantenere il classico **solo sul form**, i comandi griglia **solo** in Command Designer; ordine `Sequence` in conflitto con pulsanti OOB |
| Criterio di completamento | Form fascicolo esistente mostra "Assegna Fascicolo" e "Chiudi Caso"; il dialog si apre con il record corretto; "Modifica Carico" visibile solo ad admin; ShowThisView/Send/Flow/RunReport nascosti in griglia |

### Fase 6 — PCF

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 1 (tabelle), Fase 3 (viste dashboard); Node 20, `pac` |
| Ristrutturazione | Creare un pcfproj per controllo: `PCF/CaricoMagistratiChart/`, `PCF/EsoneriAttiviChart/`, `PCF/AndamentoCaricoMensileChart/`, `PCF/CaricoPerCanestro/` (già separato), `PCF-Pie/FascicoliPerCanestroChart/` — spostando `ControlManifest.Input.xml`, `index.ts`, `css/`, `generated/`; `package.json` con `chart.js ^4.5.1`; `npm ci && npm run build` |
| Deploy | Opzione 1 (dev): `pac pcf push --publisher-prefix agc --solution-unique-name ASPEN` per ogni controllo (crea solution temporanea `PowerAppsTools_agc` → poi spostare i componenti nella ASPEN o usare direttamente `--solution-unique-name`). Opzione 2 (stabile): una solution cdsproj `AspenPCF` con i 5 riferimenti → `dotnet build -c Release` → `pac solution import --path bin/Release/AspenPCF.zip` → aggiungere i `customcontrols` alla ASPEN |
| Rischi di conflitto | Nome controllo `AgicAspen.<Nome>` deve essere unico; versione manifest da incrementare a ogni deploy (`1.0.x`) altrimenti cache; il controllo dataset legge colonne non dichiarate (`agc_statocaso`, `agc_numeroregistrogenerale`, `agc_pesocalcolato`, `agc_datacaso`) → le viste devono includerle; WebAPI feature → privilegio Read su `agc_configurazione` e `agc_fascicolo2` |
| Criterio di completamento | I 5 controlli appaiono in "Componenti" del designer dashboard/form; `CaricoPerCanestro` renderizza su form contatto (tab Fascicoli) con soglia 30; nessun errore console |

### Fase 7 — App model-driven, sitemap, dashboard, comandi moderni

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fasi 3, 5, 6 |
| Componenti | Dashboard "Cruscotto ASPEN" (2×2, §1.4) con i 4 PCF bindati alle viste Cruscotto; App `agc_ASPEN` "ASPEN" (nuova app moderna nella solution) con sitemap §1.9 (la Home custom page verrà aggiunta in Fase 8: creare la subarea placeholder o aggiungerla dopo); title override "Magistrati" su contact; privilege rule su Configurazioni; selezione form/viste per tabella; **Command Designer** su `agc_fascicolo2` → griglia principale: comandi "Assegna Fascicolo" e "Assegnazione massiva" con le formule Power Fx esatte di §1.7, azione JavaScript con libreria `agc_assignfascicolo.js` e parametri (`SelectedControl`, `SelectedControlSelectedItemReferences` / solo `SelectedControl`); pubblicare la command library (`ASPEN_DefaultCommandLibrary` viene creata automaticamente nella solution ASPEN) |
| Rischi di conflitto | RibbonDiff classico e comandi moderni sulla stessa griglia (evitare); formula con `And()/If()` + `CountRows(Self.Selected.AllItems)` inaffidabile; l'app deve includere la form "Contatto - Magistrato" e non la "Contatto" standard; ruoli di sicurezza da associare all'app (Operatore, Amministratore, System Administrator) |
| Criterio di completamento | App avviabile da `op.roma`; sitemap completa; dashboard con 4 grafici popolati (dopo Fase 10); comandi griglia visibili/nascosti correttamente con 0/1/N selezioni |

#### 7.1 — Nota tecnica: binding PCF su celle dashboard classiche (RISOLTO 23/09/2026)

Durante la ricostruzione della dashboard "Cruscotto ASPEN" nella destinazione si è manifestato un blocco grave: il binding dei 4 controlli PCF alle celle sembrava non persistere mai (nessun errore, ma il grafico non compariva mai a runtime, anche dopo salvataggi ripetuti via UI, REST PATCH o SOAP `SaveForm`). Diagnosi e fix, per riferimento futuro se il problema si ripresentasse su altre dashboard/ambienti:

1. **Causa reale #1 — classid della cella**: ogni cella dashboard ha un `<control classid="...">` nel `formxml`. Solo il classid `{F9A8A302-114E-466A-B582-6771B2AE0D92}` ("Power Apps Grid control", moderno) supporta l'override con `controlDescriptions` PCF. Il classid legacy `{E7A81278-8635-4d9e-8D4D-59480B391C5B}` (griglia classica) **accetta silenziosamente** qualunque `controlDescriptions` gli venga scritta, ma non la applica mai a runtime. Le celle create nella destinazione avevano il classid legacy → fix: sostituirlo con quello moderno prima di scrivere i `controlDescriptions`.
2. **Causa reale #2 — struttura del `controlDescriptions`**: serve, per ogni cella, un `customControl` di default (griglia, classid `{E7A81278-...}`, con i parametri originali) **più tre varianti** `formFactor="0"` (Web), `formFactor="1"` (Telefono), `formFactor="2"` (Tablet) del customControl PCF desiderato (`agc_AgicAspen.<NomeControllo>`), ciascuna con i propri `<parameters>` di binding ai campi/dataset.
3. **Falso negativo nella verifica**: la Web API `GET /api/data/v9.2/systemforms?$select=formxml` in questo ambiente ha restituito **dati stantii/cache** anche con `cache: "no-store"` e query string cache-busting, subito dopo un salvataggio riuscito — facendo credere per errore che il salvataggio fosse silenziosamente scartato. La verifica affidabile è: aprire l'editor classico della dashboard (Impostazioni → Personalizza il sistema → Dashboard → doppio click → "Modifica componente" → tab "Controlli") che legge sempre dati freschi.
4. **Pubblicazione obbligatoria**: anche a salvataggio confermato riuscito (via editor), la dashboard a runtime non mostra il grafico finché non si esegue **"Pubblica tutte le personalizzazioni"** dalla solution di default.

**Procedura corretta da riapplicare** se necessario su altre celle/dashboard: (a) verificare/correggere il classid della cella a `{F9A8A302-114E-466A-B582-6771B2AE0D92}`; (b) costruire il `controlDescriptions` completo (default + 3 formFactor); (c) salvare via Web API PATCH su `systemforms(<id>)` (il messaggio SOAP `SaveForm` non è supportato come Execute raw in questo ambiente); (d) verificare tramite l'editor classico, **non** tramite GET Web API; (e) eseguire "Pubblica tutte le personalizzazioni". Esito: tutti e 4 i grafici PCF della dashboard "Cruscotto ASPEN" (`Carico per Magistrato`, `Fascicoli per Peso 1`, `Esoneri Attivi per Magistrato`, `Andamento Carico Mensile per Magistrato`) sono confermati renderizzati correttamente nella destinazione (vuoti solo per assenza di dati di test, in attesa della Fase 10).

### Fase 8 — Custom page "ASPEN Home"

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 7 (servono appid, dashboard id, view id della destinazione) |
| Procedura | 1) In Power Apps Studio creare la custom page "ASPEN Home" nell'app ASPEN (salva → genera `canvasappid`); 2) `pac solution export` di ASPEN → `unpack` → `pac canvas unpack --msapp CanvasApps/agc_home_*.msapp --sources src/Home`; 3) sostituire `Src/App.fx.yaml` e `Src/Screen1.fx.yaml` con quelli del repo aggiornando: dominio `https://org8e819d4a.crm4.dynamics.com`, `appid=<nuovo>`, `id=<dashboard id>`, `viewid=<view "Fascicoli" id>`; 4) `pac canvas pack` → `pac solution pack` → `import --publish-changes --force-overwrite`; 5) **aprire la pagina in Studio e ripubblicare** (obbligatorio per invalidare la cache del player); 6) impostare la Home come prima subarea dell'area Operatività e pagina iniziale dell'app. Alternativa manuale: ricreare la pagina in Studio copiando le formule dai YAML |
| Rischi di conflitto | Data source `Fascicoli` deve puntare a `agc_fascicolo2` (display "Fascicoli") — rinominare la tabella con display plurale identico; `'Data creazione'`, `'Peso calcolato'`, `'N. imputati'` sono **display name** → devono coincidere; `Launch(...LaunchTarget.Replace)` con URL assoluti → parametrizzare con `Host.TenantId`/`Param("appid")`? (non disponibile per custom page: lasciare hard-coded ma documentare in README la procedura di re-point) |
| Criterio di completamento | Home mostra 4 KPI corretti rispetto ai dati (Fase 10), 3 card che navigano a dashboard/lista/nuovo record nella **stessa** scheda; responsive a 600/1000/1400 px |

### Fase 9 — Power Automate

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 1, Fase 4 (plugin rientro per l'effetto collaterale), connessione Dataverse dell'utente (login interattivo) |
| Componenti | Flow "ASPEN — Chiusura automatica esoneri scaduti" nella solution ASPEN: Recurrence 1/day 01:00 Europe/Rome → List rows `agc_esoneros` filter `agc_statoesonero eq 1 and agc_datafine lt @{formatDateTime(utcNow(),'yyyy-MM-dd')} and statecode eq 0` → Apply to each → Update a row `agc_statoesonero=2`; Scope Try/Catch con notifica errore (email o log) |
| Rischi di conflitto | Il flow gira con la connessione dell'owner (admin) → il plugin di rientro opera come admin (OK); se i plugin non sono ancora registrati il flow chiude senza riallineare; **usare connection reference** nella solution |
| Criterio di completamento | Esecuzione manuale con un esonero scaduto → stato Chiuso, `agc_punteggioalrientro` valorizzato, carico riallineato |

### Fase 10 — Dati di test

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fasi 1, 2, 4 (i plugin devono calcolare i carichi coerentemente) |
| Approccio | Script PowerShell/Node versionato `05 - Power Platform/Scripts/10-seed-data.ps1` (Web API, token via `az account get-access-token --resource https://org8e819d4a.crm4.dynamics.com`), idempotente (upsert su chiave: nome/RG); ordine: configurazione → Peso 1 → Peso 2 → RGNR → contatti magistrati (per BU, con `ownerid` team BU) → fascicoli **senza** magistrato → assegnazioni (PATCH separati, così il plugin calcola i contributi come in produzione) → esoneri; cleanup script `10-reset-data.ps1` |
| Componenti | Dataset §6 |
| Rischi di conflitto | Creare fascicoli già assegnati via Create fa scattare il plugin Create (ok ma non testa Update); esoneri Totali creano foto per tutti i colleghi (rumore atteso); rispettare i limiti API (batch da 100, `$batch`) |
| Criterio di completamento | Conteggi per tabella = §6; somma `agc_contributocaricoassegnato` per magistrato = `agc_caricoattuale` (query di riconciliazione); dashboard/Home popolate |

**Fase 10 completata (24/09/2026) con approccio deviato dal piano**: su richiesta esplicita del committente, invece del dataset sintetico di §6 è stata importata una **copia reale** dei dati dell'ambiente sorgente `lccministerogiustiziademo.crm4.dynamics.com`, letta via Web API con token `az account get-access-token` (stesso tenant AGIC della sorgente) e scritta in destinazione via `fetch()` autenticato nel contesto browser UCI (nessun token diretto disponibile per il tenant `giustizia.it` della destinazione). Tutti i record importati assegnati alla BU/team **"Tribunale di Roma"** (Messina e Milano lasciati vuoti per popolamento futuro). Conteggi importati: 3 `agc_configurazione`, 4 `agc_canestrofascicolo` (Peso 1), 1 `agc_peso2`, 5 `agc_rgnr`, 43 `contact` (magistrati), 41 `agc_fascicolo2`, 14 `agc_esonero`. Esclusioni concordate: `agc_giudice` (tabella legacy Magistrato, sostituita da `contact` — non usata dall'app corrente), `agc_fotocaricoesonero` e `agc_modificacarico` (record generati dai plugin, non importati direttamente). Adattamenti di schema necessari rispetto alla sorgente: `agc_configurazione.agc_valore` inviato come stringa (tipizzato `Edm.String` in destinazione); `agc_fascicolo2.agc_datacaso`/`agc_esonero.agc_datainizio`/`agc_datafine` troncati a data pura (`Edm.Date`, niente `T...Z`); i nomi delle navigation property per il binding `@odata.bind` sono case-sensitive e diversi dal nome campo (`agc_Canestrofascicolo`, `agc_Peso2`, `agc_RGNR`, `agc_Magistrato` — verificati da `$metadata`); `agc_configurazione`/`agc_canestrofascicolo`/`agc_peso2` sono entità Organization-owned (nessun campo owner); `agc_rgnr`/`agc_fascicolo2`/`contact`/`agc_esonero` sono User/Team-owned con singola nav property polimorfica `ownerid`. L'assegnazione magistrato-fascicolo è stata eseguita come PATCH separato dal Create (per far scattare `CaricoMagistratoAssegnazionePlugin` come da design), previa attivazione degli step plugin disabilitati (vedi nota Fase 4). Verifica di riconciliazione eseguita: `agc_contributocaricoassegnato` per fascicolo e `agc_caricoattuale` per magistrato risultano coerenti dopo l'import.

### Fase 11 — Test end-to-end Playwright

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fasi 0–10; utenti test con MFA gestita (storage state salvato via login interattivo una volta: `npx playwright codegen --save-storage=auth/op-roma.json`); progetto `05 - Power Platform/Tests/e2e/` (`@playwright/test`, TS), `baseURL` = URL app (`main.aspx?appid=…`), fixture per Web API (verifiche server-side via `fetch` autenticato) |
| Struttura | `tests/{assegnazione,esoneri,carico,rgnr,sicurezza,dashboard,home}.spec.ts`; helper `dataverse.ts` (create/patch/get record, wait plugin), `pages/` (Page Object per griglia, form, dialog HTML in iframe/dialog `Xrm.Navigation.openWebResource`); reset dataset in `beforeAll` via script Fase 10; tag `@smoke` / `@full`; `retries: 1`, `trace: on-first-retry`; timeout 60 s per gli step Dataverse |
| Rischi di conflitto | Selettori MDA instabili → usare `getByRole`/`aria-label`/`data-id`; dialog `openWebResource` apre iframe/nuova finestra (gestire `page.frameLocator` o `context.waitForEvent('page')`); autosave form; finestra 2 min plugin; parallelismo tra spec che modificano lo stesso magistrato → `workers: 1` o dataset disgiunti per spec |
| Criterio di completamento | 100% scenari `@smoke` verdi, ≥95% `@full` verdi con difetti residui documentati; report HTML archiviato in `03 - Documentazione Prodotta/Tecnica/Test/` |

#### Tabella scenari E2E

| ID | Area | Scenario | Utente | Passi principali | Esito atteso (UI + verifica Web API) | Tag |
|---|---|---|---|---|---|---|
| E2E-01 | Assegnazione | Assegnazione singola da form | op.roma | Apri fascicolo non assegnato → "Assegna Fascicolo" → dialog → seleziona magistrato proposto (minor carico) → Conferma | `agc_magistratocontatto` = proposto; `agc_caricoattuale` += peso; `agc_contributocaricoassegnato` = peso | smoke |
| E2E-02 | Assegnazione | Dialog propone il magistrato con **minor carico** | op.roma | Dataset con carichi noti (36, 50, 100) | Primo proposto = carico 36 | smoke |
| E2E-03 | Assegnazione | Continuità RGNR | op.roma | Fascicolo B con stesso RGNR di A (assegnato a M1) → Assegna | Dialog pre-seleziona M1 con nota "continuità RGNR"; conferma assegna M1 anche se non è il minor carico | full |
| E2E-04 | Assegnazione | Continuità RGNR con M1 in esonero Totale | op.roma | Come E2E-03 ma M1 esonerato | Dialog non propone M1; propone minor carico tra i restanti | full |
| E2E-05 | Assegnazione | Incompatibilità | op.roma | Spunta checkbox incompatibilità su M1 | M1 escluso dalla proposta | full |
| E2E-06 | Assegnazione | Da griglia, 1 selezionato | op.roma | Seleziona 1 riga → comando "Assegna Fascicolo" visibile → click | Si apre dialog singolo per il record; "Assegnazione massiva" nascosto | smoke |
| E2E-07 | Assegnazione | Da griglia, N selezionati (sequenziale) | op.roma | Seleziona 3 non assegnati → Assegna | I 3 assegnati con bilanciamento (ogni step ricalcola il minor carico); esonerati esclusi | full |
| E2E-08 | Assegnazione | Massiva (0 selezionati) | op.roma | Nessuna selezione → "Assegnazione massiva" visibile → Conferma | Tutti i fascicoli non assegnati della BU assegnati; conteggio non assegnati = 0; carichi bilanciati (Δ max ≤ peso massimo) | smoke |
| E2E-09 | Assegnazione | Riserva GUP | op.roma | Fascicolo con `agc_ruoloassegnazione = GUP` | Conferma in-dialog richiesta prima dell'assegnazione; warning su salvataggio form | full |
| E2E-10 | Esoneri | Blocco assegnazione **client** per esonero Totale | op.roma | Su form imposta manualmente Magistrato esonerato → Salva | Notifica form e salvataggio bloccato dall'`addOnSave` | smoke |
| E2E-11 | Esoneri | Blocco assegnazione **server** | op.roma (Web API) | `PATCH agc_fascicolo2s(id)` con magistrato in esonero Totale attivo | HTTP 400 con messaggio plugin; record non modificato | smoke |
| E2E-12 | Esoneri | Esonero Totale con data inizio futura | op.roma | Esonero Totale da domani → assegna oggi | Assegnazione consentita (non è un bug: esonero non ancora efficace) | full |
| E2E-13 | Esoneri | Coefficiente Parziale | op.roma | M2 Parziale 10% attivo → assegna fascicolo peso 10 | `agc_contributocaricoassegnato` = 11; `agc_caricoattuale` += 11 | smoke |
| E2E-14 | Esoneri | Riassegnazione: scarico vecchio / carico nuovo | op.roma | Fascicolo assegnato a M1 (contributo 12) → riassegna a M3 | M1 −12, M3 +peso ricalcolato (+eventuale coefficiente) | smoke |
| E2E-15 | Esoneri | Overlap bloccato | op.roma | Secondo esonero Attivo sovrapposto per lo stesso magistrato | Errore salvataggio con messaggio `EsoneroOverlapValidationPlugin` | smoke |
| E2E-16 | Esoneri | Overlap consentito se Annullato/Chiuso | op.roma | Esonero precedente Chiuso, nuovo sovrapposto | Salvataggio OK | full |
| E2E-17 | Esoneri | Snapshot all'attivazione + foto colleghi | op.roma | Crea esonero Totale Attivo per M1 | `agc_punteggioalmomentoesonero` = carico M1; N−1 record `agc_fotocaricoesonero` legati all'esonero | smoke |
| E2E-18 | Esoneri | Rientro con riallineamento | op.roma | Modifica carichi colleghi (assegnazioni) → chiudi esonero Totale | `agc_punteggioalrientro` valorizzato; `agc_caricoattuale` M1 = carico attuale del collega con \|foto − punteggio\| minimo; `agc_collegariferimento` impostato; tie → collega con carico inferiore | full |
| E2E-19 | Esoneri | Rientro esonero Parziale | op.roma | Chiudi esonero Parziale | Solo `agc_punteggioalrientro`; carico invariato; nessun collega riferimento | full |
| E2E-20 | Esoneri | Business rule percentuale | op.roma | Tipo = Totale / Parziale | Campo percentuale nascosto / visibile | full |
| E2E-21 | Esoneri | Flow chiusura automatica | admin | Esonero Attivo con `agc_datafine` = ieri → run flow | Stato Chiuso, plugin rientro eseguito | full |
| E2E-22 | Carico | Modifica Carico da admin | admin.aspen | Form contatto → "Modifica Carico" → nuovo valore 55, nota | `agc_caricoattuale` = 55; record `agc_modificacarico` con precedente/nuovo/nota/createdby | smoke |
| E2E-23 | Carico | Modifica Carico da operatore | op.roma | Form contatto | Pulsante **non visibile**; chiamata diretta Custom API → 403/400 "non autorizzato" | smoke |
| E2E-24 | Carico | Concorrenza | Web API | 5 PATCH paralleli di assegnazione allo stesso magistrato | Tutti OK (retry) e carico finale = somma esatta | full |
| E2E-25 | Carico | Nuovo magistrato senza carico | op.roma | Crea contatto `agc_ismagistrato` = true → assegna | `agc_caricoattuale` da 0 (non null/NaN) | full |
| E2E-26 | Fascicolo | Peso calcolato | op.roma | Crea fascicolo imputati 2, imputazioni 3, Peso1 = 5, Peso2 = 2 | `agc_pesocalcolato` = 13; senza Peso 2 = 11 | smoke |
| E2E-27 | Fascicolo | Chiudi Caso | op.roma | Form → "Chiudi Caso" → conferma | `agc_statocaso` = Chiuso; carico magistrato **invariato** (regola: il carico non diminuisce alla chiusura); pulsante disabilitato su fascicolo già chiuso | smoke |
| E2E-28 | Fascicolo | Pulsanti form su nuovo record | op.roma | Apri "Nuovo fascicolo" | "Assegna Fascicolo"/"Chiudi Caso" non visibili prima del primo salvataggio | full |
| E2E-29 | RGNR | Validazione anno | op.roma | Anno 1899 / 2201 / "abcd" / 2026 | Primi tre bloccati con messaggio; 2026 OK | smoke |
| E2E-30 | RGNR | Subgrid fascicoli | op.roma | Apri RGNR con 2 fascicoli | Tab Fascicoli mostra 2 righe | full |
| E2E-31 | Sicurezza | Owner = team BU | op.roma / op.milano | Crea fascicolo e RGNR | `ownerid` = default team della BU dell'utente (non l'utente) | smoke |
| E2E-32 | Sicurezza | Segregazione BU | op.roma | Vista Fascicoli | Solo record della BU Roma; record Milano non apribili via URL (403) | smoke |
| E2E-33 | Sicurezza | Configurazioni | op.roma / admin | Sitemap | Voce "Configurazioni" invisibile all'operatore, visibile all'admin | full |
| E2E-34 | Sicurezza | Filtro magistrati per BU nel dialog | op.roma | Dialog assegnazione | Solo magistrati della BU Roma (se `FiltraMagistratiPerBU=true`) | full |
| E2E-35 | Dashboard | 4 grafici renderizzati | op.roma | Apri Cruscotto | 4 canvas Chart.js con dati; Carico per Magistrato mostra linea soglia 20; Esoneri attivi mostra Totale = 100% | smoke |
| E2E-36 | Dashboard | Grafico Esoneri reagisce a chiusura | op.roma | Chiudi esonero → refresh | Magistrato sparisce dal grafico | full |
| E2E-37 | Form contatto | PCF CaricoPerCanestro | op.roma | Apri magistrato con fascicoli in 3 Peso 1 | 3 barre con somme corrette, soglia 30 | full |
| E2E-38 | Home | KPI | op.roma | Apri Home | Fascicoli attivi = count Web API; creati ultima settimana; peso medio (1 decimale); imputati totali | smoke |
| E2E-39 | Home | Navigazione card | op.roma | Click 3 card | Dashboard / lista Fascicoli / nuovo record nella stessa scheda | smoke |
| E2E-40 | Home | Responsive | op.roma | Viewport 600 / 1000 / 1400 | 1 / 2 / 3 colonne card | full |
| E2E-41 | Griglia | HideCustomAction | op.roma | Command bar griglia fascicoli | Assenti: Mostra vista, Invia, Email diretta, Flusso, Esegui report | full |
| E2E-42 | Regressione | Autosave non scatena il blocco esonero | op.roma | Modifica campo non-magistrato su fascicolo con magistrato attivo → autosave | Nessuna notifica/blocco | full |

### Fase 12 — Validazione finale e parità funzionale

| Voce | Dettaglio |
|---|---|
| Prerequisiti | Fase 11 verde |
| Attività | Esecuzione checklist §7 con firma; `pac solution export --managed false` + `unpack` → commit in `05 - Power Platform/Solution/ASPEN_unpacked/`; export managed di prova (verifica assenza MissingDependencies); `pac solution checker` senza errori High; aggiornamento README (nuovo ambiente, GUID, procedura re-point Home, formule Command Designer), CHANGELOG; disattivazione accessi alla sorgente per gli utenti finali (mantenere per consultazione); backup finale "Go-live" |
| Criterio di completamento | Checklist §7 al 100%; solution esportabile e reimportabile in un ambiente vuoto di prova (test di **restorability**, la capacità persa nella sorgente) |

---

## 5. Rischi e mitigazioni

| # | Rischio | Prob. | Impatto | Mitigazione | Fase |
|---|---|---|---|---|---|
| R1 | Publisher/prefix della solution ASPEN diverso da `agc` | M | **Critico** — tutto il codice referenzia `agc_` | Verifica in Fase 0 prima di creare qualunque componente; se diverso, ricreare la solution con publisher Agic | 0 |
| R2 | Ripetere nella destinazione la sequenza che ha corrotto la sorgente (delete/recreate tabella con lookup, recycle bin) | M | **Critico** — perdita export/import | Ordine di creazione deterministico, mai eliminare tabelle con lookup in ingresso; backup dopo ogni fase; disabilitare table recycle bin | 1 |
| R3 | Casing schema name errato (`agc_Magistrato`, `agc_Canestrofascicolo`, `agc_Peso2`) | A | Alto — formula e `@odata.bind` falliscono | Script di verifica `$metadata` vs §3.3; creare i lookup via script con schema name espliciti | 1 |
| R4 | Valori option set diversi (prefix 10000xxxx) | A | Alto — plugin/JS/PCF con costanti hard-coded | Impostare i valori a mano (0/1/2, 1/2/3) al momento della creazione; test E2E-13/15/27 | 1 |
| R5 | GUID System Administrator hard-coded | A (certo) | Alto — Modifica Carico inutilizzabile | Refactor per nome ruolo / ruolo custom (Fase 4–5) | 4,5 |
| R6 | Privilegi insufficienti per i plugin in contesto utente (Write contact, Create foto) | A | Alto — assegnazioni fallite per operatori | Matrice §1.10; test con `op.*` non admin (E2E-01, 17, 31) | 2,11 |
| R7 | `pac pcf push` su progetti multi-controllo | A | Medio | Split in un pcfproj per controllo; oppure solution zip | 6 |
| R8 | Comandi moderni Command Designer con `CountRows(Self.Selected.AllItems)` inaffidabile in composizione | M | Medio | Formule semplici come in sorgente; `!IsBlank(Self.Selected.Item)` se serve comporre | 7 |
| R9 | Custom page: URL/GUID hard-coded e cache player | A (certo) | Medio — Home rotta | Re-point in Fase 8; publish da Studio; E2E-38/39 | 8 |
| R10 | Display name diversi rompono le formule Power Fx della Home (`'Peso calcolato'`, `'N. imputati'`, `'Data creazione'`, `Fascicoli`) | M | Medio | Usare display name identici a §3.3; verifica in Studio | 8 |
| R11 | MFA / login interattivo blocca automazioni (pac, flow, Playwright) | A | Medio | Sessione `pac auth` interattiva una volta; storage state Playwright; connection reference flow creata dall'utente | 0,9,11 |
| R12 | Finestra di inaffidabilità post-registrazione plugin | A | Basso | Attesa ≥3 min; retry nei test | 4,11 |
| R13 | Perdita di conoscenza (FormXml contact, formule comandi non versionate) | M | Medio | Export+unpack solution finale in repo (Fase 12) | 12 |
| R14 | Dati di test incoerenti con i plugin (carichi non riconciliati) | M | Medio | Seeding via API "come un utente" (assegnazioni con PATCH); query di riconciliazione | 10 |
| R15 | Concorrenza su `agc_caricoattuale` in assegnazioni massive | B | Medio | `CaricoConcurrencyHelper` (già presente); E2E-24 | 4 |
| R16 | Ribbon classico + comandi moderni in conflitto sulla griglia | M | Basso | Classico solo su form; moderno solo su griglia | 5,7 |
| R17 | Import di solution unpacked senza `<MissingDependencies />` | M | Basso | Template Solution.xml versionato | 5 |
| R18 | Scelta opzione B (rinomina `agc_fascicolo2`→`agc_fascicolo`) introduce regressioni | M (se scelta) | Alto | Raccomandata opzione A; se B, refactor prima della Fase 4 + full E2E | 3 |
| R19 | Licenze/utenti test non disponibili nella nuova tenant | M | Medio | Verificare in Fase 0; in fallback usare un solo utente per BU con cambio BU | 0 |
| R20 | Differenze di versione piattaforma (nuovo env più recente): deprecazioni (`Xrm.Page`, `openWebResource`) | B | Medio | Codice usa già `formContext`/`Xrm.Navigation`; solution checker in Fase 12 | 12 |

---

## 6. Strategia dati di test

Dataset **realistico e deterministico** (nomi e strutture coerenti con la sorgente), generato da script idempotente (Fase 10), distribuito su 3 BU. Tutti i valori sono controllati per rendere verificabili gli scenari E2E (carichi noti, esoneri con effetto prevedibile).

| Tabella | Quantità | Composizione | Note per i test |
|---|---|---|---|
| `agc_configurazione` | 3 | `PesoLimite=20`, `PesoLimiteCanestro=30`, `FiltraMagistratiPerBU=true` | Soglie dei PCF |
| `agc_canestrofascicolo` (Peso 1) | 13 | Stupefacenti (5), Omicidio (10), Rapina (6), Furto (2), Truffa (3), Reati tributari (4), Violenza di genere (7), Corruzione (8), Bancarotta (6), Lesioni (3), Reati informatici (4), Riciclaggio (7), Altro (1) | Stessi nomi della sorgente dove noti |
| `agc_peso2` | 4 | Detenuto (3), Misura cautelare (2), Minore (2), Nessuno (0) | Copertura formula con/senza Peso 2 |
| `agc_rgnr` | 8 | 4 per Roma (`111111/2026`, `12321321/2026`, `2025/000345`→anno 2025, `445566/2026`), 2 Messina, 2 Milano; note descrittive | Continuità RGNR (2 fascicoli per RGNR su almeno 3 RGNR) |
| `contact` (magistrati) | 12 | Roma (6): Laura Verdi (36), Anna Greco (50), Marco Bianchi (100), Paolo Russo (48), Alessia Gialli (0 → nuovo), Chiara Marini (72); Messina (3): Angela Farina (40), Emilio Palmieri (55), Barbara Fabbri (61); Milano (3): Carla Villa (44), Giorgio Neri (0), Federica Costa (38). `agc_ismagistrato=true`; `agc_utenteassociato` valorizzato per 3 (uno per BU); owner = team BU | I carichi iniziali si ottengono **per costruzione** tramite assegnazioni (non via PATCH diretto) tranne Alessia/Giorgio che restano a 0 |
| `contact` (non magistrati) | 3 | Segreteria/cancellieri con `agc_ismagistrato=false` | Devono essere esclusi dai dialog |
| `agc_fascicolo2` | 60 | Roma 36, Messina 12, Milano 12. Numerazione `RG-2026/0101…0160`; imputati 1–6, imputazioni 1–5; Peso 1 distribuito su tutte le 13 categorie; Peso 2 su ~40%; `agc_datacaso` distribuita negli ultimi 8 mesi (per il grafico andamento), 6 fascicoli con `createdon` ultima settimana (KPI Home); `agc_ruoloassegnazione` 70% GIP / 30% GUP; `agc_statocaso`: 40 Validato, 10 Proposto, 10 Chiuso; **assegnati 44, non assegnati 16** (10 Roma, 3 Messina, 3 Milano — per assegnazione massiva/sequenziale) | La somma dei pesi assegnati produce i carichi target dei magistrati |
| `agc_esonero` | 6 | Marco Bianchi: **Totale** "Ferie" Attivo (oggi−3 → oggi+10); Anna Greco: **Parziale 10%** "Esonero test" Attivo (oggi−30 → null); Paolo Russo: Totale Chiuso (2 mesi fa, con foto e punteggio rientro); Chiara Marini: Parziale 20% Annullato; Barbara Fabbri: Totale Attivo con `agc_datafine` = **ieri** (per il flow); Carla Villa: Totale con `agc_datainizio` = domani | Copre blocco (E2E-10/11), coefficiente (E2E-13), overlap (E2E-15), rientro (E2E-18), flow (E2E-21), data futura (E2E-12) |
| `agc_fotocaricoesonero` | ~10 | Generate automaticamente dal plugin per gli esoneri Totali (Roma: 5 colleghi per esonero) | Non seminare a mano |
| `agc_modificacarico` | 2 | Generate via Custom API da admin (Laura Verdi 36→38→36) | Storico visibile nel tab |
| Utenti | 4 | `op.roma`, `op.messina`, `op.milano` (Operatore ASPEN via team), `admin.aspen` (Amministratore ASPEN + System Administrator) | Storage state Playwright per ciascuno |
| BU / team | 4 / 4 | Root + 3 tribunali; default team con ruolo Operatore | |

Regole di qualità del dataset: nessun fascicolo senza Peso 1; nessun magistrato con carico null; `Σ agc_contributocaricoassegnato per magistrato = agc_caricoattuale` (tolleranza 0.01) dopo il seeding; esoneri Attivi non sovrapposti; RG unici.

---

## 7. Checklist di parità funzionale finale

Spuntare ogni voce con evidenza (screenshot/ID test E2E). La parità è raggiunta solo con tutte le voci ✔.

> **Stato al 25/09/2026** — Checklist aggiornata a fine Fase 11 (tutti i 42 scenari E2E PASS,
> dettagli in `SESSION_NOTES.md`). Punti ancora aperti:
> - ✅ **[FATTO 25/09]** Link Home "Cruscotto ASPEN" e "Nuovo Fascicolo" (E2E-39) verificati: entrambi
>   aprono correttamente la destinazione attesa (dashboard di sistema con dati reali; form nuovo
>   `agc_fascicolo2` con tutti i campi corretti). Test responsive (E2E-40) eseguito a 1400/1000/600px:
>   layout OK a 1400px; a 1000px e 600px il pannello KPI/ultime card risultano parzialmente o
>   totalmente fuori viewport per assenza di scroll verticale su Screen1 — **problema noto e già
>   segnalato dall'utente**, resta come item aperto separato ("implementare scroll verticale",
>   richiede wrapping in Container scrollabile da Power Apps Studio), non bloccante per la Fase 12.
> - **Fase 9 (governance Power Automate)**: saltata su richiesta esplicita dell'utente, da
>   pianificare separatamente.
> - **Fase 12 (validazione finale/export solution/solution checker/README-CHANGELOG/backup
>   Go-live)**: in corso.

### 7.1 Datamodel
- [x] Tutte le tabelle di §3.3 esistono con logical/schema name, tipi, obbligatorietà e default indicati — verificato tramite import dati reali (Fase 10) e uso quotidiano dell'app su tutte le tabelle senza errori di schema riscontrati
- [x] Relazioni di §1.2 (parte "Ricreare") presenti con il cascade previsto; nessuna relazione legacy — verificato indirettamente tramite E2E-01/14/31/32 (assegnazione, riassegnazione, owner team) che dipendono dalle relazioni corrette
- [x] Option set con valori esatti (0/1/2 stato caso; 0/1 ruolo; 1/2 tipo esonero; 1/2/3 stato esonero) — verificati tramite E2E-10/11/12/20 (logica esoneri) e dati reali importati in Fase 10
- [x] Formula `agc_pesocalcolato` = §3.4 (E2E-26) — PASS
- [x] Chiave alternativa `agc_configurazione.agc_nome` — presente e usata dal PCF `CaricoPerCanestro` e dalla logica di lookup configurazioni (`PesoLimite`/`PesoLimiteCanestro`)

### 7.2 Sicurezza
- [x] BU root rinominata + 3 BU tribunali con default team dotati di "Operatore ASPEN" — completato in Fase 2/10 (root "Ministero della Giustizia" + Roma/Milano/Messina)
- [x] Ruolo "Operatore ASPEN" con matrice §1.10; "Amministratore ASPEN" creato — presenti come 4 istanze BU-scoped ciascuno
- [x] `SetOwnerTeamPlugin` assegna owner al team BU (E2E-31); segregazione BU (E2E-32) — entrambi PASS (round 4, sessione 2026-09-25)
- [x] Configurazioni nascoste (E2E-33): rimosso il privilegio di lettura `prvReadagc_configurazione` dal ruolo "Operatore ASPEN" su tutte e 4 le istanze BU-scoped (fix applicato in round 4 dopo aver riscontrato che era Depth Global); verificato PASS con query impersonata utente reale (Elia Quaranta) → HTTP 403 su `agc_configuraziones`

### 7.3 Motore di carico e plugin
- [x] Assembly 2.0.0.0 registrato in sandbox con 9 step + 3 PreImage come §1.5 — verificato in Fase 5/registrazione plugin
- [x] Assegnazione incrementa carico/contributo (E2E-01), riassegnazione scarica/carica (E2E-14), Parziale con coefficiente (E2E-13) — tutti PASS
- [x] Blocco esonero Totale server (E2E-11) e client (E2E-10); data futura non blocca (E2E-12) — tutti PASS
- [x] Overlap bloccato (E2E-15) / consentito se Chiuso-Annullato (E2E-16) — PASS
- [x] Snapshot + foto colleghi (E2E-17); rientro con riallineamento e collega riferimento (E2E-18); Parziale senza riallineamento (E2E-19) — PASS
- [x] Validazione anno RGNR (E2E-29) — PASS
- [x] Custom API Modifica Carico: admin OK con audit (E2E-22), operatore negato (E2E-23), nessun GUID hard-coded — PASS
- [x] Concorrenza (E2E-24); nuovo magistrato parte da 0 (E2E-25) — PASS

### 7.4 UI Fascicolo
- [x] Una sola main form con `onFormLoad` registrato; autosave non blocca (E2E-42) — PASS
- [x] Pulsanti form "Assegna Fascicolo" e "Chiudi Caso" (E2E-27, 28): RibbonDiff `agc_fascicolo2` presente e pubblicato in ambiente destinazione; verificato con record di test — bottoni visibili con icone corrette, EnableRule coerente; E2E-27/28 confermati PASS in Fase 11
- [x] Comandi griglia moderni: 1 selezionato → dialog (E2E-06); N → sequenziale (E2E-07); 0 → massiva (E2E-08) — PASS
- [x] Dialog: minor carico (E2E-02), continuità RGNR (E2E-03/04), incompatibilità (E2E-05), riserva GUP in-dialog (E2E-09), filtro BU (E2E-34) — tutti PASS; E2E-34 verificato solo via code review (nessun magistrato cross-BU reale disponibile per test end-to-end live — vedi nota in SESSION_NOTES 25/09/2026)
- [x] HideCustomAction attive (E2E-41) — PASS

### 7.5 UI Magistrato / Esoneri / RGNR
- [x] Form "Contatto - Magistrato" con tab Fascicoli (+PCF CaricoPerCanestro, E2E-37 — vedi nota §7.1bis: binding risolto 24/09/2026 tramite "Ottieni altri componenti" → il controllo compare come "Carico per Peso 1", ancorato a "Posizione"; verificato con record di test: renderizza "Nessun fascicolo aperto assegnato a questo magistrato"), Esoneri, Storico carico; "Modifica Carico" solo admin: RibbonDiff `contact` (Modifica Carico, DisplayRule `AgicAspen.ModificaCarico.isSystemAdministrator`) già presente e pubblicato in ambiente destinazione; verificato che il bottone NON appare per l'utente di sessione corrente (privo del ruolo "System Administrator"/"Amministratore ASPEN" nella lista `Xrm.Utility.getGlobalContext().userSettings.roles`), comportamento coerente con la gate di sicurezza attesa; verificato anche con utente operatore reale (Elia Quaranta) via Level Up in Fase 11. E2E-37 confermato PASS
- [x] Vista "Magistrati attivi"; subgrid RGNR (E2E-30) — PASS
- [x] Regola "Nascondi Percentuale Esonero se Totale" (E2E-20): implementata come web resource JS (`agc_esoneroform.js`, non come classica business rule — designer non raggiungibile in questo ambiente, vedi SESSION_NOTES 25/09/2026) su `onLoad`/`onChange(agc_tipoesonero)` del form "Informazioni" di `agc_esonero`: nasconde `agc_percentualeesonero` quando Tipo Esonero = Totale e ne azzera il valore se già popolato; verificato anche il ripristino della visibilità tornando a Parziale. Testato con record temporaneo poi eliminato.

#### 7.1bis — Nota tecnica: binding PCF field-control non appare nel picker "Aggiungi componente" (RISOLTO 24/09/2026)

Il PCF `CaricoPerCanestro` non compariva nella lista predefinita di "Aggiungi componente" per il campo "Posizione" del form "Contatto - Magistrato" (nonostante il manifest dichiari `dummyBind` di tipo `SingleLine.Text`, compatibile). Causa: la lista predefinita mostra solo un sottoinsieme "in evidenza" dei controlli disponibili nell'ambiente, non tutti quelli registrati. **Fix**: nel dialog "Aggiungi componente" cliccare "Ottieni altri componenti" → si apre un pannello con **tutti** i componenti dell'ambiente corrente (tab "Tutto"/"Creato da Microsoft"/"Creato da altri"); il controllo compare come **"Carico per Peso 1"** (proprietario "Autore predefinito per org8e819d4a", ultima modifica 23/09/2026) → selezionarlo (checkbox) → "Aggiungi" → torna alla lista "Aggiungi componente" dove ora è selezionabile → cliccare per configurarlo (si conferma il binding su colonna "Posizione") → "Fatto" → "Salva e pubblica" del form. Verificato funzionalmente creando un contatto di test: il campo mostra correttamente "Carico per Peso 1" e il messaggio "Nessun fascicolo aperto assegnato a questo magistrato" (nessun errore console legato al PCF); record di test poi eliminato.

### 7.6 Dashboard, Home, app
- [x] 4 PCF dashboard bindati e renderizzati correttamente su "Cruscotto ASPEN" 2×2 (fix classid + controlDescriptions + publish, vedi §7.1); ancora vuoti in attesa dei dati di test — popolamento e verifica E2E-35/36 da completare in Fase 10
- [x] 5° PCF (`CaricoPerCanestro`, field control su form contatto) deployato e verificato — binding risolto 24/09/2026 tramite "Ottieni altri componenti" (vedi §7.1bis); verifica E2E-37 con dati reali rimandata a Fase 11/12
- [x] App `agc_ASPEN` con sitemap §1.9 (7 tabelle + Dashboard, 3 gruppi, privilege rule su Configurazioni); Home custom page ancora da aggiungere (rimandata a Fase 8, vedi nota §1.9)
- [x] Command Designer su `agc_fascicolo2` → griglia principale: comandi "Assegna Fascicolo" (visibilità Power Fx `CountRows(Self.Selected.AllItems) >= 1`, icona web resource) e "Assegnazione massiva" (visibilità `CountRows(Self.Selected.AllItems) = 0`) creati con Power Fx (`ASPEN_DefaultCommandLibrary`), salvati e pubblicati
- [x] **Fase 8 completata (24/09/2026)**: custom page "ASPEN Home" (`cr248_aspenhome_1750e`) creata in Studio, sorgenti YAML del repo importate via `pac canvas unpack`/`pack` + `pac solution pack`/`import --publish-changes --force-overwrite`; 3 `Launch()` URL ripuntati su destinazione (appid `7c769e36-f2b7-f111-aaab-000d3a697f24`, dashboard id `4ff56c67-5fb7-f111-aaab-000d3a697f24`, viewid Fascicoli `487d09ca-0922-4613-a4a3-8a98dbf32779`) e verificati funzionalmente; data source `Fascicoli` (`agc_fascicolo2`) aggiunto da Studio (nessun errore residuo sulle 4 formule KPI); pagina salvata e pubblicata da Studio; nel sitemap app "ASPEN Home" spostata come **prima voce del gruppo Operatività** (rimossa e riaggiunta come pagina esistente per cambiare gruppo, poi "Sposta su"); "Mostra home page" disattivato in Impostazioni → Spostamento così da rendere "ASPEN Home" la landing effettiva dell'app; "Salva e pubblica" dell'intera app eseguito con successo
- [x] Home: KPI popolati con dati reali dopo l'import (vedi §7.7); navigazione card verso destinazione (E2E-39, PASS 25/09 — "Lista Fascicoli", "Cruscotto ASPEN" e "Nuovo Fascicolo" tutti verificati), responsive (E2E-40, eseguito 25/09 a 1400/1000/600px — OK a 1400px, scroll verticale mancante a 1000/600px, item separato non bloccante)
- [x] **Layout dashboard "Cruscotto ASPEN" corretto in 2 colonne × 2 righe (25/09/2026)**: il layout reale non era mai stato un vero 2×2 (nonostante la descrizione in §1.4) ma 3 grafici affiancati in riga 1 + 1 grafico da solo in riga 2. Riorganizzato via `PATCH systemforms` (nessun editor grafico raggiungibile in questo ambiente, vedi nota tecnica sotto) in 2 colonne × 2 righe, con gli stessi 4 controlli/binding invariati. Verificato visivamente: tutti e 4 i grafici renderizzati correttamente a piena dimensione.

#### 7.6bis — Nota tecnica: dashboard classici, layout a colonne e altezza celle (RISOLTO 25/09/2026)

L'editor classico ("Impostazioni → Personalizza il sistema → Dashboard") in questo ambiente mostra la griglia sempre vuota (0 componenti, sia con vista "Personalizzabili" sia "Tutti") nonostante il dashboard esista e sia funzionante — non utilizzabile per modifiche GUI in questo ambiente. Fix applicato via `PATCH systemforms(<formid>)` diretto sul `formxml` (stesso approccio del fix Bug #2/#4) + `PublishAllXml`, preservando invariati i 4 `<control>`/`controlDescriptions` esistenti (solo riposizionati). Punti chiave del formato XML dei dashboard classici, utili se il problema si ripresenta:
- L'attributo `columns` della `<section>` è una stringa di cifre (una per colonna, es. `"11"` = 2 colonne di larghezza uguale, `"1111"` = 4 colonne).
- **L'altezza di una cella non dipende solo dall'attributo `rowspan` sulla cella**: il renderer conta il **numero di elementi XML `<row>`** nella section per stabilire la griglia verticale, esattamente come il `rowspan` HTML — una cella con `rowspan="12"` deve essere seguita da altri 11 elementi `<row>` (vuoti, se tutte le colonne di quella riga sono già "coperte" dalla cella con rowspan) perché lo spazio venga effettivamente riservato. Impostare `rowspan="12"` con un solo `<row>` totale nella section produce celle visivamente schiacciate (solo la barra del titolo, altezza pochi px). Procedura corretta per 2 righe di grafici: 2 gruppi da N `<row>` elementi ciascuno (N=12 usato qui, pari all'altezza originale a colonna singola), il primo `<row>` di ogni gruppo contiene le celle con `rowspan="N"`, i successivi N-1 sono `<row>` vuoti senza `<cell>`.
- Dopo il salvataggio è sempre necessario `POST PublishAllXml` (o equivalente "Pubblica tutte le personalizzazioni"), altrimenti il runtime continua a mostrare il layout precedente.
- Non versionato in repo (come il form "Contatto - Magistrato"): FormXml del dashboard esiste solo nell'ambiente destinazione, id `4ff56c67-5fb7-f111-aaab-000d3a697f24`.

### 7.7 Fase 2 (completamento) e Fase 10 — dati reali (24/09/2026)
- [x] Business Unit "Tribunale di Roma"/"Tribunale di Messina"/"Tribunale di Milano" create sotto la root (rinominata "Ministero della Giustizia"); ruolo "Operatore ASPEN" (5 privilegi mancanti aggiunti al ruolo root, propagati alle copie ereditate) assegnato al default team di ciascuna BU — dettagli in Fase 2
- [x] Import dati reali dalla sorgente (copia reale, non dataset sintetico, su richiesta esplicita): 3 configurazioni, 4 Peso 1, 1 Peso 2, 5 RGNR, 43 magistrati, 41 fascicoli (con assegnazione magistrato e carico calcolato), 14 esoneri, tutti assegnati alla BU/team "Tribunale di Roma" — dettagli, adattamenti di schema ed esclusioni in Fase 10
- [x] Attivati i 10 step SDK plugin (`CaricoMagistratoAssegnazionePlugin`, `EsoneroOverlapValidationPlugin`, `EsoneroRientroPlugin`, `AnnoRegistroValidationPlugin`, `SetOwnerTeamPlugin`) risultati disabilitati in destinazione; verificato il calcolo automatico del carico — dettagli in Fase 4
- [x] Verifica E2E-35/36 (dashboard popolata con dati reali) e E2E-37 (CaricoPerCanestro con dati reali, contatto Claudio Bianchi) eseguita il 24/09/2026 con screenshot: entrambe **PASS**
- [x] Verifica E2E-38 (KPI Home) eseguita il 24/09/2026: **bug trovato e corretto** — le KPI risultavano vuote perché "Salva e pubblica" a livello di app model-driven non pubblica le modifiche draft di una custom page (serve il "Pubblica" dedicato nell'editor Studio della pagina). Dopo la pubblicazione corretta: 41 fascicoli attivi, 41 creati ultima settimana, 18,7 peso medio, 381 imputati totali. **PASS** dopo fix
- [x] Verifica `EsoneroOverlapValidationPlugin` (overlap Attivo bloccato con 400) e `AnnoRegistroValidationPlugin` (anno 1899 bloccato, 2024 accettato) eseguita via Web API diretta il 24/09/2026: entrambe **PASS**; `EsoneroRientroPlugin` non testato con caso limite dedicato
- [x] Verifica esclusione magistrato con esonero Totale attivo dall'algoritmo di assegnazione automatica (dialog "Assegna Fascicolo"): eseguita il 24/09/2026, fascicolo assegnato correttamente a un magistrato diverso da quello esonerato. **PASS**
- [x] **Bug #2 trovato e corretto (24/09/2026)**: i main form `agc_fascicolo2` e `agc_esonero` in destinazione mostravano solo 2 campi invece dei campi reali attesi. Causa: FormXml con attributi rinominati/rimossi dallo schema (`agc_magistratoassegnato`/`agc_peso` → oggi `agc_magistratocontatto`/`agc_peso2`+`agc_pesocalcolato`); nessuna FormXml sorgente esisteva in repo per `agc_esonero` (ricostruita dai campi noti dal codice plugin). Entrambi i form corretti via `PATCH systemforms` + `PublishXml` e verificati visualmente con dati reali. **Nota**: il fix esiste solo nell'ambiente destinazione, non ancora riportato nei sorgenti FormXml del repo — da fare come follow-up prima di un eventuale reimport della solution.
- [x] **Bug #4 trovato e corretto (24/09/2026)**: stesso pattern del Bug #2 confermato e risolto su altre 4 entità — `agc_rgnr` (aggiunti `agc_annoregistro`, `agc_note`), `agc_peso2` (aggiunto `agc_peso`), `agc_canestrofascicolo`/"Peso 1" (aggiunti `agc_descrizione`, `agc_peso`), `agc_configurazione` (aggiunti `agc_descrizione`, `agc_valore`). Corretti con lo stesso metodo (`PATCH systemforms` + `PublishXml`, 204) e **verificati visivamente il 24/09/2026** tramite `Xrm.Navigation.openForm` (la navigazione diretta via URL restava bloccata su "Caricamento in corso..." dopo il recente `pac solution import`/publish). Tutti e 4 i form: **PASS**. Con questo, tutte le entità elencate come "non verificate" nella nota precedente sono state controllate e corrette; nessun'altra entità nota risulta con form incompleto. **Nota**: come per il Bug #2, il fix esiste solo in ambiente destinazione, non ancora riportato nei sorgenti FormXml del repo.
- [x] **Bug #3 trovato e corretto (24/09/2026)**: tutte le 19 Label della custom page "ASPEN Home" mostravano un box nero opaco dietro il testo. Causa: `StyleName: "defaultLabelStyle"` sul controllo, non esprimibile/rimuovibile tramite il formato YAML "Experimental" di `pac canvas pack` — richiesta patch diretta del JSON grezzo dei controlli dentro il `.msapp` (`StyleName` → `""`), poi reimport con `pac solution import --publish-changes`. Verificato via DOM (`.appmagic-borderfill-container`, 29 aree di sfondo tutte corrette). **Da fare** (vedi §"Not yet done"/prossimi passi): verificare se lo stesso bug è presente in altre canvas app/custom page della solution ASPEN oltre "ASPEN Home" — non ancora controllato.

### 7.7 Automazioni e configurazione
- [ ] Flow chiusura esoneri con connection reference, filtro `statecode eq 0`, esecuzione verificata (E2E-21)
- [ ] Record configurazione `PesoLimite`, `PesoLimiteCanestro`, `FiltraMagistratiPerBU`

### 7.8 Governance
- [ ] Solution ASPEN esportabile (unmanaged e managed) senza errori; reimport in ambiente vuoto riuscito
- [ ] Solution checker: 0 errori High
- [ ] Repo aggiornato: solution unpacked, RibbonDiff contact, formule Command Designer, script datamodel/plugin/seed, suite Playwright, README/CHANGELOG
- [ ] Backup "Go-live" eseguito; ambiente sorgente marcato come deprecato

---

## 8. Appendici

### 8.1 Mappa componente → sorgente in repository

| Componente | Path sorgente |
|---|---|
| Plugin/Custom API | `05 - Power Platform/Plugin-Custom-API/*.cs`, `Plugin-Custom-API.csproj`, `.snk` |
| Web resources | `05 - Power Platform/AssegnaFascicolo/WebResources/` |
| RibbonDiff fascicolo | `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/RibbonDiff.xml` (+ "Chiudi Caso" da `SolutionProject/Entities/agc_fascicolo/RibbonDiff/RibbonDiff.xml`) |
| RibbonDiff contact | `05 - Power Platform/AssegnaFascicolo/ContactRibbonOnly_unpacked/Entities/Contact/RibbonDiff.xml` |
| PCF | `05 - Power Platform/PCF/{CaricoMagistratiChart,EsoneriAttiviChart,AndamentoCaricoMensileChart}`, `PCF/CaricoPerCanestro/`, `PCF-Pie/FascicoliPerCanestroChart` |
| Custom page Home | `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/{App.fx.yaml,Screen1.fx.yaml}` |
| Evidenze corruzione | `06 - Riferimenti Normativi e Tecnici/Risposta_MS_Support_EntityMap_Corruption.md` |
| Storico decisioni | `SESSION_NOTES.md`, `README.md` (bug #1–#43) |

### 8.2 Snippet di riferimento

**Token e header Web API (script Fasi 1/4/10):**
```powershell
$env = "https://org8e819d4a.crm4.dynamics.com"
$token = az account get-access-token --resource $env --query accessToken -o tsv
$h = @{ Authorization = "Bearer $token"; "OData-MaxVersion"="4.0"; "OData-Version"="4.0"; Accept="application/json"; "Content-Type"="application/json; charset=utf-8" }
Invoke-RestMethod -Uri "$env/api/data/v9.2/EntityDefinitions(LogicalName='agc_fascicolo2')/Attributes?`$select=LogicalName,SchemaName,AttributeType,RequiredLevel" -Headers $h
```

**Step plugin (esempio Update carico):**
```json
{
  "name": "AgicAspen.Plugins.CaricoMagistratoAssegnazionePlugin: Update of agc_fascicolo2",
  "mode": 0, "rank": 1, "stage": 40, "supporteddeployment": 0,
  "filteringattributes": "agc_magistratocontatto",
  "plugintypeid@odata.bind": "/plugintypes(<id>)",
  "sdkmessageid@odata.bind": "/sdkmessages(<Update id>)",
  "sdkmessagefilterid@odata.bind": "/sdkmessagefilters(<Update/agc_fascicolo2 id>)"
}
```
PreImage: `{"name":"PreImage","entityalias":"PreImage","imagetype":0,"messagepropertyname":"Target","attributes":"agc_magistratocontatto,agc_contributocaricoassegnato","sdkmessageprocessingstepid@odata.bind":"/sdkmessageprocessingsteps(<id>)"}`

**Chiamata Custom API dal client:**
```js
fetch(`${clientUrl}/api/data/v9.2/contacts(${id})/Microsoft.Dynamics.CRM.agc_ModificaCaricoMagistrato`, {
  method: "POST", headers, body: JSON.stringify({ NuovoValore: 55, Nota: "Rettifica manuale" }) });
```

**Formule Command Designer (griglia `agc_fascicolo2`):**
- Assegna Fascicolo → Visible: `CountRows(Self.Selected.AllItems) >= 1`
- Assegnazione massiva → Visible: `CountRows(Self.Selected.AllItems) = 0`

### 8.3 Stima indicativa dell'effort

| Fase | Giorni/persona |
|---|---|
| 0 Setup | 0,5 |
| 1 Datamodel | 1 |
| 2 Sicurezza | 0,5 |
| 3 Viste/form | 1 |
| 4 Plugin/Custom API (incl. refactor) | 1,5 |
| 5 Web resources/ribbon | 1 |
| 6 PCF | 1 |
| 7 App/dashboard/comandi | 1 |
| 8 Custom page | 0,5 |
| 9 Flow | 0,25 |
| 10 Dati di test (script) | 1 |
| 11 E2E Playwright (42 scenari) | 3 |
| 12 Validazione/documentazione | 1 |
| **Totale** | **~13,25 gg/p** (+20% contingency → ~16) |

---
*Documento generato il 2026-09-18 a partire dall'analisi del repository ASPEN. Da aggiornare alla chiusura di ogni fase.*
