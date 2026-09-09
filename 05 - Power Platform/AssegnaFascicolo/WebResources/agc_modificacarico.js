"use strict";
// eslint-disable-next-line no-var
var AgicAspen = window.AgicAspen || {};

/* ── Tasto "Modifica carico" (form Contatto/Magistrato) ──
   Permette agli amministratori di sistema di correggere manualmente il carico
   (agc_caricoattuale) del magistrato, con nota di giustificazione obbligatoria.
   La modifica viene tracciata a fini di audit in agc_modificacarico dalla Custom
   API server-side agc_ModificaCaricoMagistrato (vedi ModificaCaricoMagistratoPlugin.cs).
   Il tasto è visibile solo al ruolo "System Administrator" (verificato sia
   client-side, per la visibilità del comando, sia server-side nel plugin, per
   difesa in profondità). */
AgicAspen.ModificaCarico = (function () {
    // Ruolo di sicurezza "System Administrator" nell'ambiente lccministerogiustiziademo.
    var RUOLO_SYSTEM_ADMINISTRATOR = "5eaeacb4-735a-f111-a825-000d3ade6bac";

    /* ── Enable rule per la command bar: true solo se l'utente corrente è
       membro del ruolo System Administrator ── */
    function isSystemAdministrator() {
        try {
            var roles = Xrm.Utility.getGlobalContext().userSettings.roles;
            if (!roles || !roles.getLength) return false;

            var isAdmin = false;
            roles.forEach(function (role) {
                var roleId = (role.id || "").replace(/[{}]/g, "").toLowerCase();
                if (roleId === RUOLO_SYSTEM_ADMINISTRATOR) isAdmin = true;
            });
            return isAdmin;
        } catch (e) {
            return false;
        }
    }

    /* ── Apre il dialog di modifica carico dal form Contatto ── */
    function openDialog(formContext) {
        if (!isSystemAdministrator()) {
            Xrm.Navigation.openAlertDialog({
                title: "Modifica Carico",
                text: "Solo un amministratore di sistema può modificare manualmente il carico del magistrato."
            });
            return;
        }

        var rawId = formContext.data.entity.getId();
        var id = rawId.replace(/[{}]/g, "");

        // getEntityReference().name espone il nome primario del record (fullname)
        // indipendentemente dal fatto che l'attributo sia presente nel layout del form.
        var nome = "";
        try {
            var entityRef = formContext.data.entity.getEntityReference();
            nome = (entityRef && entityRef.name) ? entityRef.name : "";
        } catch (e) { /* ignore */ }
        if (!nome) {
            var nomeAttr = formContext.getAttribute("fullname");
            nome = nomeAttr ? (nomeAttr.getValue() || "") : "";
        }

        var caricoAttr = formContext.getAttribute("agc_caricoattuale");
        var carico = caricoAttr ? (caricoAttr.getValue() || 0) : 0;

        Xrm.Navigation.navigateTo(
            {
                pageType: "webresource",
                webresourceName: "agc_modificacaricodialog.html",
                data: encodeURIComponent(JSON.stringify({ id: id, nome: nome, carico: carico }))
            },
            {
                target: 2,
                position: 1,
                width: { value: 520, unit: "px" },
                height: { value: 560, unit: "px" },
                title: "ASPEN - Modifica Carico"
            }
        ).then(function () {
            formContext.data.refresh(false);
        });
    }

    return {
        isSystemAdministrator: isSystemAdministrator,
        openDialog: openDialog
    };
})();
