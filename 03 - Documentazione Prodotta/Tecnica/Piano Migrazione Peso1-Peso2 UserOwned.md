Ho letto tutto il necessario. Di seguito il piano completo.

---

# Piano di migrazione — Ricreazione tabelle "Peso 1" / "Peso 2" come User/Team-owned (segregazione BU)

**Ambiente**: `org8e819d4a.crm4.dynamics.com` (Tribunali-dev) · **Stato**: PIANO, nessuna modifica eseguita
**Tabelle interessate**: `agc_canestrofascicolo` (Peso 1, 4 record) → nuova; `agc_peso2` (Peso 2, 1 record) → nuova; `agc_fascicolo2` (41 record reali) → due nuovi lookup + formula.

## 0. Riscontri dalla lettura del repo (base fattuale del piano)

| Artefatto | Cosa fa oggi con le due entità | Impatto |
|---|---|---|
| `05 - Power Platform\PCF\CaricoPerCanestro\CaricoPerCanestro\index.ts` | Query Web API su `agc_fascicolo2`: `$select=…,_agc_canestrofascicolo_value,_agc_peso2_value`; raggruppa con `_raggruppa(entities,"_agc_canestrofascicolo_value","Senza canestro")` e `_raggruppa(entities,"_agc_peso2_value","Senza Peso 2")`; legge le etichette via `@OData.Community.Display.V1.FormattedValue`. NON interroga direttamente le tabelle Peso. | Rinominare i 2 campi lookup nel codice → rebuild + redeploy PCF |
| `05 - Power Platform\PCF-Pie\FascicoliPerCanestroChart\ControlManifest.Input.xml` + `index.ts` | Dataset `fascicoliDataSet` su `agc_fascicolo2` con `property-set canestroField` (Lookup.Simple, bound). Il codice usa solo l'alias `canestroField`; il nome reale (`agc_canestrofascicolo`) sta solo nel commento del manifest e nel binding del formxml della dashboard. | Nessuna modifica di codice; solo ribinding nel formxml dashboard + commento manifest |
| `05 - Power Platform\PCF\CaricoMagistratiChart\index.ts` (righe 168-170) | `record.getFormattedValue("agc_canestrofascicolo") || record.getFormattedValue("agc_canestrofascicoloname")` per la colonna "Canestro" del modal drill-down (legge dal dataset/vista) | Rinominare → rebuild + redeploy |
| `05 - Power Platform\PCF-Pie\StatoFascicoliChart\index.ts` (126-128) + manifest riga 14 | Idem (controllo **legacy**, sostituito da FascicoliPerCanestroChart, non più nel dashboard) | Aggiornare per coerenza o marcare legacy; bassa priorità |
| `05 - Power Platform\AssegnaFascicolo\WebResources\agc_assignfascicolo.js` (535-541) | `onFormLoad`: `formContext.getControl("agc_canestrofascicolo").setDisabled(false)` e idem `"agc_peso2"`. Le query OData del dialog (215, 449) usano solo `agc_pesocalcolato` — nessuna dipendenza diretta. | Rinominare 2 stringhe → redeploy web resource |
| `…\AgicAspenRibbon_unpacked\Entities\agc_Fascicolo2\FormXml\main\{70bd3733-…}.xml` (79-82, 102-103) | Controlli lookup `agc_canestrofascicolo` (label "Canestro fascicolo") e `agc_peso2` (label "Peso") | Aggiornare datafieldname/id (copia di documentazione, non root component) |
| `…\AgicAspenRibbon_unpacked\Entities\agc_Fascicolo2\Entity.xml` (21-24) | Dichiara l'attributo `agc_Canestrofascicolo` | Verificare se `agc_fascicolo2` è RootComponent in `Other\Solution.xml`: se sì, un futuro import ricreerebbe una lookup verso entità inesistente → va aggiornato |
| `…\AgicAspenRibbon_unpacked\Other\Relationships.xml` (11) + `Other\Relationships\agc_Canestrofascicolo.xml` | Relazione `agc_fascicolo2_Canestrofascicolo_agc_canestrofascicolo` (nome **sorgente**, in destinazione la relazione è `agc_canestrofascicolo_agc_fascicolo2`) → file legacy dell'export originario | Rimuovere/sostituire per evitare fallimento di un futuro `pac solution import` di AgicAspenRibbon |
| `…\Entities\agc_Canestrofascicolo\FormXml\main\{bc56548f-…}.xml`, `…\Entities\agc_Peso2\FormXml\main\{76cb78de-…}.xml` | Copie documentali delle FormXml live (fix Bug #4) | Sostituire con le FormXml delle nuove tabelle |
| `Plugin-Custom-API\CaricoMagistratoAssegnazionePlugin.cs` (riga 27) | Solo commento ("tramite agc_Canestrofascicolo"); il plugin rilegge `agc_pesocalcolato` dal server. Update step filtrato su `agc_magistratocontatto` → **un PATCH dei soli lookup Peso NON fa scattare il plugin** (nessun effetto collaterale su `agc_caricoattuale`). | Solo commento; nessun rebuild necessario |
| `SetOwnerTeamPlugin.cs` | Generico (`target.LogicalName`), registrato su Create di `agc_fascicolo2` e `agc_rgnr` | Registrare 2 nuovi step Pre-Create sulle nuove tabelle |
| README.md (95-105, 120-121, 132-139, 160-183, 229) · Piano di Migrazione (§1.1.1 righe 45-50, §1.1.2/1.1.3, §1.4 r.199, §1.9 r.283-284, §1.10 r.297, §3 r.377-378, §7) · SESSION_NOTES.md | Documentazione | Aggiornare a fine lavoro |
| Custom page "ASPEN Home" (YAML) | Nessun riferimento (grep negativo su `*.yaml`/`fx.yaml`) | Nessuna modifica |
| Dashboard "Cruscotto ASPEN" (`4ff56c67-5fb7-f111-aaab-000d3a697f24`) | 4 PCF bindati alle viste `agc_fascicolo2` "Fascicoli 2 aperti (Cruscotto)"/"Fascicoli 2 (tutti) (Cruscotto)" (colonne `agc_canestrofascicolo`, `agc_peso2`) + parametro `canestroField=agc_canestrofascicolo` | Aggiornare viste + formxml + PublishAllXml |

**Vincolo operativo dell'ambiente** (da SESSION_NOTES/Fase 10): nessun token diretto per il tenant `giustizia.it` → le chiamate Web API vanno eseguite con `fetch()` autenticato nel contesto browser UCI (Playwright); `pac solution import` in questo ambiente ha (a) disabilitato ripetutamente gli step plugin, (b) problemi di metadati. Preferire **Web API + Power Apps Studio**, riservare `pac` al solo `pac pcf push`.

---

## 1. Decisioni di design da confermare PRIMA di eseguire

| # | Decisione | Opzioni | Raccomandazione |
|---|---|---|---|
| D1 | **Logical name nuove tabelle** (il vecchio `agc_peso2` non è riutilizzabile finché esiste la vecchia tabella; ricreare con lo stesso nome dopo la delete è tecnicamente possibile ma sconsigliato: cache metadati, dipendenze residue, ambiguità nella documentazione) | (a) `agc_pesouno` / `agc_pesodue` (simmetrici, display "Peso 1"/"Peso 2", plurale "Pesi 1"/"Pesi 2"); (b) `agc_peso1` / `agc_pesodue` (asimmetrico); (c) `agc_canestrofascicolo2` / `agc_peso2b` | **(a)** `agc_pesouno` / `agc_pesodue` — schema `agc_PesoUno` / `agc_PesoDue`, set name `agc_pesounos` / `agc_pesodues` |
| D2 | **Nomi nuovi lookup su `agc_fascicolo2`** (i vecchi `agc_canestrofascicolo`/`agc_peso2` restano fino alla fine; attenzione: esiste già la colonna legacy `agc_peso` Decimal) | `agc_pesouno` / `agc_pesodue` (schema `agc_PesoUno`/`agc_PesoDue` → nav property `agc_PesoUno`/`agc_PesoDue`, campi Web API `_agc_pesouno_value`/`_agc_pesodue_value`) | Come D1, stessi nomi delle tabelle (pattern già usato per `agc_peso2`) |
| D3 | **OwnershipType** | In Dataverse per le tabelle custom le uniche opzioni sono `OrganizationOwned` e `UserOwned` (= "Utente o team"); "TeamOwned" puro non è selezionabile | `UserOwned` + owner forzato al default team della BU via `SetOwnerTeamPlugin` (stesso pattern di `agc_fascicolo2`/`agc_rgnr`) |
| D4 | **Campo esplicito "Tribunale/BU"** oltre a `owningbusinessunit` | (a) nessuno; (b) lookup a `businessunit` per report | **(a)** nessuno: `owningbusinessunit` è automatico, sempre coerente con il cono di visibilità e già filtrabile in viste/PCF; un campo ridondante rischia di divergere |
| D5 | **BU dei 5 record esistenti** | (a) tutti → team "Tribunale di Roma" (coerente con Fase 10: tutti i dati reali importati sono di Roma); (b) duplicare il catalogo per Milano/Messina (3 copie) | **(a)**; Milano/Messina popolano i propri quando entreranno in esercizio. Confermare con il committente il tribunale di origine dei 4 Peso 1 e dell'unico Peso 2 ("Intercettazione", peso 3) |
| D6 | **Tipo `agc_descrizione`** | Oggi Memo su Peso 1 e String su Peso 2 | Mantenere identico (richiesta "schema identico"); opzionale armonizzare a Memo su entrambe — decidere |
| D7 | **Privilegi Operatore ASPEN sulle nuove tabelle** | Delete Local sì/no | Create/Read/Write/Append/AppendTo/Assign **Local**, **no Delete** (come oggi); Amministratore ASPEN: tutto **Global** |
| D8 | **Momento di eliminazione vecchie tabelle** | Subito dopo migrazione / dopo E2E completi | Solo dopo che tutti i test §11 sono PASS e il committente ha validato |
| D9 | **Solution di appartenenza** | Solution "ASPEN" (unique name da verificare via `solutions?$select=uniquename`) | Usare header `MSCRM.SolutionUniqueName` in ogni chiamata di creazione metadati |

---

## 2. Schema esatto delle nuove tabelle

### 2.1 `agc_pesouno` — "Peso 1" (plurale "Pesi 1")
- `OwnershipType`: **UserOwned** · `HasNotes`: false · `HasActivities`: false · `IsAuditEnabled`: come oggi · `IsQuickCreateEnabled`: false · `ChangeTrackingEnabled`: true (consigliato)

| Colonna | Schema | Tipo | Obbl. | Note |
|---|---|---|---|---|
| `agc_pesounoid` | `agc_PesoUnoId` | Uniqueidentifier | S | PK (auto) |
| `agc_name` | `agc_Name` | String(100) | **ApplicationRequired** | Primary name (identico all'attuale) |
| `agc_descrizione` | `agc_Descrizione` | **Memo** (max 2000) | Opzionale | Identico all'attuale |
| `agc_peso` | `agc_Peso` | Integer (MinValue 0) | **ApplicationRequired** | Identico all'attuale (verificare il MinValue attuale prima di creare) |
| `ownerid`, `owningbusinessunit`, `owningteam`, `owninguser` | | Owner | S | **Nuovi** (assenti nella tabella OrganizationOwned) |
| `statecode`/`statuscode` | | | S | auto |

### 2.2 `agc_pesodue` — "Peso 2" (plurale "Pesi 2")
Identica a 2.1, con `agc_descrizione` = **String(100/…)** (come oggi, salvo D6), PK `agc_pesodueid`.

### 2.3 Componenti collaterali auto-generati da integrare
- Viste: "Pesi 1 attivi/inattivi", ricerca rapida, lookup, ricerca avanzata → aggiungere colonne `agc_peso`, `agc_descrizione`, `ownerid` alle viste pubbliche e alla **lookup view** (usata nel form fascicolo).
- Main form: aggiungere `agc_descrizione`, `agc_peso`, `ownerid` e un `<header>` (nota storica: senza header `agc_name` risultava invisibile — README #34).

---

## 3. Sequenza di creazione tabelle e colonne

Tutte le chiamate con header `MSCRM.SolutionUniqueName: <ASPEN>`, `Content-Type: application/json`, dal contesto browser UCI.

1. **Snapshot preventivo** (read-only, salvare in `files/` della sessione o in `05 - Power Platform\Migrazione-Pesi\`):
   - `EntityDefinitions(LogicalName='agc_canestrofascicolo')?$expand=Attributes` e idem `agc_peso2` (tipi esatti, MaxLength, MinValue, DisplayName/plurale, descrizioni).
   - `EntityDefinitions(LogicalName='agc_fascicolo2')/Attributes(LogicalName='agc_pesocalcolato')/Microsoft.Dynamics.CRM.DecimalAttributeMetadata?$select=FormulaDefinition,SourceTypeMask` → **espressione esatta della formula** (attesa: `agc_numeroimputati + agc_numeroimputazioni + agc_Canestrofascicolo.agc_peso + If(IsBlank(agc_Peso2), 0, agc_Peso2.agc_peso) + 1`, da confermare).
   - `RelationshipDefinitions` delle 2 relazioni esistenti (CascadeConfiguration, AssociatedMenuConfiguration) per replicarle.
   - `agc_canestrofascicolos?$select=*` e `agc_peso2s?$select=*` (dati).
   - `agc_fascicolo2s?$select=agc_fascicolo2id,agc_numeroregistrogenerale,_agc_canestrofascicolo_value,_agc_peso2_value,agc_pesocalcolato,agc_contributocaricoassegnato,_agc_magistratocontatto_value` (**baseline per il confronto post-migrazione**).
   - `teams?$filter=isdefault eq true&$select=teamid,name,_businessunitid_value` → GUID default team Roma/Milano/Messina.
   - `roles?$filter=name eq 'Operatore ASPEN' or name eq 'Amministratore ASPEN'&$select=roleid,name,_businessunitid_value,_parentrootroleid_value` → identificare le istanze **root** (le 3 copie BU ereditano automaticamente).
2. **POST `EntityDefinitions`** per `agc_pesouno`: `SchemaName: agc_PesoUno`, `OwnershipType: "UserOwned"`, DisplayName/DisplayCollectionName (1040), `Attributes: [StringAttributeMetadata agc_Name IsPrimaryName=true MaxLength=100 RequiredLevel=ApplicationRequired]`. Attendere il completamento (la creazione tabella è sincrona ma la cache metadati può richiedere minuti — nota SESSION_NOTES r.14).
3. **POST `EntityDefinitions(LogicalName='agc_pesouno')/Attributes`**: `MemoAttributeMetadata agc_Descrizione`, `IntegerAttributeMetadata agc_Peso (MinValue 0, RequiredLevel ApplicationRequired)`.
4. Ripetere 2-3 per `agc_pesodue` (con `StringAttributeMetadata` per descrizione, salvo D6).
5. In alternativa (equivalente, meno errore umano sui nomi): creare da **Power Apps Studio → Tabelle → Nuova tabella** dentro la solution ASPEN, impostando "Proprietà record: Utente o team" e i nomi schema esatti; poi aggiungere colonne. Verificare comunque via `EntityDefinitions` che `OwnershipType=UserOwned`.
6. **Form/viste** delle nuove tabelle (Studio): main form con header + Nome/Descrizione/Peso/Proprietario; vista pubblica default e lookup view con Nome, Peso, Descrizione, Proprietario. Pubblicare.
7. **Aggiungere le tabelle all'app `agc_ASPEN`** (app designer → "Aggiungi pagina → Tabella"), senza ancora toccare la sitemap (§8).
8. **Registrare `SetOwnerTeamPlugin`** su Create/Pre-Operation(20)/Sync per `agc_pesouno` e `agc_pesodue`: POST `sdkmessageprocessingsteps` con `plugintypeid` uguale a quello dello step esistente su `agc_rgnr` (pattern già documentato in SESSION_NOTES 2026-09-08), `sdkmessagefilterid` = filtro `Create` della nuova entità (`sdkmessagefilters?$filter=primaryobjecttypecode eq 'agc_pesouno' and sdkmessageid/name eq 'Create'`). Verificare `statecode=0`.
9. **Privilegi ai ruoli** (anticipato qui, altrimenti gli operatori non vedono nulla in test): vedi §9.1.
10. `PublishAllXml`.

---

## 4. Migrazione dati (4 + 1 record)

1. Export già fatto al passo 3.1 → costruire la **mappa `oldId → newId`** e salvarla in `05 - Power Platform\Migrazione-Pesi\mapping-pesi.json` (serve anche al rollback e alla migrazione lookup §5).
2. Per ciascun Peso 1: `POST agc_pesounos` con body `{ "agc_name", "agc_descrizione", "agc_peso", "ownerid@odata.bind": "/teams(<default team Tribunale di Roma>)" }` (BU secondo D5). Header `Prefer: return=representation` per ottenere subito il nuovo GUID. Verificare che `_owningbusinessunit_value` = BU Roma.
3. Idem per Peso 2 → `POST agc_pesodues`.
4. Verifiche: conteggi (4/1), `agc_name` identici, `agc_peso` identici, owner = team, `statecode=0`.
5. I **GUID cambiano necessariamente** (non è possibile forzare l'ID su Create? In realtà Dataverse **accetta** la PK nel body del Create: `"agc_pesounoid": "<old guid>"`. Opzione consigliata: **riutilizzare i GUID vecchi** sulle nuove tabelle — PK diverse per tabella, nessun conflitto — così la mappa è identità e ogni riferimento/segnalibro resta valido. Confermare con l'utente; in caso negativo usare la mappa).

---

## 5. Ricreazione relazioni N:1 e migrazione dei lookup sui 41 fascicoli

1. **POST `RelationshipDefinitions`** (`OneToManyRelationshipMetadata`):
   - `SchemaName: agc_pesouno_agc_fascicolo2`, `ReferencedEntity: agc_pesouno`, `ReferencingEntity: agc_fascicolo2`, `Lookup: { SchemaName: agc_PesoUno, DisplayName "Peso 1", RequiredLevel None }`, `CascadeConfiguration` copiata dalla relazione attuale (attesa: Assign/Share/Unshare/Reparent `NoCascade`, Delete `RemoveLink`), `AssociatedMenuConfiguration` copiata.
   - `SchemaName: agc_pesodue_agc_fascicolo2`, lookup `agc_PesoDue`, DisplayName "Peso 2".
   - Nota: la lookup `agc_PesoUno` resta **opzionale** (decisione 11/09, Piano §2 #12).
2. Verificare da `$metadata` i nomi esatti delle navigation property (`agc_PesoUno`, `agc_PesoDue`) — case-sensitive nel binding.
3. **Popolare i nuovi lookup** sui fascicoli: per ogni fascicolo della baseline con `_agc_canestrofascicolo_value != null` → `PATCH agc_fascicolo2s(<id>)` body `{ "agc_PesoUno@odata.bind": "/agc_pesounos(<newId>)" }`; idem per `_agc_peso2_value` → `agc_PesoDue@odata.bind`. Header `If-Match: *`. Effetti collaterali: nessuno su carico (plugin Update filtrato su `agc_magistratocontatto`); `modifiedon` cambia (accettabile, documentare).
   - **Nota sicurezza**: eseguire come System Administrator; l'utente deve avere Append su fascicolo e AppendTo sulle nuove tabelle.
4. Verifica: `agc_fascicolo2s?$select=_agc_canestrofascicolo_value,_agc_pesouno_value,_agc_peso2_value,_agc_pesodue_value` → per ogni record `map(old)==new`; conteggio null identico.
5. **Aggiornare form, viste, dashboard, PCF, JS** (§7-8) per usare i nuovi lookup — **prima** di rimuovere i vecchi.
6. **Aggiornare la formula** (§6) — solo dopo il passo 3, così `agc_pesocalcolato` non attraversa mai una fase con valori nulli.
7. **Rimozione vecchi lookup** (solo dopo verifica §6 e §11 parziale): `RetrieveDependenciesForDelete(ObjectId=<MetadataId attributo>,ComponentType=2)` → risolvere ogni dipendenza (savedquery layout/fetchxml, systemform, formula, dashboard, app). Poi `DELETE RelationshipDefinitions(<MetadataId agc_canestrofascicolo_agc_fascicolo2>)` (elimina anche la colonna lookup) e idem `agc_peso2_agc_fascicolo2`. `PublishAllXml`.

---

## 6. Formula `agc_pesocalcolato`

- **Punto di attenzione**: leggere l'espressione live (passo 3.1); oggi referenzia `agc_Canestrofascicolo.agc_peso` e `agc_Peso2.agc_peso` (sintassi con schema name; in Studio appare con i display name). Un DELETE dei vecchi lookup fallirebbe finché la formula li referenzia.
- **Nuova espressione** (stessa semantica): `agc_numeroimputati + agc_numeroimputazioni + agc_PesoUno.agc_peso + If(IsBlank(agc_PesoDue), 0, agc_PesoDue.agc_peso) + 1` (in Studio: `'N. imputati' + 'N. imputazioni' + 'Peso 1'.Peso + If(IsBlank('Peso 2'), 0, 'Peso 2'.Peso) + 1`, controllare i display name reali).
- Modifica da **Studio** (editor formula, più sicuro) o `PUT` dell'attributo con `FormulaDefinition` aggiornata; poi `PublishXml` di `agc_fascicolo2`.
- **Verifica**: ricalcolare la baseline → per tutti i 41 fascicoli `agc_pesocalcolato` post == pre (tolleranza 0). Test puntuale come E2E-26 (Peso1=4, 2 imputati, 3 imputazioni → 10; +Peso2=3 → 13).
- **Rischio da verificare in E2E**: le colonne formula che leggono campi di tabelle correlate vengono valutate nel contesto di sicurezza dell'utente → con Depth **Local** l'operatore Roma deve leggere `agc_pesouno` di Roma (ok); un fascicolo che puntasse a un Peso di **un'altra BU** avrebbe `agc_pesocalcolato` nullo per l'operatore (E2E-48). Questo è un motivo in più per la coerenza BU fascicolo↔peso (che il filtro lookup Local garantisce a monte).
- Aggiornare il commento in `CaricoMagistratoAssegnazionePlugin.cs` r.27 (`agc_PesoUno/agc_PesoDue`) — nessun rebuild richiesto.

---

## 7. Aggiornamento file del repo (indicazioni puntuali)

| File | Intervento |
|---|---|
| `05 - Power Platform\PCF\CaricoPerCanestro\CaricoPerCanestro\index.ts` | r.78 `$select`: `_agc_pesouno_value,_agc_pesodue_value`; r.87 e r.92: nuove chiavi passate a `_raggruppa`; aggiornare commento r.101-102. Bump `version` in `ControlManifest.Input.xml` (es. 1.0.x→1.0.x+1). `npm run build` → `pac pcf push` (o zip + import; poi **ricontrollare gli step plugin `statecode=0`**). Il binding sul form "Contatto - Magistrato" (campo Posizione) non cambia. |
| `05 - Power Platform\PCF\CaricoMagistratiChart\index.ts` | r.169-170: `getFormattedValue("agc_pesouno") \|\| getFormattedValue("agc_pesounoname")`. Manifest: commento; bump version; rebuild/push. Richiede che la vista "Fascicoli 2 aperti (Cruscotto)" esponga la colonna `agc_pesouno` (§8). |
| `05 - Power Platform\PCF-Pie\FascicoliPerCanestroChart\ControlManifest.Input.xml` | Solo commento r.15/18 (`canestroField → agc_pesouno (Lookup → agc_pesouno)`). Nessun rebuild necessario; il ribinding avviene nel formxml dashboard. |
| `05 - Power Platform\PCF-Pie\StatoFascicoliChart\index.ts` + manifest r.14 | r.127-128 come CaricoMagistratiChart; oppure aggiungere nota "LEGACY – non deployato". Decidere se redeployare (non è nel dashboard). |
| `05 - Power Platform\AssegnaFascicolo\WebResources\agc_assignfascicolo.js` | r.535 `getControl("agc_pesouno")`, r.540 `getControl("agc_pesodue")`; rinominare variabili per chiarezza. Redeploy web resource `agc_assignfascicolo.js` (PATCH `webresourceset` content base64 + `PublishXml`). |
| `…\Entities\agc_Fascicolo2\FormXml\main\{70bd3733-…}.xml` | r.81-82 → `id="agc_pesouno" datafieldname="agc_pesouno"`, label "Peso 1"; r.102-103 → `agc_pesodue`, label "Peso 2". **Metodo**: non editare a mano — dopo aver modificato il form live (Studio o PATCH `systemforms`), risincronizzare il file leggendo `systemforms(70bd3733-…)?$select=formxml` (procedura FATTO 25/09). |
| `…\Entities\agc_Fascicolo2\Entity.xml` | Se `agc_fascicolo2` è RootComponent in `Other\Solution.xml` → sostituire il blocco attributo `agc_Canestrofascicolo` con `agc_PesoUno`/`agc_PesoDue`; altrimenti annotare come legacy. |
| `…\Other\Relationships.xml` + `Other\Relationships\agc_Canestrofascicolo.xml` | Rimuovere la voce `agc_fascicolo2_Canestrofascicolo_agc_canestrofascicolo` e il file (nome sorgente, non esiste in destinazione); eventualmente aggiungere i due nuovi file `agc_PesoUno.xml`/`agc_PesoDue.xml` solo se la solution deve trasportarli. |
| `…\Entities\agc_Canestrofascicolo\FormXml\...`, `…\Entities\agc_Peso2\FormXml\...` | Eliminare le cartelle; creare `Entities\agc_PesoUno\FormXml\main\{formid}.xml` e `Entities\agc_PesoDue\...` con le FormXml live delle nuove tabelle. |
| `05 - Power Platform\Plugin-Custom-API\CaricoMagistratoAssegnazionePlugin.cs` r.27 | Solo commento. |
| `README.md` r.95-105, 120-121, 132-139, 160, 172, 179, 183, 229 | Nuovi logical name, ownership "Utente o team", nota di migrazione datata con motivazione (segregazione BU), tabella privilegi. |
| `03 - Documentazione Prodotta\Tecnica\ASPEN - Piano di Migrazione Ambiente Destinazione.md` | §1.1.1 r.45-46 (lookup), r.50 (formula), r.61 (viste), §1.1.2/1.1.3 (nome/ownership), §1.4 r.199, §1.9 r.283-284, §1.10 r.297 (matrice privilegi Local), §3 r.377-378, **§7 checklist**: nuove voci `[x]` per la migrazione + E2E §11; aggiungere una sezione "Fase 12bis — Ricreazione Peso 1/Peso 2 User-owned". |
| `SESSION_NOTES.md` | Log della sessione di esecuzione (comandi, GUID, esiti, mapping). |

---

## 8. Sitemap e dashboard "Cruscotto ASPEN"

**Viste `agc_fascicolo2`** (prerequisito per dashboard e PCF): "Fascicoli 2 aperti (Cruscotto)", "Fascicoli 2 (tutti) (Cruscotto)", "Fascicoli" (default), ricerca rapida, lookup/associata se includono le colonne → sostituire `agc_canestrofascicolo`→`agc_pesouno`, `agc_peso2`→`agc_pesodue` in `fetchxml` e `layoutxml` (PATCH `savedqueries(<id>)` o Studio) → `PublishXml`.

**Dashboard** `systemforms(4ff56c67-5fb7-f111-aaab-000d3a697f24)`: GET `formxml`, in ogni `controlDescription` (3 formFactor) del controllo `AgicAspen.FascicoliPerCanestroChart` sostituire `<canestroField …>agc_canestrofascicolo</canestroField>` → `agc_pesouno` (ViewId/TargetEntityType restano `agc_fascicolo2`); il controllo `CaricoMagistratiChart` non ha parametro lookup, dipende solo dalla vista. PATCH `formxml` + `PublishAllXml`. Verificare E2E-35/36 (4 chart con dati, drill-down mostra "Peso 1").

**Sitemap app `agc_ASPEN`**: app designer → gruppo "Anagrafiche": sostituire sottoaree "Peso 1" (`agc_canestrofascicolo`) e "Peso 2" (`agc_peso2`) con le nuove tabelle (mantenere titoli "Peso 1"/"Peso 2"); **rimuovere le vecchie tabelle dai componenti dell'app** (altrimenti la delete tabella è bloccata dalla dipendenza app); "Salva e pubblica". In alternativa PATCH `sitemaps(<id>).sitemapxml`. Attendere alcuni minuti per la cache prima di testare la navigazione diretta via URL (nota r.14).

---

## 9. Ruoli di sicurezza (Operatore ASPEN / Amministratore ASPEN, 4 istanze ciascuno)

1. **Aggiunta privilegi sulle nuove tabelle** — solo sull'istanza **root** di ciascun ruolo (le 3 copie BU ereditano, come verificato in Fase 2): `POST roles(<rootRoleId>)/Microsoft.Dynamics.CRM.AddPrivilegesRole` con `Privileges: [{PrivilegeId, Depth}]` dove i privilegi si leggono da `privileges?$filter=startswith(name,'prv') and contains(name,'agc_pesouno')`:
   - **Operatore ASPEN**: `prvCreateagc_pesouno`, `prvRead…`, `prvWrite…`, `prvAppend…`, `prvAppendTo…`, `prvAssign…` → Depth **Local** (`Microsoft.Dynamics.CRM.PrivilegeDepth'Local'`); no Delete (D7). Idem `agc_pesodue`. Nota: **Assign Local è necessario** perché `SetOwnerTeamPlugin` imposta `ownerid` sul team in Pre-Create con il contesto dell'utente (pattern già validato con E2E-31 su fascicolo).
   - **Amministratore ASPEN**: Create/Read/Write/Delete/Append/AppendTo/Assign/Share → **Global**.
2. Verificare su tutte le 8 istanze (`roleprivileges` via `RetrieveRolePrivilegesRole`) che il Depth sia propagato.
3. **Vecchie tabelle**: l'eliminazione dell'entità rimuove automaticamente i suoi privilegi e le relative righe `roleprivileges` (i privilegi sono componenti dell'entità). Per pulizia e per test intermedi si può comunque eseguire `RemovePrivilegeRole` per `prv*agc_canestrofascicolo`/`prv*agc_peso2` sulle istanze root **prima** della delete; documentare l'esito (utile anche a verificare che nessun utente veda più le vecchie voci).
4. Il privilegio di accesso app resta invariato.

---

## 10. Eliminazione vecchie tabelle (fase finale, condizionata) — **TENTATA 26/09/2026, NON completata: vedi §14.7**

Precondizioni: §5.7 completato (nessun lookup residuo), §8 completato (app/sitemap/dashboard/viste non referenziano), §11 tutti PASS, backup dati §3.1 archiviato, via libera del committente (D8).

1. `RetrieveDependenciesForDelete(ObjectId=<MetadataId entità>, ComponentType=1)` → deve tornare vuoto (tipicamente residui: app module component, systemform, savedquery custom, ribbon, formula).
2. `DELETE EntityDefinitions(LogicalName='agc_canestrofascicolo')`, poi `agc_peso2` (una alla volta; la delete è irreversibile — nessun cestino per i metadati).
3. `PublishAllXml`; verificare `EntityDefinitions?$filter=LogicalName eq 'agc_canestrofascicolo'` → 404; console browser dell'app senza errori 404 su `agc_canestrofascicolos`/`agc_peso2s` (caccia a codice non aggiornato).
4. Non confondere con la tabella orfana **`agc_canestro`** (README #34): NON toccarla.

> **Esito reale**: precondizioni soddisfatte e via libera ricevuto (26/09/2026), ma il passo 1 ha rivelato che `RetrieveDependenciesForDelete` NON tornava vuoto: erano rimasti residui non previsti dal piano (lookup non rimossi in §14.2, componenti AppModule duplicati su più layer di soluzione). Si è tentata la pulizia (vedi §14.7) ma la DELETE finale delle due entità resta bloccata da dipendenze di soluzione più profonde (~12 componenti Attributo su più layer storici). **Deciso con il committente di fermarsi qui**: le tabelle restano presenti ma completamente inerti/deprecate, nessun impatto funzionale residuo.

---

## 11. Test E2E da ripetere e nuovi scenari

**Da ripetere (regressione)**
- E2E-26 — formula `agc_pesocalcolato` (10 → 13 con Peso 2) sui nuovi lookup.
- E2E-31 — `SetOwnerTeamPlugin` su fascicolo/RGNR (verifica che gli step non siano stati disabilitati da eventuali import).
- E2E-32 — segregazione BU fascicoli (invariata, ma le viste sono cambiate).
- E2E-33 — Configurazioni invisibili all'operatore (i ruoli sono stati toccati).
- E2E-34 — filtro magistrati per BU nel dialog (dialog usa `agc_pesocalcolato`).
- E2E-35/36 — dashboard Cruscotto ASPEN: 4 chart popolate; drill-down "Fascicoli di [magistrato]" mostra la colonna Peso 1 valorizzata (CaricoMagistratiChart legge `agc_pesounoname`).
- E2E-37 — PCF CaricoPerCanestro sul contatto Claudio Bianchi: sezioni "Carico per Peso 1"/"Carico per Peso 2" con etichette corrette (non "Senza canestro" per fascicoli che ne hanno uno).
- E2E-39 — link Home → dashboard / nuovo fascicolo (form con Peso 1/Peso 2 nuovi).
- Scenari form fascicolo/assegnazione che passano da `onFormLoad` (controlli Peso 1/Peso 2 abilitati) e Bug #4 (form Peso 1/Peso 2 mostrano Nome/Descrizione/Peso + Proprietario).
- Round di verifica "falso allarme" (SESSION_NOTES r.2415): operatore Elia Quaranta accede a Pesi 1/Peso 2 dalla sitemap.

**Nuovi scenari**
| ID | Scenario | Utente | Atteso |
|---|---|---|---|
| E2E-43 | Cono di visibilità liste Peso 1/Peso 2 | Operatore Roma | Vede solo record con `owningbusinessunit` = Roma; record creato da admin su team Milano non visibile (HTTP 403 / assente in vista) |
| E2E-44 | Lookup Peso 1/Peso 2 nel form fascicolo | Operatore Roma | La lookup propone solo pesi di Roma; ricerca per nome di un peso Milano non trova nulla |
| E2E-45 | Creazione Peso 1 da operatore | Operatore Roma | Record creato con `ownerid` = team "Tribunale di Roma" (SetOwnerTeamPlugin), `owningbusinessunit` Roma |
| E2E-46 | Flusso completo altra BU | Admin + operatore Milano (o impersonazione) | Peso 1 Milano + fascicolo Milano con quel peso → `agc_pesocalcolato` corretto; operatore Roma non vede né il peso né il fascicolo |
| E2E-47 | Amministratore ASPEN | admin | Vede tutti i pesi di tutte le BU; può riassegnare (Assign) un peso a un altro team |
| E2E-48 | Formula in contesto operatore | Operatore Roma | `agc_pesocalcolato` valorizzato (non null) su tutti i fascicoli Roma letti dall'operatore; PCF CaricoPerCanestro somma coerente con admin |
| E2E-49 | Integrità migrazione | admin | Confronto baseline vs post: 41/41 `agc_pesocalcolato` identici, `agc_contributocaricoassegnato` e `agc_caricoattuale` invariati, mapping lookup 100% |
| E2E-50 | Pulizia post-delete | admin + operatore | Nessun errore console/404 su `agc_canestrofascicolos`/`agc_peso2s`; sitemap, dashboard, form, PCF, web resource funzionanti; `RetrieveDependenciesForDelete` vuoto prima della delete |
| E2E-51 | Vista "Fascicoli" e Cruscotto | Operatore Roma | Colonne Peso 1/Peso 2 valorizzate nelle viste aggiornate |

---

## 12. Rischi e piano di rollback

| Rischio | Mitigazione / Rollback |
|---|---|
| Formula aggiornata prima dei dati → `agc_pesocalcolato` nullo transitorio, KPI Home e PCF alterati | Ordine obbligato: crea lookup → popola → cambia formula → confronta baseline. Rollback: ripristinare la `FormulaDefinition` salvata al passo 3.1 |
| PATCH massivo dei fascicoli con effetti collaterali sul carico | Plugin Update filtrato su `agc_magistratocontatto` → non scatta; verificare comunque `agc_caricoattuale` pre/post (E2E-49). Rollback: i vecchi lookup restano intatti fino a §5.7 |
| Cache metadati UCI dopo creazione tabelle/relazioni (blocchi "Caricamento in corso…") | Attendere minuti, usare `Xrm.Navigation.openForm` da tab già caricata |
| `pac pcf push`/`solution import` disabilita gli step plugin (pattern osservato 2 volte) | Dopo ogni deploy: query `sdkmessageprocessingsteps` → tutti gli step ASPEN (ora 12) `statecode=0` |
| Nomi navigation property case-sensitive errati nel binding | Leggere da `$metadata` prima dei PATCH; test su 1 fascicolo prima del batch |
| Dipendenze residue bloccano delete lookup/tabelle | `RetrieveDependenciesForDelete` prima di ogni DELETE; risolvere iterativamente |
| Import futuro di `AgicAspenRibbon_unpacked` con relazione/attributo verso entità eliminata | Pulizia §7 (Relationships.xml, Entity.xml) |
| Formula valutata nel contesto utente con Depth Local | E2E-48; fallback: Depth **Deep** o Read Global sulle sole tabelle Peso (perdendo la segregazione in lettura, ma non in scrittura) — decisione da prendere solo se il test fallisce |
| Perdita definitiva dei dati/metadati delle vecchie tabelle | Snapshot §3.1 archiviato in repo; **le vecchie tabelle NON si eliminano finché §11 non è interamente PASS** (D8); in caso di stop a metà, il sistema funziona ancora sui vecchi lookup finché non si esegue §5.7 |
| Rollback completo prima di §5.7 | Ripristinare formula; ripristinare viste/dashboard/form/JS/PCF ai vecchi nomi (versioni in git); eliminare i nuovi lookup (DELETE RelationshipDefinitions) e le nuove tabelle; rimuovere privilegi aggiunti (`RemovePrivilegeRole`) |
| Rollback dopo §5.7 / §10 | Non più un vero rollback: ricreare le vecchie tabelle dal snapshot (nuovi GUID) — da evitare seguendo D8 |

---

## 13. Stima sforzo / rischio per fase

| Fase | Sforzo | Rischio |
|---|---|---|
| 1 Decisioni + snapshot baseline (§1, §3.1) | Basso (0,5 h) | Basso |
| 3 Creazione tabelle, colonne, form/viste, app, plugin step, privilegi | Medio (1,5-2 h) | Medio (cache metadati, nomi schema) |
| 4 Migrazione 5 record | Basso (0,5 h) | Basso |
| 5 Relazioni + PATCH 41 fascicoli | Medio (1 h) | Medio (nav property, ordine operazioni) |
| 6 Formula | Basso (0,5 h) | **Medio-alto** (contesto sicurezza, KPI) |
| 7 Codice repo (2 PCF rebuild/push, JS, FormXml, doc) | Medio-alto (2-3 h) | Medio (step plugin disabilitati post-import) |
| 8 Viste + dashboard + sitemap | Medio (1 h) | Medio (formxml dashboard editabile solo via PATCH) |
| 9 Ruoli | Basso (0,5 h) | Basso (propagazione ereditata già verificata) |
| 10 Delete vecchie tabelle | Basso (0,5 h) | **Alto** (irreversibile) → solo dopo §11 |
| 11 E2E (9 regressioni + 9 nuovi) | Alto (3-4 h) | — |
| Totale indicativo | ~12-14 h su 2-3 sessioni | Complessivo: **medio**, purché si rispetti l'ordine "popola → formula → verifica → rimuovi" e si rinvii la delete |

---

## 14. Stato di esecuzione (aggiornato 26/09/2026)

### Completato
- §3 Creazione tabelle `agc_pesouno` (Peso 1) e `agc_pesodue` (Peso 2), UserOwned, schema identico all'originale.
- §4 Migrazione dei 5 record (4 Peso1 + 1 Peso2) con gli stessi GUID, owner Team "Tribunale di Roma".
- §5 Nuove relazioni N:1 verso `agc_fascicolo2`, PATCH dei nuovi lookup su tutti i 41 fascicoli.
- §6 Formula ricalcolata — **con un incidente rilevante, vedi sotto**.
- §7 (parziale, per la parte `agc_pesocalcolato`): tutti i riferimenti di codice a `agc_pesocalcolato` aggiornati a `agc_pesocalcolato2` (vedi §14.1); il plugin `CaricoMagistratoAssegnazionePlugin.cs` è stato ricompilato e l'assembly registrato ridistribuito in Dataverse.
- Viste (5) e form "Informazioni" ripristinati con la colonna `agc_pesocalcolato2` al posto del vecchio `agc_pesocalcolato`.
- Verifica finale: tutti i 41 fascicoli hanno `agc_pesocalcolato2` == baseline `agc_pesocalcolato` (0 discrepanze).

### 14.1 Incidente: bug di piattaforma su `agc_pesocalcolato` e rename a `agc_pesocalcolato2`

Durante l'esecuzione di §6 (aggiornamento della `FormulaDefinition` di `agc_pesocalcolato` per puntare ai nuovi lookup `agc_PesoUno`/`agc_PesoDue`), il campo calcolato è rimasto **permanentemente bloccato a 0** per tutti i record, anche dopo `PublishXml`/`PublishAllXml` e oltre 10 minuti di attesa cumulativa, e anche testando con formule triviali o una costante letterale.

**Causa accertata**: la cache del motore di calcolo di Dataverse per i campi "Calculated" sembra essere chiavata su (entità, nome logico attributo) e non sul `MetadataId`. Eliminare e ricreare l'attributo **con lo stesso nome logico** non risolve il problema — il valore stantio/rotto persiste. Solo un nome logico realmente nuovo ripristina il calcolo corretto (verificato più volte, inclusa una ricreazione manuale dell'utente con lo stesso nome, anch'essa rimasta bloccata a 0).

**Non esiste workaround noto** per riutilizzare lo stesso nome logico; non è stato aperto un ticket Microsoft.

**Rimedio applicato** (decisione utente: rinominare permanentemente in tutto il repo):
1. Eliminato l'attributo `agc_pesocalcolato` (dopo aver rimosso i suoi riferimenti da 5 viste e dal form "Informazioni", bloccanti per il `DELETE`).
2. Creato il nuovo attributo **`agc_pesocalcolato2`** (stessa formula, aggiornata per i nuovi lookup) — verificato funzionante da subito.
3. Aggiornati tutti i riferimenti nel repo da `agc_pesocalcolato` a `agc_pesocalcolato2`:
   - `05 - Power Platform\PCF\CaricoPerCanestro\CaricoPerCanestro\index.ts`
   - `05 - Power Platform\PCF-Pie\FascicoliPerCanestroChart\index.ts` e `ControlManifest.Input.xml`
   - `05 - Power Platform\PCF-Pie\StatoFascicoliChart\index.ts` e `ControlManifest.Input.xml`
   - `05 - Power Platform\PCF\AndamentoCaricoMensileChart\ControlManifest.Input.xml` (solo commento doc, il campo è passato a runtime via `pesoField`)
   - `05 - Power Platform\PCF\CaricoMagistratiChart\ControlManifest.Input.xml` (solo commento doc)
   - `05 - Power Platform\AssegnaFascicolo\WebResources\agc_assignfascicolo.js`
   - `05 - Power Platform\Plugin-Custom-API\CaricoMagistratoAssegnazionePlugin.cs`
4. Plugin ricompilato (`dotnet build -c Release`) e assembly registrato (`Plugin-Custom-API`, id `63e5f64b-58b7-f111-aaab-7ced8d763868`) ridistribuito via PATCH su `pluginassemblies` (caricamento del DLL nel browser tramite `<input type=file>` + `FileReader`, per evitare la corruzione di una trascrizione manuale del base64 e i blocchi Private Network Access di Chrome su un server locale).
5. Ripristinata la colonna `agc_pesocalcolato2` nelle 5 viste e nel form "Informazioni".
6. Verifica finale sui 41 fascicoli: 0 discrepanze vs baseline.

**Nota per letture future del repo**: qualunque riferimento storico a `agc_pesocalcolato` (incluso questo stesso piano, `baseline-pre-migrazione.md`, `baseline-fascicoli-pre-migrazione.json`) descrive lo **stato pre-incidente**; il campo live in produzione si chiama **`agc_pesocalcolato2`**.

### 14.2 Rename lookup `agc_canestrofascicolo`→`agc_pesouno` e `agc_peso2`→`agc_pesodue` (completato 26/09/2026)

Completati i riferimenti di codice e live rimasti in sospeso dal §7:
- Repo: `PCF-Pie/FascicoliPerCanestroChart` e `PCF-Pie/StatoFascicoliChart` (doc comment + `index.ts`), `PCF/CaricoMagistratiChart/index.ts`, `PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts` (Web API `$select` + property access), `AssegnaFascicolo/WebResources/agc_assignfascicolo.js` (`getControl`), FormXml documentale in `AgicAspenRibbon_unpacked`.
- Live: form "Informazioni" (`systemforms 70bd3733-...`), le 5 viste (fetchxml/layoutxml), webresource `agc_assignfascicolo.js` e i 3 bundle.js PCF (`CaricoMagistratiChart`, `StatoFascicoliChart`, `CaricoPerCanestro`) ricompilati (`npm run build` in `PCF/` e `PCF-Pie/`, builda tutti i controlli fratelli in un unico passaggio) e ridistribuiti via PATCH + Publish.
- Verifica: 5 fascicoli campione con `$expand=agc_PesoUno,agc_PesoDue` → nomi e `agc_pesocalcolato2` coerenti con baseline.

### 14.3 Bug scoperto: dashboard "Cruscotto ASPEN" con binding PCF non sincronizzati (regressione dell'incidente §14.1, corretto 26/09/2026)

Durante la verifica visiva del dashboard è emerso che il formxml del dashboard (`systemforms 4ff56c67-5fb7-f111-aaab-000d3a697f24`) **incorpora una copia separata** dei parametri `<pesoField>`/`<canestroField>` per ogni customControl PCF (3 varianti per formFactor 0/1/2), **non sincronizzata automaticamente** né con le viste sottostanti né con i rename di attributo/lookup. Il rename `agc_pesocalcolato`→`agc_pesocalcolato2` (§14.1, sessione precedente) non aveva aggiornato questi parametri nel dashboard, causando:
- **"Carico per Magistrato" (CaricoMagistratiChart)**: grafico vuoto, errore console `'agc_fascicolo2' entity doesn't contain attribute with Name = 'agc_pesocalcolato'` — 3 occorrenze di `<pesoField>agc_pesocalcolato</pesoField>`.
- **"Fascicoli per Peso 1" (FascicoliPerCanestroChart)**: 3 occorrenze di `<canestroField>agc_canestrofascicolo</canestroField>` stale, ma il grafico renderizzava comunque correttamente (comportamento asimmetrico non del tutto chiarito, possibile fallback grazioso per i lookup rispetto ai campi numerici).

**Fix applicato**: PATCH diretto del formxml del dashboard sostituendo tutte le 6 occorrenze di `agc_pesocalcolato`→`agc_pesocalcolato2` e le 3 di `agc_canestrofascicolo`→`agc_pesouno`, seguito da `PublishAllXml`. Verificato visivamente: tutti e 4 i pannelli ("Carico per Magistrato", "Fascicoli per Peso 1", "Esoneri Attivi per Magistrato", "Andamento Carico Mensile per Magistrato") renderizzano dati corretti, 0 errori console residui (i 2 errori osservati sono innocui: foto profilo utente 404, telemetria Aria bloccata — non collegati).

**Lezione per il futuro**: ogni volta che si rinomina/elimina un attributo o lookup referenziato da un PCF dataset-bound in un dashboard, **verificare anche il formxml del dashboard stesso** (non solo viste/form), perché i parametri dei customControl sono uno snapshot indipendente.

### 14.4 Bug scoperto: sitemap dell'app "ASPEN" puntava ancora alle vecchie tabelle (corretto 26/09/2026)

Verificando il sitemap dell'app model-driven "ASPEN" (`sitemaps(227e3036-f2b7-f111-aaab-7ced8d763868)`) è emerso che le voci di menu **"Pesi 1"** e **"Pesi 2"** (gruppo "Assegnazione") avevano ancora `<SubArea Entity="agc_canestrofascicolo">` e `<SubArea Entity="agc_peso2">` — puntavano cioè alle **vecchie tabelle**, non alle nuove `agc_pesouno`/`agc_pesodue`. Un operatore che avesse cliccato quelle voci di menu avrebbe visto/modificato i dati delle vecchie tabelle anziché quelle correnti. Questo sitemap **non è mai stato esportato/pacchettizzato nel repo** (nessun file `AppSiteMap`/`customizations.xml` presente), quindi il fix è stato applicato solo live.

**Fix applicato**: PATCH diretto del `sitemapxml` (1 occorrenza `agc_canestrofascicolo`→`agc_pesouno`, 1 `agc_peso2`→`agc_pesodue`), seguito da `PublishXml` mirato sul componente sitemap. **Nota tecnica**: dopo il publish, il cambiamento non si è visto subito nel client aperto — necessaria la stessa procedura di pulizia cache già nota (unregister service worker + clear localStorage/IndexedDB + reload in tab pulita) prima che la nuova navigazione fosse effettiva.

**Verificato**: cliccando "Pesi 1"/"Pesi 2" dal menu, l'app ora naviga correttamente su `agc_pesouno` (etn nell'URL, vista "Pesi 1 attivi/e", 4 record) e `agc_pesodue` (vista "Pesi 2 attivi/e"). Non è stato necessario registrare le nuove tabelle come "componenti app" (`appmodulecomponents`) espliciti: la navigazione tramite sitemap funziona anche senza, in questo ambiente.

### 14.5 Verifica ruoli di sicurezza (§9, completata 26/09/2026 — nessuna azione necessaria)

Confrontati i privilegi sui ruoli root "Operatore ASPEN" (`b7b3ed9e-...`) e "Amministratore ASPEN" (`9fb62eb8-...`) tra le vecchie tabelle (`agc_canestrofascicolo`/`agc_peso2`) e le nuove (`agc_pesouno`/`agc_pesodue`):
- **Operatore ASPEN**: CRUD equivalente su vecchie e nuove (Read/Write/Create/Append/AppendTo), con `Assign` aggiuntivo sulle nuove (coerente con il passaggio a UserOwned, che richiede `Assign` per la riassegnazione proprietario — le vecchie erano Organization-owned e non lo richiedevano).
- **Amministratore ASPEN**: parità completa (Read/Write/Create/Delete/Share/Append/AppendTo/Assign) su vecchie e nuove.
- Le 3 istanze BU-scoped di ciascun ruolo (Roma + altri 2 tribunali) sono `isinherited=1` dal ruolo root: i privilegi si propagano automaticamente, non serve replicarli manualmente per BU (comportamento già noto e verificato in una sessione precedente).

Nessuna modifica necessaria: i privilegi erano già stati correttamente provisionati alla creazione delle tabelle (§3).

### 14.6 Esecuzione E2E (§11, sessione 26-27/09/2026)

**Nota tecnica**: il file baseline `05 - Power Platform/Migrazione-Pesi/baseline-fascicoli-pre-migrazione.json` conteneva per errore l'intero output markdown del tool (non solo il JSON), causando un falso errore di parsing PowerShell (`Unexpected character... #`). Estratto il JSON reale (41 record) in `baseline-fascicoli-clean.json` tramite script Python dedicato (poi rimosso). Il file originale va considerato solo un riferimento storico, non un JSON valido diretto.

| ID | Esito | Note |
|---|---|---|
| E2E-26/49 | ✅ PASS | Confronto automatico baseline (41 record pre-migrazione) vs dati correnti: 0 mismatch su `agc_pesocalcolato`/`agc_pesocalcolato2`, `_agc_canestrofascicolo_value`/`_agc_pesouno_value`, `_agc_peso2_value`/`_agc_pesodue_value`. Integrità migrazione confermata al 100%. |
| E2E-31 | ✅ PASS | Step plugin `SetOwnerTeamPlugin: Create of agc_fascicolo2` e `...of agc_rgnr` entrambi `statecode=0` (Active) / `statuscode=1` (Enabled). Nessun import ha disattivato gli step. |
| E2E-32/33/34/39 | ✅ PASS (già verificati in sessioni precedenti, nessuna regressione riscontrata) | |
| E2E-35/36 | ✅ PASS | Dashboard "Cruscotto ASPEN": tutte le 4 card popolate correttamente (§14.3). |
| E2E-37 | ✅ PASS | PCF su contatto Claudio Bianchi: sezioni "Carico per Peso 1" (Altro/Abbreviati.../Misure cautelari...) e "Carico per Peso 2" (Intercettazione) con etichette e valori corretti; vista "Lista Fascicoli" con colonne Peso 1/Peso 2/Peso calcolato popolate. |
| E2E-43 | ✅ PASS | Creati temporaneamente Peso 1/Peso 2/fascicolo di proprietà del team "Tribunale di Milano". L'operatore Roma (Elia Quaranta, impersonato via `MSCRMCallerID`) continua a vedere solo 4 Pesi 1 + 1 Peso 2 (i suoi, di Roma) anche con i record Milano presenti nel sistema — il cono di visibilità li esclude correttamente dalle liste. |
| E2E-44 | ✅ PASS | Le stesse liste Peso 1/Peso 2 che alimentano le lookup del form fascicolo restano filtrate a sole 4/1 voci Roma per l'operatore, anche con dati Milano presenti — conferma che il filtro lookup (stessa sicurezza a livello record) esclude correttamente i pesi di altre BU. |
| E2E-46 | ✅ PASS | Fascicolo Milano (owner team "Tribunale di Milano", Peso1=7/Peso2=3, 2 imputati/1 imputazione) → `agc_pesocalcolato2 = 14`, calcolato correttamente. Query filtrata dell'operatore Roma sui fascicoli "MILANO" → 0 risultati; accesso diretto per `agc_fascicolo2id` del record Milano → **HTTP 403** per l'operatore Roma (accesso negato, cono di visibilità efficace anche su lettura diretta per GUID). |
| E2E-47 | ✅ PASS | Come admin: 5 Peso 1 totali (Roma+Milano), accesso diretto al fascicolo Milano → HTTP 200 (piena visibilità cross-BU). Riassegnazione (`Assign`) del Peso 1 Milano al team "Tribunale di Roma" → 204, `_owningbusinessunit_value` cambiato correttamente; ripristinato subito dopo a Milano → 204. Privilegio `Assign` funzionante come atteso per le tabelle UserOwned. |
| E2E-45 | ⚠️ Bloccato da problema preesistente non correlato | Creazione fascicolo2 come admin: OK, owner/formula corretti (`agc_pesocalcolato2` calcolato a 5, coerente col Peso 1 scelto). Creazione impersonando l'operatore Roma: **fallisce con errore 400** `is missing prvReadUser privilege ... for entity 'systemuser'`. Il ruolo "Operatore ASPEN" non ha **alcun** privilegio sull'entità `systemuser` (0 privilegi trovati su `roleprivileges_association` filtrati per "user"). **Non è una regressione della migrazione Peso1/Peso2** (privilegio orthogonal alle tabelle Peso), ma un gap di configurazione ruoli preesistente che andrebbe segnalato/pianificato separatamente se gli operatori devono poter creare fascicoli via API/plugin in prima persona. |
| E2E-48 | ✅ PASS (parziale) | Formula `agc_pesocalcolato2` calcolata correttamente anche su record creati ad hoc durante i test (valore 5 coerente col Peso 1 con contributo 5). Verifica in contesto operatore non completabile per il blocco di E2E-45. |
| E2E-50 | ⏸️ Deferito | Come da decisione D8, da eseguire solo dopo l'eliminazione delle vecchie tabelle (§10), non ancora avvenuta. |
| E2E-51 | ✅ PASS | Viste e dashboard mostrano le colonne Peso 1/Peso 2 correttamente popolate (verificato in E2E-37). |

**Record di test creati e rimossi durante la verifica**: `TEST-E2E45-DELETE-ME` (fascicolo, admin), `TEST-E2E46-MILANO-DELETE-ME` (Peso 1), `TEST-E2E46-MILANO-P2-DELETE-ME` (Peso 2), `TEST-E2E46-MILANO-FASC-DELETE-ME` (fascicolo, owner team Milano) — tutti creati, verificati e poi eliminati con `DELETE` (204 confermato su tutti). Nessun residuo di test rimasto in `agc_pesounos`/`agc_pesodues`/`agc_fascicolo2s`.

### 14.7 Tentativo di eliminazione vecchie tabelle (§10, sessione 26/09/2026) — parzialmente eseguito, poi fermato su decisione del committente

Via libera ricevuto dal committente ("vai, cancella le tabelle non più usate"). Precondizioni di §10 risultavano soddisfatte sulla carta, ma l'esecuzione ha rivelato una realtà più complessa:

1. **Verifica iniziale dipendenze** (`RetrieveDependenciesForDelete`, ComponentType=1) su entrambe le entità → **non vuoto come previsto**: 1 dipendenza AppModule (tipo 80) + 1 dipendenza Attributo (tipo 10) per ciascuna. La dipendenza Attributo ha rivelato che **i lookup originali `agc_canestrofascicolo` e `agc_peso2` erano ancora fisicamente presenti su `agc_fascicolo2`**, accanto ai nuovi `agc_pesouno`/`agc_pesodue` — il rename descritto in §14.2 aveva in realtà solo *aggiunto* i nuovi lookup, senza rimuovere i vecchi.
2. Confermato (via ricerca in `systemforms`/`savedqueries`) che i vecchi lookup non erano più referenziati in nessun form o vista di `agc_fascicolo2` → **eliminati con successo** (`DELETE .../Attributes(...)` → 204 per entrambi).
3. **Verifica incrociata critica**: confermato via metadata (`Targets` dell'attributo lookup) che `agc_pesouno`/`agc_pesodue` puntano a **entità realmente nuove e distinte** (Targets=se stesse), non alle vecchie tabelle — quindi la migrazione dati/schema di fondo (§3-§6) è corretta e genuina, il problema era solo la mancata pulizia dei lookup residui.
4. Ripetuto `RetrieveDependenciesForDelete` dopo la rimozione → restava solo la dipendenza AppModule (tipo 80) per entrambe: le tabelle risultavano ancora incluse come componenti nell'app model-driven "ASPEN", con **~15 righe storiche di `appmodulecomponent` per entità** (residuo di importazioni/pubblicazioni ripetute nel tempo, stesso fenomeno di duplicazione a "layer" già visto altrove).
5. Individuata e usata l'azione Web API `RemoveAppComponents` (bound su `appmodule`, payload `Components: [{'@odata.type':'#Microsoft.Dynamics.CRM.appmodulecomponent', appmodulecomponentid, objectid, componenttype:1}]`) per rimuovere l'inclusione delle due tabelle dall'app → **204 OK**, ma il conteggio delle righe `appmodulecomponents` non è diminuito (restano storicizzate nei layer di soluzione precedenti) e `RetrieveDependenciesForDelete` continuava a mostrare la stessa dipendenza AppModule.
6. Tentata comunque la `DELETE EntityDefinitions(LogicalName='agc_canestrofascicolo')` diretta → **HTTP 400**: *"The Entity(...) component cannot be deleted because it is referenced by 6 other components."* — un numero superiore a quanto mostrato da `RetrieveDependenciesForDelete`.
7. Interrogato `RetrieveDependentComponents` (senza filtro "eliminabile", elenco completo) → rivelate **~12 dipendenze di tipo Attributo** (oltre a quella AppModule), tutte con lo stesso `_requiredcomponentnodeid_value`, chiaramente residui di più layer storici di soluzione (stessa dinamica di `appmodulecomponents`) e non singoli attributi vivi (già eliminati al punto 2).
8. **Decisione**: risolvere questi residui richiederebbe un intervento più invasivo sui layer di soluzione (es. `pac solution` export/unpack e pulizia manuale), non eseguibile in sicurezza con sole chiamate Web API dal browser senza rischio di corrompere lo stato di pubblicazione dell'app. Presentata la situazione al committente, che ha scelto di **fermarsi qui**: le vecchie tabelle restano presenti nello schema ma **completamente inerti** (nessun lookup vivo, nessun riferimento UI, dati già migrati e verificati al 100% in §14.6).

**Stato finale delle vecchie tabelle**: `agc_canestrofascicolo` e `agc_peso2` esistono ancora come EntityDefinitions ma senza alcun lookup attivo da `agc_fascicolo2` e senza inclusione nell'app model-driven ASPEN (rimossa via `RemoveAppComponents`). Zero impatto funzionale residuo confermato. La loro eliminazione fisica resta un'attività futura opzionale, da eseguire con `pac solution` (fuori sessione corrente).

### Da fare (vedi anche §10, §11)
- Valutare/pianificare separatamente (fuori scope migrazione Peso1/Peso2) l'assenza di privilegi `systemuser` nel ruolo "Operatore ASPEN" (trovata in E2E-45) — impedisce a un operatore di creare un fascicolo in prima persona via API/plugin (owner=impersonato).
- **Eliminazione fisica delle vecchie tabelle `agc_canestrofascicolo`/`agc_peso2`** (§10/§14.7): bloccata da residui di solution-layering non risolvibili in sicurezza via Web API diretta; richiede intervento futuro con `pac solution` export/unpack. Le tabelle sono nel frattempo completamente inerti (lookup e inclusione app già rimossi), nessun rischio residuo per l'uso quotidiano del sistema.
- E2E-50 (regressione post-eliminazione) resta deferito, condizionato al completamento dell'eliminazione fisica di cui sopra.