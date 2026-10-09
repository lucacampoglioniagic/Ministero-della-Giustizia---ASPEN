import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { Chart, PieController, ArcElement, Tooltip, Legend } from "chart.js";

Chart.register(PieController, ArcElement, Tooltip, Legend);

const FALLBACK_PALETTE = [
  "#0F6CBD",
  "#107C10",
  "#FFB900",
  "#D13438",
  "#8764B8",
  "#038387",
  "#CA5010",
];
const UNKNOWN_LABEL = "(nessun peso)";
const FORMATTED = "@OData.Community.Display.V1.FormattedValue";
const RELOAD_MIN_INTERVAL_MS = 5000;

type PesoKind = "peso1" | "peso2";

interface FascicoloRow {
  rg: string;
  magistrato: string;
  peso: number;
  data: string;
}

interface FascicoloData extends FascicoloRow {
  year: number | null;
  peso1: string;
  peso2: string;
}

export class FascicoliPerCanestroChart implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _context: ComponentFramework.Context<IInputs>;
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _yearSelect: HTMLSelectElement;
  private _chart: Chart<"pie", number[], string> | null = null;
  private _labels: string[] = [];
  private _fascicoliPerCanestro: Record<string, FascicoloRow[]> = {};
  private _selectedYear = "all";
  private _pesoSelect: HTMLSelectElement;
  private _selectedPeso: PesoKind = "peso1";
  private _fascicoli: FascicoloData[] = [];
  private _loadedAt = 0;
  private _loading = false;
  private _errorEl: HTMLDivElement;

  constructor() {
    // PCF required constructor
  }

  public init(
    context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement,
  ): void {
    this._context = context;
    this._container = container;
    this._container.classList.add("stato-fascicoli-chart");

    const wrapper = document.createElement("div");
    wrapper.className = "chart-wrapper";

    const header = document.createElement("div");
    header.className = "chart-header";

    const title = document.createElement("h2");
    title.className = "chart-title";
    title.textContent = "Fascicoli per Peso";

    const filters = document.createElement("div");
    filters.className = "chart-filters";

    const filterWrap = document.createElement("div");
    filterWrap.className = "year-filter";

    const filterLabel = document.createElement("span");
    filterLabel.className = "year-filter-label";
    filterLabel.textContent = "Anno";

    this._yearSelect = document.createElement("select");
    this._yearSelect.className = "year-filter-select";
    this._yearSelect.innerHTML = `<option value="all">Tutti gli anni</option>`;
    this._yearSelect.addEventListener("change", () => {
      this._selectedYear = this._yearSelect.value;
      if (this._context) this.updateView(this._context);
    });

    filterWrap.appendChild(filterLabel);
    filterWrap.appendChild(this._yearSelect);

    const pesoWrap = document.createElement("div");
    pesoWrap.className = "year-filter";
    const pesoLabel = document.createElement("span");
    pesoLabel.className = "year-filter-label";
    pesoLabel.textContent = "Peso";
    this._pesoSelect = document.createElement("select");
    this._pesoSelect.className = "year-filter-select";
    this._pesoSelect.innerHTML =
      `<option value="peso1">Peso 1</option><option value="peso2">Peso 2</option>`;
    this._pesoSelect.addEventListener("change", () => {
      this._selectedPeso = this._pesoSelect.value as PesoKind;
      if (this._context) this.updateView(this._context);
    });
    pesoWrap.appendChild(pesoLabel);
    pesoWrap.appendChild(this._pesoSelect);

    filters.appendChild(filterWrap);
    filters.appendChild(pesoWrap);
    header.appendChild(title);
    header.appendChild(filters);

    this._canvas = document.createElement("canvas");
    this._canvas.className = "chart-canvas";
    this._canvas.style.cursor = "pointer";

    const canvasHolder = document.createElement("div");
    canvasHolder.className = "chart-canvas-holder";
    canvasHolder.appendChild(this._canvas);

    this._errorEl = document.createElement("div");
    this._errorEl.style.cssText = "display:none;color:#D13438;font-size:13px;margin-bottom:8px;";

    wrapper.appendChild(header);
    wrapper.appendChild(this._errorEl);
    wrapper.appendChild(canvasHolder);
    this._container.appendChild(wrapper);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this._context = context;
    const dataset = context.parameters.fascicoliDataSet;
    if (dataset.loading) return;
    this._loadFascicoli(context);

    const yearsSet = new Set<number>();
    for (const f of this._fascicoli) {
      if (f.year !== null) yearsSet.add(f.year);
    }
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    this._syncYearFilter(years);

    const counts: Record<string, number> = {};
    this._fascicoliPerCanestro = {};

    for (const f of this._fascicoli) {
      if (this._selectedYear !== "all" && f.year !== Number(this._selectedYear)) {
        continue;
      }

      const canestro =
        (this._selectedPeso === "peso1" ? f.peso1 : f.peso2) || UNKNOWN_LABEL;
      counts[canestro] = (counts[canestro] ?? 0) + 1;

      if (!this._fascicoliPerCanestro[canestro]) {
        this._fascicoliPerCanestro[canestro] = [];
      }
      this._fascicoliPerCanestro[canestro].push(f);
    }

    const labels = Object.keys(counts);
    const values = labels.map((l) => counts[l]);
    const colors = labels.map(
      (_l, i) => FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    );

    this._labels = labels;

    if (this._chart) {
      this._chart.data.labels = labels;
      this._chart.data.datasets[0].data = values;
      this._chart.data.datasets[0].backgroundColor = colors;
      this._chart.update();
      return;
    }

    this._chart = new Chart(this._canvas, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        animation: { duration: 900 },
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const canestro = this._labels[elements[0].index];
          this._openModal(canestro);
        },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: { font: { size: 13 }, padding: 16, color: "#222" },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const total = (ctx.dataset.data as number[]).reduce(
                  (a, b) => a + b,
                  0,
                );
                const pct =
                  total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0";
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%) — clicca per dettaglio`;
              },
            },
          },
        },
      },
    });
  }

  // Il dataset legato alla view non contiene agc_pesocalcolato2 né agc_pesodue (leggerli da lì
  // restituiva sempre 0/vuoto): i dati dei fascicoli si leggono direttamente via Web API.
  private _loadFascicoli(context: ComponentFramework.Context<IInputs>): void {
    if (this._loading || Date.now() - this._loadedAt < RELOAD_MIN_INTERVAL_MS) {
      return;
    }
    this._loading = true;
    this._fetchAllFascicoli(context)
      .then((rows) => {
        this._fascicoli = rows;
        this._errorEl.style.display = "none";
        return rows;
      })
      .catch((err) => {
        // mantiene i dati precedenti, riprova al prossimo refresh
        console.error("FascicoliPerCanestroChart: caricamento fascicoli fallito", err);
        this._errorEl.textContent = `Errore nel caricamento dei fascicoli: ${
          (err as { message?: string })?.message ?? String(err)
        }`;
        this._errorEl.style.display = "block";
        return null;
      })
      .finally(() => {
        this._loading = false;
        this._loadedAt = Date.now();
        this.updateView(this._context);
      })
      .catch(() => {
        // errori di updateView non devono diventare unhandled rejection
      });
  }

  private async _fetchAllFascicoli(
    context: ComponentFramework.Context<IInputs>,
  ): Promise<FascicoloData[]> {
    const select =
      "?$select=agc_numeroregistrogenerale,agc_datacaso,agc_pesocalcolato2," +
      "_agc_magistratocontatto_value,_agc_pesouno_value,_agc_pesodue_value";
    const rows: FascicoloData[] = [];
    let query: string | undefined = select;
    while (query) {
      const res: ComponentFramework.WebApi.RetrieveMultipleResponse =
        await context.webAPI.retrieveMultipleRecords("agc_fascicolo2", query);
      for (const e of res.entities as Record<string, unknown>[]) {
        rows.push({
          rg: (e["agc_numeroregistrogenerale"] as string) || "—",
          magistrato:
            (e[`_agc_magistratocontatto_value${FORMATTED}`] as string) || "—",
          peso: Number(e["agc_pesocalcolato2"]) || 0,
          data: (e[`agc_datacaso${FORMATTED}`] as string) || "—",
          year: this._yearFromRaw(e["agc_datacaso"]),
          peso1: (e[`_agc_pesouno_value${FORMATTED}`] as string) || "",
          peso2: (e[`_agc_pesodue_value${FORMATTED}`] as string) || "",
        });
      }
      const next: string | undefined = res.nextLink;
      query = next ? next.substring(next.indexOf("?")) : undefined;
    }
    return rows;
  }

  private _yearFromRaw(raw: unknown): number | null {
    if (typeof raw !== "string") return null;
    const m = /^(\d{4})-/.exec(raw);
    return m ? Number(m[1]) : null;
  }

  private _syncYearFilter(years: number[]): void {
    const selectedStillValid =
      this._selectedYear === "all" ||
      years.some((y) => String(y) === this._selectedYear);
    if (!selectedStillValid) this._selectedYear = "all";

    const options = [
      `<option value="all">Tutti gli anni</option>`,
      ...years.map((y) => `<option value="${y}">${y}</option>`),
    ];
    this._yearSelect.innerHTML = options.join("");
    this._yearSelect.value = this._selectedYear;
  }

  private _openModal(canestro: string): void {
    const rows = this._fascicoliPerCanestro[canestro] ?? [];

    const existing = document.getElementById("aspen-pie-modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "aspen-pie-modal-overlay";
    overlay.className = "aspen-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const modal = document.createElement("div");
    modal.className = "aspen-modal";

    const header = document.createElement("div");
    header.className = "aspen-modal-header";
    header.style.background = "#0F6CBD";
    header.innerHTML = `
      <span class="aspen-modal-title">Fascicoli con ${this._selectedPeso === "peso1" ? "Peso 1" : "Peso 2"} <strong>${canestro}</strong> (${rows.length})</span>
      <button class="aspen-modal-close" aria-label="Chiudi">&times;</button>
    `;
    header
      .querySelector(".aspen-modal-close")!
      .addEventListener("click", () => overlay.remove());

    const body = document.createElement("div");
    body.className = "aspen-modal-body";

    if (rows.length === 0) {
      body.innerHTML = `<p class="aspen-modal-empty">Nessun fascicolo trovato.</p>`;
    } else {
      const table = document.createElement("table");
      table.className = "aspen-modal-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th>N. RG</th>
            <th>Magistrato</th>
            <th>Peso</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td>${r.rg}</td>
            <td>${r.magistrato}</td>
            <td><strong>${r.peso}</strong></td>
            <td>${r.data}</td>
          </tr>`,
            )
            .join("")}
        </tbody>
      `;
      body.appendChild(table);
    }

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    const host = this._container.getRootNode();
    if (host instanceof ShadowRoot) {
      host.appendChild(overlay);
    } else {
      document.body.appendChild(overlay);
    }
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    document.getElementById("aspen-pie-modal-overlay")?.remove();
    this._chart?.destroy();
    this._chart = null;
  }
}
