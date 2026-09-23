using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Linq;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Plugin che implementa la Custom API <c>agc_ModificaCaricoMagistrato</c>, bound sulla
    /// tabella <c>contact</c> (magistrato). Permette di correggere manualmente il carico
    /// (<c>agc_caricoattuale</c>) del magistrato, tracciando la modifica a fini di audit in un
    /// nuovo record <c>agc_modificacarico</c> (Magistrato, Valore Precedente, Valore Nuovo, Nota;
    /// utente e data della modifica sono i campi standard createdby/createdon).
    ///
    /// Parametri Custom API:
    /// - Target (EntityReference, obbligatorio, implicito da bound action): il magistrato (contact)
    /// - NuovoValore (Decimal, obbligatorio): il nuovo valore da assegnare a agc_caricoattuale
    /// - Nota (String, obbligatorio): giustificazione della modifica manuale, non può essere vuota
    ///
    /// Sicurezza: in aggiunta alla visibilità del tasto lato client (riservata ai ruoli
    /// "System Administrator" e "Amministratore ASPEN"), il plugin verifica anche lato server che
    /// l'utente chiamante sia membro di uno di questi ruoli, come difesa in profondità nel caso la
    /// Custom API venga invocata direttamente (es. da Web API/Postman) bypassando la command bar.
    /// I ruoli sono risolti per nome (non per GUID hardcoded) per essere portabili tra ambienti.
    /// </summary>
    public class ModificaCaricoMagistratoPlugin : PluginBase
    {
        // Nomi dei ruoli di sicurezza abilitati alla modifica manuale del carico. Risolti per
        // nome ad ogni esecuzione per non dipendere dai GUID specifici di un singolo ambiente.
        private static readonly string[] RuoliAbilitati = { "System Administrator", "Amministratore ASPEN" };

        public ModificaCaricoMagistratoPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(ModificaCaricoMagistratoPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
                throw new ArgumentNullException(nameof(localPluginContext));

            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.PluginUserService;
            var tracer = localPluginContext.TracingService;

            if (context.MessageName != "agc_ModificaCaricoMagistrato")
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is EntityReference target))
                throw new InvalidPluginExecutionException("Parametro Target (magistrato) mancante o non valido.");

            if (target.LogicalName != "contact")
                throw new InvalidPluginExecutionException("La Custom API agc_ModificaCaricoMagistrato è utilizzabile solo su record di tipo contact.");

            if (!context.InputParameters.Contains("Nota") || string.IsNullOrWhiteSpace((string)context.InputParameters["Nota"]))
                throw new InvalidPluginExecutionException("La nota di giustificazione è obbligatoria per modificare manualmente il carico.");

            if (!context.InputParameters.Contains("NuovoValore"))
                throw new InvalidPluginExecutionException("Parametro NuovoValore mancante.");

            var nota = ((string)context.InputParameters["Nota"]).Trim();
            var nuovoValore = Convert.ToDecimal(context.InputParameters["NuovoValore"]);

            // Difesa in profondità: verifica che il chiamante appartenga a uno dei ruoli abilitati,
            // anche se il tasto lato client è già nascosto agli utenti non autorizzati.
            var ruoliUtente = service.RetrieveMultiple(new QueryExpression("role")
            {
                ColumnSet = new ColumnSet("name"),
                LinkEntities =
                {
                    new LinkEntity("role", "systemuserroles", "roleid", "roleid", JoinOperator.Inner)
                    {
                        LinkCriteria = new FilterExpression(LogicalOperator.And)
                        {
                            Conditions = { new ConditionExpression("systemuserid", ConditionOperator.Equal, context.InitiatingUserId) }
                        }
                    }
                }
            }).Entities;

            var isAdmin = ruoliUtente.Any(r => RuoliAbilitati.Contains(r.GetAttributeValue<string>("name")));
            if (!isAdmin)
            {
                tracer.Trace($"ModificaCaricoMagistratoPlugin: utente {context.InitiatingUserId} non appartiene ai ruoli abilitati ({string.Join(", ", RuoliAbilitati)}), operazione negata.");
                throw new InvalidPluginExecutionException("Solo un amministratore (System Administrator o Amministratore ASPEN) può modificare manualmente il carico del magistrato.");
            }

            // Scrittura con retry su concorrenza ottimistica: il valore precedente viene letto
            // all'interno del retry (non prima), cosi' l'audit riflette sempre il carico
            // effettivamente sostituito, anche se un'altra scrittura concorrente (assegnazione,
            // rientro da esonero) e' avvenuta tra l'inizio della Custom API e questo update.
            var valorePrecedente = 0m;
            CaricoConcurrencyHelper.AggiornaCaricoConRetry(service, tracer, nameof(ModificaCaricoMagistratoPlugin), target.Id, caricoAttuale =>
            {
                valorePrecedente = caricoAttuale;
                tracer.Trace($"ModificaCaricoMagistratoPlugin: magistrato={target.Id} valorePrecedente={caricoAttuale} nuovoValore={nuovoValore}");
                return nuovoValore;
            });

            // Utente e data della modifica sono tracciati dai campi standard createdby/createdon
            // (il record di audit viene creato una sola volta e non più aggiornato, quindi
            // createdby coincide sempre con l'utente che ha effettuato la correzione).
            var audit = new Entity("agc_modificacarico")
            {
                ["agc_magistrato"] = target,
                ["agc_valoreprecedente"] = valorePrecedente,
                ["agc_valorenuovo"] = nuovoValore,
                ["agc_nota"] = nota
            };
            var auditId = service.Create(audit);

            tracer.Trace($"ModificaCaricoMagistratoPlugin: creato record di audit {auditId} in agc_modificacarico.");

            context.OutputParameters["AuditId"] = auditId;
        }
    }
}
