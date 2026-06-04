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
│   └── Plugin-Custom-API/           # Plugin Dataverse / Custom API per logica assegnazione

📁 06 - Riferimenti Normativi e Tecnici/   # Normativa, lettere istituzionali, docs tecnici
```

---

## Architettura target

- **Piattaforma:** Microsoft Power Platform – Model-Driven App su Dataverse  
- **Sicurezza:** Business Units per sede, ruoli di sicurezza nativi, Entra ID  
- **Logica assegnazione:** Plugin Dataverse / Custom API (per robustezza transazionale)  
- **Integrazione:** SICP (registro generale Ministero)  
- **Reporting:** Dashboard model-driven + Power BI  

---

## Prossimi passi

1. **Validare con il cliente** la sintesi AS-IS emersa dalla call del 04/06/2026
2. **Approfondire il modello dati** (tabelle, relazioni, soglie pesatura) – richiedere dump anonimizzato
3. **POC model-driven su Power Platform** entro ~2 settimane (tabelle: Magistrati, Fascicoli/Assegnazioni, Canestri)
4. Pianificare sessioni su: sicurezza, incompatibilità, reportistica, migrazione dati
5. Definire architettura target (collocazione logica assegnazione: Plugin / Custom API vs Power Automate)
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
