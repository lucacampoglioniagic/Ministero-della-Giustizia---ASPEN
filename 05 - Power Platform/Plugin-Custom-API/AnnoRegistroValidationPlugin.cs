using Microsoft.Xrm.Sdk;
using System;
using System.Text.RegularExpressions;

namespace AgicAspen.Plugins
{
    /// <summary>
    /// Pre-Operation Create/Update plugin registrato su agc_rgnr. Valida il campo agc_annoregistro
    /// (Testo, MaxLength 4) ogni volta che è presente nel Target: deve contenere esattamente 4 cifre
    /// numeriche (nessuna lettera, spazio o segno) e rappresentare un anno compreso tra 1900 e 2200.
    /// Il campo non è dichiarato obbligatorio a livello di colonna: se non viene valorizzato (o non
    /// è presente nel Target di una Update parziale) la validazione viene semplicemente saltata.
    ///
    /// Registrazione richiesta (Web API dirette, stesso pattern delle altre validazioni del progetto):
    /// - Step su Create, Pre-Operation (stage 20), nessuna image necessaria.
    /// - Step su Update, Pre-Operation (stage 20), nessuna image necessaria (si valida solo se
    ///   agc_annoregistro è presente nel Target, cioè se l'utente lo sta effettivamente modificando).
    /// </summary>
    public class AnnoRegistroValidationPlugin : PluginBase
    {
        private const int AnnoMinimo = 1900;
        private const int AnnoMassimo = 2200;
        private static readonly Regex QuattroCifre = new Regex(@"^\d{4}$", RegexOptions.Compiled);

        public AnnoRegistroValidationPlugin(string unsecureConfiguration, string secureConfiguration)
            : base(typeof(AnnoRegistroValidationPlugin))
        {
        }

        protected override void ExecuteDataversePlugin(ILocalPluginContext localPluginContext)
        {
            if (localPluginContext == null)
                throw new ArgumentNullException(nameof(localPluginContext));

            var context = localPluginContext.PluginExecutionContext;
            var tracer = localPluginContext.TracingService;

            // Solo Pre-Operation, sui messaggi Create e Update
            if (context.Stage != 20)
                return;

            if (context.MessageName != "Create" && context.MessageName != "Update")
                return;

            if (!context.InputParameters.Contains("Target") || !(context.InputParameters["Target"] is Entity target))
                return;

            if (!target.Contains("agc_annoregistro"))
            {
                tracer.Trace("AnnoRegistroValidationPlugin: agc_annoregistro non presente nel Target, skip.");
                return;
            }

            var valore = target["agc_annoregistro"] as string;

            // Campo non obbligatorio: se viene esplicitamente svuotato (null/stringa vuota), nessuna validazione.
            if (string.IsNullOrWhiteSpace(valore))
                return;

            if (!QuattroCifre.IsMatch(valore))
            {
                throw new InvalidPluginExecutionException(
                    "Anno Registro non valido: deve contenere esattamente 4 cifre numeriche (es. 2024).");
            }

            var anno = int.Parse(valore);
            if (anno < AnnoMinimo || anno > AnnoMassimo)
            {
                throw new InvalidPluginExecutionException(
                    $"Anno Registro non valido: deve essere un anno compreso tra {AnnoMinimo} e {AnnoMassimo}.");
            }
        }
    }
}
