/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
var pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad;
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./CaricoPerCanestro/CaricoPerCanestro/index.ts"
/*!******************************************************!*\
  !*** ./CaricoPerCanestro/CaricoPerCanestro/index.ts ***!
  \******************************************************/
(__unused_webpack_module, __webpack_exports__, __webpack_require__) {

eval("{__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   CaricoPerCanestro: () => (/* binding */ CaricoPerCanestro)\n/* harmony export */ });\nvar COLOR_GREEN = \"#107C10\";\nvar COLOR_YELLOW = \"#FFB900\";\nvar COLOR_RED = \"#D13438\";\nvar CLOSED_STATUS_LABEL = \"chiuso\";\nvar CLOSED_STATUS_VALUE = 2;\nclass CaricoPerCanestro {\n  constructor() {\n    this._currentMagistratoId = \"\";\n    this._pesoLimiteCanestro = 30;\n    /* PCF required */\n  }\n  init(context, _notifyOutputChanged, _state, container) {\n    this._context = context;\n    this._container = container;\n    this._container.style.cssText = \"font-family:'Segoe UI',sans-serif;width:100%;\";\n    this._renderLoading();\n    this._loadPesoLimite(context);\n  }\n  updateView(context) {\n    var _a;\n    this._context = context;\n    // context.page non è nei tipi pubblici PCF ma esiste a runtime — cast sicuro\n    var page = context.page;\n    var newId = ((_a = page === null || page === void 0 ? void 0 : page.entityId) !== null && _a !== void 0 ? _a : \"\").replace(/[{}]/g, \"\").toLowerCase();\n    if (newId && newId !== this._currentMagistratoId) {\n      this._currentMagistratoId = newId;\n      this._loadData(newId);\n    }\n  }\n  _loadPesoLimite(context) {\n    context.webAPI.retrieveMultipleRecords(\"agc_configurazione\", \"?$select=agc_valore&$filter=agc_nome eq 'PesoLimiteCanestro'&$top=1\").then(res => {\n      if (res.entities.length > 0) {\n        var v = res.entities[0][\"agc_valore\"];\n        if (v > 0) this._pesoLimiteCanestro = v;\n      }\n      return res;\n    }).catch(() => {\n      /* usa default */\n    });\n  }\n  _loadData(magistratoId) {\n    this._renderLoading();\n    this._context.webAPI.retrieveMultipleRecords(\"agc_fascicolo2\", \"?$select=agc_fascicolo2id,agc_pesocalcolato2,agc_statocaso,\" + \"_agc_pesouno_value,_agc_pesodue_value\" + \"&$filter=_agc_magistratocontatto_value eq \".concat(magistratoId, \" and agc_pesocalcolato2 ne null\")).then(res => {\n      var entities = res.entities.filter(f => !this._isClosedFascicolo(f));\n      var rowsPeso1 = this._raggruppa(entities, \"_agc_pesouno_value\", \"Senza canestro\");\n      var rowsPeso2 = this._raggruppa(entities, \"_agc_pesodue_value\", \"Senza Peso 2\");\n      this._render(rowsPeso1, rowsPeso2);\n      return {\n        rowsPeso1,\n        rowsPeso2\n      };\n    }).catch(err => this._renderError(String(err)));\n  }\n  /* Raggruppa i fascicoli per il valore di un campo lookup (Peso 1 = agc_pesouno,\n     Peso 2 = agc_pesodue), sommando il peso calcolato totale per ciascun gruppo. */\n  _raggruppa(entities, lookupField, etichettaVuota) {\n    var _a, _b, _c;\n    var map = {};\n    for (var f of entities) {\n      var id = (_a = f[lookupField]) !== null && _a !== void 0 ? _a : \"__nessuno__\";\n      var nome = (_b = f[\"\".concat(lookupField, \"@OData.Community.Display.V1.FormattedValue\")]) !== null && _b !== void 0 ? _b : etichettaVuota;\n      var peso = (_c = f[\"agc_pesocalcolato2\"]) !== null && _c !== void 0 ? _c : 0;\n      if (!map[id]) map[id] = {\n        id,\n        nome,\n        pesoTotale: 0,\n        numFascicoli: 0\n      };\n      map[id].pesoTotale += peso;\n      map[id].numFascicoli += 1;\n    }\n    return Object.values(map).sort((a, b) => b.pesoTotale - a.pesoTotale);\n  }\n  _isClosedFascicolo(entity) {\n    var _a;\n    var formatted = String((_a = entity[\"agc_statocaso@OData.Community.Display.V1.FormattedValue\"]) !== null && _a !== void 0 ? _a : \"\").trim().toLowerCase();\n    if (formatted === CLOSED_STATUS_LABEL) return true;\n    var raw = entity[\"agc_statocaso\"];\n    if (typeof raw === \"number\") return raw === CLOSED_STATUS_VALUE;\n    if (typeof raw === \"string\") {\n      var parsed = Number(raw);\n      return Number.isFinite(parsed) && parsed === CLOSED_STATUS_VALUE;\n    }\n    return false;\n  }\n  _barColor(peso) {\n    if (peso >= this._pesoLimiteCanestro) return COLOR_RED;\n    if (peso >= this._pesoLimiteCanestro * 0.8) return COLOR_YELLOW;\n    return COLOR_GREEN;\n  }\n  _render(rowsPeso1, rowsPeso2) {\n    this._container.innerHTML = \"\";\n    var nessunDato = rowsPeso1.length === 0 && rowsPeso2.length === 0;\n    if (nessunDato) {\n      var empty = document.createElement(\"p\");\n      empty.textContent = \"Nessun fascicolo aperto assegnato a questo magistrato.\";\n      empty.style.cssText = \"color:#666;font-size:13px;\";\n      this._container.appendChild(empty);\n      return;\n    }\n    this._renderSezione(\"Carico per Peso 1\", rowsPeso1);\n    this._renderSezione(\"Carico per Peso 2\", rowsPeso2);\n    /* ── Legenda (comune a entrambe le sezioni) ── */\n    var legend = document.createElement(\"div\");\n    legend.style.cssText = \"margin-top:14px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#555;\";\n    legend.innerHTML = \"<span><span style=\\\"display:inline-block;width:10px;height:10px;border-radius:2px;background:\".concat(COLOR_GREEN, \";margin-right:4px;\\\"></span>Scarico</span>\") + \"<span><span style=\\\"display:inline-block;width:10px;height:10px;border-radius:2px;background:\".concat(COLOR_YELLOW, \";margin-right:4px;\\\"></span>Attenzione (\\u226580%)</span>\") + \"<span><span style=\\\"display:inline-block;width:10px;height:10px;border-radius:2px;background:\".concat(COLOR_RED, \";margin-right:4px;\\\"></span>Oberato (\\u2265soglia)</span>\");\n    this._container.appendChild(legend);\n  }\n  _renderSezione(titolo, rows) {\n    var title = document.createElement(\"h3\");\n    title.textContent = titolo;\n    title.style.cssText = \"margin:0 0 12px;font-size:14px;font-weight:600;color:#242424;\";\n    this._container.appendChild(title);\n    if (rows.length === 0) {\n      var empty = document.createElement(\"p\");\n      empty.textContent = \"Nessun fascicolo aperto in questa categoria.\";\n      empty.style.cssText = \"color:#666;font-size:13px;margin-bottom:14px;\";\n      this._container.appendChild(empty);\n      return;\n    }\n    var maxPeso = Math.max(...rows.map(r => r.pesoTotale), 1);\n    for (var row of rows) {\n      var pct = Math.round(row.pesoTotale / maxPeso * 100);\n      var color = this._barColor(row.pesoTotale);\n      /* Wrapper riga */\n      var item = document.createElement(\"div\");\n      item.style.cssText = \"margin-bottom:10px;\";\n      /* Label sopra la barra */\n      var label = document.createElement(\"div\");\n      label.style.cssText = \"display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;\";\n      label.innerHTML = \"<span style=\\\"color:#242424;font-weight:500;\\\">\".concat(this._esc(row.nome), \"</span>\") + \"<span style=\\\"color:#555;\\\">\".concat(row.pesoTotale.toFixed(1), \" pt &nbsp;\\xB7&nbsp; \").concat(row.numFascicoli, \" fasc.</span>\");\n      /* Track barra */\n      var track = document.createElement(\"div\");\n      track.style.cssText = \"background:#E0E0E0;border-radius:4px;height:14px;overflow:hidden;\";\n      /* Barra colorata */\n      var bar = document.createElement(\"div\");\n      bar.style.cssText = \"width:\".concat(pct, \"%;height:100%;background:\").concat(color, \";border-radius:4px;\") + \"transition:width .4s ease;\";\n      track.appendChild(bar);\n      item.appendChild(label);\n      item.appendChild(track);\n      this._container.appendChild(item);\n    }\n  }\n  _renderLoading() {\n    this._container.innerHTML = \"<p style=\\\"color:#666;font-size:13px;\\\">Caricamento carico per canestro\\u2026</p>\";\n  }\n  _renderError(msg) {\n    this._container.innerHTML = \"<p style=\\\"color:#D13438;font-size:13px;\\\">Errore: \".concat(this._esc(msg), \"</p>\");\n  }\n  _esc(s) {\n    return s.replace(/&/g, \"&amp;\").replace(/</g, \"&lt;\").replace(/>/g, \"&gt;\");\n  }\n  getOutputs() {\n    return {};\n  }\n  destroy() {\n    this._container.innerHTML = \"\";\n  }\n}\n\n//# sourceURL=webpack://pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad/./CaricoPerCanestro/CaricoPerCanestro/index.ts?\n}");

/***/ }

/******/ 	});
/************************************************************************/
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module can't be inlined because the eval devtool is used.
/******/ 	var __webpack_exports__ = {};
/******/ 	__webpack_modules__["./CaricoPerCanestro/CaricoPerCanestro/index.ts"](0,__webpack_exports__,__webpack_require__);
/******/ 	pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad = __webpack_exports__;
/******/ 	
/******/ })()
;
if (window.ComponentFramework && window.ComponentFramework.registerControl) {
	ComponentFramework.registerControl('AgicAspen.CaricoPerCanestro', pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad.CaricoPerCanestro);
} else {
	var AgicAspen = AgicAspen || {};
	AgicAspen.CaricoPerCanestro = pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad.CaricoPerCanestro;
	pcf_tools_652ac3f36e1e4bca82eb3c1dc44e6fad = undefined;
}