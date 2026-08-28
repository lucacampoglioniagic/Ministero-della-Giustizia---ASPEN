"use strict";
// eslint-disable-next-line no-var
var AgicAspen = window.AgicAspen || {};

AgicAspen.AssegnaFascicolo = (function () {
    var STATO_CHIUSO = 2;

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
                        "?$select=agc_tipoesonero,agc_percentualeesonero,_agc_magistrato_value&$filter=(" + filterEsoneri + ") and agc_statoesonero eq 1 and agc_datainizio le " + oggiIso + " and (agc_datafine ge " + oggiIso + " or agc_datafine eq null)"
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

                        // Coefficiente moltiplicativo per esonero parziale (tipo 2): un magistrato con
                        // esonero parziale ha capacità ridotta, quindi il suo carico "equivalente" ai
                        // fini del confronto viene aumentato proporzionalmente (es. 30% => x1.3)
                        var coeffPer = {};
                        magistrati.forEach(function (m) {
                            var es = esoneroPer[m.contactid];
                            coeffPer[m.contactid] = (es && es.tipo === 2 && es.percentuale > 0) ? (1 + es.percentuale / 100) : 1;
                        });

                        /* 1. Carico cumulativo attuale (agc_caricoattuale, regola 3.11 "carico
                           monotono": cresce con ogni assegnazione, non diminuisce mai per
                           chiusura fascicolo). pesoPer tiene il carico REALE (senza coefficiente),
                           usato sia per il confronto (moltiplicato per coeffPer) sia per il
                           salvataggio persistente su contact al termine di ogni assegnazione. */
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
                                "?$select=agc_pesocalcolato,_agc_rgnr_value&$filter=_agc_magistratocontatto_value eq null and (agc_statocaso ne 2 or agc_statocaso eq null)"
                            ).then(function (unassignedResult) {
                                var fascicoli = unassignedResult.entities || [];
                                if (fascicoli.length === 0) {
                                    Xrm.Utility.closeProgressIndicator();
                                    return Xrm.Navigation.openAlertDialog({ title: "Assegnazione massiva", text: "Non ci sono fascicoli da assegnare." });
                                }

                                /* 3. Assegnazione sequenziale: ogni assegnazione aggiorna il carico
                                   cumulativo (reale, non l'equivalente) sia in memoria che sul
                                   record contact, prima di calcolare il magistrato migliore per il
                                   fascicolo successivo (confrontando sempre il carico equivalente
                                   = carico reale * coefficiente esonero). Se il fascicolo appartiene
                                   a un RGNR già assegnato ad un magistrato compatibile, si applica la
                                   continuità invece del calcolo per carico. Il carico non viene mai
                                   decrementato in questo flusso (nessuna chiusura qui). */
                                var assignedCount = 0;
                                var errorCount = 0;
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
                                                var pesoM = pesoPer[m.contactid] * coeffPer[m.contactid];
                                                var pesoBest = pesoPer[best.contactid] * coeffPer[best.contactid];
                                                return pesoM < pesoBest ? m : best;
                                            });
                                            scelto = migliore.contactid;
                                        }
                                        var peso = f.agc_pesocalcolato || 0;

                                        return Xrm.WebApi.updateRecord("agc_fascicolo2", f.agc_fascicolo2id, {
                                            "agc_magistratocontatto@odata.bind": "/contacts(" + scelto + ")"
                                        }).then(function () {
                                            var nuovoCarico = pesoPer[scelto] + peso;
                                            return Xrm.WebApi.updateRecord("contact", scelto, { agc_caricoattuale: nuovoCarico }).then(function () {
                                                pesoPer[scelto] = nuovoCarico;
                                                if (rgnrId) rgnrToMagistrato[rgnrId] = scelto;
                                                assignedCount++;
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

        setTimeout(function () {
            try { formContext.ui.refreshRibbon(true); } catch (e) { /* ignore */ }
        }, 1000);

        /* ── Regola 3.11 "carico monotono": la riassegnazione di un fascicolo da un
           magistrato A ad un magistrato B deve decrementare il carico di A (oltre
           ad incrementare quello di B). Si cattura il magistrato originale al
           caricamento della form e lo si confronta al salvataggio. ── */
        try {
            var origMagAttr = formContext.getAttribute("agc_magistratocontatto");
            var origMagValue = origMagAttr ? origMagAttr.getValue() : null;
            var origMagId = (origMagValue && origMagValue.length > 0) ? origMagValue[0].id.replace(/[{}]/g, "") : null;

            formContext.data.entity.addOnSave(function (saveEventArgs) {
                try {
                    var magAttr = formContext.getAttribute("agc_magistratocontatto");
                    var magValue = magAttr ? magAttr.getValue() : null;
                    var newMagId = (magValue && magValue.length > 0) ? magValue[0].id.replace(/[{}]/g, "") : null;

                    if (!newMagId || !origMagId || newMagId === origMagId) return;

                    var pesoAttr = formContext.getAttribute("agc_pesocalcolato");
                    var peso = pesoAttr ? (pesoAttr.getValue() || 0) : 0;
                    var fascicoloId = formContext.data.entity.getId().replace(/[{}]/g, "");

                    // Decremento carico del vecchio magistrato (mai sotto zero) e incremento del nuovo
                    Xrm.WebApi.retrieveRecord("contact", origMagId, "?$select=agc_caricoattuale").then(function (oldContact) {
                        var nuovoCaricoOld = Math.max(0, (oldContact.agc_caricoattuale || 0) - peso);
                        return Xrm.WebApi.updateRecord("contact", origMagId, { agc_caricoattuale: nuovoCaricoOld });
                    }).then(function () {
                        return Xrm.WebApi.retrieveRecord("contact", newMagId, "?$select=agc_caricoattuale");
                    }).then(function (newContact) {
                        var nuovoCaricoNew = (newContact.agc_caricoattuale || 0) + peso;
                        return Xrm.WebApi.updateRecord("contact", newMagId, { agc_caricoattuale: nuovoCaricoNew });
                    }).then(function () {
                        origMagId = newMagId; // aggiorna il riferimento per eventuali salvataggi successivi senza refresh form
                        console.log("[ASPEN] Riassegnazione fascicolo " + fascicoloId + ": carico spostato da " + origMagId + " a " + newMagId);
                    }).catch(function (e) {
                        console.error("[ASPEN] Errore aggiornamento carico su riassegnazione:", e);
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
