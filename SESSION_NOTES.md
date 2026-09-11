# Session Notes — ASPEN / Ministero della Giustizia

> Note di sessione in ordine cronologico inverso (più recente in cima).

---

## Session 2026-09-10 — Fix ribbon, ricerca magistrati, esclusione esonero totale in continuità RGNR, blocco esoneri sovrapposti

### Richieste utente
1. Spostare il tasto "Modifica Carico" sulla ribbon del Contatto (Magistrato) subito dopo "Nuovo".
2. Spostare il PCF "Carico per Canestro" dalla tab "Generale" alla tab "Fascicoli" del form Contatto (primo campo, sotto la subgrid fascicoli).
3. Aggiungere un campo di ricerca/filtro magistrati nella modale "Assegna Fascicolo".
4. Fix logica di continuità RGNR: se un altro fascicolo dello stesso PGNR/RGNR è assegnato a un magistrato che nel frattempo ha un esonero **Totale**, il codice non deve riproporlo per continuità ma deve ricadere sulla regola di assegnazione classica.
5. Chiarimento + fix comportamento con esoneri sovrapposti: deciso di **bloccare la creazione/modifica di qualsiasi esonero che si sovrapponga temporalmente** a un altro esonero Attivo dello stesso magistrato, indipendentemente dal tipo (Totale/Parziale).
6. Bug aggiuntivo segnalato: nella griglia fascicoli il tasto "Assegna Fascicolo" compare anche se il magistrato è già assegnato (nel modulo invece il comportamento è corretto).

### Implementazione e stato
1. **Ribbon "Modifica Carico"** — `RibbonDiff.xml` (`ContactRibbonOnly_unpacked`): Sequence del bottone/CustomAction cambiata da 15 a 11 per posizionarlo subito dopo "Nuovo". Pacchettizzato (`pac solution pack`) e importato live (`pac solution import --publish-changes`). **✅ Deployato e pubblicato.**
2. **Spostamento PCF "Carico per Canestro"** — il FormXml del Contatto non è tracciato nel repo (solo `RibbonDiff.xml`/`Entity.xml` per il Contact in `ContactRibbonOnly_unpacked`); non modificabile via file. **⏳ Da fare manualmente in Maker Portal (Form Designer)**, oppure valutare un intervento diretto via Web API `systemform`/FormXml in una sessione successiva.
3. **Ricerca magistrati nella modale** — `agc_assignfascicolodialog.html`: aggiunto input `#mag-search`, CSS `.mag-search`/`.mag-item.hidden`, filtro JS su `item.dataset.nome`. **✅ Deployato** (content aggiornato via Web API PATCH su `webresourceset` + `PublishXml`, verificato post-deploy).
4. **Esclusione esonero Totale nella continuità RGNR (flusso modale)** — `agc_assignfascicolodialog.html`: prima di assegnare per continuità RGNR, ora interroga `getEsoneriAttivi([contId])` e se il magistrato ha un esonero attivo con `agc_tipoesonero === 1` (Totale) esclude la continuità e ricade sulla regola di assegnazione classica. Il flusso massivo (`agc_assignfascicolo.js`) già gestiva correttamente questo caso, nessuna modifica necessaria lì. **✅ Deployato** (stesso webresource, stesso deploy del punto 3).
5. **Blocco esoneri sovrapposti** — creato nuovo plugin `EsoneroOverlapValidationPlugin.cs` (progetto `Plugin-Custom-API`), registrato in **Pre-Operation (stage 20)** su Create e Update di `agc_esonero`, con PreImage (`agc_datainizio,agc_datafine,agc_statoesonero,agc_magistrato`) sullo step di Update. Blocca qualunque sovrapposizione temporale con un esonero Attivo esistente dello stesso magistrato, indipendentemente dal tipo. Registrazione fatta interamente via Web API dirette (`az account get-access-token` + `Invoke-RestMethod`/`Invoke-WebRequest`), stesso pattern usato in tutte le sessioni precedenti per operazioni dirette sui metadati Dataverse (il tentativo di riusare la cache token di `pac` con `ServiceClient`/MSAL è fallito per necessità di login interattivo loopback, non ripetibile in ambiente headless). **✅ Plugin compilato, assembly `Plugin-Custom-API` aggiornato via PATCH `content` base64, plugintype e step creati, testato end-to-end** (creazione con date sovrapposte bloccata con messaggio custom; creazione senza sovrapposizione riuscita). Notato che esistevano già in produzione due esoneri "Ferie" sovrapposti per lo stesso magistrato inseriti prima del fix (dati storici, non retroattivamente bloccati).
6. **Bug griglia "Assegna Fascicolo" sempre visibile** — causa: la formula Power Fx del Command Designer per la visibilità del bottone controlla il campo legacy `agc_magistratoassegnato` (mai popolato) invece di `agc_magistratocontatto` (campo realmente usato). La formula non è tracciata in file di repo (non è parte del RibbonDiffXml classico). **⏳ Da correggere manualmente in Maker Portal (Command Designer)**, salvo investigare se il comando moderno sia esposto in una tabella Dataverse interrogabile via Web API.

### Note tecniche
- Confermato che `az account get-access-token --resource <org-url>` + `Invoke-RestMethod` è il pattern corretto e consolidato per operazioni Web API dirette su Dataverse (incluse registrazione plugin), **non** il token cache di `pac` (valido solo per `api.powerplatform.com`, non per la Web API dell'organizzazione).
- Plugin assembly `Plugin-Custom-API` (pluginassemblyid `5cd6cdfb-e163-f111-ab0c-7ced8d72f54e`) aggiornato con la nuova classe; plugintype `AgicAspen.Plugins.EsoneroOverlapValidationPlugin` creato con id `f0c1bbc4-c1ad-f111-aaab-7ced8d71a68d`.

### Follow-up: chiarimento ambito controllo + messaggio errore con periodo
- Segnalato un caso apparentemente anomalo (record "test" creato nonostante una sovrapposizione visibile in griglia): verificato che **non è un bug**. Il vecchio esonero "ferie" sovrapposto era già `agc_statoesonero = Chiuso` nel momento della creazione del nuovo record: il plugin blocca solo la sovrapposizione tra esoneri **entrambi Attivi contemporaneamente**, per design. Confermato con l'utente che questo è il comportamento desiderato (non estendere il controllo agli esoneri Chiusi).
- Migliorato il messaggio di errore del plugin per includere il periodo (date inizio/fine, o "a tempo indeterminato" se `agc_datafine` è nullo) dell'esonero Attivo in conflitto, es.: *"Il magistrato ha già un esonero Attivo (Ferie) dal 02/09/2026 al 16/09/2026 il cui periodo si sovrappone a quello inserito..."*. Assembly ricompilato e ripubblicato via PATCH `content` su `pluginassemblies(5cd6cdfb-e163-f111-ab0c-7ced8d72f54e)` (stesso plugintype/step già registrati, nessuna nuova registrazione necessaria). Testato end-to-end: messaggio verificato corretto.

## Session 2026-09-09 (cont.) — Riallineamento punteggio al rientro da esonero Totale

### Requisito
Requisito cliente emerso in sessione 2026-09-08 (cont. 3), che **supera** il design "solo log" implementato
in sessione 2026-09-08 (cont.) per il todo `3.1-riallineamento-punteggio`: per gli esoneri **Totale**
(non Parziale), al rientro il carico reale del magistrato deve essere effettivamente riallineato al
carico del "collega più simile", non solo loggato.

### Decisioni di design (confermate con l'utente)
1. **M2 candidati**: esclusi il magistrato M1 stesso e chiunque avesse un esonero **attivo** (Totale o
   Parziale) nello stesso momento (attivazione di M1) — verificabile in tempo reale senza query su
   intervalli di date storici.
2. **Tie-break**: a parità di distanza dal carico di M1 all'attivazione, vince il collega col **carico
   più basso**.
3. **Nuova tabella snapshot**: `agc_fotocaricoesonero` (lookup a `agc_esonero`, lookup a `contact`
   magistrato, `agc_carico` decimale) — fotografa il carico di tutti i colleghi eleggibili nel momento in
   cui un esonero **Totale** diventa Attivo.
4. **Tracciabilità**: nuovo campo lookup `agc_esonero.agc_collegariferimento` → `contact`, popolato al
   rientro con il collega scelto come M2.
5. Gli esoneri **Parziali** mantengono invariato il comportamento di solo log (`agc_punteggioalrientro`,
   nessuna modifica al carico reale) implementato in sessione 2026-09-08 (cont.).

### Implementazione
- **Tabella `agc_fotocaricoesonero`** creata via Web API dirette (`EntityDefinitions`,
  `RelationshipDefinitions`, `Attributes`) con lo stesso pattern token `az account get-access-token` +
  `Invoke-RestMethod` già usato per `agc_modificacarico`. Campi: `agc_name` (primaria), `agc_esonero`
  (lookup, required), `agc_magistrato` (lookup a contact, required), `agc_carico` (decimal, required).
- **Nuovo campo `agc_esonero.agc_collegariferimento`** (lookup a contact, opzionale) per audit.
- **`EsoneroRientroPlugin.cs`** esteso (non sostituito):
  - Sulla transizione ad **Attivo**, se `agc_tipoesonero` = Totale, `CreaFotoCaricoColleghi()` interroga
    tutti i contact con `agc_ruolomagistrato` popolato (esclusi M1 e chi ha un `agc_esonero` Attivo in
    corso) e crea una riga `agc_fotocaricoesonero` per ciascuno col loro carico attuale.
  - Sulla transizione **Attivo → Chiuso**, se Totale, `RiallineaCaricoAlRientro()` legge
    `agc_punteggioalmomentoesonero` di M1, interroga le foto colleghi di questo esonero, sceglie M2 per
    minima distanza assoluta (tie-break: carico più basso), aggiorna `contact(M1).agc_caricoattuale` al
    carico **attuale** (oggi) di M2, e popola `agc_collegariferimento`. Se non ci sono foto (nessun
    collega eleggibile all'attivazione), mantiene il vecchio comportamento di solo log con trace warning.
  - Il tipo esonero (immutabile) viene letto con una `Retrieve` diretta sul record corrente invece di
    estendere la PreImage registrata (`agc_statoesonero`, `agc_magistrato`), per non toccare la
    registrazione dello step.
- Assembly ricompilato (`dotnet build`, net462) e caricato via `PATCH pluginassemblies(...)` riusando
  l'assembly esistente (`5cd6cdfb-e163-f111-ab0c-7ced8d72f54e`), nessun nuovo plugintype necessario.

### Gotcha tecnico — navigation property OData vs. nome schema
La `@odata.bind` sul lookup `agc_magistrato` di `agc_esonero` **non** funziona con
`"agc_magistrato@odata.bind"` (nome dell'attributo/schema): l'entità Web API la espone con un nome
navigation property diverso, **`agc_Magistrato`** (M maiuscola, radice del nome relazione
`agc_contact_agc_esonero_Magistrato`), altrimenti errore OData "undeclared property ... has property
annotations ... but no property value". Verificato interrogando `$metadata` grezzo (via
`Invoke-WebRequest`, non `Invoke-RestMethod` che lo parsifica come XML e complica la ricerca) e cercando
`NavigationProperty Name="..." Partner="agc_contact_agc_esonero_Magistrato"`. Da tenere a mente per
futuri lookup con nome navigation property non banale.

### Backfill dati reali
L'esonero Totale già attivo di **Chiara Marini** ("Ferie", dal 02/09/2026) non aveva
`agc_punteggioalmomentoesonero` valorizzato, perché il record era stato creato **direttamente** in stato
Attivo (Create, non Update — il plugin scatta solo su transizioni Update, comportamento noto e atteso,
non un difetto). Backfill manuale via Web API:
- `agc_punteggioalmomentoesonero` = carico attuale di Chiara (100,00) al 09/09/2026, come approssimazione
  ragionevole del valore reale al 02/09/2026 (durante un esonero Totale il magistrato non riceve nuove
  assegnazioni, quindi il carico non dovrebbe essere cambiato nel frattempo).
- 4 righe `agc_fotocaricoesonero` create per i colleghi eleggibili al 09/09/2026: Laura Verdi (81),
  Marco Bianchi (88), Paolo Russo (77), Alessia Gialli (81) — esclusi Chiara stessa e Anna Greco (esonero
  Parziale attivo, "Esonero test").

### Test end-to-end e verifica
Creato un esonero di test sintetico per Marco Bianchi (Totale, creato in stato Annullato poi transizionato
via Update, per triggerare correttamente il plugin come farebbe un flusso reale):
1. **Attivazione** → `agc_punteggioalmomentoesonero` = 88 (carico di Marco), create 3 foto colleghi
   (Laura 81, Paolo 77, Alessia 81 — correttamente esclusi Anna Greco e Chiara Marini, entrambe con
   esonero attivo in quel momento).
2. **Chiusura** → distanza da 88: Laura/Alessia = 7 (parità), Paolo = 11 → scelta Laura Verdi
   (tie-break ok, primo valore restituito a parità di carico), `agc_collegariferimento` popolato,
   carico di Marco riallineato correttamente a 81.
3. **Cleanup**: ripristinato carico originale di Marco (88), eliminate le 3 foto di test e il record
   esonero di test. Verificato che il backfill di Chiara Marini restasse intatto e i carichi degli altri
   magistrati invariati.

### File coinvolti
- `05 - Power Platform/Plugin-Custom-API/EsoneroRientroPlugin.cs` (esteso)
- Tabella `agc_fotocaricoesonero` (nuova, live)
- Campo `agc_esonero.agc_collegariferimento` (nuovo, live)
- `README.md` (nuovo item 23, ✅ Risolto)

### Bug scoperto durante il test manuale dell'utente e fix — gestione anche della Create
Testando manualmente (esonero Totale creato per Marco Bianchi, poi chiuso), l'utente ha notato che il
carico **non veniva riallineato**. Diagnosi: l'esonero era stato creato **direttamente in stato Attivo**
tramite il form (un solo salvataggio, workflow naturale per l'utente finale, dato che il campo Stato
Esonero è obbligatorio). Il plugin però reagiva solo a **Update** con transizione di stato: una `Create`
che nasce già Attivo non genera alcuna transizione rilevabile (non c'è uno stato "prima" diverso), quindi
né la fotografia del carico all'attivazione né le foto colleghi venivano mai create — stesso identico
comportamento già osservato per il record reale di Chiara Marini. Conferma della diagnosi: i campi
`agc_punteggioalmomentoesonero` e soprattutto `agc_collegariferimento` risultavano modificati
dall'utente stesso (non dal plugin) e quest'ultimo puntava al magistrato stesso — impossibile da produrre
dall'algoritmo (M1 è sempre escluso da se stesso).

Confermato con l'utente che **l'esonero nascerà sempre già in stato Attivo** in produzione: non è un
caso limite di test ma il flusso normale. Fix: aggiunto un secondo step del plugin registrato su
**Create** (Post-Operation, stage 40, stesso plugin type) che, se il record nasce con
`agc_statoesonero = Attivo`, esegue subito la fotografia (carico attuale + foto colleghi se Totale),
esattamente come farebbe la transizione Update. La logica di rientro (Update Attivo→Chiuso) resta
invariata. Verificato end-to-end creando un esonero direttamente in Attivo (Marco Bianchi, carico 88):
foto colleghi create immediatamente (Laura Verdi 81, Paolo Russo 77, Alessia Gialli 81, esclusi Anna
Greco e Chiara Marini per esonero attivo), chiusura → carico riallineato correttamente a 81. Puliti anche
i dati residui del test fallito dell'utente (record esonero errato eliminato, carichi di Laura Verdi e
Alessia Gialli, temporaneamente alterati per il test, ripristinati a 81).

### Miglioramenti form `agc_esonero` — prevenire errori di test/uso futuri
Su richiesta dell'utente, per evitare che i campi gestiti dal plugin vengano toccati manualmente (come
successo nel test sopra) e per velocizzare la creazione di un nuovo esonero (che nasce sempre già
Attivo):
- **`DefaultFormValue` = 1 (Attivo)** impostato sul campo picklist `agc_statoesonero` via
  `PUT EntityDefinitions(...)/Attributes(<metadataid>)` (il PUT per-attributo richiede il `MetadataId`
  numerico/guid dell'attributo: navigare per `LogicalName` con PATCH/PUT diretto non è supportato, va
  prima recuperato il `MetadataId` con una GET). Da ora un nuovo esonero nasce con "Stato Esonero" già
  preselezionato su "Attivo".
- **Main form (`systemforms`, type=2) di `agc_esonero`** aggiornato via Web API (lettura/scrittura
  diretta di `formxml`, poi `PublishXml`): il controllo `agc_punteggioalmomentoesonero` (già presente)
  reso `disabled="true"`; aggiunte due nuove righe **di sola lettura** per `agc_punteggioalrientro` e
  `agc_collegariferimento` (non erano ancora presenti su nessuna delle 3 form dell'entità — verificato
  cercando questi due nomi campo nel `formxml` di tutte e tre). Tutti e tre restano visibili per
  audit/log ma non più editabili manualmente dall'utente.

### File coinvolti (aggiornamento)
- Metadata campo `agc_esonero.agc_statoesonero` (`DefaultFormValue`, live) e main form `agc_esonero`
  (`formxml`, live) — non tracciati nel repository (nessuna cartella solution unpacked per
  `agc_esonero`), modificati direttamente in ambiente.
- `README.md` (item 23 aggiornato con le migliorie form).

---

## Session 2026-09-09 — Tasto "Modifica Carico" (admin) sul form Contatto/Magistrato

### Requisito
Punto 1 dei "Prossimi passi" raccolti in sessione 2026-09-08 (cont. 3): tasto visibile solo agli
amministratori di sistema sul form Contatto/Magistrato per correggere manualmente
`agc_caricoattuale`, con nota di giustificazione obbligatoria e traccia di audit.

### Decisioni con l'utente
- Ruolo di sicurezza: quello esistente **"System Administrator"**
  (roleid `5eaeacb4-735a-f111-a825-000d3ade6bac`), niente ruolo dedicato nuovo.
- Tabella di audit: `agc_modificacarico` (creata manualmente dall'utente: lookup `agc_magistrato`
  → contact, `agc_valoreprecedente`, `agc_valorenuovo`, `agc_nota`). Niente colonna
  `agc_utentemodifica` dedicata: si usano i campi standard `createdby`/`createdon`.
- Meccanismo: Custom API (non plugin su Update, non Cloud Flow).
- Metodo di lavoro: "usa le API dove possibile, altrimenti Playwright" → in pratica tutto fatto
  via Web API dirette con `az account get-access-token --resource <org-url>` + `Invoke-RestMethod`
  (stesso pattern di sessioni precedenti — `pac auth token` restituisce sempre `Token: ******`,
  mascherato, quindi inutilizzabile per chiamate REST dirette).

### Implementazione
- **Plugin Custom API** `ModificaCaricoMagistratoPlugin.cs`
  (`05 - Power Platform/Plugin-Custom-API/`): valida `Nota` non vuota e `NuovoValore` presente,
  verifica lato server l'appartenenza del chiamante al ruolo System Administrator (join
  `role`/`systemuserroles`, difesa in profondità oltre al check client-side), legge il vecchio
  `agc_caricoattuale`, aggiorna il contact, crea il record di audit `agc_modificacarico` e
  restituisce `AuditId`.
