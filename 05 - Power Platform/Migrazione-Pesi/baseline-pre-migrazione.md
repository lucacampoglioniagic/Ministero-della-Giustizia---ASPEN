# Baseline pre-migrazione — Peso 1 (`agc_canestrofascicolo`) / Peso 2 (`agc_peso2`)

Snapshot eseguito il 25/09/2026 prima di qualunque modifica, ambiente `org8e819d4a.crm4.dynamics.com`.

> **Nota 26/09/2026**: durante la migrazione l'attributo `agc_pesocalcolato` è stato vittima di un
> bug di piattaforma (cache del motore di calcolo non invalidata dopo l'update della formula, anche
> dopo delete+ricreazione con lo stesso nome logico — vedi §14.1 di
> `03 - Documentazione Prodotta\Tecnica\Piano Migrazione Peso1-Peso2 UserOwned.md`) ed è stato
> **rinominato permanentemente in `agc_pesocalcolato2`**. Questo documento e
> `baseline-fascicoli-pre-migrazione.json` restano invariati come fotografia dello **stato
> pre-incidente** (il nome storico `agc_pesocalcolato` qui sotto non esiste più in produzione).

## Formula `agc_pesocalcolato` (agc_fascicolo2) — ORIGINALE

```
agc_numeroimputati + agc_numeroimputazioni + If(IsBlank(agc_Canestrofascicolo), 0, agc_Canestrofascicolo.agc_peso) + If(IsBlank(agc_Peso2), 0, agc_Peso2.agc_peso) + 1
```

## Schema `agc_canestrofascicolo` (Peso 1)
- `agc_canestrofascicoloid` (PK)
- `agc_name`: String, MaxLength 100, RequiredLevel **ApplicationRequired** (primary name)
- `agc_descrizione`: **Memo**, MaxLength 2000, RequiredLevel None
- `agc_peso`: Integer, MinValue 0, MaxValue 1000000000, RequiredLevel **ApplicationRequired**
- OwnershipType: OrganizationOwned (DA CORREGGERE)

Dati (4 record):
| id | Nome | Peso |
|---|---|---|
| c6a67305-21b8-f111-aaab-000d3a697f24 | Abbreviati e richieste di rinvio a giudizio | 1 |
| cfa67305-21b8-f111-aaab-000d3a697f24 | Misure cautelari personali e reali (escluso convalide) | 2 |
| d1a67305-21b8-f111-aaab-000d3a697f24 | Intercettazioni | 4 |
| d2a67305-21b8-f111-aaab-000d3a697f24 | Altro | 1 |

## Schema `agc_peso2` (Peso 2)
- `agc_peso2id` (PK)
- `agc_name`: String, MaxLength 100, RequiredLevel **ApplicationRequired** (primary name)
- `agc_descrizione`: **String**, MaxLength 100, RequiredLevel None
- `agc_peso`: Integer, MinValue 0, MaxValue 1000000000, RequiredLevel **ApplicationRequired**
- OwnershipType: OrganizationOwned (DA CORREGGERE)

Dati (1 record):
| id | Nome | Peso |
|---|---|---|
| d3a67305-21b8-f111-aaab-000d3a697f24 | Intercettazione | 3 |

## Relazioni N:1 esistenti (da `agc_fascicolo2`)
| Relazione | Lookup su fascicolo | RequiredLevel lookup | CascadeConfiguration |
|---|---|---|---|
| `agc_canestrofascicolo_agc_fascicolo2` | `agc_canestrofascicolo` (nav `agc_Canestrofascicolo`) | **ApplicationRequired** | Assign NoCascade, Delete **Restrict**, Merge NoCascade, Reparent NoCascade, Share NoCascade, Unshare NoCascade, RollupView NoCascade |
| `agc_peso2_agc_fascicolo2` | `agc_peso2` (nav `agc_Peso2`) | None (opzionale) | idem (Delete Restrict) |

## Team di default per BU (per ownerid dei nuovi record)
| BU | Team | TeamId |
|---|---|---|
| Tribunale di Roma | Tribunale di Roma | `791409db-1fb8-f111-aaab-000d3a697f24` |
| Tribunale di Milano | Tribunale di Milano | `1a1509db-1fb8-f111-aaab-000d3a697f24` |
| Tribunale di Messina | Tribunale di Messina | `111509db-1fb8-f111-aaab-000d3a697f24` |
| Ministero della Giustizia (root) | Ministero della Giustizia | `a5834cd8-08a9-f111-aaad-e4fb1ef60532` |

Decisione utente: tutti i 5 record esistenti (4 Peso1 + 1 Peso2) vanno assegnati al team **Tribunale di Roma**.

## Ruoli (istanza root, le 3 copie BU ereditano)
| Ruolo | RoleId root |
|---|---|
| Operatore ASPEN | `b7b3ed9e-4fb7-f111-aaab-7ced8d763868` |
| Amministratore ASPEN | `9fb62eb8-4fb7-f111-aaab-7ced8d763868` |

## Baseline 41 fascicoli
Vedi `baseline-fascicoli-pre-migrazione.json` (export completo: `agc_fascicolo2id`, `agc_numeroregistrogenerale`, `_agc_canestrofascicolo_value`, `_agc_peso2_value`, `agc_pesocalcolato`, `agc_contributocaricoassegnato`).

## Decisioni confermate dall'utente (25/09/2026)
- **Naming nuove tabelle**: `agc_pesouno` (Peso 1) / `agc_pesodue` (Peso 2)
- **BU record esistenti**: tutti a Tribunale di Roma
- **GUID**: riutilizzare gli stessi GUID esistenti nei nuovi record (stesso ID, tabella diversa)
- **Eliminazione vecchie tabelle**: solo dopo che tutti gli E2E sono PASS
