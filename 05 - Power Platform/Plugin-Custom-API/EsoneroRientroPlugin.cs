using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;
using System.Collections.Generic;
using System.Linq;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Post-Operation Create/Update plugin registrato su agc_esonero (con pre-image su Update
    /// contenente lo stato/carico precedenti). Gestisce il ciclo di vita "punteggio" dell'esonero:
    /// - Alla **creazione**, se il record nasce gia' in stato "Attivo" (caso comune: l'utente
    ///   seleziona direttamente "Attivo" nel form), la fotografia di attivazione viene eseguita
    ///   subito, dato che una successiva Update non rileverebbe alcuna transizione di stato.
    /// - Quando lo Stato Esonero passa a "Attivo" (1) via **Update** (transizione da altro stato):
    ///   fotografa il carico attuale del magistrato in agc_punteggioalmomentoesonero. Se il tipo
    ///   esonero e' "Totale" (1), fotografa anche il carico attuale di tutti i colleghi magistrati
    ///   "eleggibili" (nessun esonero Attivo in corso) in record agc_fotocaricoesonero, da usare al
    ///   rientro per individuare il collega piu' simile.
    /// - Quando lo Stato Esonero passa da "Attivo" (1) a "Chiuso" (2) (rientro, sia per chiusura
    ///   manuale sia per chiusura automatica da flow schedulato su scadenza Data Fine):
    ///   - Esonero "Parziale" (2): fotografa il carico attuale del magistrato in
    ///     agc_punteggioalrientro, a solo scopo di log/reportistica. Il carico reale non viene
    ///     mai modificato: il riequilibrio avviene naturalmente tramite l'algoritmo a minor carico
    ///     del motore di assegnazione nelle assegnazioni successive.
    ///   - Esonero "Totale" (1): oltre al log in agc_punteggioalrientro, riallinea il carico reale
    ///     (contact.agc_caricoattuale) del magistrato al carico ATTUALE del "collega piu' simile"
    ///     M2, cioe' il collega la cui fotografia (agc_fotocaricoesonero, presa all'attivazione)
    ///     era la piu' vicina al carico del magistrato all'attivazione dell'esonero
    ///     (agc_punteggioalmomentoesonero). A parita' di distanza vince il collega con il carico
    ///     piu' basso. Il collega scelto viene tracciato in agc_esonero.agc_collegariferimento.
    ///     Se non esistono fotografie eleggibili (es. nessun collega disponibile all'attivazione),
    ///     si mantiene il comportamento di solo log, senza modificare il carico reale.
    /// </summary>
    public class EsoneroRientroPlugin : PluginBase
    {
        private const int StatoAttivo = 1;
        private const int StatoChiuso = 2;

        private const int TipoTotale = 1;
        private const int TipoParziale = 2;

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

            // Funziona solo in Post-Operation, sui messaggi Create e Update
            if (context.Stage != 40)
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                return;

            if (context.MessageName == "Create")
            {
                GestisciCreate(service, tracer, context, target);
                return;
            }

            if (context.MessageName != "Update")
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

            var caricoAttuale = LeggiCaricoAttuale(service, magistratoRef.Id);

            // Il tipo esonero e' immutabile dopo la creazione: lo recuperiamo direttamente
            // dal record corrente invece di estendere la PreImage registrata.
            var esoneroCorrente = service.Retrieve("agc_esonero", target.Id, new ColumnSet("agc_tipoesonero"));
            var tipoEsonero = esoneroCorrente.Contains("agc_tipoesonero")
                ? ((OptionSetValue)esoneroCorrente["agc_tipoesonero"]).Value
                : (int?)null;

            var esoneroUpdate = new Entity("agc_esonero", target.Id);

            if (nuovoStato == StatoAttivo)
            {
                tracer.Trace($"EsoneroRientroPlugin: esonero attivato (update), fotografo carico attuale ({caricoAttuale}) in agc_punteggioalmomentoesonero.");
                esoneroUpdate["agc_punteggioalmomentoesonero"] = caricoAttuale;
                service.Update(esoneroUpdate);

                if (tipoEsonero == TipoTotale)
                {
                    CreaFotoCaricoColleghi(service, tracer, target.Id, magistratoRef.Id);
                }
            }
            else if (nuovoStato == StatoChiuso && vecchioStato == StatoAttivo)
            {
                tracer.Trace($"EsoneroRientroPlugin: rientro da esonero, fotografo carico attuale ({caricoAttuale}) in agc_punteggioalrientro (solo log).");
                esoneroUpdate["agc_punteggioalrientro"] = caricoAttuale;

                if (tipoEsonero == TipoTotale)
                {
                    RiallineaCaricoAlRientro(service, tracer, target.Id, magistratoRef.Id, esoneroUpdate);
                }

                service.Update(esoneroUpdate);
            }
            // altre transizioni (es. verso Annullato) non gestite
        }

        /// <summary>
        /// Gestisce la Create: se il record nasce gia' in stato "Attivo" (caso normale, dato che il
        /// campo Stato Esonero e' obbligatorio e l'utente lo valorizza direttamente in creazione),
        /// esegue subito la fotografia di attivazione, perche' nessuna Update successiva rilevera'
        /// mai una transizione di stato (non c'e' un "prima" diverso da Attivo).
        /// </summary>
        private void GestisciCreate(IOrganizationService service, ITracingService tracer, IPluginExecutionContext context, Entity target)
        {
            if (!target.Contains("agc_statoesonero"))
                return;

            var statoIniziale = ((OptionSetValue)target["agc_statoesonero"]).Value;
            if (statoIniziale != StatoAttivo)
                return; // nasce in uno stato diverso da Attivo: nessuna fotografia da fare ora

            if (!target.Contains("agc_magistrato"))
            {
                tracer.Trace("EsoneroRientroPlugin: creazione senza magistrato associato, skip.");
                return;
            }

            var esoneroId = target.Id != Guid.Empty
                ? target.Id
                : (context.OutputParameters.Contains("id") ? (Guid)context.OutputParameters["id"] : Guid.Empty);

            if (esoneroId == Guid.Empty)
            {
                tracer.Trace("EsoneroRientroPlugin: impossibile determinare l'id dell'esonero appena creato, skip.");
                return;
            }

            var magistratoRef = (EntityReference)target["agc_magistrato"];
            var caricoAttuale = LeggiCaricoAttuale(service, magistratoRef.Id);
            var tipoEsonero = target.Contains("agc_tipoesonero")
                ? ((OptionSetValue)target["agc_tipoesonero"]).Value
                : (int?)null;

            tracer.Trace($"EsoneroRientroPlugin: esonero creato gia' in stato Attivo, fotografo carico attuale ({caricoAttuale}) in agc_punteggioalmomentoesonero.");
            service.Update(new Entity("agc_esonero", esoneroId)
            {
                ["agc_punteggioalmomentoesonero"] = caricoAttuale
            });

            if (tipoEsonero == TipoTotale)
            {
                CreaFotoCaricoColleghi(service, tracer, esoneroId, magistratoRef.Id);
            }
        }

        private static decimal LeggiCaricoAttuale(IOrganizationService service, Guid magistratoId)
        {
            var magistrato = service.Retrieve("contact", magistratoId, new ColumnSet("agc_caricoattuale"));
            return magistrato.Contains("agc_caricoattuale")
                ? magistrato.GetAttributeValue<decimal>("agc_caricoattuale")
                : 0m;
        }

        /// <summary>
        /// Alla attivazione di un esonero Totale, fotografa il carico attuale di tutti i colleghi
        /// magistrati "eleggibili" come futuro termine di paragone al rientro: sono esclusi il
        /// magistrato stesso e chiunque abbia in corso un esonero Attivo (Totale o Parziale) in
        /// questo momento.
        /// </summary>
        private static void CreaFotoCaricoColleghi(IOrganizationService service, ITracingService tracer, Guid esoneroId, Guid magistratoId)
        {
            var candidati = new QueryExpression("contact")
            {
                ColumnSet = new ColumnSet("agc_caricoattuale", "fullname")
            };
            candidati.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            candidati.Criteria.AddCondition("agc_ruolomagistrato", ConditionOperator.NotNull);
            candidati.Criteria.AddCondition("agc_caricoattuale", ConditionOperator.NotNull);
            candidati.Criteria.AddCondition("contactid", ConditionOperator.NotEqual, magistratoId);

            var esoneratiAttivi = new QueryExpression("agc_esonero")
            {
                ColumnSet = new ColumnSet("agc_magistrato")
            };
            esoneratiAttivi.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            esoneratiAttivi.Criteria.AddCondition("agc_statoesonero", ConditionOperator.Equal, StatoAttivo);
            esoneratiAttivi.Criteria.AddCondition("agc_magistrato", ConditionOperator.NotEqual, magistratoId);

            var esoneratiIds = new HashSet<Guid>(service.RetrieveMultiple(esoneratiAttivi).Entities
                .Where(e => e.Contains("agc_magistrato"))
                .Select(e => ((EntityReference)e["agc_magistrato"]).Id));

            var eleggibili = service.RetrieveMultiple(candidati).Entities
                .Where(c => !esoneratiIds.Contains(c.Id))
                .ToList();

            tracer.Trace($"EsoneroRientroPlugin: fotografia carico colleghi per esonero Totale, {eleggibili.Count} colleghi eleggibili trovati.");

            foreach (var collega in eleggibili)
            {
                var foto = new Entity("agc_fotocaricoesonero");
                foto["agc_name"] = $"Foto {collega.GetAttributeValue<string>("fullname")} - {esoneroId}";
                foto["agc_esonero"] = new EntityReference("agc_esonero", esoneroId);
                foto["agc_magistrato"] = new EntityReference("contact", collega.Id);
                foto["agc_carico"] = collega.GetAttributeValue<decimal>("agc_caricoattuale");
                service.Create(foto);
            }
        }

        /// <summary>
        /// Al rientro da un esonero Totale, individua il collega "piu' simile" (M2) tra le
        /// fotografie prese all'attivazione, cioe' quello il cui carico all'epoca era il piu'
        /// vicino a quello del magistrato in rientro (M1) alla stessa data; a parita' di distanza
        /// vince il carico piu' basso. Se trovato, riallinea il carico reale di M1 al carico
        /// ATTUALE (oggi) di M2 e traccia il collega scelto in agc_collegariferimento. Se non
        /// esistono fotografie eleggibili, mantiene il comportamento di solo log.
        /// </summary>
        private static void RiallineaCaricoAlRientro(IOrganizationService service, ITracingService tracer, Guid esoneroId, Guid magistratoId, Entity esoneroUpdate)
        {
            var esonero = service.Retrieve("agc_esonero", esoneroId, new ColumnSet("agc_punteggioalmomentoesonero"));
            if (!esonero.Contains("agc_punteggioalmomentoesonero"))
            {
                tracer.Trace("EsoneroRientroPlugin: agc_punteggioalmomentoesonero non presente, impossibile riallineare, mantengo solo log.");
                return;
            }

            var puntiAllEsonero = esonero.GetAttributeValue<decimal>("agc_punteggioalmomentoesonero");

            var query = new QueryExpression("agc_fotocaricoesonero")
            {
                ColumnSet = new ColumnSet("agc_magistrato", "agc_carico")
            };
            query.Criteria.AddCondition("agc_esonero", ConditionOperator.Equal, esoneroId);

            var foto = service.RetrieveMultiple(query).Entities;

            if (foto.Count == 0)
            {
                tracer.Trace("EsoneroRientroPlugin: nessuna fotografia colleghi trovata per questo esonero, mantengo solo log (nessun collega disponibile all'attivazione).");
                return;
            }

            var scelto = foto
                .OrderBy(f => Math.Abs(f.GetAttributeValue<decimal>("agc_carico") - puntiAllEsonero))
                .ThenBy(f => f.GetAttributeValue<decimal>("agc_carico"))
                .First();

            var collegaRef = (EntityReference)scelto["agc_magistrato"];

            var collega = service.Retrieve("contact", collegaRef.Id, new ColumnSet("agc_caricoattuale"));
            var caricoCollegaAttuale = collega.Contains("agc_caricoattuale")
                ? collega.GetAttributeValue<decimal>("agc_caricoattuale")
                : 0m;

            tracer.Trace($"EsoneroRientroPlugin: collega piu' simile individuato ({collegaRef.Id}), riallineo carico magistrato a {caricoCollegaAttuale}.");

            service.Update(new Entity("contact", magistratoId)
            {
                ["agc_caricoattuale"] = caricoCollegaAttuale
            });

            esoneroUpdate["agc_collegariferimento"] = collegaRef;
        }
    }
}
