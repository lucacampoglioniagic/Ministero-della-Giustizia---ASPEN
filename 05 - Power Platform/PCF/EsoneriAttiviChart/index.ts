import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const COLOR_TOTALE = "#D13438";
const COLOR_TOTALE_HOVER = "#A31B1E";
const COLOR_PARZIALE = "#FFB900";
const COLOR_PARZIALE_HOVER = "#C78F00";
const TIPO_TOTALE_VALUE = 1;
const STATO_ATTIVO_VALUE = 1;

interface EsoneroRow {
  magistrato: string;
  tipo: string;
  percentuale: string;
  dataInizio: string;
  dataFine: string;
}

function isEsoneroEffettivamenteAttivo(
  record: ComponentFramework.PropertyHelper.DataSetApi.EntityRecord,
): boolean {
  const stato = record.getValue("statoField");
  const statoNum =
    typeof stato === "number" ? stato : Number((stato as { value?: number })?.value ?? stato);
  if (statoNum !== STATO_ATTIVO_VALUE) return false;

  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);

  const inizio = record.getValue("dataInizioField") as Date | null;
  if (!inizio || Number.isNaN(inizio.getTime()) || inizio > oggi) return false;

  const fine = record.getValue("dataFineField") as Date | null;
  if (fine && !Number.isNaN(fine.getTime()) && fine < oggi) return false;

  return true;
}

export class EsoneriAttiviChart implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _emptyEl: HTMLDivElement;
  private _chart: Chart<"bar", number[], string> | null = null;
  private _context: ComponentFramework.Context<IInputs>;
  private _labels: string[] = [];
  private _esoneriPerMagistrato: Record<string, EsoneroRow[]> = {};

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
    this._container.classList.add("esoneri-attivi-chart");

    const wrapper = document.createElement("div");
    wrapper.className = "chart-wrapper";

    const title = document.createElement("h2");
    title.className = "chart-title";
    title.textContent = "Esoneri Attivi per Magistrato";

    this._canvas = document.createElement("canvas");
    this._canvas.className = "chart-canvas";
    this._canvas.style.cursor = "pointer";

    this._emptyEl = document.createElement("div");
    this._emptyEl.className = "chart-empty";
    this._emptyEl.textContent = "Nessun magistrato attualmente in esonero.";
    this._emptyEl.style.display = "none";

    const legend = document.createElement("div");
    legend.className = "chart-legend";
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-dot" style="background:${COLOR_TOTALE}"></span>Totale</span>
      <span class="legend-item"><span class="legend-dot" style="background:${COLOR_PARZIALE}"></span>Parziale</span>
    `;

    wrapper.appendChild(title);
    wrapper.appendChild(this._canvas);
    wrapper.appendChild(this._emptyEl);
    wrapper.appendChild(legend);
    this._container.appendChild(wrapper);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this._context = context;
    const dataset = context.parameters.esoneriDataSet;
    if (dataset.loading) return;

    this._esoneriPerMagistrato = {};
    const percentuali: Record<string, number> = {};
    const tipi: Record<string, number> = {};

    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      if (!isEsoneroEffettivamenteAttivo(record)) continue;

      const magistrato = record.getFormattedValue("magistratoField") || "—";
      const tipoRaw = record.getValue("tipoField");
      const tipoNum =
        typeof tipoRaw === "number"
          ? tipoRaw
          : Number((tipoRaw as { value?: number })?.value ?? tipoRaw);
      const percentuale = Number(record.getValue("percentualeField")) || 0;

      // Se per qualunque motivo storico esistesse più di un esonero attivo per lo stesso
      // magistrato, si mostra quello con percentuale maggiore (caso limite non atteso: il
      // plugin EsoneroOverlapValidationPlugin impedisce le sovrapposizioni per i nuovi record).
      if (!(magistrato in percentuali) || percentuale > percentuali[magistrato]) {
        percentuali[magistrato] = percentuale;
        tipi[magistrato] = tipoNum;
      }

      const row: EsoneroRow = {
        magistrato,
        tipo: record.getFormattedValue("tipoField") || "—",
        percentuale: record.getFormattedValue("percentualeField") || "—",
        dataInizio: record.getFormattedValue("dataInizioField") || "—",
        dataFine: record.getFormattedValue("dataFineField") || "A tempo indeterminato",
      };
      if (!this._esoneriPerMagistrato[magistrato]) {
        this._esoneriPerMagistrato[magistrato] = [];
      }
      this._esoneriPerMagistrato[magistrato].push(row);
    }

    const labels = Object.keys(percentuali).sort(
      (a, b) => percentuali[b] - percentuali[a],
    );
    const values = labels.map((l) => percentuali[l]);
    const colors = labels.map((l) =>
      tipi[l] === TIPO_TOTALE_VALUE ? COLOR_TOTALE : COLOR_PARZIALE,
    );
    const hoverColors = labels.map((l) =>
      tipi[l] === TIPO_TOTALE_VALUE ? COLOR_TOTALE_HOVER : COLOR_PARZIALE_HOVER,
    );

    this._labels = labels;

    const hasData = labels.length > 0;
    this._canvas.style.display = hasData ? "block" : "none";
    this._emptyEl.style.display = hasData ? "none" : "flex";

    if (!hasData) {
      this._chart?.destroy();
      this._chart = null;
      return;
    }

    if (this._chart) {
      this._chart.data.labels = labels;
      this._chart.data.datasets[0].data = values;
      this._chart.data.datasets[0].backgroundColor = colors;
      this._chart.data.datasets[0].hoverBackgroundColor = hoverColors;
      this._chart.update();
      return;
    }

    this._chart = new Chart(this._canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Percentuale esonero",
            data: values,
            backgroundColor: colors,
            hoverBackgroundColor: hoverColors,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        indexAxis: "y",
        animation: { duration: 900 },
        responsive: true,
        maintainAspectRatio: false,
        onClick: (_event, elements) => {
          if (elements.length === 0) return;
          const name = this._labels[elements[0].index];
          this._openModal(name);
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.x}% — clicca per dettaglio`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            grid: { color: "#E0E0E0" },
            ticks: { color: "#444" },
            title: {
              display: true,
              text: "% esonero",
              color: "#666",
              font: { size: 12 },
            },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#222", font: { size: 13 } },
          },
        },
      },
    });
  }

  private _openModal(magistratoName: string): void {
    const rows = this._esoneriPerMagistrato[magistratoName] ?? [];

    const existing = document.getElementById("aspen-modal-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "aspen-modal-overlay";
    overlay.className = "aspen-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const modal = document.createElement("div");
    modal.className = "aspen-modal";

    const header = document.createElement("div");
    header.className = "aspen-modal-header";
    header.innerHTML = `
      <span class="aspen-modal-title">Esonero di <strong>${magistratoName}</strong></span>
      <button class="aspen-modal-close" aria-label="Chiudi">&times;</button>
    `;
    header
      .querySelector(".aspen-modal-close")!
      .addEventListener("click", () => overlay.remove());

    const body = document.createElement("div");
    body.className = "aspen-modal-body";

    if (rows.length === 0) {
      body.innerHTML = `<p class="aspen-modal-empty">Nessun esonero trovato.</p>`;
    } else {
      const table = document.createElement("table");
      table.className = "aspen-modal-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Percentuale</th>
            <th>Data inizio</th>
            <th>Data fine</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td>${r.tipo}</td>
            <td><strong>${r.percentuale}</strong></td>
            <td>${r.dataInizio}</td>
            <td>${r.dataFine}</td>
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
    document.getElementById("aspen-modal-overlay")?.remove();
    this._chart?.destroy();
    this._chart = null;
  }
}
