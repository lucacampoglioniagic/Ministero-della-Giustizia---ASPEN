# Changelog — ASPEN (Ministero della Giustizia)

Registro delle modifiche principali applicate alla solution `ASPEN` e alla documentazione di progetto. Formato ispirato a [Keep a Changelog](https://keepachangelog.com/it/1.0.0/). Per il dettaglio operativo di ogni intervento vedi `SESSION_NOTES.md`.

## [Non rilasciato] — Fase 12: validazione finale e parità funzionale

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

### Noto/residuo (non bloccante)
- Layout Home privo di scroll verticale su viewport stretti/bassi (item aperto, richiede wrapping in Container scrollabile da Power Apps Studio).
- Tabella legacy `agc_peso2` ("Peso 2" storica) ancora presente come metadata non versionata, in attesa di analoga dismissione fisica; dati già migrati e verificati al 100% su `agc_pesouno`/`agc_pesodue`.
- Fase 9 (governance Power Automate, service account con licenza Premium per il flow "Chiusura automatica esoneri scaduti") saltata su richiesta esplicita del cliente, da pianificare separatamente.

## Storico (Fasi 0-11)

Per il dettaglio di tutte le migrazioni, fix e verifiche E2E delle Fasi 0-11 (datamodel, sicurezza, plugin, UI, dashboard/Home, Power Automate, dati di test, 42 scenari E2E Playwright), vedere `SESSION_NOTES.md` (ordine cronologico inverso) e `03 - Documentazione Prodotta/Tecnica/ASPEN - Piano di Migrazione Ambiente Destinazione.md` §7.
