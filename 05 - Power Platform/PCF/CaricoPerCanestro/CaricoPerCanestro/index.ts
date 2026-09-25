import { IInputs, IOutputs } from "./generated/ManifestTypes";

const COLOR_GREEN = "#107C10";
const COLOR_YELLOW = "#FFB900";
const COLOR_RED = "#D13438";
const CLOSED_STATUS_LABEL = "chiuso";
const CLOSED_STATUS_VALUE = 2;

interface CaricoGruppo {
  id: string;
  nome: string;
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
    const newId = (page?.entityId ?? "").replace(/[{}]/g, "").toLowerCase();
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
        "agc_fascicolo2",
        `?$select=agc_fascicolo2id,agc_pesocalcolato,agc_statocaso,` +
          `_agc_canestrofascicolo_value,_agc_peso2_value` +
          `&$filter=_agc_magistratocontatto_value eq ${magistratoId} and agc_pesocalcolato ne null`,
      )
      .then((res) => {
        const entities = (res.entities as Record<string, unknown>[]).filter(
          (f) => !this._isClosedFascicolo(f),
        );
        const rowsPeso1 = this._raggruppa(
          entities,
          "_agc_canestrofascicolo_value",
          "Senza canestro",
        );
        const rowsPeso2 = this._raggruppa(
          entities,
          "_agc_peso2_value",
          "Senza Peso 2",
        );
        this._render(rowsPeso1, rowsPeso2);
        return { rowsPeso1, rowsPeso2 };
      })
      .catch((err) => this._renderError(String(err)));
  }

  /* Raggruppa i fascicoli per il valore di un campo lookup (Peso 1 = canestro,
     Peso 2 = agc_peso2), sommando il peso calcolato totale per ciascun gruppo. */
  private _raggruppa(
    entities: Record<string, unknown>[],
    lookupField: string,
    etichettaVuota: string,
  ): CaricoGruppo[] {
    const map: Record<string, CaricoGruppo> = {};
    for (const f of entities) {
      const id = (f[lookupField] as string) ?? "__nessuno__";
      const nome =
        (f[`${lookupField}@OData.Community.Display.V1.FormattedValue`] as string) ??
        etichettaVuota;
      const peso = (f["agc_pesocalcolato"] as number) ?? 0;
      if (!map[id])
        map[id] = { id, nome, pesoTotale: 0, numFascicoli: 0 };
      map[id].pesoTotale += peso;
      map[id].numFascicoli += 1;
    }
    return Object.values(map).sort((a, b) => b.pesoTotale - a.pesoTotale);
  }

  private _isClosedFascicolo(entity: Record<string, unknown>): boolean {
    const formatted = String(
      entity["agc_statocaso@OData.Community.Display.V1.FormattedValue"] ?? "",
    )
      .trim()
      .toLowerCase();
    if (formatted === CLOSED_STATUS_LABEL) return true;

    const raw = entity["agc_statocaso"];
    if (typeof raw === "number") return raw === CLOSED_STATUS_VALUE;
    if (typeof raw === "string") {
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed === CLOSED_STATUS_VALUE;
    }
    return false;
  }

  private _barColor(peso: number): string {
    if (peso >= this._pesoLimiteCanestro) return COLOR_RED;
    if (peso >= this._pesoLimiteCanestro * 0.8) return COLOR_YELLOW;
    return COLOR_GREEN;
  }

  private _render(rowsPeso1: CaricoGruppo[], rowsPeso2: CaricoGruppo[]): void {
    this._container.innerHTML = "";

    const nessunDato = rowsPeso1.length === 0 && rowsPeso2.length === 0;
    if (nessunDato) {
      const empty = document.createElement("p");
      empty.textContent =
        "Nessun fascicolo aperto assegnato a questo magistrato.";
      empty.style.cssText = "color:#666;font-size:13px;";
      this._container.appendChild(empty);
      return;
    }

    this._renderSezione("Carico per Peso 1", rowsPeso1);
    this._renderSezione("Carico per Peso 2", rowsPeso2);

    /* ── Legenda (comune a entrambe le sezioni) ── */
    const legend = document.createElement("div");
    legend.style.cssText =
      "margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#555;";
    legend.innerHTML =
      `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOR_GREEN};margin-right:4px;"></span>Scarico</span>` +
      `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOR_YELLOW};margin-right:4px;"></span>Attenzione (≥80%)</span>` +
      `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${COLOR_RED};margin-right:4px;"></span>Oberato (≥soglia)</span>`;
    this._container.appendChild(legend);
  }

  private _renderSezione(titolo: string, rows: CaricoGruppo[]): void {
    const title = document.createElement("h3");
    title.textContent = titolo;
    title.style.cssText =
      "margin:0 0 12px;font-size:14px;font-weight:600;color:#242424;";
    this._container.appendChild(title);

    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Nessun fascicolo aperto in questa categoria.";
      empty.style.cssText = "color:#666;font-size:13px;margin-bottom:14px;";
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
        `<span style="color:#242424;font-weight:500;">${this._esc(row.nome)}</span>` +
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
