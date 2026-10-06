# Changelog — ASPEN (Ministero della Giustizia)

Registro delle modifiche principali applicate alla solution `ASPEN` e alla documentazione di progetto. Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.0.0/). Per il dettaglio operativo di ogni intervento vedi `SESSION_NOTES.md`.

## [Non rilasciato] — Fase 12: validazione finale e parità funzionale

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
