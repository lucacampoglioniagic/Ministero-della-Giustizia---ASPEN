using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Pre-Operation Create/Update plugin registrato su agc_esonero. Impedisce di salvare un
    /// esonero (Parziale o Totale, la regola non distingue il tipo) il cui intervallo
    /// [agc_datainizio, agc_datafine] si sovrappone a quello di un altro esonero già "Attivo"
    /// (agc_statoesonero = 1) dello stesso magistrato. Non ha infatti senso avere più esoneri
    /// contemporaneamente attivi per la stessa persona, indipendentemente dal fatto che siano
    /// entrambi Parziali, entrambi Totali o un Parziale e un Totale: il motore di assegnazione
    /// automatica (agc_assignfascicolo.js / agc_assignfascicolodialog.html) tiene infatti un solo
    /// esonero per magistrato e con più record sovrapposti il risultato sarebbe non deterministico
    /// (dipendente dall'ordine di ritorno di Dataverse).
    ///
    /// agc_datafine è opzionale (esonero "a tempo indeterminato"): se nullo, l'intervallo si
    /// considera aperto verso il futuro.
    ///
    /// Registrazione richiesta (Plugin Registration Tool):
    /// - Step su Create, Pre-Operation (stage 20), nessuna image necessaria (Target ha già tutti i
    ///   campi obbligatori in creazione).
    /// - Step su Update, Pre-Operation (stage 20), con una PreImage ("PreImage") contenente almeno
    ///   agc_datainizio, agc_datafine, agc_statoesonero, agc_magistrato (i campi non presenti nel
    ///   Target di una Update parziale vengono recuperati da qui).
    /// </summary>
    public class EsoneroOverlapValidationPlugin : PluginBase
    {
        private const int StatoAttivo = 1;

        public EsoneroOverlapValidationPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(EsoneroOverlapValidationPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
                throw new ArgumentNullException(nameof(localPluginContext));

            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.PluginUserService;
            var tracer = localPluginContext.TracingService;

            // Solo Pre-Operation, sui messaggi Create e Update
            if (context.Stage != 20)
                return;

            if (context.MessageName != "Create" && context.MessageName != "Update")
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                return;

            var preImage = context.PreEntityImages.Contains("PreImage") ? context.PreEntityImages["PreImage"] : null;

            // Valori effettivi (merge Target + PreImage, per gestire Update parziali)
            var statoEsonero = GetOptionSetValue(target, preImage, "agc_statoesonero");
            if (statoEsonero != StatoAttivo)
                return; // la regola vale solo per esoneri che risultano (o restano) Attivi

            var magistratoRef = GetEntityReference(target, preImage, "agc_magistrato");
            if (magistratoRef == null)
            {
                tracer.Trace("EsoneroOverlapValidationPlugin: nessun magistrato associato, skip.");
                return;
            }

            var dataInizio = GetDateTime(target, preImage, "agc_datainizio");
            if (dataInizio == null)
            {
                tracer.Trace("EsoneroOverlapValidationPlugin: agc_datainizio non valorizzata, skip.");
                return;
            }

            var dataFine = GetDateTime(target, preImage, "agc_datafine"); // null = a tempo indeterminato

            var query = new QueryExpression("agc_esonero")
            {
                ColumnSet = new ColumnSet("agc_name", "agc_datainizio", "agc_datafine", "agc_tipoesonero")
            };
            query.Criteria.AddCondition("agc_magistrato", ConditionOperator.Equal, magistratoRef.Id);
            query.Criteria.AddCondition("agc_statoesonero", ConditionOperator.Equal, StatoAttivo);
            if (target.Id != Guid.Empty)
                query.Criteria.AddCondition("agc_esoneroid", ConditionOperator.NotEqual, target.Id);

            var altriEsoneriAttivi = service.RetrieveMultiple(query).Entities;

            foreach (var altro in altriEsoneriAttivi)
            {
                if (!altro.Contains("agc_datainizio"))
                    continue;

                var altroInizio = altro.GetAttributeValue<DateTime>("agc_datainizio");
                DateTime? altroFine = altro.Contains("agc_datafine") ? altro.GetAttributeValue<DateTime>("agc_datafine") : (DateTime?)null;

                var sovrapposto = dataInizio.Value <= (altroFine ?? DateTime.MaxValue)
                    && altroInizio <= (dataFine ?? DateTime.MaxValue);

                if (sovrapposto)
                {
                    tracer.Trace($"EsoneroOverlapValidationPlugin: sovrapposizione rilevata con esonero {altro.Id}.");
                    var periodoAltro = altroFine.HasValue
                        ? $"dal {altroInizio:dd/MM/yyyy} al {altroFine:dd/MM/yyyy}"
                        : $"dal {altroInizio:dd/MM/yyyy} (a tempo indeterminato)";
                    throw new InvalidPluginExecutionException(
                        $"Il magistrato ha già un esonero Attivo ({altro.GetAttributeValue<string>("agc_name")}) " +
                        $"{periodoAltro} il cui periodo si sovrappone a quello inserito. Non è possibile avere due " +
                        "esoneri contemporaneamente attivi sullo stesso magistrato: modificare le date o chiudere " +
                        "prima l'esonero esistente.");
                }
            }
        }

        private static OptionSetValue GetOptionSetValueRaw(Entity target, Entity preImage, string attr)
        {
            if (target.Contains(attr)) return target[attr] as OptionSetValue;
            if (preImage != null && preImage.Contains(attr)) return preImage[attr] as OptionSetValue;
            return null;
        }

        private static int? GetOptionSetValue(Entity target, Entity preImage, string attr)
        {
            return GetOptionSetValueRaw(target, preImage, attr)?.Value;
        }

        private static EntityReference GetEntityReference(Entity target, Entity preImage, string attr)
        {
            if (target.Contains(attr)) return target[attr] as EntityReference;
            if (preImage != null && preImage.Contains(attr)) return preImage[attr] as EntityReference;
            return null;
        }

        private static DateTime? GetDateTime(Entity target, Entity preImage, string attr)
        {
            if (target.Contains(attr)) return target[attr] as DateTime?;
            if (preImage != null && preImage.Contains(attr)) return preImage[attr] as DateTime?;
            return null;
        }
    }
}
