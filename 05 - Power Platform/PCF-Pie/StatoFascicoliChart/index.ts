import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { Chart, PieController, ArcElement, Tooltip, Legend } from "chart.js";

Chart.register(PieController, ArcElement, Tooltip, Legend);

const STATE_COLORS: Record<string, string> = {
  Validato: "#107C10",
  Proposto: "#0F6CBD",
  Chiuso: "#6B7280",
};
const FALLBACK_PALETTE = [
  "#FFB900",
  "#D13438",
  "#8764B8",
  "#038387",
  "#CA5010",
];

interface FascicoloRow {
  rg: string;
  magistrato: string;
  canestro: string;
  peso: number;
  data: string;
}

export class StatoFascicoliChart implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _context: ComponentFramework.Context<IInputs>;
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _yearSelect: HTMLSelectElement;
  private _chart: Chart<"pie", number[], string> | null = null;
  private _labels: string[] = [];
  private _fascicoliPerStato: Record<string, FascicoloRow[]> = {};
  private _selectedYear = "all";

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
    title.textContent = "Fascicoli per Stato";

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
    header.appendChild(title);
    header.appendChild(filterWrap);

    this._canvas = document.createElement("canvas");
    this._canvas.className = "chart-canvas";
    this._canvas.style.cursor = "pointer";

    wrapper.appendChild(header);
    wrapper.appendChild(this._canvas);
    this._container.appendChild(wrapper);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this._context = context;
    const dataset = context.parameters.fascicoliDataSet;
    if (dataset.loading) return;

    const yearsSet = new Set<number>();
    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const year = this._extractYear(record);
      if (year !== null) yearsSet.add(year);
    }
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    this._syncYearFilter(years);

    const counts: Record<string, number> = {};
    this._fascicoliPerStato = {};

    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const year = this._extractYear(record);
      if (this._selectedYear !== "all" && year !== Number(this._selectedYear)) {
        continue;
      }

      const stato = record.getFormattedValue("statoField") || "(sconosciuto)";
      counts[stato] = (counts[stato] ?? 0) + 1;

      const row: FascicoloRow = {
        rg: (record.getValue("agc_numeroregistrogenerale") as string) || "—",
        magistrato:
          record.getFormattedValue("agc_magistratocontatto") ||
          record.getFormattedValue("agc_magistratocontattoname") ||
          "—",
        canestro:
          record.getFormattedValue("agc_canestrofascicolo") ||
          record.getFormattedValue("agc_canestrofascicoloname") ||
          "—",
        peso: Number(record.getValue("agc_pesocalcolato")) || 0,
        data: record.getFormattedValue("agc_datacaso") || "—",
      };
      if (!this._fascicoliPerStato[stato]) {
        this._fascicoliPerStato[stato] = [];
      }
      this._fascicoliPerStato[stato].push(row);
    }

    const labels = Object.keys(counts);
    const values = labels.map((l) => counts[l]);
    const colors = labels.map(
      (l, i) =>
        STATE_COLORS[l] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
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
          const stato = this._labels[elements[0].index];
          this._openModal(stato);
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

  private _extractYear(
    record: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord,
  ): number | null {
    const raw = record.getValue("agc_datacaso");
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw.getFullYear();
    }
    if (typeof raw === "string") {
      const rawDate = new Date(raw);
      if (!Number.isNaN(rawDate.getTime())) return rawDate.getFullYear();
    }

    const formatted = record.getFormattedValue("agc_datacaso") || "";
    const match = formatted.match(/(19|20)\d{2}/);
    if (match) return Number(match[0]);

    return null;
  }

  private _openModal(stato: string): void {
    const rows = this._fascicoliPerStato[stato] ?? [];
    const color = STATE_COLORS[stato] ?? "#0F6CBD";

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
    header.style.background = color;
    header.innerHTML = `
      <span class="aspen-modal-title">Fascicoli con stato <strong>${stato}</strong> (${rows.length})</span>
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
            <th>Canestro</th>
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
            <td>${r.canestro}</td>
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
