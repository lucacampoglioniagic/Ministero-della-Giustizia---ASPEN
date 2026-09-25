using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.ServiceModel;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Helper condiviso dai tre scrittori di <c>contact.agc_caricoattuale</c>
    /// (<see cref="CaricoMagistratoAssegnazionePlugin"/>, <see cref="EsoneroRientroPlugin"/>,
    /// <see cref="ModificaCaricoMagistratoPlugin"/>): centralizza l'aggiornamento con
    /// concorrenza ottimistica basata sul <c>RowVersion</c> di Dataverse, cosi' due processi che
    /// leggono e scrivono lo stesso contact in parallelo non possono piu' produrre un
    /// "lost update" (l'ultimo che scrive sovrascrive silenziosamente il lavoro dell'altro).
    ///
    /// Ogni chiamata rilegge il carico attuale, lo passa a <c>calcolaNuovoValore</c> per ottenere
    /// il valore da scrivere, e tenta l'Update con <see cref="ConcurrencyBehavior.IfRowVersionMatches"/>.
    /// Se nel frattempo un altro processo ha gia' scritto sul contact (RowVersion cambiato),
    /// Dataverse rifiuta l'update (errore -2147088254, "ConcurrencyVersionMismatch"): in tal caso
    /// l'operazione viene abortita subito con un <see cref="InvalidPluginExecutionException"/>
    /// esplicito, senza ritentare all'interno dello stesso plugin.
    ///
    /// IMPORTANTE: NON ritentare qui con altre chiamate a <c>IOrganizationService</c> dopo aver
    /// catturato il fault di concorrenza. Farlo (come in una versione precedente di questo helper,
    /// che rileggeva e ritentava fino a 5 volte nello stesso try/catch) viola la regola Dataverse
    /// "custom plug-ins should not catch exceptions from OrganizationService calls and continue
    /// processing": sotto scritture concorrenti reali questo ha causato l'errore di piattaforma
    /// 0x8009000c ("ISV code reduced the open transaction count") con persistenza *parziale* e
    /// incoerente (il contributo di carico veniva scritto ma il lookup principale dell'operazione
    /// esterna no), corrompendo silenziosamente i dati. Il fallimento va invece propagato per
    /// intero: l'intera transazione Dataverse viene annullata in modo atomico e il chiamante
    /// (form, Web API, flow) deve ripetere l'intera operazione da capo su dati freschi.
    /// </summary>
    public static class CaricoConcurrencyHelper
    {
        private const int ErrorConcurrencyVersionMismatch = -2147088254;

        /// <summary>
        /// Aggiorna <c>agc_caricoattuale</c> del magistrato con un singolo tentativo protetto da
        /// concorrenza ottimistica (RowVersion). <paramref name="calcolaNuovoValore"/> riceve il
        /// carico attuale appena riletto e restituisce il nuovo valore da scrivere.
        /// In caso di conflitto di concorrenza (un altro processo ha scritto sul contact nel
        /// frattempo) l'operazione NON viene ritentata qui: viene sollevato subito un
        /// <see cref="InvalidPluginExecutionException"/> che abortisce l'intera transazione del
        /// plugin in modo atomico. E' responsabilita' del chiamante (form, Web API, flow) ripetere
        /// l'intera operazione da capo su dati freschi.
        /// </summary>
        /// <returns>Il valore di carico effettivamente scritto.</returns>
        public static decimal AggiornaCaricoConRetry(
            IOrganizationService service,
            ITracingService tracer,
            string nomeChiamante,
            Guid magistratoId,
            Func<decimal, decimal> calcolaNuovoValore)
        {
            var contact = service.Retrieve("contact", magistratoId, new ColumnSet("agc_caricoattuale"));
            var caricoAttuale = contact.Contains("agc_caricoattuale")
                ? contact.GetAttributeValue<decimal>("agc_caricoattuale")
                : 0m;

            var nuovoCarico = calcolaNuovoValore(caricoAttuale);

            var update = new Entity("contact", magistratoId) { ["agc_caricoattuale"] = nuovoCarico };
            update.RowVersion = contact.RowVersion;

            try
            {
                service.Execute(new UpdateRequest
                {
                    Target = update,
                    ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches
                });
                return nuovoCarico;
            }
            catch (FaultException<OrganizationServiceFault> ex) when (ex.Detail != null && ex.Detail.ErrorCode == ErrorConcurrencyVersionMismatch)
            {
                // NON ritentare qui: catturare questo fault e proseguire con altre chiamate
                // IOrganizationService nella stessa transazione e' la causa nota dell'errore di
                // piattaforma 0x8009000c ("ISV code reduced the open transaction count") e puo'
                // corrompere silenziosamente i dati (vedi commento sulla classe). Si abortisce
                // subito con un messaggio chiaro per far ripetere l'intera operazione a monte.
                tracer.Trace($"{nomeChiamante}: conflitto di concorrenza sul carico del magistrato {magistratoId}, operazione abortita (nessun retry interno).");
                throw new InvalidPluginExecutionException(
                    $"Aggiornamento del carico del magistrato {magistratoId} in conflitto con un'altra operazione concorrente. Riprovare l'operazione.", ex);
            }
        }
    }
}
