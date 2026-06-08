import { IInputs, IOutputs } from "./generated/ManifestTypes";
import { Chart, PieController, ArcElement, Tooltip, Legend } from "chart.js";

Chart.register(PieController, ArcElement, Tooltip, Legend);

const STATE_COLORS: Record<string, string> = {
  Validato: "#107C10",
  Proposto: "#0F6CBD",
};
const FALLBACK_PALETTE = ["#FFB900", "#D13438", "#8764B8", "#038387", "#CA5010"];

interface FascicoloRow {
  rg: string;
  magistrato: string;
  canestro: string;
  peso: number;
  data: string;
}

export class StatoFascicoliChart
  implements ComponentFramework.StandardControl<IInputs, IOutputs>
{
  private _container: HTMLDivElement;
  private _canvas: HTMLCanvasElement;
  private _chart: Chart<"pie", number[], string> | null = null;
  private _labels: string[] = [];
  private _fascicoliPerStato: Record<string, FascicoloRow[]> = {};

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
    this._canvas.style.cursor = "pointer";

    wrapper.appendChild(title);
    wrapper.appendChild(this._canvas);
    this._container.appendChild(wrapper);
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    const dataset = context.parameters.fascicoliDataSet;
    if (dataset.loading) return;

    const counts: Record<string, number> = {};
    this._fascicoliPerStato = {};

    for (const id of dataset.sortedRecordIds) {
      const record = dataset.records[id];
      const stato = record.getFormattedValue("statoField") || "(sconosciuto)";
      counts[stato] = (counts[stato] ?? 0) + 1;

      const row: FascicoloRow = {
        rg: (record.getValue("agc_numeroregistrogenerale") as string) || "—",
        magistrato: record.getFormattedValue("agc_magistratoassegnato") || record.getFormattedValue("agc_magistratoassegnatoname") || "—",
        canestro: record.getFormattedValue("agc_canestro") || record.getFormattedValue("agc_canestroname") || "—",
        peso: Number(record.getValue("agc_peso")) || 0,
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
      (l, i) => STATE_COLORS[l] ?? FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
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
        datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: "#fff" }],
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
                const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : "0";
                return ` ${ctx.label}: ${ctx.parsed} (${pct}%) — clicca per dettaglio`;
              },
            },
          },
        },
      },
    });
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
    header.querySelector(".aspen-modal-close")!.addEventListener("click", () => overlay.remove());

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
