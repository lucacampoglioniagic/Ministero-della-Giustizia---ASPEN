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

const COLOR_GREEN = "#107C10";
const COLOR_YELLOW = "#FFB900";
const COLOR_RED = "#D13438";
const COLOR_UNASSIGNED = "#5C2D91";
const COLOR_GREEN_HOVER = "#0B5E0B";
const COLOR_YELLOW_HOVER = "#C78F00";
const COLOR_RED_HOVER = "#A31B1E";
const COLOR_UNASSIGNED_HOVER = "#4B1F78";
const UNASSIGNED_LABEL = "(non assegnato)";
const CLOSED_STATUS_LABEL = "chiuso";
const CLOSED_STATUS_VALUE = 2;

interface FascicoloRow {
  rg: string;
  canestro: string;
  peso: number;
  stato: string;
  data: string;
}

function barColor(value: number, limit: number, hover = false): string {
  if (value >= limit) return hover ? COLOR_RED_HOVER : COLOR_RED;
  if (value >= limit * 0.8) return hover ? COLOR_YELLOW_HOVER : COLOR_YELLOW;
  return hover ? COLOR_GREEN_HOVER : COLOR_GREEN;
}

function isClosedStatus(rawStatus: unknown, formattedStatus: string): boolean {
  if (formattedStatus.trim().toLowerCase() === CLOSED_STATUS_LABEL) return true;
  if (typeof rawStatus === "number") return rawStatus === CLOSED_STATUS_VALUE;
  if (typeof rawStatus === "string") {
    const parsed = Number(rawStatus);
    return Number.isFinite(parsed) && parsed === CLOSED_STATUS_VALUE;
  }
  return false;
}

