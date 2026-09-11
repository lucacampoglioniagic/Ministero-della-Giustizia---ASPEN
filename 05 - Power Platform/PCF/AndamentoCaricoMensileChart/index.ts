import { IInputs, IOutputs } from "./generated/ManifestTypes";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
);

const PALETTE = [
  "#0F6CBD",
  "#D13438",
  "#107C10",
  "#FFB900",
  "#8764B8",
  "#038387",
  "#CA5010",
  "#5C2D91",
];

interface Movimento {
  data: Date;
  peso: number;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const nomi = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
  ];
  return `${nomi[m - 1]} ${y}`;
}

export class AndamentoCaricoMensileChart implements ComponentFramework.StandardControl<
  IInputs,
  IOutputs
> {
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _emptyEl: HTMLDivElement;
  private _chart: Chart<"line", number[], string> | null = null;
  private _context: ComponentFramework.Context<IInputs>;

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
    this._container.classList.add("andamento-carico-chart");

    const wrapper = document.createElement("div");
    wrapper.className = "chart-wrapper";

    const title = document.createElement("h2");
    title.className = "chart-title";
    title.textContent = "Andamento Carico Mensile per Magistrato";

    this._canvas = document.createElement("canvas");
    this._canvas.className = "chart-canvas";

    this._emptyEl = document.createElement("div");
    this._emptyEl.className = "chart-empty";
    this._emptyEl.textContent = "Nessun dato sufficiente per calcolare l'andamento.";
    this._emptyEl.style.display = "none";

    wrapper.appendChild(title);
    wrapper.appendChild(this._canvas);
    wrapper.appendChild(this._emptyEl);
    this._container.appendChild(wrapper);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this._context = context;
    const dataset = context.parameters.fascicoliDataSet;
    if (dataset.loading) return;

    // magistrato → lista di movimenti (data caso, peso)
    const movimentiPerMagistrato: Record<string, Movimento[]> = {};

    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const magistrato = record.getFormattedValue("magistratoField");
      if (!magistrato) continue; // il carico cumulato ha senso solo per fascicoli assegnati

      const rawData = record.getValue("dataField");
      const data =
        rawData instanceof Date
          ? rawData
          : typeof rawData === "string"
            ? new Date(rawData)
            : null;
      if (!data || Number.isNaN(data.getTime())) continue;

      const peso = Number(record.getValue("pesoField")) || 0;

      if (!movimentiPerMagistrato[magistrato]) movimentiPerMagistrato[magistrato] = [];
      movimentiPerMagistrato[magistrato].push({ data, peso });
    }

    const magistrati = Object.keys(movimentiPerMagistrato);

    if (magistrati.length === 0) {
      this._canvas.style.display = "none";
      this._emptyEl.style.display = "flex";
      this._chart?.destroy();
      this._chart = null;
      return;
    }

    // Raccoglie tutti i mesi coperti dai dati (dal primo movimento al mese corrente)
    const monthsSet = new Set<string>();
    let minDate: Date | null = null;
    for (const rows of Object.values(movimentiPerMagistrato)) {
      for (const r of rows) {
        if (!minDate || r.data < minDate) minDate = r.data;
      }
    }
    const oggi = new Date();
    if (minDate) {
      const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      const fine = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
      while (cursor <= fine) {
        monthsSet.add(monthKey(cursor));
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
    const months = Array.from(monthsSet).sort();
    const labels = months.map(monthLabel);

    // Per ogni magistrato, ordina i movimenti per data e calcola il cumulato a fine mese
    const datasets = magistrati.map((magistrato, i) => {
      const rows = [...movimentiPerMagistrato[magistrato]].sort(
        (a, b) => a.data.getTime() - b.data.getTime(),
      );
      let cursorIdx = 0;
      let cumulato = 0;
      const data: number[] = [];
      for (const monthK of months) {
        const [y, m] = monthK.split("-").map(Number);
        const fineMese = new Date(y, m, 0, 23, 59, 59);
        while (cursorIdx < rows.length && rows[cursorIdx].data <= fineMese) {
          cumulato += rows[cursorIdx].peso;
          cursorIdx++;
        }
        data.push(Math.round(cumulato * 100) / 100);
      }
      const color = PALETTE[i % PALETTE.length];
      return {
        label: magistrato,
        data,
        borderColor: color,
        backgroundColor: color,
        tension: 0.25,
        pointRadius: 3,
        fill: false,
      };
    });

    this._canvas.style.display = "block";
    this._emptyEl.style.display = "none";

    if (this._chart) {
      this._chart.data.labels = labels;
      this._chart.data.datasets = datasets;
      this._chart.update();
      return;
    }

    this._chart = new Chart(this._canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        animation: { duration: 900 },
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: { font: { size: 12 }, padding: 12, color: "#222" },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} punti`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: "#444" },
          },
          y: {
            beginAtZero: true,
            grid: { color: "#E0E0E0" },
            ticks: { color: "#444" },
            title: {
              display: true,
              text: "Punti carico cumulati",
              color: "#666",
              font: { size: 12 },
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
