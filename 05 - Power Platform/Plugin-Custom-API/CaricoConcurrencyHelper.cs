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
    /// Dataverse rifiuta l'update (errore -2147088254, "ConcurrencyVersionMismatch") invece di
    /// accettarlo sulla base di un dato ormai obsoleto: si rilegge il valore fresco e si ritenta,
    /// fino a un massimo di tentativi. Questo NON risolve da solo i conflitti *semantici* tra
    /// scritture assolute (riallineamento esonero, correzione manuale) e incrementali
    /// (assegnazione fascicolo): garantisce solo che ogni singola scrittura veda sempre l'ultimo
    /// valore committato, invece di basarsi su una lettura stale.
    /// </summary>
    public static class CaricoConcurrencyHelper
    {
        private const int MaxTentativi = 5;
        private const int ErrorConcurrencyVersionMismatch = -2147088254;

        /// <summary>
        /// Aggiorna <c>agc_caricoattuale</c> del magistrato con retry su conflitto di
        /// concorrenza. <paramref name="calcolaNuovoValore"/> riceve il carico attuale (riletto
        /// ad ogni tentativo) e restituisce il nuovo valore da scrivere; viene invocata una volta
        /// per tentativo, anche in caso di retry, cosi' un incremento/decremento relativo si basa
        /// sempre sull'ultimo valore effettivamente committato.
        /// </summary>
        /// <returns>Il valore di carico effettivamente scritto.</returns>
        public static decimal AggiornaCaricoConRetry(
            IOrganizationService service,
            ITracingService tracer,
            string nomeChiamante,
            Guid magistratoId,
            Func<decimal, decimal> calcolaNuovoValore)
        {
            for (var tentativo = 1; tentativo <= MaxTentativi; tentativo++)
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
                    tracer.Trace($"{nomeChiamante}: conflitto di concorrenza sul carico del magistrato {magistratoId} (tentativo {tentativo}/{MaxTentativi}), rileggo il valore aggiornato e ritento.");
                }
            }

            throw new InvalidPluginExecutionException(
                $"Impossibile aggiornare il carico del magistrato {magistratoId}: troppi aggiornamenti concorrenti ({MaxTentativi} tentativi falliti). Riprovare l'operazione.");
        }
    }
}
