using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;
using System;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Post-Operation Create/Update plugin registrato su <c>agc_fascicolo2</c>. Applica lato
    /// server la regola 3.11 "carico monotono", aggiornando <c>agc_caricoattuale</c> del
    /// magistrato ogni volta che il campo <c>agc_magistratocontatto</c> viene impostato,
    /// cambiato o svuotato — indipendentemente dal percorso usato per farlo (form del fascicolo,
    /// creazione da subgrid del Contatto, "Aggiungi fascicolo esistente" dalla subgrid, modifica
    /// inline in griglia, assegnazione massiva/assistita via Web API, import, integrazioni).
    ///
    /// Questo sostituisce e centralizza la logica di incremento/decremento carico che in
    /// precedenza viveva solo lato client (agc_assignfascicolo.js, agc_assignfascicolodialog.html):
    /// quei file continuano a gestire le validazioni che richiedono un'interazione con l'utente
    /// prima del salvataggio (messaggio immediato di blocco per esonero Totale, avviso di
    /// riserva GUP), ma NON scrivono più direttamente <c>agc_caricoattuale</c>, per evitare un
    /// doppio conteggio. Il blocco per esonero Totale è inoltre riapplicato qui come vincolo
    /// bloccante (eccezione, intera operazione annullata), per coprire anche i percorsi che non
    /// aprono mai il form del fascicolo (subgrid "Aggiungi esistente", bulk edit, import, Web
    /// API dirette), dove la validazione client non verrebbe mai eseguita.
    ///
    /// Il peso del fascicolo (<c>agc_pesocalcolato</c>) viene sempre riletto fresco dal server
    /// dopo l'operazione (Post-Operation), perché è un campo calcolato che referenzia un'altra
    /// tabella (Peso 1/Peso 2 tramite agc_Canestrofascicolo) e non è quindi presente/affidabile
    /// nel Target o nelle Image.
    ///
    /// Il campo <c>agc_contributocaricoassegnato</c> (sul fascicolo) memorizza il contributo
    /// esatto (peso x coefficiente esonero parziale del magistrato al momento dell'assegnazione)
    /// applicato al carico del magistrato attualmente assegnato: viene scritto qui dopo ogni
    /// incremento e riletto dalla PreImage al decremento successivo, cosi' la rimozione/
    /// riassegnazione annulla esattamente quanto era stato aggiunto, anche se nel frattempo
    /// l'esonero del vecchio magistrato è cambiato o terminato (altrimenti si lascerebbe un
    /// residuo di carico "fantasma"). Gestito solo da questo plugin, non editabile manualmente.
    ///
    /// Registrazione richiesta (Plugin Registration Tool / Web API dirette):
    /// - Step su Create, Post-Operation (stage 40), Modalità sincrona, nessuna image necessaria.
    /// - Step su Update, Post-Operation (stage 40), Modalità sincrona, filtro sull'attributo
    ///   agc_magistratocontatto, con una PreImage ("PreImage") contenente almeno
    ///   agc_magistratocontatto e agc_contributocaricoassegnato.
    /// </summary>
    public class CaricoMagistratoAssegnazionePlugin : PluginBase
    {
        private const int TipoEsoneroTotale = 1;
        private const int TipoEsoneroParziale = 2;
        private const int StatoEsoneroAttivo = 1;
        private const int StagePostOperation = 40;

        public CaricoMagistratoAssegnazionePlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(CaricoMagistratoAssegnazionePlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
                throw new ArgumentNullException(nameof(localPluginContext));

            var context = localPluginContext.PluginExecutionContext;
            var service = localPluginContext.PluginUserService;
            var tracer = localPluginContext.TracingService;

            if (context.Stage != StagePostOperation)
                return;

            if (context.MessageName != "Create" && context.MessageName != "Update")
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                return;

            if (target.LogicalName != "agc_fascicolo2")
                return;

            EntityReference oldMagRef = null;
            EntityReference newMagRef;
            Entity preImage = null;

            if (context.MessageName == "Create")
            {
                if (!target.Contains("agc_magistratocontatto"))
                    return; // nessun magistrato alla creazione, nulla da aggiornare

                newMagRef = target["agc_magistratocontatto"] as EntityReference;
            }
            else
            {
                // Update: lo step è filtrato sull'attributo, quindi il Target lo contiene sempre
                // quando questo plugin viene eseguito (anche se svuotato: in tal caso vale null).
                if (!target.Contains("agc_magistratocontatto"))
                    return;

                newMagRef = target["agc_magistratocontatto"] as EntityReference;

                preImage = context.PreEntityImages.Contains("PreImage") ? context.PreEntityImages["PreImage"] : null;
                oldMagRef = preImage != null && preImage.Contains("agc_magistratocontatto")
                    ? preImage["agc_magistratocontatto"] as EntityReference
                    : null;
            }

            var oldMagId = oldMagRef?.Id;
            var newMagId = newMagRef?.Id;

            if (oldMagId == newMagId)
                return; // nessuna modifica reale (es. stesso magistrato riselezionato)

            // Blocco server-side per esonero Totale (regola già applicata lato client in
            // agc_assignfascicolo.js#verificaEsoneroTotale, ma qui necessaria per coprire anche
            // i percorsi che non passano dal form: subgrid "Aggiungi esistente", bulk edit,
            // import, Web API dirette). Un magistrato con esonero Totale attivo oggi non può
            // ricevere NESSUNA nuova assegnazione, né in Create né in Update: l'intera
            // operazione viene annullata (nessuna scrittura parziale del carico).
            if (newMagId.HasValue && HaEsoneroTotaleAttivo(service, newMagId.Value))
            {
                tracer.Trace($"CaricoMagistratoAssegnazionePlugin: assegnazione negata, il magistrato {newMagId.Value} ha un esonero Totale attivo.");
                throw new InvalidPluginExecutionException(
                    "Impossibile assegnare il fascicolo: il magistrato selezionato è attualmente in esonero Totale e non può ricevere nuove assegnazioni.");
            }

            var fascicolo = service.Retrieve("agc_fascicolo2", target.Id, new ColumnSet("agc_pesocalcolato"));
            var peso = fascicolo.Contains("agc_pesocalcolato") ? fascicolo.GetAttributeValue<decimal>("agc_pesocalcolato") : 0m;

            tracer.Trace($"CaricoMagistratoAssegnazionePlugin: fascicolo={target.Id} peso={peso} vecchioMagistrato={oldMagId} nuovoMagistrato={newMagId}");

            if (oldMagId.HasValue)
            {
                // Rimuove esattamente il contributo (peso x coefficiente esonero) registrato al
                // momento dell'assegnazione, non il peso "nudo" corrente: evita un residuo di
                // carico se l'esonero parziale del vecchio magistrato è nel frattempo cambiato o
                // terminato. Fallback al peso base per fascicoli assegnati prima dell'introduzione
                // di questo campo (mai valorizzato, quindi assente dalla PreImage).
                var contributoDaRimuovere = preImage != null && preImage.Contains("agc_contributocaricoassegnato")
                    ? preImage.GetAttributeValue<decimal>("agc_contributocaricoassegnato")
                    : peso;
                DecrementaCarico(service, tracer, oldMagId.Value, contributoDaRimuovere);
            }

            decimal? nuovoContributo = null;
            if (newMagId.HasValue)
                nuovoContributo = IncrementaCarico(service, tracer, newMagId.Value, peso);

            // Registra sul fascicolo il contributo appena applicato (null se il magistrato è
            // stato rimosso), cosi' un successivo decremento/riassegnazione potra' rimuovere
            // esattamente quanto e' stato aggiunto ora, incluso l'eventuale coefficiente esonero
            // parziale. Il campo non fa parte dei filteringattributes dello step Update, quindi
            // questa scrittura non ri-esegue il plugin.
            var fascicoloUpdate = new Entity("agc_fascicolo2", target.Id);
            fascicoloUpdate["agc_contributocaricoassegnato"] = nuovoContributo.HasValue ? (object)nuovoContributo.Value : null;
            service.Update(fascicoloUpdate);
        }

        private static void DecrementaCarico(IOrganizationService service, ITracingService tracer, Guid magistratoId, decimal contributo)
        {
            var contact = service.Retrieve("contact", magistratoId, new ColumnSet("agc_caricoattuale"));
            var caricoAttuale = contact.Contains("agc_caricoattuale") ? contact.GetAttributeValue<decimal>("agc_caricoattuale") : 0m;
            var nuovoCarico = Math.Max(0m, caricoAttuale - contributo);

            service.Update(new Entity("contact", magistratoId) { ["agc_caricoattuale"] = nuovoCarico });
            tracer.Trace($"CaricoMagistratoAssegnazionePlugin: decrementato carico magistrato {magistratoId} da {caricoAttuale} a {nuovoCarico} (contributo rimosso {contributo}).");
        }

        private static decimal IncrementaCarico(IOrganizationService service, ITracingService tracer, Guid magistratoId, decimal peso)
        {
            var coefficiente = OttieniCoefficienteCarico(service, magistratoId);
            var pesoEffettivo = peso * coefficiente;

            var contact = service.Retrieve("contact", magistratoId, new ColumnSet("agc_caricoattuale"));
            var caricoAttuale = contact.Contains("agc_caricoattuale") ? contact.GetAttributeValue<decimal>("agc_caricoattuale") : 0m;
            var nuovoCarico = caricoAttuale + pesoEffettivo;

            service.Update(new Entity("contact", magistratoId) { ["agc_caricoattuale"] = nuovoCarico });
            tracer.Trace($"CaricoMagistratoAssegnazionePlugin: incrementato carico magistrato {magistratoId} da {caricoAttuale} a {nuovoCarico} (peso {peso} x coefficiente {coefficiente}).");
            return pesoEffettivo;
        }

        /// <summary>
        /// Verifica se il magistrato ha un esonero Totale (1) Attivo (1) la cui finestra
        /// [agc_datainizio, agc_datafine] comprende la data odierna (agc_datafine opzionale =
        /// a tempo indeterminato). Stessa regola già applicata lato client in
        /// agc_assignfascicolo.js#verificaEsoneroTotale, qui riproposta server-side come
        /// vincolo bloccante per coprire anche i percorsi che non aprono il form del fascicolo.
        /// </summary>
        private static bool HaEsoneroTotaleAttivo(IOrganizationService service, Guid magistratoId)
        {
            var oggi = DateTime.UtcNow;

            var query = new QueryExpression("agc_esonero")
            {
                ColumnSet = new ColumnSet("agc_esoneroid"),
                TopCount = 1
            };
            query.Criteria.AddCondition("agc_magistrato", ConditionOperator.Equal, magistratoId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("agc_statoesonero", ConditionOperator.Equal, StatoEsoneroAttivo);
            query.Criteria.AddCondition("agc_tipoesonero", ConditionOperator.Equal, TipoEsoneroTotale);
            query.Criteria.AddCondition("agc_datainizio", ConditionOperator.LessEqual, oggi);

            var dataFineFilter = new FilterExpression(LogicalOperator.Or);
            dataFineFilter.AddCondition("agc_datafine", ConditionOperator.GreaterEqual, oggi);
            dataFineFilter.AddCondition("agc_datafine", ConditionOperator.Null);
            query.Criteria.AddFilter(dataFineFilter);

            return service.RetrieveMultiple(query).Entities.Count > 0;
        }

        /// <summary>
        /// Coefficiente di carico per esonero Parziale attivo (stessa regola già applicata lato
        /// client in agc_assignfascicolo.js#ottieniCoefficienteCarico e nel dialog assistito).
        /// Nessun esonero Parziale attivo oggi => coefficiente 1 (peso invariato).
        /// </summary>
        private static decimal OttieniCoefficienteCarico(IOrganizationService service, Guid magistratoId)
        {
            var oggi = DateTime.UtcNow;

            var query = new QueryExpression("agc_esonero")
            {
                ColumnSet = new ColumnSet("agc_percentualeesonero"),
                TopCount = 1
            };
            query.Criteria.AddCondition("agc_magistrato", ConditionOperator.Equal, magistratoId);
            query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            query.Criteria.AddCondition("agc_statoesonero", ConditionOperator.Equal, StatoEsoneroAttivo);
            query.Criteria.AddCondition("agc_tipoesonero", ConditionOperator.Equal, TipoEsoneroParziale);
            query.Criteria.AddCondition("agc_datainizio", ConditionOperator.LessEqual, oggi);

            var dataFineFilter = new FilterExpression(LogicalOperator.Or);
            dataFineFilter.AddCondition("agc_datafine", ConditionOperator.GreaterEqual, oggi);
            dataFineFilter.AddCondition("agc_datafine", ConditionOperator.Null);
            query.Criteria.AddFilter(dataFineFilter);

            var esoneri = service.RetrieveMultiple(query).Entities;
            if (esoneri.Count == 0)
                return 1m;

            var percentuale = esoneri[0].Contains("agc_percentualeesonero") ? esoneri[0].GetAttributeValue<decimal>("agc_percentualeesonero") : 0m;
            return percentuale > 0 ? (1 + percentuale / 100m) : 1m;
        }
    }
}