- **Custom API** `agc_ModificaCaricoMagistrato` (bound a `contact`): parametri richiesta
  `NuovoValore` (Decimal) e `Nota` (String), risposta `AuditId` (GUID). Registrata interamente via
  Web API dirette (assembly aggiornato via PATCH su `pluginassemblies`, nuovo `plugintype`, nuovo
  `customapi` con `PluginTypeId@odata.bind`, `customapirequestparameters`,
  `customapiresponseproperties`).
  - **Gotcha**: il navigation property per legare `customapi` a `plugintype` è `PluginTypeId`
    (P/T maiuscole), non `plugintypeid`.
  - **Gotcha grave**: fatto un errore iniziale impostando `NuovoValore` come tipo 8 (Money)
    invece di 2 (Decimal) → errore runtime `Unable to cast object of type
    'Microsoft.Xrm.Sdk.Money'`. **PATCHare il campo `type` di un `customapirequestparameter` già
    creato non ha alcun effetto reale** (risponde 204 ma il messaggio SDK sottostante resta col
    vecchio tipo): bisogna **cancellare e ricreare** il parametro con il tipo corretto.
- **JS/HTML** (`05 - Power Platform/AssegnaFascicolo/WebResources/`):
  `agc_modificacarico.js` (`AgicAspen.ModificaCarico.isSystemAdministrator()` +
  `.openDialog(formContext)`, apre un webresource HTML in dialog via `Xrm.Navigation.navigateTo`)
  e `agc_modificacaricodialog.html` (form con carico attuale, nuovo valore, nota obbligatoria,
  POST diretto alla Custom API via `fetch`). Il nome del magistrato nel dialog viene letto da
  `formContext.data.entity.getEntityReference().name` e non da `getAttribute("fullname")`, perché
  quest'ultimo restituisce `null` se l'attributo non è presente nel layout del form corrente
  (mentre l'`EntityReference` del record espone comunque il nome primario).
- **Tasto in command bar (RibbonDiffXml)**: la moderna **Command Designer non supporta la
  visibilità via funzione JS** — l'unica opzione oltre "Mostra sempre" è "Mostra in base a
  condizione da formula" (**Power Fx**), e la funzione `User()` di Power Fx **non è disponibile
  nelle app model-driven** (solo nelle Canvas App) — confermato su
  `learn.microsoft.com/power-apps/maker/model-driven-apps/use-command-designer` e
  `commanding-use-powerfx`. Per nascondere davvero il tasto ai non-amministratori serve quindi il
  **ribbon classico** (`RibbonDiffXml`), con `DisplayRule`/`CustomRule` che richiama
  `AgicAspen.ModificaCarico.isSystemAdministrator` in JS.
  - La solution `ASPEN POC Ribbon` (`ASPENPOCRibbon`, che già include `contact` come root
    component) si è rivelata **non re-importabile**: sia il roundtrip
    `pac solution export/unpack/pack/import` sia l'`ImportSolution` diretto via Web API falliscono
    **sempre**, anche re-importando lo zip esportato senza alcuna modifica, con
    `Cannot have object with no publish instances, Name:Active, BaseInstance(SolutionId=
    fd140aae-4df4-11dd-bd17-0019b9312238, ...)` — causato quasi certamente dalle
    `<MissingDependencies>` presenti nel `Solution.xml` esportato (referenziano un componente di
    `msdynce_AppCommon`/`msdynce_PortalPrivacyExtensions` non risolvibile in questo ambiente).
    Rimuovere del tutto il nodo `<MissingDependencies>` cambia l'errore in
    `Solution manifest import: FAILURE: Object reference not set to an instance of an object.`
    (NullReferenceException lato piattaforma): la soluzione che ha funzionato è **lasciare un
    `<MissingDependencies />` vuoto** (nodo presente ma senza figli) invece di ometterlo o
    popolarlo con le voci originali.
  - Per evitare di toccare/rischiare la solution `ASPENPOCRibbon` esistente (bloccata comunque
    dal problema sopra), il tasto è stato deployato tramite una **nuova solution unmanaged
    isolata e minimale**, creata da zero, `AgicModificaCaricoRibbon`
    (cartella `05 - Power Platform/AssegnaFascicolo/ContactRibbonOnly_unpacked/`), con `contact`
    come unico root component (`behavior="2"`, RibbonDiffXml popolato con `CustomAction` +
    `CommandDefinition` + `DisplayRule`/`CustomRule`). Import riuscito, `RetrieveEntityRibbon`
    confermato con il pulsante presente e funzionante.
  - Location verificata (non "a manuale") tramite `RetrieveEntityRibbon` sul form Contact live:
    `Mscrm.Form.contact.MainTab.Actions.Controls._children`. Icona: nuovo webresource SVG
    `agc_modificacarico_icon.svg` (matita), `ModernImage="$webresource:agc_modificacarico_icon.svg"`.
    Sequence finale `15` (tra "Chiudi", Sequence 9, e il flyout "Processo", Sequence 62) per
    posizionare il tasto più a sinistra nella command bar, come richiesto dall'utente dopo il primo
    test (che lo mostrava per ultimo, Sequence 100).

### Verifica end-to-end
Testato più volte su record reali (incl. contatto "Laura Verdi" e un test finale dall'utente
stesso da browser con utente amministratore): tasto visibile solo a System Administrator, dialog
con nome magistrato e carico attuale popolati correttamente, salvataggio aggiorna
`agc_caricoattuale` e crea il record di audit in `agc_modificacarico` con valore precedente,
nuovo valore, nota, `createdby`/`createdon`. Dati di test ripristinati/puliti dopo ogni verifica.

### File toccati
- `05 - Power Platform/Plugin-Custom-API/ModificaCaricoMagistratoPlugin.cs` (nuovo)
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_modificacarico.js` (nuovo)
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_modificacaricodialog.html` (nuovo)
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_modificacarico_icon.svg` (nuovo)
- `05 - Power Platform/AssegnaFascicolo/ContactRibbonOnly_unpacked/` (nuovo — solution isolata
  `AgicModificaCaricoRibbon`, source of truth per il ribbon del tasto Modifica Carico)

### Ambiente live (`lccministerogiustiziademo.crm4.dynamics.com`)
- Tabella `agc_modificacarico` (creata manualmente dall'utente in Maker Portal)
- Plugin assembly `Plugin-Custom-API` (`5cd6cdfb-e163-f111-ab0c-7ced8d72f54e`) aggiornato
- `plugintype` `AgicAspen.Plugins.ModificaCaricoMagistratoPlugin`
  (`3dee2b2c-2bac-f111-aaab-7ced8d775612`)
- `customapi` `agc_ModificaCaricoMagistrato` (`e8f5ab3e-2bac-f111-aaab-7ced8d775612`)
- Webresource `agc_modificacarico.js` (`e62e55c2-2bac-f111-aaab-7ced8d775612`),
  `agc_modificacaricodialog.html` (`ea2e55c2-2bac-f111-aaab-7ced8d775612`),
  `agc_modificacarico_icon.svg` (`411120f1-33ac-f111-aaab-7ced8d71a68d`)
- Solution `AgicModificaCaricoRibbon` (nuova, contiene solo `contact` come root component)

---

## Session 2026-09-08 (cont. 3) — Blocco assegnazione manuale con esonero Totale + fix carico prima assegnazione + coefficiente esonero Parziale

### Requisito cliente
Impedire l'assegnazione manuale (dal form Fascicolo) di un fascicolo ad un magistrato con
esonero **Totale** attivo, con messaggio di avviso bloccante (a differenza della riserva GUP,
qui non esiste "assegna comunque").

### Implementazione (`agc_assignfascicolo.js`)
- Nuova funzione `verificaEsoneroTotale(candidatoContactId)`: interroga `agc_esonero` per un
  esonero Totale (tipo 1) attivo (stato 1) alla data odierna per il magistrato candidato.
- Hook in `formContext.data.entity.addOnSave` (dentro `onFormLoad`): se il magistrato selezionato
  cambia rispetto a quello già in salvataggio (sia prima assegnazione sia riassegnazione) e ha
  esonero Totale attivo, il salvataggio viene annullato (`preventDefault`) e si apre
  `Xrm.Navigation.openAlertDialog` con titolo "Assegnazione non consentita". Il messaggio include
  ora anche la **data di fine esonero** (formattata gg/mm/aaaa) o "a tempo indeterminato" se
  `agc_datafine` è vuoto.
- Flag `esoneroTotaleBypass` per evitare di ri-eseguire il controllo sul resave programmatico
  dopo un controllo riuscito.

### Individuazione form corretto (problema di deploy, non di codice)
La form "Informazioni" di `agc_fascicolo2` esiste **duplicata** in questo ambiente
(`a1b2c3d4-e5f6-7890-abcd-ef1234567890` e `b41ca47e-38b5-4fcf-85a2-afb9efe1fac8`): solo la
seconda è quella effettivamente renderizzata (verificato con
`Xrm.Page.ui.formSelector.getCurrentItem().getId()`). L'handler OnLoad che carica
`agc_assignfascicolo.js` è stato aggiunto a questa form corretta. Lezione: quando un event
handler sembra "non funzionare" nonostante il webresource sia deployato correttamente, verificare
sempre quale form è realmente in uso prima di sospettare problemi di cache/pubblicazione — in
questo ambiente esistono anche scritture Web API su `webresource`/`systemform` che vengono
silenziosamente **ripristinate** (200/204 ma valore invariato al successivo GET): l'unico modo
affidabile per persistere modifiche a componenti di solution è l'editor UI di make.powerapps.com
(clipboard paste per il contenuto file, editor Form Designer per gli event handler).

### Bug scoperto e corretto: carico non aggiornato alla prima assegnazione
`aggiornaCaricoRiassegnazione` veniva invocata solo se `origMagId` (magistrato già presente al
caricamento della form) non era nullo — quindi funzionava per le **riassegnazioni** (A → B) ma
**mai per la prima assegnazione** di un fascicolo senza magistrato. Corretto: il decremento del
vecchio magistrato ora è condizionale (`Promise.resolve()` se non c'era un magistrato precedente),
mentre l'incremento del nuovo magistrato avviene sempre.

### Nuova logica: coefficiente di carico per esonero Parziale
Chiarito con l'utente il funzionamento corretto (in precedenza il coefficiente era usato solo per
il confronto "chi ha meno carico", non per il valore persistito): un magistrato con esonero
**Parziale** attivo al momento dell'assegnazione vede il **peso del fascicolo assegnato
aumentato** proporzionalmente alla percentuale di esonero (es. esonero 30% → un fascicolo di peso
10 pesa 13 sul carico reale). Nessun esonero → carico invariato (+peso pieno). Esonero Totale →
bloccato (vedi sopra).
- Nuova funzione `ottieniCoefficienteCarico(candidatoContactId)`: restituisce `1 + percentuale/100`
  se il magistrato ha un esonero Parziale attivo oggi, altrimenti `1`.
- `aggiornaCaricoRiassegnazione` (assegnazione manuale dal form): il peso viene moltiplicato per
  il coefficiente prima di sommarlo al carico del nuovo magistrato. Il decremento dal vecchio
  magistrato (in caso di riassegnazione) resta a peso pieno (non si tiene uno storico di quale
  coefficiente fu applicato all'assegnazione originale).
- `openBulkAssignFromGrid` (assegnazione massiva/automatica): rimossa la doppia moltiplicazione a
  tempo di confronto (`pesoPer` ora è già il carico reale effettivo, aggiornato ad ogni
  assegnazione con `peso * coeffPer[scelto]`); il confronto per scegliere il magistrato con meno
  carico usa direttamente `pesoPer`.

### Verifica end-to-end (ambiente live `lccministerogiustiziademo.crm4.dynamics.com`)
- Creato esonero Totale di prova per Marco Bianchi → riassegnazione fascicolo RG-2026/0111 a
  Marco Bianchi → dialog "Assegnazione non consentita" mostrato correttamente, salvataggio
  bloccato, form rimasta "non salvata". Fascicolo e dati di test ripristinati/eliminati dopo il
  test.
- Utente ha verificato autonomamente sia il messaggio con data di fine esonero sia la correzione
  del carico (bugfix prima assegnazione + coefficiente esonero parziale): confermato funzionante.

### Deploy
Come nelle sessioni precedenti, il deploy del webresource è avvenuto tramite copia del contenuto
esatto del file locale negli appunti Windows (`Get-Content -Raw ... | Set-Clipboard`) e incolla
manuale nell'editor di codice del webresource su make.powerapps.com (l'utente collegato non ha
permessi di scrittura API diretta su `webresource`/`systemform` in questo ambiente).

### Esito
Blocco assegnazione manuale con esonero Totale, messaggio con data di fine esonero, bugfix carico
prima assegnazione e coefficiente esonero parziale: **tutti completati e verificati in
produzione**.

### Prossimi passi (nuovi requisiti raccolti in questa sessione, non ancora implementati)
1. **Tasto "Modifica carico" visibile solo agli amministratori** (ruolo di sicurezza esatto da
   definire con l'utente) sul form Contatto/Magistrato, che permetta di correggere manualmente
   `agc_caricoattuale` inserendo una **nota obbligatoria** a giustificazione. Valutare la
   creazione di una nuova tabella (es. `agc_modificacarico` o simile) per tracciare ogni modifica
   manuale (magistrato, valore precedente, nuovo valore, nota, utente, data) a fini di audit.
2. **Riallineamento punteggio al rientro da esonero Totale** (nuovo requisito, da specifica email
   ricevuta dal cliente — supera la decisione presa in una sessione precedente di "nessuna
   modifica algoritmica al rientro", che restava valida per gli esoneri **Parziali** ma va rivista
   per il Totale): alla chiusura di un esonero **Totale** (sospensione totale da data `dd1` a
   `dd2`), il punteggio/carico del magistrato rientrante M1 in data `dd2` va impostato uguale al
   punteggio che aveva in data `dd1` (`P(M1,dd1)`, già fotografato in `agc_punteggioalmomentoesonero`
   dal plugin `EsoneroRientroPlugin`) **rivalutato al carico attuale del "collega più simile"**:
   individuare M2 come il magistrato che, al momento dell'inizio dell'esonero (`dd1`), aveva il
   punteggio più vicino a `P(M1,dd1)`, e impostare `P(M1,dd2) = P(M2,dd2)` (il carico attuale di
   M2 alla data del rientro). Da progettare: dove/come fotografare il carico di **tutti** i
   magistrati a `dd1` (non solo M1) per poter individuare M2 in un secondo momento; probabile
   estensione del plugin `EsoneroRientroPlugin` o nuova logica scheduler-side. Questo si applica
   solo a esonero **Totale**, non Parziale (per il quale resta valida la decisione precedente di
   nessuna modifica algoritmica).

### File toccati
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js`

---

## Session 2026-09-08 (cont. 2) — Ricostruzione custom page "Home" dell'app ASPEN

### Contesto
Ambiente: `lccministerogiustiziademo.crm4.dynamics.com` (id `b420c516-4df1-ef0b-ba98-06dc0d1b6450`).
Solution **ASPEN POC** (id `0ddb9b10-3c63-f111-ab0d-e4fb1ef62741`). App model-driven **ASPEN**
(id `390ef80f-5163-f111-ab0c-7ced8d72f54e`, nome logico `agc_ASPEN`).

La custom page "Home" era stata eliminata in una sessione precedente durante un tentativo di
workaround per il **bug Microsoft** relativo a metadata orfani della tabella `agc_canestro` che
impediscono l'eliminazione di `agc_giudice` e modifiche di schema su `agc_fascicolo`.
**Il bug è tuttora aperto**, in attesa di verifica da parte del supporto Microsoft/Dynamics
(riferimento: email di Iwayemi Akinmoju, vedi anche `Risposta_MS_Support_EntityMap_Corruption.md`
in repo). In questa sessione si è quindi ricostruita la pagina Home da zero.

### Cosa è stato fatto
- Usato come blueprint di riferimento (sola lettura, non modificato) il file repo
  `05 - Power Platform\Model-Driven-App\AspenHomeCustomPage\Source\agc_aspenhome.pa.yaml`
  (429 righe) per estrarre con precisione controlli, proprietà, colori, posizioni e formule
  Power Fx originali.
- Ricostruzione pilotata via **Playwright** (browser Chrome reale via CDP, con login manuale
  dell'utente) su Power Apps Studio. **Scoperta chiave**: Studio accetta l'incolla (Ctrl+V) di
  definizioni di controlli in formato YAML Power Fx direttamente dalla clipboard di sistema —
  ha permesso di ricreare tutti i 31 controlli di Screen1 in un'unica operazione invece che uno
  per uno manualmente.
- Controlli ricreati: `lblHeroTitle`, `lblHeroSubtitle`; 3 card di navigazione (rettangoli
  `recCardDashboard` / `recCardList` / `recCardCreate` con icone, titoli, corpo testo e bottoni
  `btnCruscotto` / `btnAssegnaFascicolo` / `btnCreaFascicolo` con formule `OnSelect` → `Launch()`
  verso dashboard / vista lista entità / nuovo record); pannello KPI (`recStatsPanel` + 3
  divisori + 4 coppie titolo/valore con formule Power Fx `CountIf` / `CountRows(Filter(...))` /
  `Average` / `Sum`).
- Aggiunta la tabella dati **Fascicoli** (nome logico `agc_fascicolo2`) come data source di
  app/pagina.
- **Verifica di fedeltà**: i 4 KPI mostrano valori live (Fascicoli attivi: 31, Creati ultima
  settimana: 0, Peso medio: 12.9, Imputati totali: 216) quasi identici allo screenshot originale
  fornito dall'utente (`Homepage.png`: 31 / 0 / 12.2 / 216) → conferma alta fedeltà della
  ricostruzione.
- **Pubblicazione**: pagina custom pubblicata in Studio ("Pubblica" → "Pubblica questa
  versione"). App Designer salvato. Eseguito poi **"Pubblica tutte le personalizzazioni"** a
  livello di solution ASPEN POC, completato con successo → modifiche live per gli utenti finali.

### Gap noti / non risolti
1. **Colore di sfondo** dello schermo Home rimasto bianco puro `RGBA(255,255,255,1)` invece del
   valore di spec `RGBA(249,247,245,1)`: i tentativi di editare la formula bar in Studio non
   hanno avuto effetto visibile. Gap cosmetico minore, non bloccante.
2. **Posizione della voce "Home" nel menu di navigazione** dell'app: la pagina è stata
   auto-aggiunta al sitemap sotto il gruppo "Impostazioni" (fondo menu) invece che in posizione
   prominente come presumibilmente era l'originale (es. cima del gruppo "Operatività"). Il menu
   contestuale non offre lo spostamento cross-gruppo; servirebbe drag&drop manuale. Nessuna
   azione eseguita: da chiedere esplicitamente il parere dell'utente su dove riposizionarla.
3. I pulsanti di navigazione della pagina Home (Cruscotto, Fascicoli, Nuovo Fascicolo) sono
   stati creati con formule `Launch()` corrette ma **non ancora testati end-to-end** con click
   reali in ambiente pubblicato.

### Stato attuale
- Pagina Home ricostruita, pubblicata e live in produzione demo, con fedeltà dati confermata
  rispetto allo screenshot originale.
- Bug Microsoft su metadata orfani `agc_canestro` **ancora aperto**, in attesa Microsoft/Dynamics
  support.
- Da tenere presente: i vecchi "canestri" erano stati cancellati ma non del tutto proprio a causa
  di questo bug; l'utente ha ricreato nuovi canestri e sono stati riassegnati casualmente ai
  fascicoli esistenti.

### Prossimi passi
- Decidere con l'utente il riposizionamento della voce "Home" nel sitemap (gap #2).
- Tentare nuovamente la correzione del colore di sfondo (gap #1), eventualmente editando
  direttamente il file `.pa.yaml` sorgente e reimportando, se l'editor Studio continua a non
  applicare la formula.
- Testare end-to-end i 3 pulsanti di navigazione della Home page in ambiente pubblicato (gap #3).
- Seguire l'evolversi del ticket Microsoft sul bug `agc_canestro` / `agc_giudice` /
  `agc_fascicolo` e riprovare le operazioni di schema bloccate una volta risolto.

### File toccati
- Nessun file di repository modificato direttamente in questa sessione: il lavoro è stato
  eseguito interamente lato Power Apps Studio (online) tramite automazione Playwright, usando
  `agc_aspenhome.pa.yaml` solo come riferimento di lettura.

---

## Session 2026-09-08 (cont.) — Riallineamento punteggio al rientro dall'esonero (3.1, parte finale)

### Decisioni di design (confermate dall'utente)
- **Trigger**: sia chiusura manuale dello Stato Esonero (Attivo → Chiuso) sia chiusura
  automatica su scadenza Data Fine (flow schedulato).
- **Formula**: nessuna modifica algoritmica al carico al rientro — solo log/fotografia per
  audit/reportistica. Il riequilibrio tra colleghi avviene naturalmente tramite l'algoritmo a
  minor carico nelle assegnazioni successive (i magistrati con esonero totale non hanno ricevuto
  nuovi fascicoli, quindi il loro carico reale è già più basso; quelli con esonero parziale hanno
  comunque accumulato carico reale, solo confrontato a soglia maggiorata).
- **Implementazione**: plugin C# (per il "log" puntuale) + flow schedulato (per la chiusura
  automatica su scadenza).

### Nuovo campo `agc_punteggioalrientro` (Decimal) su `agc_esonero`
Aggiunto in simmetria al campo già esistente `agc_punteggioalmomentoesonero` (che finora non era
mai popolato da nessuna logica). Nessun impatto sul motore di assegnazione: solo dati di log.

### Nuovo plugin `EsoneroRientroPlugin.cs` (Plugin-Custom-API)
Registrato su **Update** di `agc_esonero`, Post-Operation (stage 40), filtrato sull'attributo
`agc_statoesonero`, con **PreImage** (`agc_statoesonero`, `agc_magistrato`) per confrontare stato
precedente/nuovo:
- Transizione verso **Attivo** (1): fotografa il carico attuale del magistrato
  (`contact.agc_caricoattuale`) in `agc_punteggioalmomentoesonero`.
- Transizione **Attivo → Chiuso** (rientro): fotografa il carico attuale in
  `agc_punteggioalrientro`. **Non modifica mai** `agc_caricoattuale`: il rientro è puramente
  informativo/di log, come da decisione utente.
- Altre transizioni (es. verso Annullato) ignorate.

Deploy: assembly `Plugin-Custom-API` (id `5cd6cdfb-e163-f111-ab0c-7ced8d72f54e`) ricompilato
(`dotnet build`, net462) e aggiornato via Web API (PATCH `content` in base64); creato nuovo
`plugintype` (`AgicAspen.Plugins.EsoneroRientroPlugin`, id `095b040c-60ab-f111-aaab-7ced8d71a68d`)
e nuovo `sdkmessageprocessingstep` (id `b06eaf18-60ab-f111-aaab-7ced8d71a68d`) con relativa
`sdkmessageprocessingstepimage` di tipo PreImage.

**Test end-to-end eseguito** su un esonero di prova (magistrata Laura Verdi, carico reale 81):
attivazione → `agc_punteggioalmomentoesonero = 81` ✅; carico modificato manualmente a 95
(simulando assegnazioni durante l'esonero parziale) → chiusura → `agc_punteggioalrientro = 95` ✅,
carico del magistrato rimasto invariato a 95 (nessuna modifica algoritmica) ✅. Record di test
eliminato, carico magistrato ripristinato a 81.

### Chiusura automatica su scadenza Data Fine — **richiede azione manuale nel Maker Portal**
La connessione Dataverse per Power Automate in questo ambiente non è ancora stabilita
(`connectionreferences` presente ma senza `connectionid`: richiede consenso OAuth interattivo,
non ottenibile via Web API). Creare quindi manualmente un flow schedulato:
1. Power Automate → Nuovo flow → **Flow schedulato**, ricorrenza giornaliera.
2. Azione **Elenca righe** (Dataverse) su tabella "Esonero", filtro:
   `agc_statoesonero eq 1 and agc_datafine lt '@{utcNow()}'` (o `Microsoft.Dynamics.CRM.On`/formato
   data compatibile OData).
3. **Applica a ciascuno** sul risultato → azione **Aggiorna riga** (Dataverse), tabella "Esonero",
   Id = riga corrente, campo "Stato Esonero" = Chiuso.
4. Salvare e attivare: la chiusura triggera automaticamente `EsoneroRientroPlugin` che fotografa
   `agc_punteggioalrientro`, senza ulteriore codice.

### Chiusura automatica — flow creato e testato
L'utente ha creato manualmente il flow cloud classico (Power Automate, non Copilot Studio Agent
Flow — valutata e scartata quest'ultima opzione per minore maturità ALM/solution-aware rispetto ai
cloud flow classici) e lo ha aggiunto alla solution ASPENPOC. Configurazione: ricorrenza
giornaliera → Elenca righe `agc_esonero` con filtro
`agc_statoesonero eq 1 and agc_datafine le '<oggi>'` → Applica a ciascuno → Aggiorna riga
(`agc_statoesonero = 2`).

**Test end-to-end eseguito** (record `TEST flow chiusura automatica`, creato con Data Fine = ieri
e Stato = Attivo, magistrata Laura Verdi): eseguito il flow manualmente → record chiuso
correttamente (`agc_statoesonero = 2`) → `EsoneroRientroPlugin` scattato sull'Update e popolato
`agc_punteggioalrientro = 81` (carico reale del magistrato). `agc_punteggioalmomentoesonero`
rimasto vuoto perché il record di test era stato creato già in stato Attivo via Create (il plugin
fotografa quel valore solo su una vera transizione via Update, come da design) — comportamento
atteso, non un difetto. Record di test eliminato dopo la verifica.

### Esito
Todo `3.1-riallineamento-punteggio` **completato end-to-end**: plugin di log su attivazione/rientro
+ flow schedulato di chiusura automatica, entrambi verificati in ambiente live.

---

## Session 2026-09-08 (cont.) — Allineamento commento `SetOwnerTeamPlugin` + estensione a `agc_rgnr`

### Verifica registrazione reale (live, `lccministerogiustiziademo.crm4.dynamics.com`)
Confermato via Web API (`sdkmessageprocessingsteps`) che `SetOwnerTeamPlugin` era registrato **solo**
su Create di `agc_fascicolo2` (Pre-Operation, sincrono) — il commento nel sorgente citava ancora
`agc_fascicolo` (deprecata) e `agc_canestro`, mai registrato per quest'ultima. Commento allineato al
comportamento reale.

### Estensione a `agc_rgnr`
Su richiesta cliente, stessa regola di ownership (assegnazione al default team della BU
dell'utente creatore) applicata anche alla creazione di `agc_rgnr` (entità `UserOwned`, supporta
ownership a team):
- Creato un nuovo `sdkmessageprocessingstep` (Create, Pre-Operation, sincrono, stage 20, rank 1)
  che punta allo stesso `plugintypeid` di `SetOwnerTeamPlugin`, filtrato su `agc_rgnr` (nessuna
  modifica al codice C# necessaria: la logica è già generica, agisce sul `Target` a runtime
  indipendentemente dall'entità).
- **Gap di sicurezza scoperto e risolto**: il primo test di creazione ha fallito con
  `Read Privilege Check For Owner failed ... missing prvReadagc_RGNR privilege` — il ruolo
  "Operatore ASPEN" (assegnato ai default team "Ministero della Giustizia" e "Tribunale di
  Messina") non aveva **nessun** privilegio su `agc_rgnr`. Aggiunti i 6 privilegi
  Create/Read/Write/Delete/Append/AppendTo a profondità **Local** (Business Unit), stessa
  profondità già in uso per `agc_Fascicolo2` sullo stesso ruolo (verificata via
  `RetrieveRolePrivilegesRole`).
- Ritest: creazione di un `agc_rgnr` di prova → assegnato correttamente al team "Ministero della
  Giustizia", nessun errore di privilegio; record di test eliminato subito dopo.

### Osservazione da approfondire (non risolta in questa sessione)
I default team di **Tribunale di Roma** e **Tribunale di Milano** non hanno **nessun ruolo di
sicurezza assegnato** (a differenza di "Ministero della Giustizia" e "Tribunale di Messina", che
hanno "Operatore ASPEN"). Se in futuro fascicoli/RGNR verranno effettivamente segregati su quelle
BU (oggi i dati demo sono tutti sotto la BU radice), gli utenti di quei tribunali dovranno avere
un ruolo di sicurezza equivalente assegnato (via team o direttamente) per poter leggere/scrivere i
record di cui il team risulta proprietario. Da verificare con il cliente prima del rollout multi-
tribunale.

### Esito
Todo completato: commento plugin allineato, regola di ownership per team estesa a `agc_rgnr`,
gap di privilegi sul ruolo "Operatore ASPEN" risolto. Nessuna modifica al codice C# del plugin
(solo alla registrazione in Dataverse e al ruolo di sicurezza); l'assembly non richiede
ricompilazione/redeploy.

---

## Session 2026-09-08 — Implementazione regola "Riserva GUP" (3.4, avviso non bloccante)

### Requisito cliente
Per un RGNR i cui fascicoli collegati sono tutti di ruolo GIP, deve sempre restare disponibile
almeno un magistrato del tribunale non ancora impegnato come GIP su quello stesso RGNR, per poter
eventualmente coprire un futuro fascicolo GUP collegato allo stesso procedimento. Ad ogni
assegnazione (automatica o manuale) deve partire una verifica: se l'assegnazione in corso
esaurirebbe l'ultimo magistrato disponibile del tribunale (tutti risulterebbero impegnati come GIP
sullo stesso RGNR), va mostrato un avviso non bloccante — l'utente può comunque procedere
confermando.

### Logica implementata (`verificaRiservaGup`, replicata in `agc_assignfascicolo.js` e
`agc_assignfascicolodialog.html`)
1. Si applica solo se il fascicolo in assegnazione ha un `agc_RGNR` valorizzato ed è di ruolo
   **GIP** (`agc_ruoloassegnazione = 0`); se è di ruolo GUP il controllo non si applica.
2. Se per lo stesso RGNR esiste già almeno un fascicolo di ruolo **GUP** con magistrato assegnato,
   la riserva è considerata già utilizzata/non più rilevante: nessun avviso.
3. Altrimenti si contano i magistrati **distinti** già assegnati come GIP sullo stesso RGNR e si
   aggiunge il candidato corrente (simulando l'assegnazione); si confronta con il totale dei
   magistrati (`agc_ismagistrato = true`) del tribunale (business unit proprietaria del
   fascicolo, `owningbusinessunit`). Se il conteggio simulato raggiunge il totale, l'assegnazione
   userebbe l'ultimo magistrato disponibile: si mostra l'avviso.
4. Non si applica alle assegnazioni per **continuità RGNR** (stesso magistrato già usato per
   fratelli dello stesso RGNR): riutilizzare lo stesso magistrato non consuma nuova riserva.

### Punti di integrazione
- **Assegnazione singola** (`agc_assignfascicolodialog.html`): dopo aver calcolato il candidato a
  minor carico, verifica la riserva; se scatta l'avviso usa `window.confirm` (pagina standalone),
  annullando l'assegnazione se l'utente rifiuta.
- **Assegnazione massiva** (`agc_assignfascicolo.js`, `openBulkAssignFromGrid`): verifica per ogni
  fascicolo non di continuità nella catena sequenziale; se scatta l'avviso usa
  `Xrm.Navigation.openConfirmDialog` — se l'utente rifiuta, il fascicolo viene saltato (conteggio
  `skippedCount` nel riepilogo finale) e si passa al successivo.
- **Riassegnazione manuale da form** (`onFormLoad`, handler `addOnSave`): intercetta il
  salvataggio con `eventArgs.preventDefault()` quando il magistrato lookup cambia verso un
  fascicolo GIP con RGNR; se la verifica scatta l'avviso, mostra `openConfirmDialog` e, solo se
  confermato, ri-esegue `formContext.data.save()` (con flag di bypass per evitare loop/doppio
  controllo) per completare salvataggio + aggiornamento carico monotono già esistente. Se
  l'utente annulla, il salvataggio resta sospeso (form ancora dirty).

### Verifica schema live (`lccministerogiustiziademo.crm4.dynamics.com`, solution `ASPENPOC`)
Confermato via Web API: `agc_fascicolo2.agc_rgnr` (lookup), `agc_ruoloassegnazione` (picklist,
0=GIP/1=GUP), `owningbusinessunit`; `contact.agc_ismagistrato` (bool), `owningbusinessunit`. Le
business unit esistenti (Tribunale di Roma/Messina/Milano) sono il modello di "tribunale" già
usato per la segregazione (3.8); nei dati di test attuali tutti i magistrati/fascicoli sono ancora
sotto la BU radice "Ministero della Giustizia" (nessun dato demo segregato per tribunale), ma la
logica usa comunque il campo `owningbusinessunit` del fascicolo per restare corretta quando i dati
verranno distribuiti sulle BU dei tribunali.

### Verifica e deploy
Sintassi verificata con `node --check` su entrambi i file. Web resource aggiornati via Web API
(`webresourceset` PATCH `content` + `PublishXml`) sui due file (`agc_assignfascicolo.js`,
`agc_assignfascicolodialog.html`). Query OData della nuova logica testate in sola lettura contro
l'ambiente live (nessun dato modificato) per verificarne la correttezza sintattica.

### Esito
Regola di riserva GUP implementata come avviso non bloccante su tutti e tre i canali di
assegnazione (singola, massiva, manuale da form). Non implementato: un blocco reale/obbligatorio
(esplicitamente escluso dal requisito, che chiede solo l'avviso) e la segregazione effettiva dei
dati demo per tribunale (dato di test, non blocca la funzionalità).

---

## Session 2026-08-28 (sera) — Fix grafico "Fascicoli per Stato" (Magistrato/Canestro vuoti) e ripristino Hide "Chiudi Caso"

### Segnalazione utente
1. Nel modal di drill-down del grafico a torta "Fascicoli per Stato" (dashboard "Cruscotto ASPEN"), le colonne **Magistrato** e **Canestro** risultavano sempre vuote (`—`).
2. Il pulsante **"Chiudi Caso"** era ancora visibile nella form del fascicolo, nonostante fosse stato nascosto e verificato nella sessione del 2026-08-27.

### ⚠️ Falsa pista iniziale (corretta nella stessa sessione)
Prima analisi basata su `AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/Entity.xml` (locale) aveva erroneamente suggerito che il campo corretto fosse `agc_magistratoassegnato` invece di `agc_magistratocontatto`. **Quell'Entity.xml è stale**: non è mai stato rigenerato dopo la migrazione Magistrati→Contatti del 2026-08-27 (l'export completo della solution resta bloccato dal problema di metadati orfani). Il codice sorgente (`StatoFascicoliChart/index.ts`) era già corretto con `agc_magistratocontatto`; la modifica errata è stata individuata e ripristinata prima del deploy, controllando `SESSION_NOTES.md` stessa (righe sessione 2026-08-27).

### Causa reale — Magistrato/Canestro vuoti
Due problemi concorrenti, entrambi diagnosticati via Web API (`az account get-access-token` + Invoke-RestMethod su `lccministerogiustiziademo.crm4.dynamics.com`):
1. **View "Fascicoli 2 (tutti) (Cruscotto)"** (`savedqueryid 3c5b46e1-db79-f111-ab0e-70a8a581677c`, bindata a `StatoFascicoliChart` sul dashboard) aveva l'attributo `agc_canestrofascicolo` nel `fetchxml` ma **non** come `<cell>` nel `layoutxml` — stesso identico bug già risolto in precedenza per l'altra view del cruscotto (`9cdb22db...`, usata da `CaricoMagistratiChart`), ma il fix non era mai stato applicato a questa seconda view. Fix: `PATCH savedqueries(...)` con `layoutxml` aggiornato (cella `agc_canestrofascicolo` aggiunta, stesso ordine/pattern dell'altra view) + `PublishXml`.
2. **Bundle JS deployato per il PCF `StatoFascicoliChart` (`cc_AgicAspen.StatoFascicoliChart/bundle.js`, webresourceid `8ecdd1f4-f6f2-483a-80a6-b6ec38b6330c`) era stale**: `modifiedon` risultava 07/07/2026, cioè **precedente** alla migrazione Contatti del 27/08. Verificato via ispezione del contenuto (`content` base64 decodificato): il bundle live conteneva ancora il vecchio nome campo `agc_magistratoassegnato` e **non** `agc_magistratocontatto`, nonostante il sorgente locale fosse già corretto da settimane — non era mai stato ricompilato/ripubblicato dopo quella modifica. Fix: rebuild (`npm run build` nella cartella multi-progetto `PCF-Pie`, non nella sottocartella del singolo controllo) + `PATCH webresourceset(...)` con il nuovo `bundle.js` in base64 + `PublishXml`. Verificato dati Dataverse: tutti i 31 record `agc_fascicolo2` hanno effettivamente magistrato e canestro valorizzati (query REST con header `Prefer: odata.include-annotations="*"` per leggere i valori formattati dei lookup).

### Causa reale — "Chiudi Caso" ancora visibile
La `HideCustomAction` per `agc_fascicolo2` era già presente nel sorgente locale (`AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/RibbonDiff.xml`, aggiunta il 27/08) ma **non risultava effettivamente applicata in ambiente** — verificato con l'azione `RetrieveEntityRibbon` (risposta zip con `RibbonXml.xml`, non gzip: va estratta con `Expand-Archive`, non `GZipStream`), che mostrava il bottone "Chiudi Caso" senza alcuna entry di hide associata. Probabile causa: una reimportazione successiva della solution `AgicAspenRibbon` (o di altre solution che toccano la stessa customizzazione) ha sovrascritto la modifica. Fix: rieseguito il workaround già documentato — `pac solution pack` direttamente dalla cartella `AgicAspenRibbon_unpacked` (spostando temporaneamente fuori la cartella `Entities/agc_Fascicolo`, non referenziata come RootComponent in `Solution.xml` e che altrimenti fa fallire la validazione "RootComponent validation failed" del packer) seguito da `pac solution import --publish-changes --async false`. Import verificato riuscito (`importjobs`, `entityRibbon` con `result="success"` per `agc_Fascicolo2`).
**Nota per il futuro**: `RetrieveEntityRibbon` mostra sempre il nodo `<Button>` originale anche quando una `HideCustomAction` valida lo nasconde — l'occultamento è applicato lato client in fase di rendering, non rimuove il nodo dalla risposta dell'azione. Non è quindi un metodo valido per verificare se l'hide funziona; l'unica verifica affidabile resta il test in browser (con eventuale pulizia service worker/cache, causa già nota di falsi negativi in sessioni precedenti).

### Esito
- Nessuna modifica netta ai file sorgente tracciati in git (il codice `StatoFascicoliChart` e i `RibbonDiff.xml` erano già corretti; i problemi erano tutti lato ambiente/deploy).
- Modifiche live: `savedqueries(3c5b46e1-...)` (layoutxml + publish), `webresourceset(8ecdd1f4-...)` bundle.js (rebuild + publish), solution `AgicAspenRibbon` reimportata e pubblicata.

### Aggiornamento — "Chiudi Caso" ancora visibile dopo il primo redeploy (HideCustomAction inefficace)
L'utente ha confermato il grafico corretto (e di aver corretto autonomamente, lato form principale `agc_fascicolo2`, una lookup "Magistrato" ancora puntata alla vecchia tabella `agc_giudice` invece di `contact`), ma il pulsante "Chiudi Caso" restava visibile anche dopo il reimport della solution `AgicAspenRibbon` con la `HideCustomAction`. **Causa**: `HideCustomAction` non ha rimosso il bottone dal merge live (confermato ripetendo `RetrieveEntityRibbon` post-import: il `<Button>` "Chiudi Caso" risultava ancora presente, senza alcuna traccia dell'hide) — evidentemente inefficace per un bottone custom creato nello stesso file di diff. **Fix definitivo**: rimossi del tutto da `RibbonDiff.xml` (`AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/`) la `CustomAction`/`Button` "Chiudi Caso", la `CommandDefinition` e la `EnableRule` associate (oltre alla `HideCustomAction`, ormai inutile) — il bottone non viene proprio più generato, invece di essere nascosto. Ripetuto pack (con lo stesso workaround di esclusione temporanea della cartella `agc_Fascicolo`) + import + publish. **Verificato**: `RetrieveEntityRibbon` post-deploy non contiene più alcun riferimento a "Chiudi" nell'XML della ribbon di `agc_fascicolo2` — rimozione confermata lato server (più affidabile della verifica precedente basata su Hide). Il webresource JS (`agc_assignfascicolo.js`, funzioni `openCloseDialog`/`isCloseEnabledForm`) non è stato toccato: resta come codice morto innocuo, non più referenziato da alcun comando.

---

## Session 2026-08-28 (cont.) — Rimozione dipendenze `agc_giudice` (Magistrato legacy) e apertura ticket Microsoft Support per corruzione EntityMap

### Contesto
Proseguimento del tentativo di eliminare la tabella legacy `agc_giudice` ("Magistrato"), sostituita dal nuovo modello di assegnazione su `agc_fascicolo2`/`contact`. Il tentativo di `DELETE EntityDefinitions(LogicalName='agc_giudice')` falliva citando fino a 13 componenti referenzianti; obiettivo della sessione è stato ridurre progressivamente questo numero risolvendo ogni dipendenza reale.

### Dipendenze risolte con successo
1. **Canvas App "ASPEN_DefaultCommandLibrary"** (`ca8c900c-4851-4c1a-8bdd-0badbb28c2ed`): rimossa la formula rotta `IsBlank(Self.Selected.Item.agc_Magistratoassegnato)` sul componente "Assegna Fascicolo_1" e, soprattutto, rimossa la **data source "Magistrati"** registrata nell'app (la vera causa della dipendenza — una data source può essere tracciata anche se non più referenziata in alcuna formula visibile). Salvato e pubblicato.
2. **App Module "ASPEN"** (`390ef80f-5163-f111-ab0c-7ced8d72f54e`): rimosse dall'App Designer (tab Pagine) le pagine "Visualizzazione Magistrati", "Modulo Magistrati" (sezione Anagrafiche) e "Visualizzazioni di Magistrato"/"Moduli Magistrato" (sezione Tutte le altre pagine). Dopo la rimozione, la tabella "Magistrato" è scomparsa automaticamente dalla lista "Nell'app" (tab Dati) senza necessità di rimozione manuale. Salvato e pubblicato con "Salva e pubblica".
   - Nota: l'azione Web API `RemoveAppComponents` (tentata in una sessione precedente) **non elimina realmente** la riga `appmodulecomponents` — tocca solo `modifiedon`/`versionnumber`. L'unico modo efficace per rimuovere la registrazione di una tabella da un'app model-driven è tramite il flusso UI dell'App Designer (rimuovere prima tutte le pagine/dashboard che la referenziano).
   - Verificato via `RetrieveDependenciesForDelete(ComponentType=1,ObjectId=<guid>)`: il conteggio blocchi è sceso da 3 a 2 (Canvas App risolta) e poi da 2 a 1 (AppModule risolto). Il conteggio grezzo dell'errore `DELETE EntityDefinitions` è sceso in parallelo da 13 → 12 → 11 → 4.

### Dipendenza NON risolvibile: relazione `agc_fascicolo_Magistratoassegnato_agc_giudice`
Rimane l'ultima dipendenza reale: la relazione legacy `agc_fascicolo_Magistratoassegnato_agc_giudice` (MetadataId `48621705-4f63-f111-ab0d-e4fb1ef62741`), confermata dal Ministero come "vecchia assegnazione" e quindi eliminabile senza impatto funzionale. Il tentativo di `DELETE RelationshipDefinitions(SchemaName='agc_fascicolo_Magistratoassegnato_agc_giudice')` fallisce però con:

```
0x80072343 — SqlException: Invalid column name 'agc_CanestroName'.
```

Questo è **lo stesso identico errore** già diagnosticato da un'analisi approfondita (agente in background, ~45 tentativi documentati) su una corruzione preesistente e indipendente: la tabella `agc_canestro` ("Canestro fascicolo") è un'entità "zombie" residua di un flusso di table-recycle-bin interrotto (metadati presenti, tabella SQL fisica assente), e il lookup `agc_canestro` su `agc_fascicolo` punta a un ID di relazione fantasma (`cb984bf8-e237-43fe-bf30-1f8a3daae1ad`) non più esistente. Questo corrompe il generatore automatico della vista SQL filtrata `Filteredagc_Fascicolo`, che referenzia una colonna fisica (`agc_CanestroName`) non più presente nel database — bloccando **qualsiasi** modifica di schema su `agc_fascicolo`, non solo quelle relative a `agc_giudice`.

Sono stati esclusi tutti i percorsi di risoluzione disponibili via API pubbliche (OData e SOAP): eliminazione diretta di attributi/attributemap/entitymap, ricreazione della relazione fantasma, creazione manuale della colonna fisica mancante (fallita con "nome già esistente" — disallineamento metadati↔storage fisico non risolvibile lato client), patch di flag di sistema, ecc. Tutti i tentativi e gli errori esatti sono documentati nella bozza del ticket.

### Esito
**Ticket di supporto Microsoft aperto** (dal cliente, sessione 2026-08-28) usando la bozza tecnica preparata in questa sessione — vedi `Ticket-Supporto-Microsoft-EntityMap-Corruption.md` (salvato nel workspace di sessione, non nel repository) per il contenuto completo: ID esatti di tutti i componenti coinvolti, errore SQL riprodotto, tabella di tutti i tentativi falliti, e le 4 richieste esplicite di intervento backend a Microsoft.

**Stato residuo**: `agc_giudice` non ancora eliminabile (bloccato solo dalla relazione legacy, a sua volta bloccata dal bug della vista su `agc_fascicolo`). `agc_canestro` e `agc_fascicolo` restano nello stato corrotto in attesa della risposta del supporto Microsoft. Nessun'altra azione è possibile lato codice/API fino all'intervento Microsoft; da riprendere quando il ticket verrà evaso.

---

## Session 2026-08-28 (cont.) — Implementazione punto 3.4 "Ruolo GIP/GUP e riserva GUP" (parziale)

### Modifica dati
Il Ministero ha chiarito che il ruolo GIP/GUP non è un attributo stabile del magistrato, ma un attributo dell'assegnazione del fascicolo (lo stesso magistrato può fare da GIP su un fascicolo e da GUP su un altro). Creato nuovo campo picklist `agc_ruoloassegnazione` (0=GIP, 1=GUP) su `agc_fascicolo2`, aggiunto al form principale subito dopo "Magistrato assegnato". Migrati i 31 fascicoli già assegnati, copiando il valore corrente di `agc_ruolomagistrato` dal magistrato collegato.

Il vecchio campo `agc_ruolomagistrato` su `contact` è stato **lasciato invariato** (nessuna rimozione/deprecazione formale) perché il motore di assegnazione non lo utilizzava già in alcuna logica (verificato: nessun riferimento in `agc_assignfascicolo.js`/`agc_assignfascicolodialog.html`), quindi non c'è stato impatto sul comportamento esistente. Valutare con il cliente se e quando ritirare il campo su `contact`.

### Cosa NON è stato implementato: regola di riserva GUP
Il resoconto (`aspen_resoconto_modifiche.pdf`) elenca esplicitamente "Definire regola esatta della riserva GUP e casi in cui deve bloccare una proposta di assegnazione" tra le **"Decisioni da prendere"** (non tra le risoluzioni già chiarite) — la regola non è ancora definita dal Ministero, quindi non è stata implementata alcuna logica di blocco/candidabilità per la riserva. Il conteggio del carico resta cumulato (non separato per ruolo), come da indicazione esplicita del resoconto stesso.

### Esito
Todo `impl-ruolo-assegnazione` completato per la parte modellabile senza input aggiuntivo del cliente (spostamento campo + migrazione). La regola di riserva GUP resta backlog aperto, da chiarire nella demo tecnica con il Ministero come indicato nel resoconto.

---

## Session 2026-08-28 (cont.) — Implementazione punto 3.11 "Carico monotono"

### Regola cliente
La chiusura di un fascicolo non deve mai far diminuire il carico del magistrato; solo una riassegnazione esplicita (fascicolo spostato da un magistrato A a un magistrato B) deve decrementare il carico di A (e incrementare quello di B). Il vecchio motore calcolava il carico dinamicamente come `SUM(agc_pesocalcolato)` sui fascicoli non chiusi assegnati, quindi la chiusura di un fascicolo faceva scendere il carico — violando la regola.

### Modifica dati
Aggiunto un nuovo campo persistito `agc_caricoattuale` (Decimal, minimo 0) su `contact`. Effettuato un backfill una tantum per i 6 magistrati esistenti, usando il valore di carico calcolato dinamicamente fino a quel momento come baseline: Laura Verdi=51, Anna Greco=51, Marco Bianchi=41, Paolo Russo=36, Alessia Gialli=43, Chiara Marini=49.

### Modifica motore di assegnazione
- **Assegnazione singola** (`agc_assignfascicolodialog.html`): il carico dei magistrati viene ora letto direttamente da `agc_caricoattuale` (non più ricalcolato sommando i fascicoli). Al momento dell'assegnazione (sia per continuità RGNR che per algoritmo a minor carico), un nuovo helper `incrementaCaricoMagistrato(contactId, delta)` legge il valore corrente e lo aggiorna sommando il peso del fascicolo appena assegnato.
- **Assegnazione massiva** (`agc_assignfascicolo.js`, `openBulkAssignFromGrid`): stessa logica — la query iniziale sui magistrati include `agc_caricoattuale`, rimossa la query di aggregazione sui fascicoli non chiusi. Il carico reale (`pesoPer`, separato dal coefficiente di esonero usato solo per il confronto) viene incrementato e persistito su `contact` dopo ogni assegnazione nella catena sequenziale, così le assegnazioni successive nello stesso lotto vedono il carico aggiornato.
- **Riassegnazione (decremento)**: poiché il pulsante "Assegna Fascicolo" si disabilita quando il fascicolo ha già un magistrato, la riassegnazione avviene modificando direttamente il campo lookup `agc_magistratocontatto` sulla form. Aggiunto un handler `addOnSave` in `onFormLoad` (`agc_assignfascicolo.js`) che cattura il magistrato originale al caricamento della form e, se al salvataggio il valore è cambiato verso un magistrato diverso e non nullo, decrementa (mai sotto zero) il carico del vecchio magistrato del peso del fascicolo e incrementa quello del nuovo.

### Esito
Todo `impl-carico-monotono` completato. Non ancora definito dal Ministero il carico di partenza per un nuovo magistrato assunto in futuro — non blocca l'implementazione attuale, da chiarire quando si presenterà il caso.

---

## Session 2026-08-28 (cont.) — Implementazione punto 3.3 "Continuità fascicolo stesso magistrato"

### Logica implementata
In entrambi i motori di assegnazione (`agc_assignfascicolodialog.html` per la singola assegnazione, `agc_assignfascicolo.js` per la massiva):
- **Assegnazione singola**: prima di calcolare il candidato per carico, si verifica se il fascicolo ha un `agc_RGNR` valorizzato; in tal caso si cerca un fascicolo "fratello" (stesso RGNR) già assegnato. Se trovato e il magistrato non è stato marcato come incompatibile in questo dialog, si assegna direttamente a quel magistrato (bypassando il calcolo del carico) e si comunica "Assegnato per continuità RGNR".
- **Assegnazione massiva**: si costruisce prima una mappa RGNR→magistrato dai fascicoli già assegnati, poi durante l'assegnazione sequenziale ogni fascicolo con RGNR noto in mappa viene assegnato allo stesso magistrato (se ancora tra i candidati compatibili/non in esonero totale); la mappa viene aggiornata man mano che si procede, così più fascicoli dello stesso RGNR nello stesso lotto restano coerenti tra loro.
- Se il magistrato di continuità non è più un candidato valido (incompatibile nel dialog singolo, o escluso per esonero totale nel bulk), si ricade sul normale algoritmo a minor carico.

### Esito
Todo `impl-continuita-fascicolo` completato. Nessun campo "motivo eccezione" è stato aggiunto (non richiesto esplicitamente nel resoconto oltre alla regola stessa) — da valutare se il Ministero richiede tracciabilità del perché si è derogato alla continuità.

---

## Session 2026-08-28 (cont.) — Implementazione punto 3.2 "Modello RGNR padre / RG GIP-GUP figlio"

### Modello dati
Creata tabella `agc_rgnr` (Registro Generale Notizie di Reato): `agc_name` (numero RGNR, primaria), `agc_annoregistro` (integer), `agc_note` (memo). Aggiunta relazione 1:N `agc_rgnr_agc_fascicolo2_RGNR` con lookup `agc_RGNR` su `agc_fascicolo2` — **non obbligatorio**, per retrocompatibilità con i fascicoli esistenti privi di RGNR. Il campo esistente `agc_numeroregistrogenerale` (stringa) resta sul fascicolo per il numero di RG specifico GIP/GUP; `agc_rgnr` rappresenta il procedimento padre a cui più fascicoli GIP/GUP possono fare riferimento.

Form `agc_rgnr` costruita con sezione anagrafica + tab "Fascicoli GIP/GUP collegati" con subgrid (vista "Visualizzazione associata Fascicolo 2", relazione `agc_rgnr_agc_fascicolo2_RGNR`). Aggiunto il campo lookup RGNR alla form principale di `agc_fascicolo2`, subito dopo il numero RG.

### Nota di design
Questa modellazione è la base abilitante per **impl-continuita-fascicolo** (3.3): la regola "stesso fascicolo → stesso magistrato" può ora essere implementata interrogando i fascicoli con lo stesso `agc_RGNR` e verificando/forzando lo stesso `agc_magistratocontatto`, con un campo "motivo" per l'eccezione ancora da aggiungere quando si implementerà quella regola.

### Esito
Todo `impl-rgnr-model` completato. Non ancora popolato retroattivamente il campo RGNR sui fascicoli esistenti (nessun dato storico di raggruppamento disponibile per farlo in modo automatico) — valutare migrazione dati separata se necessario.

---

## Session 2026-08-28 (cont.) — Implementazione punto 3.1 "Esoneri e sospensioni"

### Tabella `agc_esonero` (nuova, ambiente `LCC-MINISTEROGIUSTIZIA-DEMO`, solution `ASPENPOC`)
Campi: `agc_name` (primaria), `agc_magistrato` (lookup → contact, required), `agc_tipoesonero` (picklist: 1=Totale, 2=Parziale), `agc_percentualeesonero` (decimal, per esoneri parziali), `agc_datainizio`/`agc_datafine` (DateOnly), `agc_statoesonero` (picklist: 1=Attivo, 2=Chiuso, 3=Annullato), `agc_note` (memo), `agc_punteggioalmomentoesonero` (decimal, riservato a logica futura di riallineamento). Relazione `agc_contact_agc_esonero_Magistrato`.

Form principale (`80d6c6f2-b3d6-42aa-92c0-d7287d0f9753`) ricostruita a mano via PATCH `systemforms` per includere tutti i campi custom (il form di default auto-generato da Dataverse conteneva solo nome + proprietario). Aggiunta una tab "Esoneri" con subgrid (vista "Visualizzazione associata Esonero") sul form "Contatto - Magistrato" (`ff4a3cde-18a2-f111-aaac-7c1e52764872`) per visibilità diretta degli esoneri di ogni magistrato.

### Business rule "Nascondi Percentuale Esonero se Totale" (form principale `agc_esonero`)
Creata e attivata via Business Rule Designer classico sul form principale: `SE Tipo Esonero uguale a "Totale" ALLORA Nascondi campo Percentuale Esonero ALTRIMENTI Mostra campo Percentuale Esonero`. Il campo Percentuale Esonero ha senso solo per esoneri Parziali, quindi va nascosto quando Tipo Esonero = Totale. Verificato su record reale: cambiando Tipo Esonero in Totale il campo scompare correttamente.

### Logica motore di assegnazione (esclusione/coefficiente esonero)
Modificati sia `agc_assignfascicolodialog.html` (assegnazione singola, riscritta con `async/await` per maggiore leggibilità) sia `agc_assignfascicolo.js` (`openBulkAssignFromGrid`, assegnazione massiva):
- Prima del calcolo del candidato migliore, si interrogano gli esoneri con `agc_statoesonero = Attivo` e la data odierna compresa tra `agc_datainizio` e `agc_datafine` (quest'ultima opzionale = esonero senza termine).
- I magistrati con esonero **Totale** attivo vengono esclusi del tutto dalla candidatura.
- I magistrati con esonero **Parziale** attivo vedono il proprio carico calcolato moltiplicato per il coefficiente `1 + percentuale/100` (es. 30% di esonero ⇒ carico equivalente ×1.3) prima del confronto con gli altri candidati — il carico "reale" resta comunque accumulato normalmente per le assegnazioni successive.
- Il "riallineamento del punteggio al rientro dall'esonero" (campo `agc_punteggioalmomentoesonero` già predisposto) è **deferito**: richiede una decisione di design (flow schedulato vs plugin on-update) non ancora presa.

Web resource aggiornati e pubblicati via Web API (`webresourceset` PATCH content + `PublishXml`). Verificata la sintassi JS di entrambi i file (`node --check`) prima del deploy.

### Esito
Todo `impl-esoneri` completato. Prossimi: `impl-rgnr-model`, `impl-ruolo-assegnazione`, `impl-carico-monotono`, poi `impl-continuita-fascicolo`.

---

## Session 2026-08-28 — Analisi punto-per-punto `aspen_resoconto_modifiche.pdf` (gap analysis 3.1–3.12)

### Metodo
Confrontati i 10 punti del resoconto (sezione 3, pagg. 2-3) + i 2 punti aggiunti nelle sessioni precedenti (3.11 carico monotono, 3.12 user-vs-contact) con lo schema Dataverse effettivo dell'ambiente `LCC-MINISTEROGIUSTIZIA-DEMO`, interrogato via Web API (`EntityDefinitions`, `businessunits`). Tabelle custom esistenti: `agc_canestro`, `agc_canestrofascicolo`, `agc_configurazione`, `agc_fascicolo` (deprecata), `agc_fascicolo2`, `agc_giudice` (deprecata, sostituita da `contact`).

### Esito per punto

| # | Tema | Stato attuale | Gap rispetto al resoconto |
|---|------|---------------|----------------------------|
| 3.1 | Esoneri e sospensioni | **Non implementato** | Nessuna tabella Esoneri; nessuna logica di sospensione/riallineamento punteggio nel motore di assegnazione. |
| 3.2 | RGNR e RG GIP/GUP | **Parziale/non conforme** | `agc_fascicolo2` ha un solo campo `agc_numeroregistrogenerale` (stringa singola); manca il modello padre (RGNR)/figlio (fascicoli GIP-GUP) richiesto. |
| 3.3 | Stesso fascicolo → stesso magistrato | **Non implementato** | Nessun controllo di continuità per RGNR nel motore di assegnazione, nessun campo "motivo" per l'eccezione. |
| 3.4 | Ruolo GIP/GUP come attributo dell'assegnazione | **Modellato in modo non conforme** | `agc_ruolomagistrato` è oggi un campo su `contact` (attributo stabile del magistrato), mentre il Ministero ha chiarito che deve essere un attributo dell'**assegnazione/fascicolo**, non del magistrato. Nessuna regola di riserva GUP. |
| 3.5 | Canestri, pesi, soglie (matrice 2D) | **Parziale** | Esistono `agc_canestro`, `agc_canestrofascicolo`, `agc_configurazione` (usata per soglie peso). Manca la matrice a due dimensioni (tipo procedimento × natura reato) e una tabella "Matrice pesi" dedicata configurabile da UI. |
| 3.6 | Rettifica carico per motivi esogeni | **Non implementato** | Nessuna entità/maschera "Rettifica carico"; nessun campo per valore/segno/motivazione/validità temporale. |
| 3.7 | Incompatibilità e riassegnazioni manuali | **Non implementato** | Nessuna tabella incompatibilità; la riassegnazione manuale esiste solo come azione UI generica (ribbon "Assegna Fascicolo"), senza workflow motivato/audit strutturato. |
| 3.8 | Ambiente unico + segregazione per business unit | **Implementato** | Confermate business unit per tribunale (Roma, Messina, Milano) sotto un unico ambiente — coerente con la decisione architetturale richiesta. |
| 3.9 | Reportistica e stampe | **Parziale** | Dashboard "Cruscotto ASPEN" esiste (carico per magistrato, stato fascicoli) — base coperta. Manca tabella "Template stampa" per versione/tribunale/stato approvazione. |
| 3.10 | Integrazioni Regiweb/SICP | **Non iniziato** | Nessun componente di integrazione nel repo — coerente con la roadmap (Fase 4, non bloccante per il prototipo). |
| 3.11 | Carico monotono | **Non implementato** | Regola chiarita col cliente (il carico non deve scendere per chiusura, solo per riassegnazione) ma non ancora tradotta in logica nel motore di calcolo peso/carico. |
| 3.12 | User vs Contact (Opzione C) | **Chiuso in questa sessione** | Verificato che la lookup `contact → systemuser` esiste già (`agc_utenteassociato`) — vedi sessione successiva in ordine cronologico. |

### Osservazione principale
Il punto **3.4** rivela un disallineamento di modello non banale: `agc_ruolomagistrato` è oggi definito su `contact`, ma la specifica del Ministero richiede che il ruolo GIP/GUP sia un attributo dell'**assegnazione** (quindi su `agc_fascicolo2`, non su `contact`), perché uno stesso magistrato può ricoprire ruoli diversi su fascicoli diversi. Questo va segnalato esplicitamente al cliente prima di passare a implementazione, perché richiede un cambio di modello dati (nuovo campo su `agc_fascicolo2` + eventuale migrazione) non un semplice aggiustamento.

### Priorità consigliata per il prossimo lavoro implementativo (da roadmap Fase 1 — Prototipo settembre)
1. Tabella Esoneri (3.1) + moltiplicatore parziale nel motore pesi
2. Modello RGNR padre / RG GIP-GUP figlio (3.2) — impatta modello dati, da fare prima di 3.3
3. Continuità fascicolo → stesso magistrato (3.3), dipende da 3.2
4. Spostare Ruolo GIP/GUP da `contact` a `agc_fascicolo2` come attributo di assegnazione + regola riserva GUP (3.4)
5. Carico monotono (3.11) — regola già chiarita col cliente, solo da implementare

Nessuna implementazione di questi punti eseguita in questa sessione (task era la sola analisi/gap-analysis). Todo `analisi-resoconto-modifiche` chiuso come "analisi completata"; le implementazioni dei singoli punti restano backlog separato da pianificare con il cliente.

---

## Session 2026-08-28 — Verifica todo `fix-lookup-contact-usersu` (Opzione C)

### Esito
Verificato via Web API di Dataverse (`az account get-access-token` + `Invoke-RestMethod`, ambiente `LCC-MINISTEROGIUSTIZIA-DEMO`) che la lookup `contact → systemuser` prevista dall'Opzione C **esiste già** in produzione: campo `agc_utenteassociato` ("Utente associato"), già presente sulla form "Contatto - Magistrato". Il nome differisce da quello ipotizzato nella sessione precedente (`agc_utenteapplicativo`), ma lo scopo e il target (`systemuser`) coincidono — la voce di note precedente era quindi imprecisa/obsoleta.

Per errore, prima di scoprire il campo esistente, è stata creata una lookup duplicata (`agc_utenteapplicativo`, relationship `agc_contact_systemuser_UtenteApplicativo`, solution `ASPENPOC`); individuato l'errore, la relationship e l'attributo duplicati sono stati eliminati nella stessa sessione (nessuna traccia residua in Dataverse).

**Todo `fix-lookup-contact-usersu` chiuso: nessuna implementazione necessaria.** Prossimo passo: verificare se `agc_utenteassociato` è già valorizzato/collegato correttamente ai record `systemuser` dei magistrati esistenti (da affrontare nell'ambito di `fix-dashboard-magistrati-contact`, dato che il cruscotto dipende dal collegamento contact/magistrato).

### Metodo di lavoro (per riuso futuro)
`pac auth token` fornisce token solo per il resource `api.powerplatform.com`, non utilizzabile per la Web API dell'organizzazione Dataverse. Per operazioni dirette su metadati (creazione/eliminazione attributi, relationship, ecc.) via REST, usare invece `az account get-access-token --resource <org-url>` (stesso utente già autenticato su Azure CLI) e chiamare `https://<org>.crm4.dynamics.com/api/data/v9.2/...` con header `MSCRM.SolutionUniqueName` per assegnare il componente alla solution desiderata (solution principale del progetto: `ASPENPOC`).

### Todo `fix-dashboard-magistrati-contact` — risolto
Causa del "canestro vuoto nei drill-down" nel Cruscotto ASPEN: la view di sistema **"Fascicoli 2 aperti (Cruscotto)"** (savedqueryid `9CDB22DB-DB79-F111-AB0E-70A8A581677C`, usata dal dataset del PCF `CaricoMagistratiChart` sulla dashboard) aveva l'attributo `agc_canestrofascicolo` nel `fetchxml` ma **non** come colonna (`<cell>`) nel `layoutxml`. Il framework dataset dei PCF espone solo le colonne presenti nel layout della view, non tutti gli attributi del fetchxml — per questo `record.getFormattedValue("agc_canestrofascicolo")` tornava sempre vuoto nel modal di drill-down. Fix: aggiunta la cella mancante al `layoutxml` via Web API (`PATCH savedqueries(...)`) e pubblicato. Il binding `magistratoField → agc_magistratocontatto` (lookup a `contact`) sulla dashboard era già corretto, nessuna regressione lì.

### Todo `fix-caricopercanestro-form-contact` — risolto
Il PCF `agc_AgicAspen.CaricoPerCanestro` (mostra il carico per canestro del magistrato corrente, legge `context.page.entityId`) non era più presente su nessuna form dopo la migrazione. Riaggiunto sulla form **"Contatto - Magistrato"** (formid `ff4a3cde-18a2-f111-aaac-7c1e52764872`) tramite editing diretto del `formxml` via Web API: nuova cella con `<control>` bound al campo "dummy" `fullname` (come previsto dal manifest, che richiede un campo bound qualsiasi il cui valore non viene usato) + blocco `<controlDescriptions>` (sibling di `<tabs>`, non annidato dentro `<control>` — pattern verificato sul Cruscotto ASPEN) che referenzia `agc_AgicAspen.CaricoPerCanestro` per i 3 formFactor. Pubblicato e verificato.

---

## Session 2026-08-27 (pomeriggio/sera) — Fix regressioni post-migrazione Contatti + revisione modello Contact/User

### Contesto
Dopo la migrazione Magistrati → Contatti (vedi sessione 2026-08-27 sotto), l'utente ha segnalato 5 regressioni via screenshot e sollevato un dubbio architetturale: i magistrati accedono alla model-driven app tramite Entra ID con licenza personale, quindi a livello Dataverse dovrebbero autenticarsi come `systemuser`, non come `contact`. Uso di `contact` come "utente applicativo" è formalmente scorretto.

### Decisione architetturale presa con l'utente
Analizzate 3 opzioni (Opus): (A) tornare a `agc_giudice` + lookup a `systemuser`; (B) usare direttamente `systemuser` con colonne custom aggiunte; (C) mantenere `contact` come anagrafica arricchita, con una nuova lookup `contact → systemuser` per il collegamento all'utente applicativo. **Scelta: Opzione C** — nessun rollback della migrazione già fatta, aggiunta solo la lookup mancante (`agc_utenteapplicativo`, ancora da implementare — vedi todo `fix-lookup-contact-usersu`).

### Regressioni corrette in questa sessione
1. **Vista/colonna "Magistrato assegnato"** in Fascicoli aperti puntava ancora al vecchio Magistrato → causa: 6 viste salvate rimaste stale + webresource `agc_assignfascicolo.js` non ripubblicato dopo la migrazione. Risolto ripubblicando il webresource e correggendo le viste.
2. **"Assegna Fascicolo" visibile anche a magistrato già assegnato** → stessa causa radice (webresource stale che rompeva `isEnabledForm`/`isEnabledGrid`). Risolto contestualmente al punto 1.
3. **Pulsante "Chiudi Caso" non nascondibile** (era solo disabilitabile via `EnableRule`, mai nascosto). Aggiunto `HideCustomAction` dedicato in `RibbonDiff.xml` (Location punta all'ID del pulsante custom, non un alias OOB). Il deployment ha richiesto un **redeploy completo della solution `AgicAspenRibbon`**, bloccato da tempo da un errore `pac solution export` (`Entity Relationship ... not found in MetadataCache`, id `1e8be637-4f63-f111-ab0c-7ced8d4558ae`). **Sbloccato con un nuovo workaround**: `pac solution pack` direttamente dalla cartella unpacked locale (bypassa la query alla metadata cache rotta che blocca `export`), poi `pac solution import --publish-changes --async false`. Import iniziale fallito per `SqlException: Invalid column name 'agc_CanestroName'` causato dal componente deprecato `agc_fascicolo` (vecchia tabella) ancora incluso come RootComponent in `Solution.xml`; risolto rimuovendolo (rimozione mantenuta in via permanente, commit incluso).
   - **Regressione secondaria emersa post-import**: dialog "Errore di script" — `Web resource method does not exist: AgicAspen.AssegnaFascicolo.onFormLoad` — bloccava di fatto il caricamento della command bar custom su ogni apertura della form Fascicolo. Diagnosticata a lungo (webresource verificato integro, FormXml con evento `onload` marcato `active="false"` ma comunque validato dal runtime, ribbon XML pulito). **Causa reale**: un **Service Worker** registrato sul dominio Dataverse (`navigator.serviceWorker`) serviva risposte cache stale indipendentemente dalle modifiche lato server; risolto con `unregister()` del service worker + cancellazione di tutte le Cache Storage via `caches.keys()`/`caches.delete()`. Rimosso anche, per pulizia, l'evento `onload` orfano (già disattivato ma causa di falsi errori) da entrambe le form "Informazioni" duplicate di `agc_fascicolo2`.
   - Verificato in browser: nessun errore di script, "Chiudi Caso" correttamente nascosto, "Assegna Fascicolo" correttamente assente quando il magistrato è già assegnato. Commit `f6d20ba`.
4. **PCF Cruscotto ASPEN**: ancora in attesa di fix — mostra dati riferiti alla vecchia tabella `agc_giudice` e il canestro risulta vuoto nei drill-down (todo `fix-dashboard-magistrati-contact`).
5. **PCF "Carico per Canestro" mancante sulla form Contatto (magistrato)** — era presente sulla vecchia form Magistrato, va riaggiunto (todo `fix-caricopercanestro-form-contact`).

### Chiarimento funzionale — carico magistrato "monotono" (da resoconto PDF)
L'utente ha caricato `aspen_resoconto_modifiche.pdf` con una lista di modifiche da valutare una alla volta (Opus per analisi, ok esplicito utente, poi Sonnet per implementazione). Primo punto discusso: **il carico di un magistrato non deve mai diminuire per chiusura fascicolo** (comportamento richiesto esplicitamente dal cliente, pur riconosciuto "strano" dallo stesso). Regole chiarite:
- Chiusura fascicolo → carico invariato (nessun decremento).
- Riassegnazione (spostamento fascicolo da magistrato A a B) → il carico di A **deve** essere decrementato.
- Nuovo magistrato in ingresso → parte dal carico minimo attuale tra i colleghi, meno il 10%, oppure da un punteggio fisso — regola esatta ancora da definire col cliente.
- Baseline iniziale di carico: non definita, verrà comunicata in seguito dal cliente; non blocca l'implementazione attuale.
- **Non ancora implementato in questa sessione** — resta todo aperto (`p311-carico-monotono`), da implementare quando si riprende la coda di analisi del PDF.

### File modificati (repo)
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Entities/agc_Fascicolo2/RibbonDiff.xml` — nuovo `HideCustomAction` per "Chiudi Caso".
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Other/Solution.xml` — rimosso `agc_fascicolo` (deprecata) da RootComponents.
- Commit: `f6d20ba`.

### Differito
- Todo aperti: `fix-lookup-contact-usersu`, `fix-dashboard-magistrati-contact`, `fix-caricopercanestro-form-contact`, e l'intera coda di analisi del PDF (`p31-esoneri` … `p310-integrazioni`, `p311-carico-monotono`, `p312-user-vs-contact`).
- File `aspen_resoconto_modifiche.pdf` presente in root repo, ancora **non tracciato in git** — da decidere se versionarlo o tenerlo solo come riferimento locale.

---

## Session 2026-08-27 — Migrazione tabella Magistrati (`agc_giudice`) → Contatti (`contact`)

### Contesto
Richiesta cliente: i magistrati diventeranno gli utenti effettivi che accedono all'applicazione, quindi la tabella custom `agc_giudice` ("Magistrati") va sostituita ovunque dalla tabella standard `contact`, sfruttando l'autenticazione nativa di Dataverse per gli utenti Entra ID collegati ai contatti.

### Analisi d'impatto
Prodotta analisi approfondita (agente Opus) di tutti i punti toccati dalla migrazione: schema (colonne custom, lookup su `agc_fascicolo2`), dati (6 record giudice → 6 contact), viste e form, sitemap/dashboard, ribbon/comandi, PCF (`CaricoMagistratiChart`, `CaricoPerCanestro`, `StatoFascicoliChart`), plugin `SetOwnerTeamPlugin`, sicurezza (ruoli), webresource JS/HTML del flusso di assegnazione.

### Modifiche eseguite
1. **Schema**: aggiunta tabella `contact` alla solution ASPEN POC; create 4 colonne custom su `contact`; creata nuova lookup `agc_magistratocontatto` su `agc_fascicolo2` → `contact` (sostituisce `agc_magistratoassegnato` → `agc_giudice`).
2. **Dati**: migrati tutti i 6 record giudice in altrettanti contact; ripuntate tutte le 31 assegnazioni `agc_fascicolo2` alla nuova lookup.
3. **Viste/Form**: creata vista "Magistrati attivi" e form "Contatto - Magistrato" (con subgrid Fascicoli funzionante).
4. **Codice**: aggiornati `agc_assignfascicolo.js`, `agc_assignfascicolodialog.html`, PCF `StatoFascicoliChart`, `CaricoPerCanestro`, commento manifest `CaricoMagistratiChart`, commento doc `SetOwnerTeamPlugin.cs`; relazioni `AgicAspenRibbon_unpacked` risincronizzate manualmente (export solution bloccato da un problema di metadati orfani non collegato).
5. **Sitemap** (`agc_ASPEN`): voce "Magistrati" ripuntata da `agc_giudice` a `contact` con override titolo.
6. **Dashboard "Cruscotto ASPEN"**: parametro `magistratoField` di `CaricoMagistratiChart` aggiornato da `agc_magistratoassegnato` a `agc_magistratocontatto` (tutti e 3 i formFactor).
7. **Form principali `agc_fascicolo2`** (2 form "Informazioni"): controllo lookup "Magistrato assegnato" ripuntato alla nuova colonna.
8. **Sicurezza**: individuato e corretto un gap critico — il ruolo "Operatore ASPEN" aveva privilegi su `agc_giudice` ma **zero privilegi su `contact`**, il che avrebbe bloccato l'accesso ai magistrati/utenti. Aggiunti privilegi Read/Append/AppendTo/Assign su `contact` al ruolo radice (propagati automaticamente ai ruoli ereditati nelle Business Unit figlie).
9. **Comandi moderni**: verificato che la tabella Fascicolo non ha comandi Power Fx configurati — solo ribbon classico, già migrato.

### Bug critico trovato e corretto in fase di test e2e
Durante il test end-to-end del flusso "Assegna Fascicolo", il webresource **`agc_assignfascicolodialog.html` pubblicato su Dataverse era rimasto alla versione precedente la migrazione** (referenziava ancora `agc_magistratoassegnato`/`agc_giudice`), nonostante il file sorgente locale fosse già corretto — probabilmente perché l'ultimo aggiornamento non era stato ripubblicato dopo una modifica locale. Il sintomo era: dialog si apriva e mostrava correttamente i magistrati (da `contact`), ma il click su "Conferma Assegnazione" falliva silenziosamente (PATCH 400 su campo non più esistente) e il fascicolo restava non assegnato. Corretto ripubblicando il contenuto del file locale (base64 via `PATCH` su `webresourceset` + `PublishXml`). Verificato con nuovo test: assegnazione confermata correttamente e persistita.

### Test end-to-end eseguiti (tutti superati)
1. **Assegnazione singola**: dialog "Assegna Fascicolo" su un fascicolo non assegnato → conferma → fascicolo assegnato correttamente al magistrato con carico minore (verificato via API).
2. **Assegnazione massiva**: pulsante griglia "Assegnazione massiva" con 0 righe selezionate → conferma → tutti i fascicoli rimasti senza magistrato assegnati correttamente (verificato: 0 fascicoli non assegnati residui).
3. **Dashboard**: grafico "Carico per Magistrato" su "Cruscotto ASPEN" renderizza correttamente con nomi reali dei contatti.
4. **Visibilità magistrato/non-magistrato**: creato un contatto di test con `agc_ismagistrato = false`, verificato che è correttamente escluso dai filtri/viste magistrato (`agc_ismagistrato eq true`), poi eliminato.

### Differito (fuori scope in questa sessione)
- Refresh completo `pac solution export`/unpack di `AgicAspenRibbon_unpacked` — bloccato da un problema di metadati orfani (relationship id `1e8be637-4f63-f111-ab0c-7ced8d4558ae`) non collegato alla migrazione.
- Riposizionamento visivo del PCF `CaricoPerCanestro` sulla form Contatto (tab "Carico") — un precedente tentativo manuale sul FormXml ha causato un crash client transitorio; da riprovare con più cautela.
- Tabella legacy `agc_fascicolo` (senza "2", non più usata/non in sitemap) ha ancora un riferimento a `agc_magistratoassegnato` sulla sua form principale — lasciata invariata poiché deprecata e fuori uso.

### File modificati (repo)
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js`
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html`
- `05 - Power Platform/PCF-Pie/StatoFascicoliChart/index.ts` e `ControlManifest.Input.xml`
- `05 - Power Platform/PCF/CaricoPerCanestro/CaricoPerCanestro/index.ts`
- `05 - Power Platform/PCF/CaricoMagistratiChart/ControlManifest.Input.xml` (commento)
- `05 - Power Platform/AssegnaFascicolo/AgicAspenRibbon_unpacked/Other/Relationships.xml`, `Relationships/contact.xml`
- `SESSION_NOTES.md`, `README.md`

---

## Session 2026-07-17

### What was done
- **Script voiceover per video dimostrativo dell'app**: creato testo per TTS (~2,5 minuti di lettura, 350 parole) da montare come sottofondo audio su una registrazione schermo dell'applicazione. Copre, nell'ordine di navigazione concordato: Home (card operative + KPI), Cruscotto ASPEN (`CaricoMagistratiChart`, `StatoFascicoliChart`), griglia Fascicoli (comandi "Assegna Fascicolo" e "Assegnazione massiva"), form Magistrato (`CaricoPerCanestro`) — con enfasi esplicita sui componenti sviluppati con il supporto dell'intelligenza artificiale.
- Registrazione schermo dell'app effettuata dall'utente (fuori repo) per il montaggio finale del video.

### Files changed
- `03 - Documentazione Prodotta/Video/ASPEN - Script Voiceover Demo.txt` (nuovo)
- `README.md` — nuova riga in tabella "Documenti di riferimento" con link allo script
- `SESSION_NOTES.md` — aggiunta sessione 2026-07-17

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

### Update 07/07/2026 (fine sessione) — Obbligatorietà campi + fix custom page "ASPEN Home"

**1. Obbligatorietà campi `agc_fascicolo2`**: il cliente ha impostato come **ApplicationRequired** i campi Numero RG (`agc_numeroregistrogenerale`), N. imputati (`agc_numeroimputati`), N. imputazioni (`agc_numeroimputazioni`) e Canestro fascicolo (`agc_canestrofascicolo`). Verificato via `EntityDefinitions(agc_fascicolo2)/Attributes` (Web API) e documentato in `README.md` (nuova colonna "Obbligatorio" nella tabella "Colonne chiave `agc_fascicolo2`").

**2. Fix custom page "ASPEN Home" ancora legata alla vecchia tabella**: la pagina Home (canvas page `agc_pagina1_61ee0`, canvasappid `66552b91-9f59-4952-8bb5-f95dab97291c`) continuava a interrogare in produzione `agc_fascicolo`/`Peso` invece di `agc_fascicolo2`/`Peso calcolato`, nonostante il documento canvas fosse già stato corretto (`DataSources/Fascicoli.json`, formula KPI, URL `Launch()` delle 3 card) e reimportato più volte con `pac solution import --force-overwrite --publish-changes`.

**Causa**: per una custom page/canvas app embeddata in una Model-Driven App, l'import di soluzione aggiorna correttamente il documento `.msapp` in Dataverse (verificato più volte ispezionando il pacchetto ri-esportato: `References/DataSources.json` e `Properties.json` mostravano sempre il binding corretto a `agc_fascicolo2`), ma **non ricompila/ripubblica il player** — il runtime pubblicato continuava a servire la versione compilata precedente. Escluso un problema di cache browser (svuotata Cache Storage/IndexedDB/Service Worker via CDP `Storage.clearDataForOrigin`, nessun effetto) e di prefetch app-wide (altre pagine dell'app non mostravano riferimenti a `agc_fascicolo`).

**Fix risolutivo**: individuato il vero editor Power Apps Studio per una custom page embeddata (non ovvio): Maker Portal → app "ASPEN" → "Modifica" (apre l'App Designer) → nell'albero "Pagine", **hover** sulla pagina "Home" → icona a matita "Modifica pagina personalizzata" (il semplice click sul nome pagina mostra solo un'anteprima in sola lettura del player pubblicato, non l'editor). Nell'editor Studio i valori KPI risultavano già corretti in live-preview (PESO MEDIO = 13,9, non vuoto), confermando che formula e data source erano giusti e il problema era solo di pubblicazione. Cliccato **Pubblica → "Pubblica questa versione"** (dopo aver chiuso il dialog "Salvataggio della pagina completato" con "Ignora").

**Verifica finale**: ricaricata la pagina live — tutte le query di rete ora puntano a `agc_fascicolo2s` (incluso `RetrieveTotalRecordCount(EntityNames=["agc_fascicolo2"])` e `$apply=aggregate(agc_pesocalcolato with average as result)`); i 4 KPI mostrano FASCICOLI ATTIVI=40, CREATI (7 GIORNI)=21, PESO MEDIO=13,9, IMPUTATI TOTALI=171 (coerenti tra loro); i pulsanti "Apri elenco" e "Crea ora" navigano correttamente su `pagetype=entitylist&etn=agc_fascicolo2` e `pagetype=entityrecord&etn=agc_fascicolo2`. Nessun errore console riconducibile al fix (solo rumore framework UCI preesistente/non correlato: 404 logo webresource, "Can't find me-control-container").

**Lezione tecnica riutilizzabile**: qualsiasi futura modifica a una custom page/canvas app applicata tramite il workaround di solution-import (necessario perché `pac canvas` non vede le custom page embeddate in una Model-Driven App) **deve essere seguita da un publish reale in Power Apps Studio**, non solo da `pac solution import --publish-changes`, altrimenti il fix non sarà mai visibile agli utenti nonostante il documento in Dataverse sia corretto.

**File di riferimento aggiornato**: `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/agc_aspenhome.pa.yaml` — aggiornati i riferimenti a tabella (`agc_fascicolo` → `agc_fascicolo2`), campo (`Peso` → `'Peso calcolato'`) e viewid del pulsante "Apri elenco" (`4383387a-...` → `66ef2ecc-32ca-4275-901c-80f0637f1003`), più una nota tecnica sulla necessità del publish Studio. Rimossi tutti gli artefatti di scratch usati per il debug (export/estrazioni temporanee, screenshot) e la solution Dataverse temporanea `TempAspenHomeExport` usata come workaround per accedere alla custom page via `pac`.

**Files changed**:
- `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/agc_aspenhome.pa.yaml`
- `README.md` (tabella "Colonne chiave" con obbligatorietà, KPI/pulsanti navigazione custom page, nota tecnica fix + lezione publish, Prossimi passi)
- `SESSION_NOTES.md`
- Dataverse live: canvas app "ASPEN HOME" ripubblicata da Power Apps Studio; solution temporanea `TempAspenHomeExport` eliminata

### Update 07/07/2026 (2) — KPI "Fascicoli Attivi" mostrava 40 invece di 21 (cache `RetrieveTotalRecordCount`)

**Segnalazione utente**: "Perché mi dice che i fascicoli aperti sono 40? Sono 21 i fascicoli nella tabella agc_fascicolo2".

**Verifica dati**: interrogata direttamente `agc_fascicolo2s` via Web API — confermati esattamente **21 record**, tutti con `statecode=0` (attivi). Nessuna incoerenza nei dati.

**Causa**: la formula del KPI "Fascicoli Attivi" era `Text(CountRows(Fascicoli), "#,##0")`. Su un data source Dataverse **senza filtro**, Power Fx ottimizza `CountRows()` in una chiamata `RetrieveTotalRecordCount(EntityNames=["agc_fascicolo2"])`, che restituisce **una statistica SQL mantenuta da Dataverse e aggiornata in modo asincrono/periodico**, non un conteggio live. Verificato chiamando direttamente l'endpoint: restituiva `Count: 40`, un residuo della situazione precedente alla pulizia dei duplicati (la tabella era passata da 40 → 20 → 21 record in sessioni precedenti, ma la statistica cache non si era mai aggiornata).

**Decisione utente**: il KPI deve mostrare il conteggio totale corretto di tutti i record (non filtrato per stato "attivo/chiuso") — chiesto esplicitamente via domanda di chiarimento, l'utente ha confermato questa opzione.

**Fix**: nel vero editor di Power Apps Studio (stesso percorso di accesso già documentato: App Designer → hover "Home" → icona matita "Modifica pagina personalizzata"), individuato il controllo `lblStat1Value` (`Screen1 > conRoot > conStats > conStat1`) e sostituita la formula con `Text(CountIf(Fascicoli, true), "#,##0")`. `CountIf(DataSource, true)` forza sempre una query aggregata live (`$apply=aggregate($count as result)`), bypassando la statistica cache. Utile conferma: Power Apps Studio mostra nativamente un tooltip di warning sulla formula `CountRows`: *"CountRows può restituire un valore memorizzato nella cache. Usa CountIf(DataSource, true) per ottenere il conteggio più recente."*

**Pubblicazione**: cliccato **Pubblica → "Pubblica questa versione"** nell'editor Studio (notifica "Publish successful — ASPEN HOME is now available to everyone").

**Verifica finale**: ricaricata la pagina live — il KPI "Fascicoli Attivi" mostra ora **21**, coerente con "Creati (7 giorni)" = 21 (unico fascicolo/tutti creati di recente in questo ambiente demo). Verificata anche la network request: la vecchia chiamata `RetrieveTotalRecordCount` su `agc_fascicolo2` non compare più; al suo posto `agc_fascicolo2s?$apply=aggregate($count as result)`, una query live.

**Lezione tecnica riutilizzabile**: qualsiasi uso futuro di `CountRows(DataSource)` **senza filtro** su un data source Dataverse in un'app canvas va considerato a rischio di mostrare un conteggio stale/cache. Preferire sempre `CountIf(DataSource, true)` quando serve un conteggio esatto e aggiornato in tempo reale.

**Files changed**:
- `05 - Power Platform/Model-Driven-App/AspenHomeCustomPage/Source/agc_aspenhome.pa.yaml` (formula KPI "Fascicoli Attivi" `CountRows` → `CountIf`, nuova nota tecnica in testa al file)
- `README.md` (tabella KPI aggiornata: formula e valore "Fascicoli Attivi"; nuova nota tecnica sulla cache `RetrieveTotalRecordCount`; Prossimi passi item 17)
- `SESSION_NOTES.md`
- Dataverse live: canvas app "ASPEN HOME" ripubblicata da Power Apps Studio (secondo publish della giornata)

### Update 07/07/2026 (notte tarda) — Tasto "Assegna Fascicolo" mancante in griglia + nuovo "Assegnazione massiva"

**Segnalazione utente**: "Manca il tasto assegna fascicoli quando seleziono un fascicolo senza magistrato assegnato nella vista. Inoltre prevediamo un nuovo tasto... 'Assegnazione massiva'... senza che venga richiesta l'incompatibilità".

**Causa scoperta**: la vista principale/griglia di `agc_fascicolo2` **non è più governata dal `RibbonDiff.xml` classico** per i pulsanti custom di assegnazione — nonostante il `CommandDefinition Id="agc.HomepageGrid.agc_fascicolo2.Assegna.Command"` esista ancora nel sorgente solution (con `EnableRule` JS `isEnabledGrid`/`isEnabledForm`), questa vista usa i **comandi moderni** (Command Designer, Maker Portal → tabella → vista → "Modifica comandi"), le cui regole di visibilità sono formule **Power Fx** valutate dal component library canvas app `ASPEN_DefaultCommandLibrary` (app id `ca8c900c-4851-4c1a-8bdd-0badbb28c2ed`), non JavaScript. Il pulsante "Assegna Fascicolo" era configurato lì con la formula `And(CountRows(Self.Selected.AllItems) = 1, IsBlank(Self.Selected.Item.'Magistrato assegnato'))`, che non veniva mai valutata come `true` (il pulsante compariva sempre o mai a seconda dei tentativi, indipendentemente dalla selezione).

**Bug di piattaforma isolato tramite test sistematico** (decine di varianti di formula pubblicate e testate live sulla griglia): `CountRows(Self.Selected.AllItems)` usato come operando di `And()` o come condizione di `If()` insieme a **qualunque altra espressione** (anche un literal banale `true`) fa valutare l'intera formula in modo scorretto quando 0 righe sono selezionate (il comando resta visibile). Non è un problema di refresh/cache dei metadati (ipotesi iniziale, verificata e scartata), né un errore runtime soppresso da `IfError()`. **`CountRows(...)` usato da solo (non composto) funziona correttamente** — infatti la formula del comando "Assegnazione massiva" (`CountRows(Self.Selected.AllItems) = 0`, standalone) è risultata corretta fin da subito.

**Fix**: sostituita la formula `Visible` di "Assegna Fascicolo" con `And(!IsBlank(Self.Selected.Item), IsBlank(Self.Selected.Item.'Magistrato assegnato'))`. `Self.Selected.Item` è blank quando 0 o più di 1 righe sono selezionate ed è valorizzato solo con esattamente 1 riga selezionata — equivalente logico di `CountRows(...) = 1` ma che **evita il bug** perché non usa `CountRows` all'interno di `And()`.

**Nuovo comando "Assegnazione massiva"**: creato in Command Designer, visibile solo con **0 righe selezionate** (`CountRows(Self.Selected.AllItems) = 0`), azione JavaScript `AgicAspen.AssegnaFascicolo.openBulkAssignFromGrid` (nuova funzione in `agc_assignfascicolo.js`). Logica: stessa di "Assegna Fascicolo" (magistrato con minor `agc_pesocalcolato` totale sui fascicoli non chiusi) applicata in sequenza a **tutti** i fascicoli attualmente senza magistrato, aggiornando il carico in memoria dopo ogni assegnazione (per non sovraccaricare lo stesso magistrato), **senza richiedere la selezione di incompatibilità** (a differenza del dialog "Assegna Fascicolo" singolo). Mostra un dialog di conferma prima di procedere e un riepilogo finale ("Assegnati N fascicoli su M").

**Verifica end-to-end sulla griglia live**:
1. 0 righe selezionate → "Assegna Fascicolo" nascosto, "Assegnazione massiva" visibile. ✅
2. 1 fascicolo selezionato con magistrato già assegnato (RG-2026/11122) → "Assegna Fascicolo" nascosto, "Assegnazione massiva" nascosto. ✅
3. 1 fascicolo selezionato senza magistrato (RG-2026/7744) → "Assegna Fascicolo" visibile, "Assegnazione massiva" nascosto. ✅
4. Click su "Assegna Fascicolo" per RG-2026/7744 → dialog si apre, lista magistrati per incompatibilità, conferma → assegnato correttamente a Dott.ssa Anna Greco (peso più basso, 4.00). ✅
5. Click su "Assegnazione massiva" con 0 selezionati → dialog di conferma → confermato → i 2 fascicoli rimasti senza magistrato assegnati correttamente, messaggio "Assegnati 2 fascicoli su 2". ✅

**Files changed**:
- Command Designer (Dataverse, no rappresentazione file locale): formula `Visible` di "Assegna Fascicolo" corretta; nuovo comando "Assegnazione massiva" creato
- `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolo.js` — nuova funzione `openBulkAssignFromGrid` + `isBulkAssignVisible` (quest'ultima non più usata dai comandi moderni ma lasciata per eventuale fallback su ribbon classico), pubblicata come webresource
- `README.md` — nuova sezione "Comandi moderni griglia `agc_fascicolo2`", nota su Command Designer vs RibbonDiff.xml, Prossimi passi item 8 risolto
- `SESSION_NOTES.md`

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

## Sessione — Fix bug continuità RGNR (dialog singolo)

### Contesto
Segnalato dall'utente: RGNR `12321321` con due fascicoli, RG-2026/0113 (senza magistrato) e
RG-2026/7475 (assegnato a Laura Verdi). Eseguendo "Assegna Fascicolo" su RG-2026/0113 ci si
aspettava l'ereditarietà del magistrato per continuità RGNR (regola 3.3), ma è stato assegnato
Alessia Gialli tramite l'algoritmo normale a minor carico.

### Root cause
In `agc_assignfascicolodialog.html` (blocco "0b. Continuità fascicolo"), la query di ricerca del
fascicolo "fratello" con lo stesso RGNR usava:
```
$select=_agc_magistratocontatto_value,agc_magistratocontattoname&...
```
`agc_magistratocontattoname` **non è un campo reale** nel Web API di Dataverse (i lookup non
espongono un campo "name" selezionabile: il valore visualizzato va richiesto tramite
l'annotazione `@OData.Community.Display.V1.FormattedValue` con header `Prefer:
odata.include-annotations="*"`). La richiesta falliva quindi con **HTTP 400 Bad Request**
("Could not find a property named 'agc_magistratocontattoname'..."), ma il codice non
controllava `siblingResp.ok` prima di leggere `.json()`: il body d'errore non ha una proprietà
`value`, quindi `sibling` risultava `undefined` e la continuità veniva **silenziosamente
saltata**, senza errori visibili, ricadendo sull'algoritmo di assegnazione normale.

Verificato riproducendo esattamente la query via REST API (stesso 400) e confermando che la
logica bulk in `agc_assignfascicolo.js` (usata da "Assegnazione massiva") **non ha lo stesso
bug**: seleziona solo `_agc_rgnr_value,_agc_magistratocontatto_value`, campi reali.

### Fix
- Rimosso `agc_magistratocontattoname` dal `$select`.
- Aggiunto header `Prefer: odata.include-annotations="*"` alla fetch della query sibling, per
  poter leggere il nome visualizzato tramite
  `sibling["_agc_magistratocontatto_value@OData.Community.Display.V1.FormattedValue"]`.
- Aggiunto controllo esplicito `if (!siblingResp.ok) throw new Error(...)` per evitare che futuri
  errori di questa chiamata vengano ignorati silenziosamente.
- File: `05 - Power Platform/AssegnaFascicolo/WebResources/agc_assignfascicolodialog.html`.
- Ridistribuito il webresource (`webresourceid bac3c3e4-7b63-f111-ab0c-7ced8d4558ae`) via PATCH +
  PublishXml e verificato che il contenuto live combacia col sorgente locale.
- Verificato via REST che la query corretta ora trova il sibling RG-2026/7475 con
  `_agc_magistratocontatto_value@OData.Community.Display.V1.FormattedValue = "Laura Verdi"`.

### Lezione
Stesso pattern di bug già visto in questa sessione (campo/bundle non allineato), ma qui la causa
è diversa: un **nome di campo Web API inventato** (retaggio di sintassi FetchXML/SOAP dove i
lookup avevano un attributo "name" leggibile direttamente) che causa un 400 silenziosamente
ignorato per mancanza di controllo `response.ok`. Da tenere a mente: nel Web API v9+ i lookup
espongono solo `_xxx_value`; il nome va richiesto con l'header `Prefer:
odata.include-annotations="*"` e letto dall'annotazione `@OData.Community.Display.V1.FormattedValue`.

---

## Session 2026-08-28 (sera, cont.) — Risposta ticket Microsoft Support, chiarimento esoneri e RGNR concettuale

### Risposta al ticket Microsoft Support (corruzione EntityMap `agc_fascicolo`)
Seguito alla richiesta di informazioni aggiuntive del supporto Microsoft (Iwayemi) sul ticket
aperto in sessione precedente per la relazione orfana `1e8be637-4f63-f111-ab0c-7ced8d4558ae` e
l'errore `Entity Relationship ... not found in MetadataCache` durante `pac solution export`.
L'utente ha fornito al supporto:
- **Errore esatto** e comportamento: sempre riproducibile, ad ogni tentativo di export/pack.
- **Decorrenza**: da metà luglio 2026, in coincidenza con una modifica alla tabella
  `agc_fascicolo` (poi sostituita dal workaround `agc_fascicolo2`, si veda il modello RGNR
  padre/figlio documentato in sessioni precedenti).
- **Impatto**: limitato alle operazioni maker/admin di export/pack della solution; nessun impatto
  sugli utenti finali dell'app in produzione/dev.
- **Ambiente**: riprodotto solo su dev/sandbox `lccministerogiustiziademo.crm4.dynamics.com`, non
  testato su altri ambienti.
- **Disponibilità per call di supporto**: da martedì in poi, 15:00–16:00 CET.

Il ticket resta **aperto**, in attesa di riscontro/intervento backend da parte di Microsoft. Nessuna
azione ulteriore possibile lato codice/API fino alla risposta.

### Chiarimento comportamento esoneri (non un bug)
Segnalazione iniziale dell'utente: creato un esonero **Totale** per la magistrata Anna Greco con
**Data Inizio = 29/08/2026** (giorno successivo) e **Stato Esonero = Attivo**; lanciata
un'assegnazione massiva lo stesso giorno (28/08/2026) e alcuni fascicoli sono stati comunque
assegnati ad Anna Greco.

Verificato **non è un bug**: la logica di esclusione per esonero attivo (in
`agc_assignfascicolodialog.html` e `agc_assignfascicolo.js`) filtra correttamente sulla congiunzione
`agc_statoesonero = Attivo` **AND** `agc_datainizio <= oggi` **AND** (`agc_datafine >= oggi` OR
null). Poiché la Data Inizio era impostata al giorno successivo rispetto al giorno
dell'assegnazione, l'esonero non era ancora efficace: comportamento corretto per design.
Confermato dall'utente dopo aver rifatto la prova con Data Inizio odierna ("Hai ragione, con la
data di oggi funziona"). **Nessuna modifica al codice necessaria.**

### Chiarimento concettuale RGNR (nessuna modifica al codice)
Fornita spiegazione a scopo di comprensione sul modello RGNR già implementato in sessioni
precedenti: l'RGNR (Registro Generale delle Notizie di Reato) è il "registro padre" del
procedimento penale, sotto cui possono essere raggruppati più fascicoli GIP/GUP "figli" (ciascuno
con il proprio numero di RG specifico, campo `agc_numeroregistrogenerale` su `agc_fascicolo2`).
Da qui la regola di continuità di assegnazione: fascicoli figli con lo stesso RGNR devono, quando
possibile, essere assegnati allo stesso magistrato. Nessun impatto sul codice in questa sessione.

---
