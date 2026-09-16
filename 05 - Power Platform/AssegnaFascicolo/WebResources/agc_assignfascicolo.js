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

                        var buPromise = opts.businessUnitId
                            ? Promise.resolve(opts.businessUnitId)
                            : Xrm.WebApi.retrieveRecord("agc_fascicolo2", opts.fascicoloId, "?$select=_owningbusinessunit_value")
                                .then(function (f) { return f["_owningbusinessunit_value"]; });

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

    /* ── Verifica esonero Totale (blocco assegnazione manuale) ──
       Un magistrato con esonero di tipo Totale (1) attivo alla data odierna non
       può ricevere assegnazioni manuali dirette (modifica del campo Magistrato
       sul form del fascicolo, che bypassa i controlli già presenti nel dialog
       di assegnazione assistita/massiva). A differenza della riserva GUP, qui
       il salvataggio viene sempre bloccato: non esiste un "assegna comunque". */
    function verificaEsoneroTotale(candidatoContactId) {
        var oggiIso = new Date().toISOString();
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

    /* ── Coefficiente di carico per esonero parziale (assegnazione manuale) ──
       Un magistrato con esonero Parziale (2) attivo ha capacità ridotta: ogni
       fascicolo assegnatogli pesa di più sul suo carico reale, proporzionalmente
       alla percentuale di esonero (es. 30% => il peso del fascicolo va
       moltiplicato per 1.3). Nessun esonero attivo => coefficiente 1 (peso invariato). */
    function ottieniCoefficienteCarico(candidatoContactId) {
        var oggiIso = new Date().toISOString();
        var filtro = "_agc_magistrato_value eq " + candidatoContactId +
            " and statecode eq 0 and agc_statoesonero eq 1 and agc_tipoesonero eq 2" +
            " and agc_datainizio le " + oggiIso +
            " and (agc_datafine ge " + oggiIso + " or agc_datafine eq null)";

        return Xrm.WebApi.retrieveMultipleRecords("agc_esonero", "?$select=agc_percentualeesonero&$filter=" + filtro + "&$top=1")
            .then(function (result) {
                var entities = result.entities || [];
                var percentuale = entities.length > 0 ? (entities[0].agc_percentualeesonero || 0) : 0;
                return percentuale > 0 ? (1 + percentuale / 100) : 1;
            });
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

    /* ── Apre il dialog dalla vista (grid) del fascicolo ── */
    function openDialogFromGrid(selectedControl) {
        var rows = selectedControl.getGrid().getSelectedRows();
        if (!rows || rows.getLength() !== 1) return;

        var row = rows.getAll()[0];
        var id = row.data.entity.getId().replace(/[{}]/g, "");
        var rgAttr = row.data.entity.attributes.get("agc_numeroregistrogenerale");
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
            try { selectedControl.refresh(); } catch (e) { /* ignore */ }
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

            Xrm.WebApi.retrieveMultipleRecords("contact", "?$select=contactid,fullname,agc_caricoattuale&$filter=agc_ismagistrato eq true&$orderby=fullname")
                .then(function (magResult) {
                    var magistrati = magResult.entities || [];
                    if (magistrati.length === 0) {
                        Xrm.Utility.closeProgressIndicator();
                        return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva", text: "Nessun magistrato trovato." });
                    }

                    /* 0. Esoneri attivi oggi: esclude i magistrati con esonero Totale,
                       calcola il coefficiente di carico equivalente per gli esoneri Parziali */
                    var oggiIso = new Date().toISOString();
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
                            Xrm.Utility.closeProgressIndicator();
                            return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva", text: "Tutti i magistrati sono in esonero totale. Impossibile assegnare automaticamente." });
                        }

                        // Coefficiente moltiplicativo per esonero parziale (tipo 2): il peso di
                        // ogni fascicolo assegnato ad un magistrato con esonero parziale viene
                        // aumentato proporzionalmente (es. 30% => x1.3) prima di sommarlo al
                        // carico reale del magistrato, sia ai fini del confronto sia del salvataggio.
                        var coeffPer = {};
                        magistrati.forEach(function (m) {
                            var es = esoneroPer[m.contactid];
                            coeffPer[m.contactid] = (es && es.tipo === 2 && es.percentuale > 0) ? (1 + es.percentuale / 100) : 1;
                        });

                        /* 1. Carico cumulativo attuale (agc_caricoattuale, regola 3.11 "carico
                           monotono": cresce con ogni assegnazione, non diminuisce mai per
                           chiusura fascicolo). pesoPer tiene il carico REALE già effettivo
                           (ogni fascicolo sommato include il coefficiente di esonero parziale
                           del magistrato a cui è stato assegnato), quindi il confronto tra
                           magistrati si fa direttamente su pesoPer, senza ri-moltiplicare. */
                        var pesoPer = {};
                        magistrati.forEach(function (m) { pesoPer[m.contactid] = m.agc_caricoattuale || 0; });

                        /* 1b. Continuità fascicolo (3.3): mappa RGNR -> magistrato già assegnato,
                           per assegnare automaticamente allo stesso magistrato i fascicoli dello
                           stesso RGNR ancora da assegnare. */
                        return Xrm.WebApi.retrieveMultipleRecords(
                            "agc_fascicolo2",
                            "?$select=_agc_rgnr_value,_agc_magistratocontatto_value&$filter=_agc_rgnr_value ne null and _agc_magistratocontatto_value ne null"
                        ).then(function (rgnrResult) {
                            var rgnrToMagistrato = {};
                            (rgnrResult.entities || []).forEach(function (f) {
                                var rgnrId = f["_agc_rgnr_value"];
                                var magId = f["_agc_magistratocontatto_value"];
                                if (rgnrId && magId && !rgnrToMagistrato[rgnrId]) rgnrToMagistrato[rgnrId] = magId;
                            });

                            /* 2. Fascicoli attualmente non assegnati e non chiusi */
                            return Xrm.WebApi.retrieveMultipleRecords(
                                "agc_fascicolo2",
                                "?$select=agc_pesocalcolato,_agc_rgnr_value,agc_ruoloassegnazione,_owningbusinessunit_value&$filter=_agc_magistratocontatto_value eq null and (agc_statocaso ne 2 or agc_statocaso eq null)"
                            ).then(function (unassignedResult) {
                                var fascicoli = unassignedResult.entities || [];
                                if (fascicoli.length === 0) {
                                    Xrm.Utility.closeProgressIndicator();
                                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva", text: "Non ci sono fascicoli da assegnare." });
                                }

                                /* 3. Assegnazione sequenziale: ogni assegnazione aggiorna il carico
                                   cumulativo (reale, non l'equivalente) sia in memoria che sul
                                   record contact, prima di calcolare il magistrato migliore per il
                                   fascicolo successivo (confrontando il carico reale già effettivo,
                                   che include il coefficiente di esonero parziale). Se il fascicolo
                                   appartiene a un RGNR già assegnato ad un magistrato compatibile, si
                                   applica la continuità invece del calcolo per carico. Il carico non
                                   viene mai decrementato in questo flusso (nessuna chiusura qui). Per
                                   le assegnazioni non di continuità si applica anche la verifica di
                                   riserva GUP (3.4): se l'utente non conferma l'avviso, il fascicolo
                                   viene saltato (resta non assegnato) e si passa al successivo. */
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

                                        // Riserva GUP (3.4): verifica solo per assegnazioni "nuove" (non
                                        // di continuità) di fascicoli di ruolo GIP collegati a un RGNR.
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
                                                return Xrm.WebApi.updateRecord("agc_fascicolo2", f.agc_fascicolo2id, {
                                                    "agc_magistratocontatto@odata.bind": "/contacts(" + scelto + ")"
                                                }).then(function () {
                                                    var pesoEffettivo = peso * coeffPer[scelto];
                                                    var nuovoCarico = pesoPer[scelto] + pesoEffettivo;
                                                    return Xrm.WebApi.updateRecord("contact", scelto, { agc_caricoattuale: nuovoCarico }).then(function () {
                                                        pesoPer[scelto] = nuovoCarico;
                                                        if (rgnrId) rgnrToMagistrato[rgnrId] = scelto;
                                                        assignedCount++;
                                                    });
                                                });
                                            });
                                        }).catch(function (e) {
                                            errorCount++;
                                            console.error("[ASPEN] Errore assegnazione massiva fascicolo " + f.agc_fascicolo2id, e);
                                        });
                                    });
                                });

                                return chain.then(function () {
                                    Xrm.Utility.closeProgressIndicator();
                                    try { selectedControl.refresh(); } catch (e) { /* ignore */ }

                                    var text = "Assegnati " + assignedCount + " fascicoli su " + fascicoli.length + ".";
                                    if (skippedCount > 0) text += " " + skippedCount + " saltati per riserva GUP non confermata.";
                                    if (errorCount > 0) text += " " + errorCount + " assegnazioni non riuscite (vedi console).";

                                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva completata", text: text });
                                });
                            });
                        });
                    });
                })
                .catch(function (err) {
                    Xrm.Utility.closeProgressIndicator();
                    var msg = (err && err.message) ? err.message : "Errore durante l'assegnazione massiva.";
                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva non riuscita", text: msg });
                });
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
           Su form Create il valore "originale" va quindi considerato nullo, così
           il salvataggio la tratta come una vera prima assegnazione. ── */
        try {
            var isCreateForm = formContext.ui.getFormType() === 1;
            var origMagAttr = formContext.getAttribute("agc_magistratocontatto");
            var origMagValue = origMagAttr ? origMagAttr.getValue() : null;
            var origMagId = (!isCreateForm && origMagValue && origMagValue.length > 0) ? origMagValue[0].id.replace(/[{}]/g, "") : null;
            var riservaGupBypass = false; // evita di ri-verificare la riserva sul resave programmatico
            var esoneroTotaleBypass = false; // evita di ri-verificare l'esonero sul resave programmatico

            function aggiornaCaricoRiassegnazione(newMagId) {
                var pesoAttr = formContext.getAttribute("agc_pesocalcolato");
                var peso = pesoAttr ? (pesoAttr.getValue() || 0) : 0;
                var fascicoloId = formContext.data.entity.getId().replace(/[{}]/g, "");
                var vecchioMagId = origMagId; // può essere null (prima assegnazione, nessun decremento)

                // Decremento carico del vecchio magistrato (mai sotto zero), solo se già assegnato
                var decrementoPromise = vecchioMagId
                    ? Xrm.WebApi.retrieveRecord("contact", vecchioMagId, "?$select=agc_caricoattuale").then(function (oldContact) {
                        var nuovoCaricoOld = Math.max(0, (oldContact.agc_caricoattuale || 0) - peso);
                        return Xrm.WebApi.updateRecord("contact", vecchioMagId, { agc_caricoattuale: nuovoCaricoOld });
                    })
                    : Promise.resolve();

                decrementoPromise.then(function () {
                    // Incremento del nuovo magistrato: se ha un esonero Parziale attivo, il peso
                    // del fascicolo viene aumentato proporzionalmente (es. 30% => x1.3)
                    return Promise.all([
                        Xrm.WebApi.retrieveRecord("contact", newMagId, "?$select=agc_caricoattuale"),
                        ottieniCoefficienteCarico(newMagId)
                    ]);
                }).then(function (results) {
                    var newContact = results[0];
                    var coeff = results[1];
                    var pesoEffettivo = peso * coeff;
                    var nuovoCaricoNew = (newContact.agc_caricoattuale || 0) + pesoEffettivo;
                    return Xrm.WebApi.updateRecord("contact", newMagId, { agc_caricoattuale: nuovoCaricoNew });
                }).then(function () {
                    origMagId = newMagId; // aggiorna il riferimento per eventuali salvataggi successivi senza refresh form
                    console.log("[ASPEN] Assegnazione fascicolo " + fascicoloId + ": carico spostato da " + (vecchioMagId || "(nessuno)") + " a " + newMagId);
                }).catch(function (e) {
                    console.error("[ASPEN] Errore aggiornamento carico su riassegnazione:", e);
                });
            }

            /* ── Regola 3.11 "carico monotono" (rimozione assegnazione): quando il
               magistrato viene tolto dal fascicolo (campo svuotato) senza assegnarne
               uno nuovo, il peso del fascicolo va comunque decrementato dal carico
               del magistrato che lo deteneva. ── */
            function decrementaCaricoRimozione(vecchioMagId) {
                if (!vecchioMagId) return;
                var pesoAttr = formContext.getAttribute("agc_pesocalcolato");
                var peso = pesoAttr ? (pesoAttr.getValue() || 0) : 0;
                var fascicoloId = formContext.data.entity.getId().replace(/[{}]/g, "");

                Xrm.WebApi.retrieveRecord("contact", vecchioMagId, "?$select=agc_caricoattuale").then(function (oldContact) {
                    var nuovoCaricoOld = Math.max(0, (oldContact.agc_caricoattuale || 0) - peso);
                    return Xrm.WebApi.updateRecord("contact", vecchioMagId, { agc_caricoattuale: nuovoCaricoOld });
                }).then(function () {
                    origMagId = null; // aggiorna il riferimento per eventuali salvataggi successivi senza refresh form
                    console.log("[ASPEN] Rimozione assegnazione fascicolo " + fascicoloId + ": carico decrementato per magistrato " + vecchioMagId);
                }).catch(function (e) {
                    console.error("[ASPEN] Errore decremento carico su rimozione assegnazione:", e);
                });
            }

            formContext.data.entity.addOnSave(function (saveEventArgs) {
                try {
                    var magAttr = formContext.getAttribute("agc_magistratocontatto");
                    var magValue = magAttr ? magAttr.getValue() : null;
                    var newMagId = (magValue && magValue.length > 0) ? magValue[0].id.replace(/[{}]/g, "") : null;

                    // Esonero Totale (blocco assegnazione manuale): si applica sia alla prima
                    // assegnazione (origMagId nullo) sia alla riassegnazione, ogni volta che il
                    // magistrato selezionato cambia rispetto a quello già in salvataggio.
                    if (newMagId && newMagId !== origMagId && !esoneroTotaleBypass) {
                        var eventArgsEsonero = saveEventArgs.getEventArgs();
                        eventArgsEsonero.preventDefault();

                        var candidatoNomeEsonero = magValue[0].name;

                        verificaEsoneroTotale(newMagId).then(function (esito) {
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
                            esoneroTotaleBypass = true;
                            formContext.data.save();
                        }).catch(function (e) {
                            console.error("[ASPEN] Errore verifica esonero totale, salvataggio consentito senza controllo:", e);
                            esoneroTotaleBypass = true;
                            formContext.data.save();
                        });
                        return;
                    }
                    esoneroTotaleBypass = false;

                    if (newMagId === origMagId) return;

                    if (!newMagId) {
                        // Il campo magistrato è stato svuotato: nessuna assegnazione nuova,
                        // ma il carico del magistrato precedente va comunque decrementato.
                        decrementaCaricoRimozione(origMagId);
                        return;
                    }

                    if (riservaGupBypass) {
                        riservaGupBypass = false;
                        aggiornaCaricoRiassegnazione(newMagId);
                        return;
                    }

                    // Riserva GUP (3.4): verifica prima di lasciar procedere il salvataggio.
                    // Se applicabile, si interrompe il salvataggio (preventDefault), si mostra
                    // l'avviso e, solo se l'utente conferma, si ri-esegue il salvataggio.
                    var rgnrAttr = formContext.getAttribute("agc_rgnr");
                    var ruoloAttr = formContext.getAttribute("agc_ruoloassegnazione");
                    var rgnrVal = rgnrAttr ? rgnrAttr.getValue() : null;
                    var rgnrId = (rgnrVal && rgnrVal.length > 0) ? rgnrVal[0].id.replace(/[{}]/g, "") : null;
                    var ruolo = ruoloAttr ? ruoloAttr.getValue() : null;

                    if (!rgnrId || ruolo !== RUOLO_GIP) {
                        aggiornaCaricoRiassegnazione(newMagId);
                        return;
                    }

                    var eventArgs = saveEventArgs.getEventArgs();
                    eventArgs.preventDefault();

                    var fascicoloId = formContext.data.entity.getId().replace(/[{}]/g, "");
                    var candidatoNome = magValue[0].name;

                    verificaRiservaGup({
                        rgnrId: rgnrId,
                        ruolo: ruolo,
                        fascicoloId: fascicoloId,
                        candidatoContactId: newMagId,
                        candidatoNome: candidatoNome
                    }).then(function (esito) {
                        var proceedPromise = esito.warn
                            ? Xrm.Navigation.openConfirmDialog(
                                {
                                    title: "Riserva GUP",
                                    text: esito.messaggio,
                                    confirmButtonLabel: "Assegna comunque",
                                    cancelButtonLabel: "Annulla"
                                },
                                { height: 260, width: 540 }
                            ).then(function (result) { return result.confirmed; })
                            : Promise.resolve(true);

                        return proceedPromise.then(function (proceed) {
                            if (!proceed) return; // salvataggio resta annullato, form ancora dirty
                            riservaGupBypass = true;
                            formContext.data.save();
                        });
                    }).catch(function (e) {
                        console.error("[ASPEN] Errore verifica riserva GUP, salvataggio consentito senza controllo:", e);
                        riservaGupBypass = true;
                        formContext.data.save();
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
