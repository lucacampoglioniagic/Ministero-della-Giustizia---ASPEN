using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Post-Operation Update plugin registrato su agc_esonero, filtrato sull'attributo
    /// agc_statoesonero, con pre-image contenente lo stato/carico precedenti.
    /// Gestisce il ciclo di vita "punteggio" dell'esonero, in sola lettura/log — NON modifica mai
    /// il carico reale (agc_caricoattuale) del magistrato:
    /// - Quando lo Stato Esonero passa a "Attivo" (1): fotografa il carico attuale del magistrato
    ///   in agc_punteggioalmomentoesonero.
    /// - Quando lo Stato Esonero passa da "Attivo" (1) a "Chiuso" (2) (rientro, sia per chiusura
    ///   manuale sia per chiusura automatica da flow schedulato su scadenza Data Fine): fotografa
    ///   il carico attuale del magistrato in agc_punteggioalrientro, a solo scopo di log/reportistica.
    ///   Il riequilibrio del carico tra colleghi avviene naturalmente tramite l'algoritmo a minor
    ///   carico del motore di assegnazione nelle assegnazioni successive: nessun ricalcolo forzato.
    /// </summary>
    public class EsoneroRientroPlugin : PluginBase
    {
        private const int StatoAttivo = 1;
        private const int StatoChiuso = 2;

        public EsoneroRientroPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(EsoneroRientroPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
                throw new ArgumentNullException(nameof(localPluginContext));

            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.PluginUserService;
            var tracer = localPluginContext.TracingService;

            // Funziona solo su Update in Post-Operation
            if (context.MessageName != "Update" || context.Stage != 40)
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                return;

            if (!target.Contains("agc_statoesonero"))
                return; // l'update non ha toccato lo stato, niente da fare

            if (!context.PreEntityImages.Contains("PreImage"))
            {
                tracer.Trace("EsoneroRientroPlugin: PreImage non registrata, impossibile determinare lo stato precedente, skip.");
                return;
            }

            var preImage = context.PreEntityImages["PreImage"];

            var nuovoStato = ((OptionSetValue)target["agc_statoesonero"]).Value;
            var vecchioStato = preImage.Contains("agc_statoesonero")
                ? ((OptionSetValue)preImage["agc_statoesonero"]).Value
                : (int?)null;

            if (nuovoStato == vecchioStato)
                return; // nessuna transizione di stato reale

            EntityReference magistratoRef = target.Contains("agc_magistrato")
                ? (EntityReference)target["agc_magistrato"]
                : (preImage.Contains("agc_magistrato") ? (EntityReference)preImage["agc_magistrato"] : null);

            if (magistratoRef == null)
            {
                tracer.Trace("EsoneroRientroPlugin: nessun magistrato associato all'esonero, skip.");
                return;
            }

            var magistrato = service.Retrieve("contact", magistratoRef.Id, new ColumnSet("agc_caricoattuale"));
            var caricoAttuale = magistrato.Contains("agc_caricoattuale")
                ? magistrato.GetAttributeValue<decimal>("agc_caricoattuale")
                : 0m;

            var esoneroUpdate = new Entity("agc_esonero", target.Id);

            if (nuovoStato == StatoAttivo)
            {
                tracer.Trace($"EsoneroRientroPlugin: esonero attivato, fotografo carico attuale ({caricoAttuale}) in agc_punteggioalmomentoesonero.");
                esoneroUpdate["agc_punteggioalmomentoesonero"] = caricoAttuale;
            }
            else if (nuovoStato == StatoChiuso && vecchioStato == StatoAttivo)
            {
                tracer.Trace($"EsoneroRientroPlugin: rientro da esonero, fotografo carico attuale ({caricoAttuale}) in agc_punteggioalrientro (solo log, carico non modificato).");
                esoneroUpdate["agc_punteggioalrientro"] = caricoAttuale;
            }
            else
            {
                return; // altre transizioni (es. verso Annullato) non gestite
            }

            service.Update(esoneroUpdate);
        }
    }
}
