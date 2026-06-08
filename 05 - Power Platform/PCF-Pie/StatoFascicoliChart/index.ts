import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { Chart, PieController, ArcElement, Tooltip, Legend } from "chart.js";

Chart.register(PieController, ArcElement, Tooltip, Legend);

// Colors for Validato (0) and Proposto (1) — plus fallback palette
const STATE_COLORS: Record<string, string> = {
  Validato: "#107C10",
  Proposto: "#0F6CBD",
};
const FALLBACK_PALETTE = [
  "#FFB900",
  "#D13438",
  "#8764B8",
  "#038387",
  "#CA5010",
];

export class StatoFascicoliChart implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _chart: Chart<"pie", number[], string> | null = null;

  constructor() {
    // PCF required constructor
  }

  public init(
    _context: ComponentFramework.Context<IInputs>,
    _notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement,
  ): void {
    this._container = container;
    this._container.classList.add("stato-fascicoli-chart");

    const wrapper = document.createElement("div");
    wrapper.className = "chart-wrapper";

    const title = document.createElement("h2");
    title.className = "chart-title";
    title.textContent = "Fascicoli per Stato";

    this._canvas = document.createElement("canvas");
    this._canvas.className = "chart-canvas";

    wrapper.appendChild(title);
    wrapper.appendChild(this._canvas);
    this._container.appendChild(wrapper);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    const dataset = context.parameters.fascicoliDataSet;
    if (dataset.loading) return;

    // Count records per stato
    const counts: Record<string, number> = {};
    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const stato = record.getFormattedValue("statoField") || "(sconosciuto)";
      counts[stato] = (counts[stato] ?? 0) + 1;
    }

    const labels = Object.keys(counts);
    const values = labels.map((l) => counts[l]);
    const colors = labels.map(
      (l, i) =>
        STATE_COLORS[l] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
    );

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
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%)`;
              },
            },
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