export class CaricoMagistratiChart implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _legendEl: HTMLDivElement;
  private _chart: Chart<"bar", number[], string> | null = null;
  private _context: ComponentFramework.Context<IInputs>;
  private _notifyOutputChanged: () => void;
  private _pesoLimite = 20;
  private _labels: string[] = [];
  private _hasScheduledDelayedRefresh = false;
  private _delayedRefreshTimer: number | null = null;
  // magistrato name → list of fascicoli rows (from dataset)
  private _fascicoliPerMagistrato: Record<string, FascicoloRow[]> = {};

  constructor() {
    // PCF required constructor
  }

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement,
  ): void {
    this._context = context;
    this._notifyOutputChanged = notifyOutputChanged;
    this._container = container;
    this._container.classList.add("carico-magistrati-chart");

    const wrapper = document.createElement("div");
    wrapper.className = "chart-wrapper";

    const title = document.createElement("h2");
    title.className = "chart-title";
    title.textContent = "Carico per Magistrato";

    this._canvas = document.createElement("canvas");
    this._canvas.className = "chart-canvas";
    this._canvas.style.cursor = "pointer";

    this._legendEl = document.createElement("div");
    this._legendEl.className = "chart-legend";
    this._legendEl.innerHTML = `
      <span class="legend-item"><span class="legend-dot" style="background:${COLOR_GREEN}"></span>Scarico</span>
      <span class="legend-item"><span class="legend-dot" style="background:${COLOR_YELLOW}"></span>Attenzione (&ge;80%)</span>
      <span class="legend-item"><span class="legend-dot" style="background:${COLOR_RED}"></span>Oberato (&ge;soglia)</span>
      <span class="legend-item"><span class="legend-dot" style="background:${COLOR_UNASSIGNED}"></span>Non assegnato</span>
    `;

    wrapper.appendChild(title);
    wrapper.appendChild(this._canvas);
    wrapper.appendChild(this._legendEl);
    this._container.appendChild(wrapper);

    this._loadPesoLimite(context);
  }

  private _loadPesoLimite(context: ComponentFramework.Context<IInputs>): void {
    context.webAPI
      .retrieveMultipleRecords(
        "agc_configurazione",
        "?$select=agc_valore&$filter=agc_nome eq 'PesoLimite'&$top=1",
      )
      .then((result) => {
        if (result.entities.length > 0) {
          const val = result.entities[0]["agc_valore"];
          if (typeof val === "number" && val > 0) {
            this._pesoLimite = val;
            this._notifyOutputChanged();
          }
        }
        return result;
      })
      .catch(() => {
        // fallback: keep default pesoLimite
      });
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this._context = context;
    const dataset = context.parameters.fascicoliDataSet;
    if (dataset.loading) return;
    if (!this._hasScheduledDelayedRefresh) {
      this._hasScheduledDelayedRefresh = true;
      this._delayedRefreshTimer = window.setTimeout(() => {
        this._context.parameters.fascicoliDataSet.refresh();
      }, 2000);
    }

    const totals: Record<string, number> = {};
    this._fascicoliPerMagistrato = {};

    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const stato =
        record.getFormattedValue("agc_statocaso") ||
        record.getFormattedValue("agc_statocasoname") ||
        "";
      if (isClosedStatus(record.getValue("agc_statocaso"), stato)) continue;

      const magistrato =
        record.getFormattedValue("magistratoField") || UNASSIGNED_LABEL;
      const peso = Number(record.getValue("pesoField")) || 0;

      totals[magistrato] = (totals[magistrato] ?? 0) + peso;

      const row: FascicoloRow = {
        rg: (record.getValue("agc_numeroregistrogenerale") as string) || "—",
        canestro:
          record.getFormattedValue("agc_canestro") ||
          record.getFormattedValue("agc_canestroname") ||
          "—",
        peso,
        stato: stato || "—",
        data: record.getFormattedValue("agc_datacaso") || "—",
      };
      if (!this._fascicoliPerMagistrato[magistrato]) {
        this._fascicoliPerMagistrato[magistrato] = [];
      }
      this._fascicoliPerMagistrato[magistrato].push(row);
    }

    const sorted = Object.entries(totals).sort((a, b) => {
      const aIsUnassigned = a[0] === UNASSIGNED_LABEL;
      const bIsUnassigned = b[0] === UNASSIGNED_LABEL;
      if (aIsUnassigned && !bIsUnassigned) return 1;
      if (!aIsUnassigned && bIsUnassigned) return -1;
      return b[1] - a[1];
    });
    const labels = sorted.map(([name]) => name);
    const values = sorted.map(([, val]) => val);
    const colors = sorted.map(([name, val]) =>
      name === UNASSIGNED_LABEL
        ? COLOR_UNASSIGNED
        : barColor(val, this._pesoLimite),
    );
    const hoverColors = sorted.map(([name, val]) =>
      name === UNASSIGNED_LABEL
        ? COLOR_UNASSIGNED_HOVER
        : barColor(val, this._pesoLimite, true),
    );

    this._labels = labels;

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
            label: "Carico (punti peso)",
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
              label: (ctx) => ` ${ctx.parsed.x} punti — clicca per dettaglio`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: "#E0E0E0" },
            ticks: { color: "#444" },
            title: {
              display: true,
              text: "Punti carico totali",
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
    const rows = this._fascicoliPerMagistrato[magistratoName] ?? [];

    // Remove any existing modal
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
      <span class="aspen-modal-title">Fascicoli di <strong>${magistratoName}</strong></span>
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
            <th>Canestro</th>
            <th>Peso</th>
            <th>Stato</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
            <td>${r.rg}</td>
            <td>${r.canestro}</td>
            <td><strong>${r.peso}</strong></td>
            <td><span class="badge badge-${r.stato.toLowerCase()}">${r.stato}</span></td>
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

    // Attach overlay — works both in ShadowDOM (PCF) and regular DOM
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
    if (this._delayedRefreshTimer !== null) {
      window.clearTimeout(this._delayedRefreshTimer);
      this._delayedRefreshTimer = null;
    }
    document.getElementById("aspen-modal-overlay")?.remove();
    this._chart?.destroy();
    this._chart = null;
  }
}
