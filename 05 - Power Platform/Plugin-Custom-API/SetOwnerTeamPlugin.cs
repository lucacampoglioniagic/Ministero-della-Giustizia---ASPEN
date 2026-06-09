using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Pre-Operation Create plugin per agc_fascicolo, agc_magistrato (logical: agc_giudice), agc_canestro.
    /// Imposta il proprietario del record al default team della Business Unit dell'utente,
    /// garantendo la segregazione dei dati tra uffici giudiziari.
    /// </summary>
    public class SetOwnerTeamPlugin : PluginBase
    {
        public SetOwnerTeamPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(SetOwnerTeamPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
                throw new ArgumentNullException(nameof(localPluginContext));

            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.PluginUserService;
            var tracer = localPluginContext.TracingService;

            // Funziona solo su Create in Pre-Operation
            if (context.MessageName != "Create" || context.Stage != 20)
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                return;

            tracer.Trace($"SetOwnerTeamPlugin: avvio su {target.LogicalName}, utente={context.InitiatingUserId}");

            // Recupera la Business Unit dell'utente che sta creando il record
            var user = service.Retrieve("systemuser", context.InitiatingUserId, new ColumnSet("businessunitid"));
            if (!user.Contains("businessunitid"))
            {
                tracer.Trace("SetOwnerTeamPlugin: businessunitid non trovato sull'utente, skip.");
                return;
            }

            var buId = ((EntityReference)user["businessunitid"]).Id;
            tracer.Trace($"SetOwnerTeamPlugin: BU utente = {buId}");

            // Trova il default team della BU (isdefault=true, stesso businessunitid)
            var teamQuery = new QueryExpression("team")
            {
                ColumnSet = new ColumnSet("teamid", "name"),
                Criteria = new FilterExpression(LogicalOperator.And)
            };
            teamQuery.Criteria.AddCondition("businessunitid", ConditionOperator.Equal, buId);
            teamQuery.Criteria.AddCondition("isdefault", ConditionOperator.Equal, true);

            var teams = service.RetrieveMultiple(teamQuery);

            if (teams.Entities.Count == 0)
            {
                tracer.Trace($"SetOwnerTeamPlugin: nessun default team trovato per BU {buId}, skip.");
                return;
            }

            var defaultTeam = teams.Entities[0];
            tracer.Trace($"SetOwnerTeamPlugin: assegno ownership a team '{defaultTeam["name"]}' ({defaultTeam.Id})");

            // Imposta il proprietario al team (pre-operation: la modifica è applicata prima del salvataggio)
            target["ownerid"] = new EntityReference("team", defaultTeam.Id);
        }
    }
}
