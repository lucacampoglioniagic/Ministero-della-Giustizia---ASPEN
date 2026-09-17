"use strict";
// eslint-disable-next-line no-var
var AgicAspen = window.AgicAspen || {};

AgicAspen.AssegnaFascicolo = (function () {
    var STATO_CHIUSO = 2;
    var RUOLO_GIP = 0;
    var RUOLO_GUP = 1;

    /* ── Verifica riserva GUP (3.4) ──
       Regola: per un RGNR i cui fascicoli collegati sono tutti di ruolo GIP,
       deve sempre restare disponibile almeno un magistrato del tribunale non
       ancora impegnato come GIP su quello stesso RGNR, così da poter essere
       eventualmente assegnato come GUP in futuro. Il controllo si applica solo
       all'assegnazione di un fascicolo di ruolo GIP collegato a un RGNR, e solo
       se per quel RGNR non esiste già un fascicolo di ruolo GUP assegnato (in
       tal caso la riserva è già stata utilizzata/non più rilevante). Non blocca
       l'assegnazione: restituisce solo un avviso (l'utente può procedere
       comunque confermando il dialog di conferma mostrato dal chiamante). */
    function verificaRiservaGup(opts) {
        if (!opts.rgnrId || opts.ruolo !== RUOLO_GIP) return Promise.resolve({ warn: false });

        var filtroGup = "_agc_rgnr_value eq " + opts.rgnrId +
            " and agc_ruoloassegnazione eq " + RUOLO_GUP + " and _agc_magistratocontatto_value ne null" +
            (opts.fascicoloId ? " and agc_fascicolo2id ne " + opts.fascicoloId : "");

        return Xrm.WebApi.retrieveMultipleRecords("agc_fascicolo2", "?$select=agc_fascicolo2id&$filter=" + filtroGup + "&$top=1")
            .then(function (gup) {
                if ((gup.entities || []).length > 0) return { warn: false };

                var filtroGip = "_agc_rgnr_value eq " + opts.rgnrId +
                    " and agc_ruoloassegnazione eq " + RUOLO_GIP + " and _agc_magistratocontatto_value ne null" +
                    (opts.fascicoloId ? " and agc_fascicolo2id ne " + opts.fascicoloId : "");

                return Xrm.WebApi.retrieveMultipleRecords("agc_fascicolo2", "?$select=_agc_magistratocontatto_value&$filter=" + filtroGip)
                    .then(function (gip) {
                        var assegnati = {};
                        (gip.entities || []).forEach(function (f) {
                            var mid = f["_agc_magistratocontatto_value"];
                            if (mid) assegnati[mid] = true;
                        });
                        assegnati[opts.candidatoContactId] = true; // simula l'assegnazione corrente
                        var distinti = Object.keys(assegnati).length;

                        // Su un fascicolo non ancora salvato (form "Nuovo elemento") fascicoloId
                        // è nullo: la retrieveRecord non è eseguibile (nessun record da leggere)
                        // e andrebbe sempre in errore. In questo caso si usa la business unit
                        // dell'utente corrente come approssimazione ragionevole del tribunale.
                        // NOTA: userSettings non espone una proprietà businessUnitId (solo
                        // userId): la business unit va recuperata con una query su systemuser.
                        var buPromise = opts.businessUnitId
                            ? Promise.resolve(opts.businessUnitId)
                            : (opts.fascicoloId
                                ? Xrm.WebApi.retrieveRecord("agc_fascicolo2", opts.fascicoloId, "?$select=_owningbusinessunit_value")
                                    .then(function (f) { return f["_owningbusinessunit_value"]; })
                                : Xrm.WebApi.retrieveRecord("systemuser", Xrm.Utility.getGlobalContext().userSettings.userId.replace(/[{}]/g, ""), "?$select=_businessunitid_value")
                                    .then(function (u) { return u["_businessunitid_value"]; }));

                        return buPromise.then(function (buId) {
                            var filtroMag = "agc_ismagistrato eq true" +
                                (buId ? " and _owningbusinessunit_value eq " + buId : "");

                            return Xrm.WebApi.retrieveMultipleRecords("contact", "?$select=contactid&$filter=" + filtroMag)
                                .then(function (mag) {
                                    var totale = (mag.entities || []).length;
                                    if (totale > 0 && distinti >= totale) {
                                        return {
                                            warn: true,
                                            messaggio: "Assegnando questo fascicolo a " + (opts.candidatoNome || "questo magistrato") +
                                                ", tutti i " + totale + " magistrati disponibili per questo tribunale risulteranno impegnati come GIP sullo stesso procedimento (RGNR). " +
                                                (opts.candidatoNome || "Il magistrato") + " rappresenta l'ultima riserva disponibile per un eventuale futuro fascicolo GUP collegato allo stesso RGNR.\n\nProcedere comunque con l'assegnazione?"
                                        };
                                    }
                                    return { warn: false };
                                });
                        });
                    });
            });
    }

    /* Data odierna troncata a mezzanotte UTC, per confrontare gli intervalli
       [agc_datainizio, agc_datafine] (campi Data, senza componente ora
       significativa) a livello di sola data. Usando l'istante esatto
       (new Date().toISOString()) l'esonero risulterebbe scaduto già dalle 00:00
       del giorno di fine, invece di restare attivo per tutta quella giornata. */
    function oggiDataIso() {
        var oggi = new Date();
        return new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate())).toISOString();
    }

    /* ── Verifica esonero Totale (blocco assegnazione manuale) ──
       Un magistrato con esonero di tipo Totale (1) attivo alla data odierna non
       può ricevere assegnazioni manuali dirette (modifica del campo Magistrato
       sul form del fascicolo, che bypassa i controlli già presenti nel dialog
       di assegnazione assistita/massiva). A differenza della riserva GUP, qui
       il salvataggio viene sempre bloccato: non esiste un "assegna comunque". */
    function verificaEsoneroTotale(candidatoContactId) {
        var oggiIso = oggiDataIso();
        var filtro = "_agc_magistrato_value eq " + candidatoContactId +
            " and statecode eq 0 and agc_statoesonero eq 1 and agc_tipoesonero eq 1" +
            " and agc_datainizio le " + oggiIso +
            " and (agc_datafine ge " + oggiIso + " or agc_datafine eq null)";

        return Xrm.WebApi.retrieveMultipleRecords("agc_esonero", "?$select=agc_esoneroid,agc_datafine&$filter=" + filtro + "&$top=1")
            .then(function (result) {
                var entities = result.entities || [];
                var datafine = entities.length > 0 ? entities[0].agc_datafine : null;
                return { bloccato: entities.length > 0, datafine: datafine };
            });
    }

    /* Formatta una data ISO in gg/mm/aaaa per i messaggi utente */
    function formattaDataIt(dataIso) {
        if (!dataIso) return null;
        var d = new Date(dataIso);
        var gg = ("0" + d.getDate()).slice(-2);
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        return gg + "/" + mm + "/" + d.getFullYear();
    }

    /* ── Apre il dialog dalla form del fascicolo ── */
    function openDialog(formContext) {
        var rawId = formContext.data.entity.getId();
        var id = rawId.replace(/[{}]/g, "");
        var rgAttr = formContext.getAttribute("agc_numeroregistrogenerale");
        var rg = rgAttr ? (rgAttr.getValue() || "") : "";

        Xrm.Navigation.navigateTo(
            {
                pageType: "webresource",
                webresourceName: "agc_assignfascicolodialog.html",
                data: encodeURIComponent(JSON.stringify({ id: id, rg: rg }))
            },
            {
                target: 2,
                position: 1,
                width: { value: 600, unit: "px" },
                height: { value: 580, unit: "px" },
                title: "ASPEN - Assegnazione Fascicolo"
            }
        ).then(function () {
            formContext.data.refresh(false);
        });
    }

    /* ── Apre il dialog dalla vista (grid) del fascicolo ──
       Punto di ingresso del tasto "Assegna Fascicolo" in griglia. Con
       esattamente 1 record selezionato e senza magistrato assegnato, apre il
       dialog interattivo (permette di marcare incompatibilità prima di
       confermare). In tutti gli altri casi (selezione multipla, oppure 1 solo
       record ma già assegnato) esegue l'assegnazione automatica in batch sui
       soli fascicoli selezionati, con avviso se alcuni risultano già
       assegnati (vedi apriAssegnazioneSelezionati). */
    function openDialogFromGrid(selectedControl) {
        var rows = selectedControl.getGrid().getSelectedRows();
        if (!rows || rows.getLength() === 0) return;

        if (rows.getLength() === 1) {
            var row = rows.getAll()[0];
            var magAttr = row.data.entity.attributes.get("agc_magistratocontatto");
            var magValue = magAttr ? magAttr.getValue() : null;
            var giaAssegnato = !!(magValue && (!Array.isArray(magValue) || magValue.length > 0));
            if (!giaAssegnato) {
                return apriDialogAssegnazioneSingola(selectedControl, row);
            }
        }

        return apriAssegnazioneSelezionati(selectedControl, rows);
    }

    /* ── Dialog interattivo di assegnazione per un singolo fascicolo non assegnato ── */
    function apriDialogAssegnazioneSingola(selectedControl, row) {
        var id = row.data.entity.getId().replace(/[{}]/g, "");
        var rgAttr = row.data.entity.attributes.get("agc_numeroregistrogenerale");
        var rg = rgAttr ? (rgAttr.getValue() || "") : "";

        return Xrm.Navigation.navigateTo(
            {
                pageType: "webresource",
                webresourceName: "agc_assignfascicolodialog.html",
                data: encodeURIComponent(JSON.stringify({ id: id, rg: rg }))
            },
            {
                target: 2,
                position: 1,
                width: { value: 600, unit: "px" },
                height: { value: 580, unit: "px" },
                title: "ASPEN - Assegnazione Fascicolo"
            }
        ).then(function () {
            try { selectedControl.refresh(); } catch (e) { /* ignore */ }
        });
    }

    /* ── Assegnazione dei fascicoli selezionati in griglia (2 o più, oppure 1
       già assegnato) ──
       A differenza di "Assegnazione massiva" (che assegna TUTTI i fascicoli
       non assegnati nel sistema), qui si assegnano SOLO i fascicoli
       selezionati dall'utente, con la stessa logica automatica (continuità
       RGNR / minor carico, esclusione esonero Totale, avviso riserva GUP). Se
       tra i selezionati ci sono fascicoli già assegnati, l'utente viene
       avvisato che l'assegnazione corrente verrà sovrascritta e può annullare
       l'intera operazione (nessun fascicolo viene toccato in caso di
       annullamento). */
    function apriAssegnazioneSelezionati(selectedControl, rows) {
        var ids = rows.getAll().map(function (r) { return r.data.entity.getId().replace(/[{}]/g, ""); });
        if (ids.length === 0) return;

        Xrm.Utility.showProgressIndicator("Verifica fascicoli selezionati...");

        var filtroIds = ids.map(function (id) { return "agc_fascicolo2id eq " + id; }).join(" or ");

        return Xrm.WebApi.retrieveMultipleRecords(
            "agc_fascicolo2",
            "?$select=agc_fascicolo2id,agc_pesocalcolato,_agc_rgnr_value,agc_ruoloassegnazione,_owningbusinessunit_value,_agc_magistratocontatto_value&$filter=" + filtroIds
        ).then(function (result) {
            Xrm.Utility.closeProgressIndicator();
            var fascicoli = result.entities || [];
            if (fascicoli.length === 0) return;

            var giaAssegnati = fascicoli.filter(function (f) { return !!f["_agc_magistratocontatto_value"]; });

            var proceedPromise = giaAssegnati.length > 0
                ? Xrm.Navigation.openConfirmDialog(
                    {
                        title: "Fascicoli già assegnati",
                        text: giaAssegnati.length + " dei " + fascicoli.length + " fascicoli selezionati risultano già assegnati a un magistrato. " +
                            "Proseguendo, l'assegnazione di questi fascicoli verrà sovrascritta con una nuova assegnazione automatica. Continuare?",
                        confirmButtonLabel: "Assegna comunque",
                        cancelButtonLabel: "Annulla"
                    },
                    { height: 260, width: 540 }
                ).then(function (result) { return result.confirmed; })
                : Promise.resolve(true);

            return proceedPromise.then(function (proceed) {
                if (!proceed) return;

                Xrm.Utility.showProgressIndicator("Assegnazione fascicoli selezionati in corso...");

                return eseguiAssegnazioneSequenziale(fascicoli).then(function (esito) {
                    Xrm.Utility.closeProgressIndicator();
                    try { selectedControl.refresh(); } catch (e) { /* ignore */ }

                    if (esito.errore) {
                        return Xrm.Navigation.openAlertDialog({ title: "Assegnazione non riuscita", text: esito.errore });
                    }

                    var text = "Assegnati " + esito.assignedCount + " fascicoli su " + fascicoli.length + ".";
                    if (esito.skippedCount > 0) text += " " + esito.skippedCount + " saltati per riserva GUP non confermata.";
                    if (esito.errorCount > 0) text += " " + esito.errorCount + " assegnazioni non riuscite (vedi console).";

                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione completata", text: text });
                });
            });
        }).catch(function (err) {
            Xrm.Utility.closeProgressIndicator();
            var msg = (err && err.message) ? err.message : "Errore durante l'assegnazione dei fascicoli selezionati.";
            return Xrm.Navigation.openAlertDialog({ title: "Assegnazione non riuscita", text: msg });
        });
    }

    /* ── Nucleo comune di assegnazione sequenziale ──
       Usato sia da "Assegnazione massiva" (fascicoli = tutti i non assegnati
       nel sistema) sia dall'assegnazione dei fascicoli selezionati in griglia
       (fascicoli = solo quelli scelti dall'utente, eventualmente già
       assegnati). Ogni fascicolo viene assegnato al magistrato di continuità
       RGNR (se applicabile) o a quello con minor carico, aggiornando il
       carico in memoria (pesoPer) tra un'assegnazione e la successiva per non
       sovraccaricare sempre lo stesso magistrato. Restituisce una Promise che
       risolve in { assignedCount, skippedCount, errorCount, errore? }. */
    function eseguiAssegnazioneSequenziale(fascicoli) {
        if (!fascicoli || fascicoli.length === 0) {
            return Promise.resolve({ assignedCount: 0, skippedCount: 0, errorCount: 0 });
        }

        var idsDaAssegnare = {};
        fascicoli.forEach(function (f) { idsDaAssegnare[f.agc_fascicolo2id] = true; });

        return Xrm.WebApi.retrieveMultipleRecords("contact", "?$select=contactid,fullname,agc_caricoattuale&$filter=agc_ismagistrato eq true&$orderby=fullname")
            .then(function (magResult) {
                var magistrati = magResult.entities || [];
                if (magistrati.length === 0) {
                    return { assignedCount: 0, skippedCount: 0, errorCount: 0, errore: "Nessun magistrato trovato." };
                }

                /* 0. Esoneri attivi oggi: esclude i magistrati con esonero Totale,
                   calcola il coefficiente di carico equivalente per gli esoneri Parziali */
                var oggiIso = oggiDataIso();
                var filterEsoneri = magistrati.map(function (m) {
                    return "_agc_magistrato_value eq " + m.contactid;
                }).join(" or ");

                return Xrm.WebApi.retrieveMultipleRecords(
                    "agc_esonero",
                    "?$select=agc_tipoesonero,agc_percentualeesonero,_agc_magistrato_value&$filter=(" + filterEsoneri + ") and statecode eq 0 and agc_statoesonero eq 1 and agc_datainizio le " + oggiIso + " and (agc_datafine ge " + oggiIso + " or agc_datafine eq null)"
                ).then(function (esoneriResult) {
                    var esoneroPer = {}; // contactid -> { tipo, percentuale }
                    (esoneriResult.entities || []).forEach(function (e) {
                        var mid = e["_agc_magistrato_value"];
                        if (mid) esoneroPer[mid] = { tipo: e.agc_tipoesonero, percentuale: e.agc_percentualeesonero || 0 };
                    });

                    // Esclude i magistrati con esonero Totale (1) attivo
                    magistrati = magistrati.filter(function (m) {
                        var es = esoneroPer[m.contactid];
                        return !(es && es.tipo === 1);
                    });

                    if (magistrati.length === 0) {
                        return { assignedCount: 0, skippedCount: 0, errorCount: 0, errore: "Tutti i magistrati sono in esonero totale. Impossibile assegnare automaticamente." };
                    }

                    // Coefficiente moltiplicativo per esonero parziale (tipo 2)
                    var coeffPer = {};
                    magistrati.forEach(function (m) {
                        var es = esoneroPer[m.contactid];
                        coeffPer[m.contactid] = (es && es.tipo === 2 && es.percentuale > 0) ? (1 + es.percentuale / 100) : 1;
                    });

                    var pesoPer = {};
                    magistrati.forEach(function (m) { pesoPer[m.contactid] = m.agc_caricoattuale || 0; });

                    /* 1. Continuità fascicolo (3.3): mappa RGNR -> magistrato già assegnato,
                       escludendo i fascicoli che stiamo per (ri)assegnare in questo stesso
                       giro (altrimenti un fascicolo selezionato già assegnato manterrebbe
                       artificialmente la continuità con se stesso). */
                    return Xrm.WebApi.retrieveMultipleRecords(
                        "agc_fascicolo2",
                        "?$select=agc_fascicolo2id,_agc_rgnr_value,_agc_magistratocontatto_value&$filter=_agc_rgnr_value ne null and _agc_magistratocontatto_value ne null"
                    ).then(function (rgnrResult) {
                        var rgnrToMagistrato = {};
                        (rgnrResult.entities || []).forEach(function (f) {
                            if (idsDaAssegnare[f.agc_fascicolo2id]) return;
                            var rgnrId = f["_agc_rgnr_value"];
                            var magId = f["_agc_magistratocontatto_value"];
                            if (rgnrId && magId && !rgnrToMagistrato[rgnrId]) rgnrToMagistrato[rgnrId] = magId;
                        });

                        /* 2. Assegnazione sequenziale: ogni assegnazione aggiorna il carico
                           cumulativo (reale, non l'equivalente) in memoria prima di calcolare
                           il magistrato migliore per il fascicolo successivo. Se il fascicolo
                           appartiene a un RGNR già assegnato ad un magistrato compatibile, si
                           applica la continuità invece del calcolo per carico. Per le
                           assegnazioni non di continuità si applica anche la verifica di
                           riserva GUP (3.4): se l'utente non conferma l'avviso, il fascicolo
                           viene saltato e si passa al successivo. */
                        var assignedCount = 0;
                        var errorCount = 0;
                        var skippedCount = 0;
                        var chain = Promise.resolve();

                        fascicoli.forEach(function (f) {
                            chain = chain.then(function () {
                                var rgnrId = f["_agc_rgnr_value"];
                                var continuitaMagId = rgnrId ? rgnrToMagistrato[rgnrId] : null;
                                var continuitaOk = continuitaMagId && pesoPer.hasOwnProperty(continuitaMagId);

                                var scelto;
                                if (continuitaOk) {
                                    scelto = continuitaMagId;
                                } else {
                                    var migliore = magistrati.reduce(function (best, m) {
                                        return pesoPer[m.contactid] < pesoPer[best.contactid] ? m : best;
                                    });
                                    scelto = migliore.contactid;
                                }
                                var peso = f.agc_pesocalcolato || 0;

                                var checkPromise = continuitaOk
                                    ? Promise.resolve({ warn: false })
                                    : verificaRiservaGup({
                                        rgnrId: rgnrId,
                                        ruolo: f.agc_ruoloassegnazione,
                                        fascicoloId: f.agc_fascicolo2id,
                                        businessUnitId: f["_owningbusinessunit_value"],
                                        candidatoContactId: scelto,
                                        candidatoNome: (magistrati.filter(function (m) { return m.contactid === scelto; })[0] || {}).fullname
                                    });

                                return checkPromise.then(function (esito) {
                                    var proceedPromise = esito.warn
                                        ? Xrm.Navigation.openConfirmDialog(
                                            {
                                                title: "Riserva GUP",
                                                text: esito.messaggio,
                                                confirmButtonLabel: "Assegna comunque",
                                                cancelButtonLabel: "Salta questo fascicolo"
                                            },
                                            { height: 260, width: 540 }
                                        ).then(function (result) { return result.confirmed; })
                                        : Promise.resolve(true);

                                    return proceedPromise.then(function (proceed) {
                                        if (!proceed) {
                                            skippedCount++;
                                            return;
                                        }
                                        // Il carico reale (agc_caricoattuale) viene aggiornato dal plugin
                                        // server-side CaricoMagistratoAssegnazionePlugin appena il campo
                                        // Magistrato viene scritto: qui si aggiorna solo pesoPer in
                                        // memoria, per scegliere correttamente il magistrato meno carico
                                        // al giro successivo, senza riscrivere il contact.
                                        return Xrm.WebApi.updateRecord("agc_fascicolo2", f.agc_fascicolo2id, {
                                            "agc_magistratocontatto@odata.bind": "/contacts(" + scelto + ")"
                                        }).then(function () {
                                            var pesoEffettivo = peso * coeffPer[scelto];
                                            pesoPer[scelto] = pesoPer[scelto] + pesoEffettivo;
                                            if (rgnrId) rgnrToMagistrato[rgnrId] = scelto;
                                            assignedCount++;
                                        });
                                    });
                                }).catch(function (e) {
                                    errorCount++;
                                    console.error("[ASPEN] Errore assegnazione fascicolo " + f.agc_fascicolo2id, e);
                                });
                            });
                        });

                        return chain.then(function () {
                            return { assignedCount: assignedCount, skippedCount: skippedCount, errorCount: errorCount };
                        });
                    });
                });
            });
    }

    /* ── Assegnazione massiva: assegna tutti i fascicoli senza magistrato ──
       Stessa logica di "Assegna Fascicolo" (magistrato con minor carico,
       sommando i pesi calcolati dei fascicoli non chiusi) ma senza richiedere
       incompatibilità e applicata in sequenza a tutti i fascicoli non assegnati. */
    function openBulkAssignFromGrid(selectedControl) {
        Xrm.Navigation.openConfirmDialog(
            {
                title: "Conferma assegnazione massiva",
                text: "Verranno assegnati tutti i fascicoli attualmente senza magistrato al magistrato con il minor carico di lavoro. Continuare?",
                confirmButtonLabel: "Assegna tutti",
                cancelButtonLabel: "Annulla"
            },
            { height: 220, width: 520 }
        ).then(function (result) {
            if (!result.confirmed) return;

            Xrm.Utility.showProgressIndicator("Assegnazione massiva in corso...");

            /* Fascicoli attualmente non assegnati e non chiusi */
            return Xrm.WebApi.retrieveMultipleRecords(
                "agc_fascicolo2",
                "?$select=agc_fascicolo2id,agc_pesocalcolato,_agc_rgnr_value,agc_ruoloassegnazione,_owningbusinessunit_value&$filter=_agc_magistratocontatto_value eq null and (agc_statocaso ne 2 or agc_statocaso eq null)"
            ).then(function (unassignedResult) {
                var fascicoli = unassignedResult.entities || [];
                if (fascicoli.length === 0) {
                    Xrm.Utility.closeProgressIndicator();
                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva", text: "Non ci sono fascicoli da assegnare." });
                }

                return eseguiAssegnazioneSequenziale(fascicoli).then(function (esito) {
                    Xrm.Utility.closeProgressIndicator();
                    try { selectedControl.refresh(); } catch (e) { /* ignore */ }

                    if (esito.errore) {
                        return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva", text: esito.errore });
                    }

                    var text = "Assegnati " + esito.assignedCount + " fascicoli su " + fascicoli.length + ".";
                    if (esito.skippedCount > 0) text += " " + esito.skippedCount + " saltati per riserva GUP non confermata.";
                    if (esito.errorCount > 0) text += " " + esito.errorCount + " assegnazioni non riuscite (vedi console).";

                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva completata", text: text });
                });
            });
        }).catch(function (err) {
            Xrm.Utility.closeProgressIndicator();
            var msg = (err && err.message) ? err.message : "Errore durante l'assegnazione massiva.";
            return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva non riuscita", text: msg });
        });
    }

    /* ── Enable rule per la vista: mostra solo se nessun record è selezionato ── */
    function isBulkAssignVisible(selectedControl) {
        try {
            var rows = selectedControl.getGrid().getSelectedRows();
            return !rows || rows.getLength() === 0;
        } catch (e) {
            console.error("[ASPEN] isBulkAssignVisible error:", e);
            return false;
        }
    }

    function openCloseDialog(formContext) {
        var rawId = formContext.data.entity.getId();
        var id = rawId ? rawId.replace(/[{}]/g, "") : "";
        if (!id) return;

        var rgAttr = formContext.getAttribute("agc_numeroregistrogenerale");
        var rg = rgAttr ? (rgAttr.getValue() || "") : "";

        Xrm.Navigation.openConfirmDialog(
            {
                title: "Conferma chiusura fascicolo",
                text: "Vuoi chiudere il fascicolo" + (rg ? " " + rg : "") + "?",
                confirmButtonLabel: "Chiudi caso",
                cancelButtonLabel: "Annulla"
            },
            { height: 220, width: 520 }
        ).then(function (result) {
            if (!result.confirmed) return;

            Xrm.Utility.showProgressIndicator("Chiusura fascicolo in corso...");
            return Xrm.WebApi.updateRecord("agc_fascicolo2", id, {
                agc_statocaso: STATO_CHIUSO
            }).then(function () {
                return formContext.data.refresh(false).then(function () {
                    try { formContext.ui.refreshRibbon(true); } catch (e) { /* ignore */ }
                });
            }).catch(function (e) {
                var msg = (e && e.message) ? e.message : "Errore durante la chiusura del fascicolo.";
                return Xrm.Navigation.openAlertDialog({
                    title: "Chiusura non riuscita",
                    text: msg
                });
            }).finally(function () {
                Xrm.Utility.closeProgressIndicator();
            });
        });
    }

    /* ── OnLoad della form: forza refresh ribbon dopo caricamento completo ── */
    function onFormLoad(executionContext) {
        var formContext = executionContext.getFormContext
            ? executionContext.getFormContext()
            : executionContext;

        try {
            var canestroCtrl = formContext.getControl("agc_canestrofascicolo");
            if (canestroCtrl) canestroCtrl.setDisabled(false);
        } catch (e) { /* ignore */ }

        try {
            var peso2Ctrl = formContext.getControl("agc_peso2");
            if (peso2Ctrl) peso2Ctrl.setDisabled(false);
        } catch (e) { /* ignore */ }

        setTimeout(function () {
            try { formContext.ui.refreshRibbon(true); } catch (e) { /* ignore */ }
        }, 1000);

        /* ── Regola 3.11 "carico monotono": la riassegnazione di un fascicolo da un
           magistrato A ad un magistrato B deve decrementare il carico di A (oltre
           ad incrementare quello di B). Si cattura il magistrato originale al
           caricamento della form e lo si confronta al salvataggio.
           Caso "Nuovo Fascicolo" da subgrid del Contatto: il campo Magistrato
           Contatto risulta già precompilato al caricamento (ereditato dal record
           padre), ma il carico non è mai stato incrementato per questo fascicolo.
           Il record è privo di Id finché non viene salvato la prima volta,
           indipendentemente dal tipo di form (Create pieno o pannello Quick
           Create aperto dalla subgrid, formType 5): usare questa condizione
           invece di formType è quindi più affidabile. Su un record nuovo il
           valore "originale" va considerato nullo, così il salvataggio lo
           tratta come una vera prima assegnazione. ── */
        try {
            var rawFascicoloId = formContext.data.entity.getId();
            var isNewRecord = !rawFascicoloId || rawFascicoloId === "{00000000-0000-0000-0000-000000000000}";
            var origMagAttr = formContext.getAttribute("agc_magistratocontatto");
            var origMagValue = origMagAttr ? origMagAttr.getValue() : null;
            var origMagId = (!isNewRecord && origMagValue && origMagValue.length > 0) ? origMagValue[0].id.replace(/[{}]/g, "") : null;
            // Unico flag di stato per il magistrato già validato (esonero Totale +
            // eventuale riserva GUP) in questo giro di salvataggio: evita di
            // ripetere i controlli ad ogni resave programmatico (con conseguente
            // doppia verifica/loop).
            var magistratoGiaValidato = null;
            // Guardia di re-entrancy: evita che il save() programmatico innescato da
            // questo stesso handler (dopo la verifica) collida con un altro salvataggio
            // già in corso (autosave, doppio click su Salva) generando l'errore
            // Dataverse 0x83215603 ("salvataggio già in corso").
            var salvataggioInCorso = false;

            // NOTA: l'aggiornamento di agc_caricoattuale (regola 3.11 "carico monotono") è
            // gestito interamente lato server dal plugin CaricoMagistratoAssegnazionePlugin,
            // registrato su Create/Update di agc_fascicolo2. Questo copre in modo uniforme
            // tutti i percorsi di assegnazione (form, subgrid, "Aggiungi esistente", bulk edit,
            // import), incluso il caso in cui il campo venga impostato senza mai aprire il form
            // (dove questo script non verrebbe eseguito). Qui restano solo le validazioni che
            // richiedono un'interazione con l'utente prima del salvataggio.

            formContext.data.entity.addOnSave(function (saveEventArgs) {
                try {
                    var eventArgsSaveMode = saveEventArgs.getEventArgs();
                    // Autosave (saveMode 70): non attendato dall'utente, non deve mai
                    // aprire dialog di verifica/conferma né innescare un re-save
                    // programmatico. Si annulla soltanto l'autosave stesso: la modifica
                    // resta in form (dirty) e verrà validata al primo salvataggio esplicito.
                    if (eventArgsSaveMode.getSaveMode && eventArgsSaveMode.getSaveMode() === 70) {
                        var magAttrAuto = formContext.getAttribute("agc_magistratocontatto");
                        var magValueAuto = magAttrAuto ? magAttrAuto.getValue() : null;
                        var newMagIdAuto = (magValueAuto && magValueAuto.length > 0) ? magValueAuto[0].id.replace(/[{}]/g, "") : null;
                        if (newMagIdAuto !== origMagId && magistratoGiaValidato !== newMagIdAuto) {
                            eventArgsSaveMode.preventDefault();
                        }
                        return;
                    }

                    var magAttr = formContext.getAttribute("agc_magistratocontatto");
                    var magValue = magAttr ? magAttr.getValue() : null;
                    var newMagId = (magValue && magValue.length > 0) ? magValue[0].id.replace(/[{}]/g, "") : null;

                    if (newMagId === origMagId) {
                        magistratoGiaValidato = null;
                        return; // nessuna modifica al magistrato: nulla da validare
                    }

                    if (!newMagId) {
                        // Il campo magistrato è stato svuotato: nessuna validazione necessaria,
                        // il decremento del carico è gestito dal plugin server-side.
                        magistratoGiaValidato = null;
                        return;
                    }

                    // Se i controlli (esonero Totale + eventuale riserva GUP) sono già
                    // stati superati in questo stesso giro di salvataggio (il re-save
                    // programmatico innescato da noi stessi più sotto), lascia procedere
                    // il salvataggio nativo senza ripeterli e SENZA passare dal controllo
                    // salvataggioInCorso qui sotto (che bloccherebbe anche questo stesso
                    // re-save, dato che il flag è stato impostato subito prima di
                    // richiamare formContext.data.save()).
                    if (magistratoGiaValidato === newMagId) return;

                    // Se un salvataggio ESTERNO (autosave concorrente, doppio click su
                    // Salva) arriva mentre è già in corso il nostro re-save differito per
                    // un'assegnazione non ancora validata, blocca solo questo: evita la
                    // collisione che genera 0x83215603.
                    if (salvataggioInCorso) {
                        eventArgsSaveMode.preventDefault();
                        return;
                    }

                    eventArgsSaveMode.preventDefault();

                    var candidatoNomeEsonero = magValue[0].name;

                    return verificaEsoneroTotale(newMagId).then(function (esito) {
                        if (esito.bloccato) {
                            var dataFineTxt = formattaDataIt(esito.datafine);
                            var dettaglioFine = dataFineTxt
                                ? " fino al " + dataFineTxt
                                : " a tempo indeterminato";
                            Xrm.Navigation.openAlertDialog({
                                title: "Assegnazione non consentita",
                                text: "Impossibile assegnare il fascicolo a " + candidatoNomeEsonero +
                                    ": il magistrato è attualmente in esonero Totale" + dettaglioFine +
                                    ". Selezionare un altro magistrato o attendere il rientro dall'esonero."
                            });
                            return; // salvataggio resta annullato, form ancora dirty
                        }

                        // Riserva GUP (3.4): verifica solo se applicabile (ruolo GIP con
                        // RGNR valorizzato). Se necessario, mostra l'avviso e procede solo
                        // su conferma dell'utente.
                        var rgnrAttr = formContext.getAttribute("agc_rgnr");
                        var ruoloAttr = formContext.getAttribute("agc_ruoloassegnazione");
                        var rgnrVal = rgnrAttr ? rgnrAttr.getValue() : null;
                        var rgnrId = (rgnrVal && rgnrVal.length > 0) ? rgnrVal[0].id.replace(/[{}]/g, "") : null;
                        var ruolo = ruoloAttr ? ruoloAttr.getValue() : null;

                        var rawFascicoloIdRiserva = formContext.data.entity.getId();
                        var fascicoloIdRiserva = rawFascicoloIdRiserva ? rawFascicoloIdRiserva.replace(/[{}]/g, "") : null;
                        var candidatoNome = magValue[0].name;

                        var riservaPromise = (rgnrId && ruolo === RUOLO_GIP)
                            ? verificaRiservaGup({
                                rgnrId: rgnrId,
                                ruolo: ruolo,
                                fascicoloId: fascicoloIdRiserva,
                                candidatoContactId: newMagId,
                                candidatoNome: candidatoNome
                            }).then(function (esitoRiserva) {
                                return esitoRiserva.warn
                                    ? Xrm.Navigation.openConfirmDialog(
                                        {
                                            title: "Riserva GUP",
                                            text: esitoRiserva.messaggio,
                                            confirmButtonLabel: "Assegna comunque",
                                            cancelButtonLabel: "Annulla"
                                        },
                                        { height: 260, width: 540 }
                                    ).then(function (result) { return result.confirmed; })
                                    : true;
                            })
                            : Promise.resolve(true);

                        return riservaPromise.then(function (proceed) {
                            if (!proceed) {
                                magistratoGiaValidato = null;
                                return; // salvataggio resta annullato, form ancora dirty
                            }
                            magistratoGiaValidato = newMagId;
                            // Il carico viene aggiornato dal plugin server-side alla scrittura di
                            // questo salvataggio: nessuna ulteriore azione lato client necessaria.
                            // Un eventuale errore di persistenza (es. regola server-side bloccante,
                            // come l'esonero Totale rilevato lato plugin) viene gestito qui
                            // separatamente dagli errori di VERIFICA più sotto: si mostra il vero
                            // errore all'utente, senza ritentare ciecamente il salvataggio.
                            // Il re-save viene differito (setTimeout) e protetto da
                            // salvataggioInCorso: il save() sincrono innescato qui dentro
                            // l'handler di OnSave può altrimenti collidere con un salvataggio
                            // già in corso (autosave/doppio click), producendo l'errore
                            // Dataverse 0x83215603 ("salvataggio già in corso").
                            salvataggioInCorso = true;
                            return new Promise(function (resolve) {
                                setTimeout(function () {
                                    resolve(formContext.data.save().catch(function (saveErr) {
                                        magistratoGiaValidato = null;
                                        console.error("[ASPEN] Errore durante il salvataggio dell'assegnazione:", saveErr);
                                        Xrm.Navigation.openAlertDialog({
                                            title: "Salvataggio non riuscito",
                                            text: "Non è stato possibile salvare l'assegnazione: " +
                                                (saveErr && saveErr.message ? saveErr.message : "errore sconosciuto") +
                                                ". Il fascicolo NON è stato riassegnato: verificare e riprovare."
                                        });
                                    }).then(function (result) {
                                        salvataggioInCorso = false;
                                        return result;
                                    }));
                                }, 0);
                            });
                        });
                    }).catch(function (e) {
                        // Errore nella VERIFICA (esonero Totale / riserva GUP), non nel
                        // salvataggio: l'esonero Totale è un vincolo bloccante, quindi in caso di
                        // errore di rete/permessi la verifica non può essere bypassata. Il
                        // salvataggio resta annullato (form ancora dirty) e l'utente viene avvisato,
                        // invece di procedere silenziosamente come se non ci fossero esoneri.
                        console.error("[ASPEN] Errore verifica esonero/riserva GUP, salvataggio annullato per sicurezza:", e);
                        magistratoGiaValidato = null;
                        Xrm.Navigation.openAlertDialog({
                            title: "Verifica non riuscita",
                            text: "Non è stato possibile verificare gli esoneri/la riserva GUP per il magistrato selezionato (errore di rete o di permessi). " +
                                "Il salvataggio è stato annullato per sicurezza. Riprovare più tardi o contattare l'amministratore." +
                                (e && e.message ? ("\n\nDettaglio tecnico: " + e.message) : "")
                        });
                    });
                } catch (e) {
                    console.error("[ASPEN] Errore onSave riassegnazione:", e);
                }
            });
        } catch (e) {
            console.error("[ASPEN] Errore registrazione onSave riassegnazione:", e);
        }
    }

    /* ── Enable rule per la form: false se magistrato già assegnato ── */
    function isEnabledForm(formContext) {
        try {
            var magistrato = formContext.getAttribute("agc_magistratocontatto");
            console.log("[ASPEN] isEnabledForm - attr:", magistrato, "val:", magistrato ? magistrato.getValue() : "N/A");
            if (!magistrato) return true;
            var val = magistrato.getValue();
            // lookup restituisce null se vuoto, array [{id, entityType, name}] se valorizzato
            if (val === null || val === undefined) return true;
            if (Array.isArray(val) && val.length === 0) return true;
            return false;
        } catch (e) {
            console.error("[ASPEN] isEnabledForm error:", e);
            return false; // se errore disabilita il tasto per sicurezza
        }
    }

    /* ── Enable rule per la grid: false se magistrato già assegnato ── */
    function isEnabledGrid(selectedControl) {
        try {
            var rows = selectedControl.getGrid().getSelectedRows();
            if (!rows || rows.getLength() !== 1) return false;
            var row = rows.getAll()[0];

            var magistrato = row.data.entity.attributes.get("agc_magistratocontatto");
            console.log("[ASPEN] isEnabledGrid - attr:", magistrato, "val:", magistrato ? magistrato.getValue() : "N/A");
            if (magistrato) {
                var val = magistrato.getValue();
                if (val !== null && val !== undefined) {
                    if (!Array.isArray(val) || val.length > 0) return false;
                }
            }

            // Fallback: scorri tutti gli attributi cercando il nome del campo magistrato
            var allAttrs = row.data.entity.attributes.getAll();
            for (var i = 0; i < allAttrs.length; i++) {
                var name = allAttrs[i].getName();
                if (name && name.toLowerCase().indexOf("magistratocontatto") !== -1) {
                    var v = allAttrs[i].getValue();
                    console.log("[ASPEN] isEnabledGrid fallback attr:", name, "=", v);
                    if (v !== null && v !== undefined && v !== "") return false;
                }
            }

            return true;
        } catch (e) {
            console.error("[ASPEN] isEnabledGrid error:", e);
            return false;
        }
    }

    function isCloseEnabledForm(formContext) {
        try {
            var statoAttr = formContext.getAttribute("agc_statocaso");
            if (!statoAttr) return true;

            var val = statoAttr.getValue();
            if (val === STATO_CHIUSO) return false;

            var text = statoAttr.getText ? (statoAttr.getText() || "") : "";
            return text.toLowerCase() !== "chiuso";
        } catch (e) {
            console.error("[ASPEN] isCloseEnabledForm error:", e);
            return false;
        }
    }

    return {
        openDialog: openDialog,
        openDialogFromGrid: openDialogFromGrid,
        openBulkAssignFromGrid: openBulkAssignFromGrid,
        openCloseDialog: openCloseDialog,
        onFormLoad: onFormLoad,
        isEnabledForm: isEnabledForm,
        isEnabledGrid: isEnabledGrid,
        isBulkAssignVisible: isBulkAssignVisible,
        isCloseEnabledForm: isCloseEnabledForm
    };

})();
