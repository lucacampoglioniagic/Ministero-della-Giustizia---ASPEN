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
            return Xrm.WebApi.updateRecord("agc_fascicolo", id, {
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

        // Disabilita il campo Canestro: la relazione è in stato ghost nell'ambiente POC.
        // Workaround temporaneo finché il ticket Microsoft non risolve la corruzione metadata.
        // Il campo resta visibile (read-only) ma non modificabile, evitando l'errore 400 al salvataggio.
        try {
            var canestroCtrl = formContext.getControl("agc_canestro");
            if (canestroCtrl) canestroCtrl.setDisabled(true);
        } catch (e) { /* ignore */ }

        setTimeout(function () {
            try { formContext.ui.refreshRibbon(true); } catch (e) { /* ignore */ }
        }, 1000);
    }

    /* ── Enable rule per la form: false se magistrato già assegnato ── */
    function isEnabledForm(formContext) {
        try {
            var magistrato = formContext.getAttribute("agc_magistratoassegnato");
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

            var magistrato = row.data.entity.attributes.get("agc_magistratoassegnato");
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
                if (name && name.toLowerCase().indexOf("magistratoassegnato") !== -1) {
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
        openCloseDialog: openCloseDialog,
        onFormLoad: onFormLoad,
        isEnabledForm: isEnabledForm,
        isEnabledGrid: isEnabledGrid,
        isCloseEnabledForm: isCloseEnabledForm
    };

})();
