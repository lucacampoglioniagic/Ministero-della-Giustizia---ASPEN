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

const ENTITY_GIUDICE = "agc_giudice";
const COLOR_GREEN = "#107C10";
const COLOR_YELLOW = "#FFB900";
const COLOR_RED = "#D13438";
const COLOR_GREEN_HOVER = "#0B5E0B";
const COLOR_YELLOW_HOVER = "#C78F00";
const COLOR_RED_HOVER = "#A31B1E";

function barColor(value: number, limit: number, hover = false): string {
  if (value >= limit) return hover ? COLOR_RED_HOVER : COLOR_RED;
  if (value >= limit * 0.8) return hover ? COLOR_YELLOW_HOVER : COLOR_YELLOW;
  return hover ? COLOR_GREEN_HOVER : COLOR_GREEN;
}

export class CaricoMagistratiChart implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _legendEl: HTMLDivElement;
  private _chart: Chart<"bar", number[], string> | null = null;
  private _context: ComponentFramework.Context<IInputs>;
  private _magistratoIdMap: Record<string, string> = {};
  private _pesoLimite = 20;

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
    `;

    wrapper.appendChild(title);
    wrapper.appendChild(this._canvas);
    wrapper.appendChild(this._legendEl);
    this._container.appendChild(wrapper);

    // Load PesoLimite from agc_configurazione
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

    const totals: Record<string, number> = {};
    this._magistratoIdMap = {};

    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const magistrato = record.getFormattedValue("magistratoField") || "(non assegnato)";
      const peso = Number(record.getValue("pesoField")) || 0;
      totals[magistrato] = (totals[magistrato] ?? 0) + peso;

      if (!this._magistratoIdMap[magistrato]) {
        const lookupVal = record.getValue("magistratoField") as ComponentFramework.LookupValue[];
        if (lookupVal && lookupVal.length > 0) {
          this._magistratoIdMap[magistrato] = lookupVal[0].id;
        }
      }
    }

    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([name]) => name);
    const values = sorted.map(([, val]) => val);
    const colors = values.map((v) => barColor(v, this._pesoLimite));
    const hoverColors = values.map((v) => barColor(v, this._pesoLimite, true));

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
          const name = labels[elements[0].index];
          const recordId = this._magistratoIdMap[name];
          if (recordId) {
            this._context.navigation.openForm({ entityName: ENTITY_GIUDICE, entityId: recordId });
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.x} punti — clicca per aprire la scheda`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: "#E0E0E0" },
            ticks: { color: "#444" },
            title: { display: true, text: "Punti carico totali", color: "#666", font: { size: 12 } },
          },
          y: {
            grid: { display: false },
            ticks: { color: "#222", font: { size: 13 } },
          },
        },
      },
    });
  }

  public getOutputs(): IOutputs {
    return {};
  }

  public destroy(): void {
    this._chart?.destroy();
    this._chart = null;
  }
}
