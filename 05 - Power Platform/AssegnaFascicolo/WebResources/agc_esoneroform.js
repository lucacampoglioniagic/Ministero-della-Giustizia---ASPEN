"use strict";
// eslint-disable-next-line no-var
var AgicAspen = window.AgicAspen || {};

AgicAspen.EsoneroForm = (function () {
    var TIPO_TOTALE = 1;

    /* ── Nascondi/pulisci Percentuale Esonero se Totale ──
       Regola: quando Tipo Esonero = Totale (100% di esonero), il campo
       Percentuale Esonero non ha senso e va nascosto; se contiene già un
       valore (es. l'utente passa da Parziale a Totale), va anche azzerato
       per evitare di lasciare un dato incoerente sul record. */
    function applyTipoEsoneroRules(formContext) {
        var tipoAttr = formContext.getAttribute("agc_tipoesonero");
        var percAttr = formContext.getAttribute("agc_percentualeesonero");
        var percControl = formContext.getControl("agc_percentualeesonero");

        if (!tipoAttr || !percAttr || !percControl) return;

        var isTotale = tipoAttr.getValue() === TIPO_TOTALE;

        percControl.setVisible(!isTotale);
        percAttr.setRequiredLevel(isTotale ? "none" : "required");

        if (isTotale && percAttr.getValue() !== null) {
            percAttr.setValue(null);
        }
    }

    function onLoad(executionContext) {
        applyTipoEsoneroRules(executionContext.getFormContext());
    }

    function onChangeTipoEsonero(executionContext) {
        applyTipoEsoneroRules(executionContext.getFormContext());
    }

    return {
        onLoad: onLoad,
        onChangeTipoEsonero: onChangeTipoEsonero
    };
})();
