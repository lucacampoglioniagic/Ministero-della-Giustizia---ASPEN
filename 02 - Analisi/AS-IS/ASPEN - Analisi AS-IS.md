# ASPEN – Analisi AS-IS

**Fonte:** Call di analisi del 04/06/2026 + documentazione AGIC/Polimi  
**Stato:** Bozza – da validare con il cliente

---

## 1. Perimetro e installazioni attive

| Applicativo | Stato | Sede attiva | Note |
|---|---|---|---|
| ASPEN | **Dismesso** | — | Versione base, non più in produzione |
| ASPEN2 | **In produzione** | Palermo – Ufficio GIP | Derivato dalla versione Milano |
| ASPENCA | Installato, non usato | Palermo | Pensato per Corte d'Appello |
| ASSPECA | — | Napoli | Estensione di ASPENCA |

La stessa struttura base è presente anche a **Milano, Monza, Roma e Napoli**, con configurazioni locali.

---

## 2. Architettura tecnica

- **Database:** SQL Server su server Windows
- **Modello dati:** Semplice, ~4–5 tabelle (1 tabella principale + tabelle di configurazione e supporto)
- **Front-end ("Aspen"):** Usato da cancellerie e uffici
- **Back-office ("Aspen Core"):** Gestione tabelle riservata ad amministratori e assistenza

---

## 3. Concetti chiave

### 3.1 Canestri (materie / competenze)
- Rappresentano le aree di specializzazione dei magistrati
- A Palermo: **circa 19 canestri**, suddivisi tra GIP e GUP *(ripartizione puntuale da riconfermare)*
- Ogni magistrato può essere assegnato a uno, alcuni o tutti i canestri

### 3.2 Tabella magistrato–canestro
La tabella di associazione memorizza:
- Magistrato
- Canestro di competenza
- **Valore di carico cumulato** per quella specifica coppia magistrato/canestro

---

## 4. Pesatura del fascicolo

Il peso di un fascicolo è la **somma di più contributi**:

| Componente | Logica |
|---|---|
| Punto fisso fascicolo | +1 |
| N. imputazioni | Per fasce (es. 1–3 → 1 pt, 4–6 → 2 pt, 7–10 → 3 pt) ⚠️ *da riconfermare* |
| N. imputati/indagati | Per fasce (es. 1–4 → 1 pt, 5–15 → 2 pt) ⚠️ *da riconfermare* |
| Peso canestro | Configurabile (a Palermo = 1 uniforme) |

**Esempio illustrato in call:** 5 imputati (2 pt) + 3 imputazioni (1 pt) + punto fisso (1 pt) = **peso 4**

---

## 5. Logica di assegnazione

1. All'arrivo di un fascicolo, il sistema identifica il **canestro di competenza**
2. Propone il magistrato con il **punteggio cumulato più basso in quel canestro** (non sul totale generale)
3. Il peso del fascicolo viene **sommato** al carico cumulato del magistrato in quel canestro
4. Nel corso della vita del fascicolo possono subentrare **più canestri/competenze** a seconda della fase processuale

### 5.1 Proposta automatica e validazione manuale
- Il sistema genera una **proposta automatica**
- L'assegnazione diventa effettiva solo dopo **validazione manuale** a fine giornata da parte di un collega di riferimento
- Senza supervisione umana il sistema "non decide nulla"

### 5.2 Carico iniziale – nuovi magistrati
- Al momento dell'ingresso viene attribuito il **valore minimo presente − 15%** (prassi mutuata da Milano)
- Il valore di partenza viene calcolato manualmente

### 5.3 GIP virtuale
- Concetto di "GIP virtuale": un GUP proiettato per la fase dell'udienza preliminare, sostituibile successivamente con il magistrato effettivo

---

## 6. Incompatibilità ed esclusioni

- Esistono tabelle dedicate, ma la gestione strutturata **di fatto non funziona**
- In pratica si usa un **valore "tappo"** impostato manualmente sul carico del magistrato nel canestro:
  - A Palermo: tappo = **1000**
  - Punteggio così alto da escludere di fatto il magistrato dall'assegnazione
  - Gestito su disposizione del Presidente, con intervento diretto sul DB

---

## 7. Output e governance

- Output a **uso esclusivamente interno**
- Basato su un **provvedimento/regolamento scritto del Presidente**
- Nessun documento prodotto verso l'esterno (avvocati, pubblico)

---

## 8. Criticità rilevate

| # | Criticità | Impatto |
|---|---|---|
| 1 | **Punteggio solo incrementale** – mai decrementato alla chiusura dei fascicoli | Il magistrato più efficiente accumula carico e riceve più assegnazioni: paradosso |
| 2 | **Tabella incompatibilità non funzionante** | Gestione manuale, fragile |
| 3 | **Forzature dirette sul DB** (tappo 1000) | Non tracciato, dipendente da poche persone |
| 4 | **Funzioni UI non operative** | Interfaccia datata, alcune feature non funzionano |
| 5 | **Reportistica poco leggibile** | Report "brutti", scarsa fruibilità |
| 6 | **Password in chiaro** | Rischio di sicurezza |
| 7 | **Dipendenza dalla validazione manuale** | Processo non autonomo, rischio operativo quotidiano |
| 8 | **Manutenibilità** | Tecnologia obsoleta, know-how concentrato su poche persone |

---

## 9. Desiderata espressi dal cliente

| Area | Richiesta |
|---|---|
| Algoritmo | Carico "reale" con decremento/ricalcolo alla chiusura dei fascicoli |
| Incompatibilità | Tabelle e regole strutturate (coniugi, conflitti d'interesse), elimina il tappo |
| Sicurezza | Hashing password, autenticazione centralizzata (Entra ID) |
| Reportistica | Cruscotti leggibili (Power BI) per Presidente e cancellerie |
| Audit | Storico assegnazioni, log validazioni e forzature |
| Multi-sede | Configurazioni indipendenti per sede all'interno di un'unica piattaforma |
| Parametrizzazione | Pesi canestri e fasce configurabili senza interventi tecnici sul DB |
| Automazione | Notifiche e flussi di validazione guidati (Power Automate) |

---

## 10. Punti aperti / da riconfermare con il cliente

- [ ] Ripartizione puntuale dei ~19 canestri tra GIP e GUP a Palermo
- [ ] Soglie esatte delle fasce imputazioni e imputati
- [ ] Numero esatto e struttura delle tabelle del modello dati (richiesta dump anonimizzato)
- [ ] Configurazioni delle altre sedi (Milano, Monza, Roma, Napoli)
- [ ] Perimetro tabelle per la POC (proposta: Magistrati, Fascicoli/Assegnazioni, Canestri)

---

## 11. Partecipanti alla call del 04/06/2026

**AGIC:** Chiara D'Innocenzi, Linda Tomasello, Vincenzo Picone, Giuseppe Scalabrino, Riccardo Vedovato, Luca Campoglioni  
**Microsoft:** Daiana D'Agostino
