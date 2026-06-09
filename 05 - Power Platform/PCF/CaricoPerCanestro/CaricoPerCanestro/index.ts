import { IInputs, IOutputs } from "./generated/ManifestTypes";

const COLOR_GREEN = "#107C10";
const COLOR_YELLOW = "#FFB900";
const COLOR_RED = "#D13438";

interface CaricoCanestro {
  canestroId: string;
  canestroName: string;
  pesoTotale: number;
  numFascicoli: number;
}

export class CaricoPerCanestro implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _container: HTMLDivElement;
  private _context: ComponentFramework.Context<IInputs>;
  private _currentMagistratoId = "";
  private _pesoLimiteCanestro = 30;

  constructor() {
    /* PCF required */
  }

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement,
  ): void {
    this._context = context;
    this._container = container;
    this._container.style.cssText =
      "font-family:'Segoe UI',sans-serif;width:100%;";
    this._renderLoading();
    this._loadPesoLimite(context);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this._context = context;
    // context.page non è nei tipi pubblici PCF ma esiste a runtime — cast sicuro
    const page = (context as unknown as { page?: { entityId?: string } }).page;
    const newId = (page?.entityId ?? "")
      .replace(/[{}]/g, "")
      .toLowerCase();
    if (newId && newId !== this._currentMagistratoId) {
      this._currentMagistratoId = newId;
      this._loadData(newId);
    }
  }

  private _loadPesoLimite(context: ComponentFramework.Context<IInputs>): void {
    context.webAPI
      .retrieveMultipleRecords(
        "agc_configurazione",
        "?$select=agc_valore&$filter=agc_nome eq 'PesoLimiteCanestro'&$top=1",
      )
      .then((res) => {
        if (res.entities.length > 0) {
          const v = res.entities[0]["agc_valore"] as number;
          if (v > 0) this._pesoLimiteCanestro = v;
        }
        return res;
      })
      .catch(() => {
        /* usa default */
      });
  }

  private _loadData(magistratoId: string): void {
    this._renderLoading();
    this._context.webAPI
      .retrieveMultipleRecords(
        "agc_fascicolo",
        `?$select=agc_fascicoloid,agc_peso,_agc_canestro_value` +
          `&$filter=_agc_magistratoassegnato_value eq ${magistratoId} and agc_peso ne null`,
      )
      .then((res) => {
        const map: Record<string, CaricoCanestro> = {};
        for (const f of res.entities) {
          const cId = (f["_agc_canestro_value"] as string) ?? "__nessuno__";
          const cName = (f["_agc_canestro_value@OData.Community.Display.V1.FormattedValue"] as string) ?? "Senza canestro";
          const peso = (f["agc_peso"] as number) ?? 0;
          if (!map[cId])
            map[cId] = {
              canestroId: cId,
              canestroName: cName,
              pesoTotale: 0,
              numFascicoli: 0,
            };
          map[cId].pesoTotale += peso;
          map[cId].numFascicoli += 1;
        }
        const rows = Object.values(map).sort(
          (a, b) => b.pesoTotale - a.pesoTotale,
        );
        this._render(rows);
        return rows;
      })
      .catch((err) => this._renderError(String(err)));
  }

  private _barColor(peso: number): string {
    if (peso >= this._pesoLimiteCanestro) return COLOR_RED;
    if (peso >= this._pesoLimiteCanestro * 0.8) return COLOR_YELLOW;
    return COLOR_GREEN;
  }

  private _render(rows: CaricoCanestro[]): void {
    this._container.innerHTML = "";

    /* ── Titolo ── */
    const title = document.createElement("h3");
    title.textContent = "Carico per Canestro";
    title.style.cssText =
      "margin:0 0 12px;font-size:14px;font-weight:600;color:#242424;";
    this._container.appendChild(title);

    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Nessun fascicolo assegnato a questo magistrato.";
      empty.style.cssText = "color:#666;font-size:13px;";
      this._container.appendChild(empty);
      return;
    }

    const maxPeso = Math.max(...rows.map((r) => r.pesoTotale), 1);

    for (const row of rows) {
      const pct = Math.round((row.pesoTotale / maxPeso) * 100);
      const color = this._barColor(row.pesoTotale);

      /* Wrapper riga */
      const item = document.createElement("div");
      item.style.cssText = "margin-bottom:10px;";

      /* Label sopra la barra */
      const label = document.createElement("div");
      label.style.cssText =
        "display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;";
      label.innerHTML =
        `<span style="color:#242424;font-weight:500;">${this._esc(row.canestroName)}</span>` +
        `<span style="color:#555;">${row.pesoTotale.toFixed(1)} pt &nbsp;·&nbsp; ${row.numFascicoli} fasc.</span>`;

      /* Track barra */
      const track = document.createElement("div");
      track.style.cssText =
        "background:#E0E0E0;border-radius:4px;height:14px;overflow:hidden;";

      /* Barra colorata */
      const bar = document.createElement("div");
      bar.style.cssText =
        `width:${pct}%;height:100%;background:${color};border-radius:4px;` +
        `transition:width .4s ease;`;

      track.appendChild(bar);
      item.appendChild(label);
      item.appendChild(track);
      this._container.appendChild(item);
    }

    /* ── Legenda ── */
    const legend = document.createElement("div");
    legend.style.cssText =
      "margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#555;";
    legend.innerHTML =
      `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOR_GREEN};margin-right:4px;"></span>Scarico</span>` +
      `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOR_YELLOW};margin-right:4px;"></span>Attenzione (≥80%)</span>` +
      `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOR_RED};margin-right:4px;"></span>Oberato (≥soglia)</span>`;
    this._container.appendChild(legend);
  }

  private _renderLoading(): void {
    this._container.innerHTML = `<p style="color:#666;font-size:13px;">Caricamento carico per canestro…</p>`;
  }

  private _renderError(msg: string): void {
    this._container.innerHTML = `<p style="color:#D13438;font-size:13px;">Errore: ${this._esc(msg)}</p>`;
  }

  private _esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    this._container.innerHTML = "";
  }
}
