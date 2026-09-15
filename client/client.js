window.__ModuleLoader__.load({
	id: "dsh-session-sync",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
		//#region \0dsh-css:C:\Users\14339\Desktop\git\AI\dsh-session-sync\src\client\sync.module.css.mjs
		const css = ".exFxyG_section{flex-direction:column;gap:14px;padding:4px 0 8px;display:flex}.exFxyG_lede{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);margin:0}.exFxyG_group{flex-direction:column;gap:10px;display:flex}.exFxyG_groupTitle{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-strong-13);margin:0}.exFxyG_card{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}.exFxyG_field{flex-direction:column;gap:4px;display:flex}.exFxyG_fieldRow{justify-content:space-between;align-items:center;gap:12px;display:flex}.exFxyG_fieldText{flex-direction:column;gap:2px;min-width:0;display:flex}.exFxyG_label{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}.exFxyG_hint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}.exFxyG_pair{grid-template-columns:minmax(0,1fr) 120px;gap:10px;display:grid}.exFxyG_actions{align-items:center;gap:8px;display:flex}.exFxyG_saved{color:var(--dsw-alias-state-success-primary);font:var(--dsw-font-xxs-12)}.exFxyG_dirty{color:var(--dsw-alias-state-warn-primary);font:var(--dsw-font-xxs-12)}.exFxyG_failed{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12)}.exFxyG_sessionList{flex-direction:column;max-height:280px;display:flex;overflow-y:auto}.exFxyG_sessionRow{justify-content:space-between;align-items:center;gap:12px;min-height:40px;padding:5px 2px;display:flex}.exFxyG_sessionRow+.exFxyG_sessionRow{border-top:.5px solid var(--dsw-alias-border-l1)}.exFxyG_sessionText{flex-direction:column;gap:2px;min-width:0;display:flex}.exFxyG_sessionTitle{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_sessionMeta{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);align-items:center;gap:6px;display:flex}.exFxyG_empty{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);padding:12px 2px}.exFxyG_status{flex-wrap:wrap;gap:6px 18px;display:flex}.exFxyG_statusItem{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);align-items:center;gap:6px;display:flex}.exFxyG_statusValue{color:var(--dsw-alias-label-primary)}.exFxyG_statusBad{color:var(--dsw-alias-state-error-primary)}.exFxyG_statusGood{color:var(--dsw-alias-state-success-primary)}.exFxyG_console{height:100%;min-height:0;color:var(--dsw-alias-label-primary);display:flex}.exFxyG_machinePane{border-right:.5px solid var(--dsw-alias-border-l1);flex-direction:column;flex:none;width:220px;min-height:0;display:flex}.exFxyG_sessionPane{border-right:.5px solid var(--dsw-alias-border-l1);flex-direction:column;flex:none;width:300px;min-height:0;display:flex}.exFxyG_detailPane{flex-direction:column;flex:1;min-width:0;min-height:0;display:flex}.exFxyG_paneHead{border-bottom:.5px solid var(--dsw-alias-border-l1);flex-direction:column;flex:none;gap:6px;padding:10px 10px 8px;display:flex}.exFxyG_paneRow{align-items:center;gap:4px;min-width:0;display:flex}.exFxyG_paneTitle{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-strong-12);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_statusLine{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_paneBody{flex-direction:column;flex:1;gap:2px;min-height:0;padding:6px;display:flex;overflow-y:auto}.exFxyG_filters{gap:4px;display:flex}.exFxyG_machineRow{box-sizing:border-box;width:100%;color:inherit;text-align:left;cursor:pointer;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:0;border-radius:8px;align-items:center;gap:8px;padding:6px 8px;display:flex}.exFxyG_machineRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_machineRowActive,.exFxyG_machineRowActive:hover{background:var(--dsw-alias-interactive-bg-active)}.exFxyG_machineRow:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_machineRowText{flex-direction:column;flex:1;gap:1px;min-width:0;display:flex}.exFxyG_machineRowName{font:var(--dsw-font-xs-strong-13);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_machineRowMeta{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_groupLabel{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;padding:8px 8px 2px;overflow:hidden}.exFxyG_listRow{box-sizing:border-box;width:100%;color:inherit;text-align:left;cursor:pointer;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:0;border-radius:8px;flex-direction:column;gap:1px;padding:6px 8px;display:flex}.exFxyG_listRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_listRow:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_listRowTop{align-items:center;gap:6px;min-width:0;display:flex}.exFxyG_listRowTitle{font:var(--dsw-font-xs-13);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.exFxyG_listRowTime{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);flex:none}.exFxyG_listRowMeta{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_detailHeader{border-bottom:.5px solid var(--dsw-alias-border-l1);flex:none;align-items:center;gap:8px;min-height:48px;padding:0 14px;display:flex}.exFxyG_detailTitle{font:var(--dsw-font-s-strong-14);text-overflow:ellipsis;white-space:nowrap;flex:1;margin:0;overflow:hidden}.exFxyG_detailBody{flex:1;min-height:0;padding:12px 14px 16px;overflow-y:auto}.exFxyG_narrowOnly{display:none}@media (width<=959px){.exFxyG_console{flex-direction:column}.exFxyG_machinePane,.exFxyG_sessionPane{border-right:0;width:auto}.exFxyG_console[data-step=machines] .exFxyG_sessionPane,.exFxyG_console[data-step=machines] .exFxyG_detailPane,.exFxyG_console[data-step=sessions] .exFxyG_machinePane,.exFxyG_console[data-step=sessions] .exFxyG_detailPane,.exFxyG_console[data-step=detail] .exFxyG_machinePane,.exFxyG_console[data-step=detail] .exFxyG_sessionPane{display:none}.exFxyG_narrowOnly{display:inline-flex}}.exFxyG_turn{flex-direction:column;gap:4px;margin-bottom:14px;display:flex}.exFxyG_turnLabel{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-strong-12)}.exFxyG_turnUser .exFxyG_bubble{background:var(--dsw-alias-bg-layer-2)}.exFxyG_bubble{background:var(--dsw-alias-bg-layer-1);font:var(--dsw-font-s-14);overflow-wrap:anywhere;white-space:pre-wrap;border-radius:10px;padding:8px 10px}.exFxyG_reasoningRow,.exFxyG_toolRow{border-bottom:.5px solid var(--dsw-alias-border-l1)}.exFxyG_toolRow{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12)}.exFxyG_toolName{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12)}.exFxyG_toolDetail{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);flex:none}.exFxyG_toolError .exFxyG_toolDetail{color:var(--dsw-alias-state-error-primary)}.exFxyG_toolBody{flex-direction:column;gap:4px;padding:4px 0 10px;display:flex}.exFxyG_toolSection{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-strong-11)}.exFxyG_toolCode{background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxxs-11);font-family:var(--ds-font-family-code);white-space:pre;border-radius:8px;margin:0;padding:8px 10px;overflow-x:auto}.exFxyG_reasoning{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);white-space:pre-wrap}.exFxyG_inputWrap{box-sizing:border-box;width:100%}.exFxyG_composer{border-top:.5px solid var(--dsw-alias-border-l1);align-items:flex-end;gap:8px;padding:10px 14px 14px;display:flex}.exFxyG_composerField{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.exFxyG_composerMeta{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);flex-wrap:wrap;align-items:center;gap:8px;display:flex}.exFxyG_composerTarget{flex:none}.exFxyG_composerDelivery{color:var(--dsw-alias-label-secondary)}.exFxyG_composerOffline{color:var(--dsw-alias-state-warn-label)}.exFxyG_composerInput{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);min-height:36px;max-height:160px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14);resize:none;border-radius:10px;flex:1;padding:8px 10px}.exFxyG_composerInput::placeholder{color:var(--dsw-alias-placeholder)}.exFxyG_composerInput:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_error{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12);margin-bottom:10px}.exFxyG_sectionRoot{min-height:0;max-height:min(45vh,320px);padding-right:var(--dsh-sidebar-inline-padding);flex-direction:column;flex:0 auto;display:flex;overflow:hidden}.exFxyG_wsRow{box-sizing:border-box;height:32px;color:var(--dsw-alias-label-primary);cursor:pointer;user-select:none;border-radius:8px;flex:none;align-items:center;gap:6px;padding:0 8px;display:flex}.exFxyG_wsRow:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_wsRow:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_wsSlot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.exFxyG_wsArrowOpen{transform:rotate(90deg)}.exFxyG_wsRow .exFxyG_wsChevron{display:none}.exFxyG_wsRow:hover .exFxyG_wsChevron,.exFxyG_wsRow:focus-visible .exFxyG_wsChevron{display:inline-flex}.exFxyG_wsRow:hover .exFxyG_wsFolder,.exFxyG_wsRow:focus-visible .exFxyG_wsFolder{display:none}.exFxyG_wsText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.exFxyG_wsTitle{min-width:0;font:var(--dsw-font-s-14);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_wsActions{opacity:0;transition:opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);flex:none;align-items:center;gap:2px;display:inline-flex}.exFxyG_wsRow:hover .exFxyG_wsActions,.exFxyG_wsRow:focus-within .exFxyG_wsActions{opacity:1}.exFxyG_wsIconButton{corner-shape:round;width:24px;height:24px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:50%;flex:none;justify-content:center;align-items:center;padding:0;display:inline-flex}.exFxyG_wsIconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_wsIconButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_wsList{min-height:0;margin-right:calc(-1 * var(--dsh-sidebar-inline-padding));padding-bottom:6px;padding-right:var(--dsh-sidebar-inline-padding);flex-direction:column;flex:0 auto;display:flex;overflow-y:auto}.exFxyG_wsSummary{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;padding:6px 8px 2px 30px;overflow:hidden}.exFxyG_wsMachine{align-items:center;gap:6px;min-width:0;padding:8px 8px 2px 24px;display:flex}.exFxyG_wsMachineName{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-strong-11);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_wsMore{box-sizing:border-box;width:100%;height:32px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);text-align:left;cursor:pointer;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:0;border-radius:8px;flex:none;padding:0 8px 0 24px;display:block}.exFxyG_wsMore:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.exFxyG_wsMore:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_wsSession{box-sizing:border-box;height:32px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;background:0 0;border:0;border-radius:8px;flex:none;align-items:center;gap:0;padding:0 8px 0 24px;display:flex}.exFxyG_wsSession:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_wsSession:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_wsSessionTitle{min-width:0;font:var(--dsw-font-s-14);text-overflow:ellipsis;white-space:nowrap;flex:1;margin:0 6px 0 4px;overflow:hidden}.exFxyG_wsSessionTime{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);flex:none}.exFxyG_sectionEmpty{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);margin:0;padding:2px 8px 8px 24px}@media (prefers-reduced-motion:reduce){.exFxyG_listRow,.exFxyG_machineRow,.exFxyG_wsMore,.exFxyG_wsActions,.exFxyG_wsArrowOpen{transition:none}}";
		const tagId = "dsh-session-sync/sync.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var sync_module_css_default = {
			"actions": "exFxyG_actions",
			"bubble": "exFxyG_bubble",
			"card": "exFxyG_card",
			"composer": "exFxyG_composer",
			"composerDelivery": "exFxyG_composerDelivery",
			"composerField": "exFxyG_composerField",
			"composerInput": "exFxyG_composerInput",
			"composerMeta": "exFxyG_composerMeta",
			"composerOffline": "exFxyG_composerOffline",
			"composerTarget": "exFxyG_composerTarget",
			"console": "exFxyG_console",
			"detailBody": "exFxyG_detailBody",
			"detailHeader": "exFxyG_detailHeader",
			"detailPane": "exFxyG_detailPane",
			"detailTitle": "exFxyG_detailTitle",
			"dirty": "exFxyG_dirty",
			"empty": "exFxyG_empty",
			"error": "exFxyG_error",
			"failed": "exFxyG_failed",
			"field": "exFxyG_field",
			"fieldRow": "exFxyG_fieldRow",
			"fieldText": "exFxyG_fieldText",
			"filters": "exFxyG_filters",
			"group": "exFxyG_group",
			"groupLabel": "exFxyG_groupLabel",
			"groupTitle": "exFxyG_groupTitle",
			"hint": "exFxyG_hint",
			"inputWrap": "exFxyG_inputWrap",
			"label": "exFxyG_label",
			"lede": "exFxyG_lede",
			"listRow": "exFxyG_listRow",
			"listRowMeta": "exFxyG_listRowMeta",
			"listRowTime": "exFxyG_listRowTime",
			"listRowTitle": "exFxyG_listRowTitle",
			"listRowTop": "exFxyG_listRowTop",
			"machinePane": "exFxyG_machinePane",
			"machineRow": "exFxyG_machineRow",
			"machineRowActive": "exFxyG_machineRowActive",
			"machineRowMeta": "exFxyG_machineRowMeta",
			"machineRowName": "exFxyG_machineRowName",
			"machineRowText": "exFxyG_machineRowText",
			"narrowOnly": "exFxyG_narrowOnly",
			"pair": "exFxyG_pair",
			"paneBody": "exFxyG_paneBody",
			"paneHead": "exFxyG_paneHead",
			"paneRow": "exFxyG_paneRow",
			"paneTitle": "exFxyG_paneTitle",
			"reasoning": "exFxyG_reasoning",
			"reasoningRow": "exFxyG_reasoningRow",
			"saved": "exFxyG_saved",
			"section": "exFxyG_section",
			"sectionEmpty": "exFxyG_sectionEmpty",
			"sectionRoot": "exFxyG_sectionRoot",
			"sessionList": "exFxyG_sessionList",
			"sessionMeta": "exFxyG_sessionMeta",
			"sessionPane": "exFxyG_sessionPane",
			"sessionRow": "exFxyG_sessionRow",
			"sessionText": "exFxyG_sessionText",
			"sessionTitle": "exFxyG_sessionTitle",
			"status": "exFxyG_status",
			"statusBad": "exFxyG_statusBad",
			"statusGood": "exFxyG_statusGood",
			"statusItem": "exFxyG_statusItem",
			"statusLine": "exFxyG_statusLine",
			"statusValue": "exFxyG_statusValue",
			"toolBody": "exFxyG_toolBody",
			"toolCode": "exFxyG_toolCode",
			"toolDetail": "exFxyG_toolDetail",
			"toolError": "exFxyG_toolError",
			"toolName": "exFxyG_toolName",
			"toolRow": "exFxyG_toolRow",
			"toolSection": "exFxyG_toolSection",
			"turn": "exFxyG_turn",
			"turnLabel": "exFxyG_turnLabel",
			"turnUser": "exFxyG_turnUser",
			"wsActions": "exFxyG_wsActions",
			"wsArrowOpen": "exFxyG_wsArrowOpen",
			"wsChevron": "exFxyG_wsChevron",
			"wsFolder": "exFxyG_wsFolder",
			"wsIconButton": "exFxyG_wsIconButton",
			"wsList": "exFxyG_wsList",
			"wsMachine": "exFxyG_wsMachine",
			"wsMachineName": "exFxyG_wsMachineName",
			"wsMore": "exFxyG_wsMore",
			"wsRow": "exFxyG_wsRow",
			"wsSession": "exFxyG_wsSession",
			"wsSessionTime": "exFxyG_wsSessionTime",
			"wsSessionTitle": "exFxyG_wsSessionTitle",
			"wsSlot": "exFxyG_wsSlot",
			"wsSummary": "exFxyG_wsSummary",
			"wsText": "exFxyG_wsText",
			"wsTitle": "exFxyG_wsTitle"
		};
		//#endregion
		//#region src/client/ConfigSection.tsx
		/**
		* The Session sync settings page.
		*
		* Registered into `settings.section`, so it gets a navigation entry of its own
		* rather than a card inside the plugin tab: the page carries a per-Session list
		* that needs the full column.
		*
		* Edits are staged and written on save. Each write is a durable document
		* mutation on the Host, and the switch list is long enough that committing per
		* keystroke would turn one intention into a dozen writes.
		*/
		/** Seed the draft from the served configuration. */
		function draftOf(config) {
			return {
				machineName: config.machineName,
				serverUrl: config.serverUrl,
				isServer: config.isServer,
				password: config.password,
				listenHost: config.listenHost,
				listenPort: String(config.listenPort)
			};
		}
		/**
		* Render the Session sync settings page.
		* @param props - copy, the snapshot hook, and the write actions.
		* @returns the section.
		*/
		function ConfigSection(props) {
			const state = props.useSync((snapshot) => snapshot);
			const { t } = props;
			const [draft, setDraft] = react.useState(() => draftOf(state.config));
			const [dirty, setDirty] = react.useState(false);
			const [status, setStatus] = react.useState("idle");
			const seeded = react.useRef(state.config);
			const dirtyRef = react.useRef(false);
			dirtyRef.current = dirty;
			react.useEffect(() => {
				if (seeded.current === state.config) return;
				seeded.current = state.config;
				if (dirtyRef.current) return;
				setDraft(draftOf(state.config));
			}, [state.config]);
			const edit = (patch) => {
				setDraft((current) => ({
					...current,
					...patch
				}));
				setDirty(true);
				setStatus("idle");
			};
			const discard = () => {
				setDraft(draftOf(state.config));
				setDirty(false);
				setStatus("idle");
			};
			const save = () => {
				setStatus("saving");
				props.configure({
					machineName: draft.machineName,
					serverUrl: draft.serverUrl,
					isServer: draft.isServer,
					password: draft.password,
					listenHost: draft.listenHost,
					listenPort: Number.parseInt(draft.listenPort, 10)
				}).then((accepted) => {
					setStatus(accepted ? "saved" : "failed");
					if (accepted) setDirty(false);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: sync_module_css_default.section,
				"aria-label": t("sectionTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: sync_module_css_default.lede,
						children: t("sectionDescription")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.group,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: sync_module_css_default.groupTitle,
								children: t("machineGroup")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sync_module_css_default.card,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: sync_module_css_default.field,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.label,
												children: t("machineName")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: sync_module_css_default.inputWrap,
												value: draft.machineName,
												onChange: (event) => {
													edit({ machineName: event.target.value });
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.hint,
												children: t("machineNameHint")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: sync_module_css_default.field,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.label,
												children: t("serverUrl")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: sync_module_css_default.inputWrap,
												value: draft.serverUrl,
												placeholder: "192.168.1.10:8791",
												disabled: draft.isServer,
												onChange: (event) => {
													edit({ serverUrl: event.target.value });
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.hint,
												children: t("serverUrlHint")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: sync_module_css_default.fieldRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: sync_module_css_default.fieldText,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.label,
												children: t("isServer")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.hint,
												children: t("isServerHint")
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
											checked: draft.isServer,
											label: t("isServer"),
											onChange: (next) => {
												edit({ isServer: next });
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										className: sync_module_css_default.field,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.label,
												children: t("password")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: sync_module_css_default.inputWrap,
												type: "password",
												autoComplete: "off",
												value: draft.password,
												onChange: (event) => {
													edit({ password: event.target.value });
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.hint,
												children: t("passwordHint")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: sync_module_css_default.pair,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: sync_module_css_default.field,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.label,
												children: t("listenHost")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: sync_module_css_default.inputWrap,
												value: draft.listenHost,
												disabled: !draft.isServer,
												onChange: (event) => {
													edit({ listenHost: event.target.value });
												}
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											className: sync_module_css_default.field,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.label,
												children: t("listenPort")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
												className: sync_module_css_default.inputWrap,
												inputMode: "numeric",
												value: draft.listenPort,
												disabled: !draft.isServer,
												onChange: (event) => {
													edit({ listenPort: event.target.value });
												}
											})]
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sync_module_css_default.actions,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "primary",
										size: "sm",
										disabled: !dirty || status === "saving",
										onClick: save,
										children: t("save")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										disabled: !dirty,
										onClick: discard,
										children: t("discard")
									}),
									status === "saved" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.saved,
										children: t("saved")
									}),
									status === "failed" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.failed,
										children: t("saveFailed")
									}),
									dirty && status === "idle" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.dirty,
										children: t("unsaved")
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBlock, {
						t,
						state
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.group,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
								className: sync_module_css_default.groupTitle,
								children: t("sessions")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.hint,
								children: t("sessionsHint")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionList, {
								t,
								ready: state.ready,
								sessions: state.sessions,
								setSessionSync: props.setSessionSync
							})
						]
					})
				]
			});
		}
		/** The role, listener, and link facts, gathered in one place. */
		function StatusBlock({ t, state }) {
			const { role, listening, linked, machines, published } = state.state;
			const connected = role === "server" ? listening ? t("statusListening") : t("statusNotListening") : state.config.serverUrl.trim() === "" ? t("statusNotConfigured") : linked ? t("statusLinked") : t("statusUnlinked");
			const healthy = role === "server" ? listening : linked;
			const detail = state.state.listenError ?? state.state.linkError;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: sync_module_css_default.groupTitle,
					children: t("statusTitle")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.card,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.status,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.statusItem,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: healthy ? "done" : "idle" }),
										t("statusTitle"),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: healthy ? sync_module_css_default.statusGood : sync_module_css_default.statusBad,
											children: connected
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.statusItem,
									children: role === "server" ? t("roleServer") : t("roleClient")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.statusItem,
									children: [t("publishedCount"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.statusValue,
										children: String(published)
									})]
								}),
								role === "server" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.statusItem,
									children: [t("machineSessions"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.statusValue,
										children: String(machines.length)
									})]
								})
							]
						}),
						detail !== void 0 && detail !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.failed,
							children: detail
						}),
						state.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.failed,
							children: state.error
						})
					]
				})]
			});
		}
		/** The per-Session publish switches. */
		function SessionList({ t, ready, sessions, setSessionSync }) {
			if (!ready) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: sync_module_css_default.empty,
				children: t("sessionsLoading")
			});
			if (sessions.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: sync_module_css_default.empty,
				children: t("sessionsEmpty")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sync_module_css_default.sessionList,
				children: sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.sessionRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: sync_module_css_default.sessionText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.sessionTitle,
							children: session.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sync_module_css_default.sessionMeta,
							children: [session.running && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sessionRunning") })] }), session.cwd !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: session.cwd })]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
						checked: session.synced,
						label: `${t("sessionSyncLabel")}: ${session.title}`,
						onChange: (next) => {
							setSessionSync(session.sessionId, next);
						}
					})]
				}, session.sessionId))
			});
		}
		//#endregion
		//#region src/client/PanelIcon.tsx
		/**
		* The icon the sidebar renders for this plugin's global panel row.
		*
		* The row is the entry that survives the collapsed rail, where the browsing
		* region's section renders nothing at all, so it exists as its own component
		* rather than as an inline JSX expression: the registration lives in `index.ts`,
		* which is a `.ts` module.
		*/
		/**
		* Render the panel row's glyph.
		* @param props - the requested icon size.
		* @returns the icon; selection is the row's own styling, not the glyph's.
		*/
		function PanelIcon(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: props.size });
		}
		//#endregion
		//#region src/client/transcript.ts
		/** Longest argument gist shown on the collapsed row. */
		const SUMMARY_LIMIT = 140;
		/** Longest argument or result body retained for the expanded row. */
		const BODY_LIMIT = 4e3;
		/**
		* Argument keys worth showing on one line, most telling first.
		*
		* This is presentation, not protocol: an unknown tool falls back to its first
		* string argument, and a call with no string argument shows nothing rather than
		* a JSON blob squeezed into a row.
		*/
		const SUMMARY_KEYS = [
			"command",
			"cmd",
			"file_path",
			"path",
			"pattern",
			"query",
			"objective",
			"url",
			"prompt",
			"text",
			"title",
			"description",
			"id"
		];
		/**
		* Project a mirrored log onto readable rows, dropping bookkeeping events.
		* @param events - the mirrored events in log order.
		* @returns the rows to render, oldest first.
		*/
		function toRows(events) {
			const rows = [];
			const calls = /* @__PURE__ */ new Map();
			for (const event of events) {
				const data = asRecord(event.data);
				if (data === void 0) continue;
				if (event.type === "tool/call") {
					const row = toolCallRow(event, data);
					rows.push(row);
					if (row.callId !== "") calls.set(row.callId, row);
					continue;
				}
				if (event.type === "tool/result") {
					const callId = callIdOf(data);
					const row = callId === "" ? void 0 : calls.get(callId);
					if (row === void 0) {
						rows.push(toolResultOnlyRow(event, callId, data));
						continue;
					}
					row.resultText = resultTextOf(data);
					row.isError = isErrorOf(data);
					row.pending = false;
					continue;
				}
				const row = toRow(event, data);
				if (row !== void 0) rows.push(row);
			}
			return rows;
		}
		/** Project one non-tool event, or undefined when it is not conversation. */
		function toRow(event, data) {
			const key = String(event.seq);
			if (event.type === "user/message") {
				if (asRecord(data["source"])?.["kind"] !== "user") return void 0;
				const text = textOf(data["content"]);
				return text === "" ? void 0 : {
					kind: "user",
					key,
					time: event.time,
					text
				};
			}
			if (event.type === "assistant/message") {
				const message = asRecord(data["message"]);
				const text = textOf(message?.["content"]);
				const reasoning = reasoningOf(message?.["content"]);
				if (text === "" && reasoning === "") return void 0;
				return {
					kind: "assistant",
					key,
					time: event.time,
					text,
					reasoning
				};
			}
		}
		/** Build the row for one `tool/call`. */
		function toolCallRow(event, data) {
			const raw = typeof data["arguments"] === "string" ? data["arguments"] : "";
			return {
				kind: "tool",
				key: String(event.seq),
				time: event.time,
				callId: typeof data["callId"] === "string" ? data["callId"] : "",
				name: typeof data["name"] === "string" ? data["name"] : "",
				summary: summarize(raw),
				argumentsText: formatArguments(raw),
				resultText: "",
				isError: false,
				pending: true
			};
		}
		/** Build the row for a `tool/result` whose call is not in the window. */
		function toolResultOnlyRow(event, callId, data) {
			return {
				kind: "tool",
				key: String(event.seq),
				time: event.time,
				callId,
				name: "",
				summary: "",
				argumentsText: "",
				resultText: resultTextOf(data),
				isError: isErrorOf(data),
				pending: false
			};
		}
		/** Read the pairing id a `tool/result` carries on its message source. */
		function callIdOf(data) {
			const source = asRecord(asRecord(data["message"])?.["source"]);
			return typeof source?.["callId"] === "string" ? source["callId"] : "";
		}
		/** Join every visible text block of one tool result. */
		function resultTextOf(data) {
			const message = asRecord(data["message"]);
			const blocks = Array.isArray(message?.["content"]) ? message["content"] : [];
			const parts = [];
			for (const block of blocks) {
				const record = asRecord(block);
				if (record === void 0) continue;
				const text = textOf(Array.isArray(record["content"]) ? record["content"] : [record]);
				if (text !== "") parts.push(text);
			}
			return truncate(parts.join("\n"), BODY_LIMIT);
		}
		/** Whether one tool result reports failure, in either of the two places it can. */
		function isErrorOf(data) {
			if (data["error"] !== void 0) return true;
			const message = asRecord(data["message"]);
			return (Array.isArray(message?.["content"]) ? message["content"] : []).some((block) => asRecord(block)?.["isError"] === true);
		}
		/** One-line gist of a raw arguments string. */
		function summarize(raw) {
			if (raw === "") return "";
			const record = asRecord(parseJson(raw));
			if (record !== void 0) {
				for (const key of SUMMARY_KEYS) {
					const value = record[key];
					if (typeof value === "string" && value.trim() !== "") return truncate(oneLine(value), SUMMARY_LIMIT);
				}
				for (const value of Object.values(record)) if (typeof value === "string" && value.trim() !== "") return truncate(oneLine(value), SUMMARY_LIMIT);
				return "";
			}
			return truncate(oneLine(raw), SUMMARY_LIMIT);
		}
		/** Pretty-print an arguments string, falling back to it verbatim when unparsable. */
		function formatArguments(raw) {
			if (raw === "") return "";
			const parsed = parseJson(raw);
			if (parsed === void 0) return truncate(raw, BODY_LIMIT);
			try {
				return truncate(JSON.stringify(parsed, null, 2), BODY_LIMIT);
			} catch {
				return truncate(raw, BODY_LIMIT);
			}
		}
		/** Parse JSON, treating failure as "not an object". */
		function parseJson(raw) {
			try {
				return JSON.parse(raw);
			} catch {
				return;
			}
		}
		/** Collapse every run of whitespace so one value fits on one row. */
		function oneLine(text) {
			return text.replace(/\s+/g, " ").trim();
		}
		/** Join the visible text blocks of one content array. */
		function textOf(content) {
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) {
				const record = asRecord(block);
				if (record === void 0) continue;
				if (record["type"] === "text" && typeof record["text"] === "string") parts.push(record["text"]);
			}
			return parts.join("\n").trim();
		}
		/** Join the reasoning blocks of one content array. */
		function reasoningOf(content) {
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) {
				const record = asRecord(block);
				if (record === void 0) continue;
				if (record["type"] === "reasoning" && typeof record["text"] === "string") parts.push(record["text"]);
			}
			return parts.join("\n").trim();
		}
		/** Narrow one unknown value to a plain record. */
		function asRecord(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			return value;
		}
		/** Bound one excerpt, marking that it was cut. */
		function truncate(text, limit) {
			if (text.length <= limit) return text;
			return `${text.slice(0, limit)}…`;
		}
		//#endregion
		//#region src/client/SyncPanel.tsx
		/**
		* The centre panel: the server's console over every machine that publishes here.
		*
		* Three panes, because the job has three steps: pick a machine, pick one of its
		* Sessions, then read it and take it over. On a wide column all three are
		* visible at once, so the list never has to be re-navigated to see what a
		* Session is doing; below 960px the same DOM becomes a drill-down, and the two
		* back buttons that only exist in that mode are hidden by CSS rather than by a
		* measured width.
		*
		* Registered into the `main` slot under the same key as this plugin's sidebar
		* row, so the frame's panel selector and the sidebar entry resolve to the same
		* place without either knowing about the other.
		*/
		/**
		* Render the sync panel.
		* @param props - copy, the snapshot hook, and the actions.
		* @returns the panel.
		*/
		function SyncPanel(props) {
			const state = props.useSync((snapshot) => snapshot);
			const { t } = props;
			const [selected, setSelected] = react.useState(void 0);
			const [query, setQuery] = react.useState("");
			const [runningOnly, setRunningOnly] = react.useState(false);
			const machines = state.state.machines;
			const open = state.open;
			const openMachine = open?.machineName;
			react.useEffect(() => {
				if (openMachine !== void 0) setSelected(openMachine);
			}, [openMachine]);
			const active = selected ?? openMachine ?? machines[0]?.machineName;
			const machine = machines.find((candidate) => candidate.machineName === active);
			const sessions = react.useMemo(() => filterSessions(machine, query, runningOnly), [
				machine,
				query,
				runningOnly
			]);
			const groups = react.useMemo(() => groupByCwd(sessions), [sessions]);
			const step = open !== void 0 ? "detail" : selected !== void 0 ? "sessions" : "machines";
			const session = (open === void 0 ? void 0 : machine?.sessions.find((candidate) => candidate.sessionId === open.sessionId) ?? machines.find((candidate) => candidate.machineName === open.machineName)?.sessions.find((candidate) => candidate.sessionId === open.sessionId)) ?? (open === void 0 ? void 0 : {
				sessionId: open.sessionId,
				title: open.sessionId,
				updatedAt: Date.now(),
				running: false,
				eventCount: 0
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.console,
				"data-step": step,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
						className: sync_module_css_default.machinePane,
						"aria-label": t("machinesTitle"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.paneHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.paneTitle,
								children: t("machinesTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.statusLine,
								children: roleLine(state, t)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.paneBody,
							children: [
								!state.ready && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: sync_module_css_default.empty,
									children: t("sessionsLoading")
								}),
								state.ready && state.state.role !== "server" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: sync_module_css_default.empty,
									children: t("panelEmptyClient")
								}),
								state.ready && state.state.role === "server" && machines.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: sync_module_css_default.empty,
									children: t("panelEmptyServer")
								}),
								machines.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: candidate.machineName === active ? `${sync_module_css_default.machineRow} ${sync_module_css_default.machineRowActive}` : sync_module_css_default.machineRow,
									"aria-current": candidate.machineName === active ? "true" : void 0,
									onClick: () => {
										setSelected(candidate.machineName);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: candidate.online ? "done" : "idle" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: sync_module_css_default.machineRowText,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.machineRowName,
												children: candidate.machineName
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.machineRowMeta,
												children: machineMeta(candidate, t)
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
											tone: "quiet",
											children: String(candidate.sessions.length)
										})
									]
								}, candidate.machineName))
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: sync_module_css_default.sessionPane,
						"aria-label": t("sessionsTitle"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.paneHead,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.paneRow,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
										variant: "ghost",
										size: "sm",
										className: sync_module_css_default.narrowOnly,
										icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
										"aria-label": t("back"),
										onClick: () => {
											setSelected(void 0);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.paneTitle,
										children: machine?.machineName ?? t("sessionsTitle")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
									icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
									className: sync_module_css_default.inputWrap,
									value: query,
									placeholder: t("searchSessions"),
									"aria-label": t("searchSessions"),
									onChange: (event) => {
										setQuery(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.filters,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
										active: !runningOnly,
										onClick: () => {
											setRunningOnly(false);
										},
										children: t("filterAll")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Pill, {
										active: runningOnly,
										onClick: () => {
											setRunningOnly(true);
										},
										children: t("filterRunning")
									})]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sync_module_css_default.paneBody,
							children: machine === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sync_module_css_default.empty,
								children: t("selectMachine")
							}) : sessions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sync_module_css_default.empty,
								children: query.trim() === "" && !runningOnly ? t("machineNoSessions") : t("searchEmpty")
							}) : groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [groups.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sync_module_css_default.groupLabel,
								title: group.cwd,
								children: group.cwd === "" ? t("noCwd") : group.cwd
							}), group.sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: sync_module_css_default.listRow,
								"aria-label": `${t("openSession")}: ${session.title}`,
								onClick: () => {
									props.openSession(machine.machineName, session.sessionId);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.listRowTop,
									children: [
										session.running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sync_module_css_default.listRowTitle,
											children: session.title
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: sync_module_css_default.listRowTime,
											children: session.running ? t("sessionRunning") : timeLabel$1(session.updatedAt, t)
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.listRowMeta,
									children: sessionMeta(session, t)
								})]
							}, session.sessionId))] }, group.cwd === "" ? "·" : group.cwd))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
						className: sync_module_css_default.detailPane,
						"aria-label": t("panelTitle"),
						children: open === void 0 || session === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: sync_module_css_default.empty,
							children: t("selectSession")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Conversation, {
							t,
							state,
							session,
							machineName: open.machineName,
							online: machines.find((candidate) => candidate.machineName === open.machineName)?.online ?? false,
							closeSession: props.closeSession,
							sendPrompt: props.sendPrompt
						})
					})
				]
			});
		}
		/**
		* One mirrored Session opened for reading and takeover.
		*
		* The snapshot arrives as a prop rather than being re-read here: the renderer's
		* generated `use<Name>` hook belongs to the registered component, and a second
		* call site in a child would depend on how that binding is cached.
		*/
		function Conversation(props) {
			const { t, state, session } = props;
			const [draft, setDraft] = react.useState("");
			const [sending, setSending] = react.useState(false);
			const body = react.useRef(null);
			const rows = react.useMemo(() => toRows(state.transcript?.events ?? []), [state.transcript]);
			const markdownLabels = react.useMemo(() => ({
				code: {
					copyLabel: t("copyCode"),
					copiedLabel: t("copiedCode")
				},
				footnotes: t("footnotes")
			}), [t]);
			react.useEffect(() => {
				const element = body.current;
				if (element === null) return;
				element.scrollTop = element.scrollHeight;
			}, [rows.length]);
			const send = () => {
				const text = draft.trim();
				if (text === "" || sending) return;
				setSending(true);
				props.sendPrompt(text).then((accepted) => {
					setSending(false);
					if (accepted) setDraft("");
				});
			};
			const delivery = state.delivery;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.detailHeader,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							size: "sm",
							className: sync_module_css_default.narrowOnly,
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
							"aria-label": t("back"),
							onClick: props.closeSession
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: sync_module_css_default.detailTitle,
							children: session.title
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "neutral",
							children: props.machineName
						}),
						session.running && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.machineMeta,
							children: t("sessionRunning")
						})] })
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.detailBody,
					ref: body,
					children: [state.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sync_module_css_default.error,
						children: state.error
					}), state.transcript === void 0 && !state.loadingTranscript ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: sync_module_css_default.empty,
						children: t("transcriptGone")
					}) : state.loadingTranscript ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: sync_module_css_default.empty,
						children: t("transcriptLoading")
					}) : rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: sync_module_css_default.empty,
						children: t("transcriptEmpty")
					}) : rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						t,
						row,
						labels: markdownLabels
					}, row.key))]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: sync_module_css_default.composer,
					onSubmit: (event) => {
						event.preventDefault();
						send();
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.composerField,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: sync_module_css_default.composerInput,
							value: draft,
							rows: 2,
							placeholder: t("composerPlaceholder"),
							"aria-label": t("composerPlaceholder"),
							onChange: (event) => {
								setDraft(event.target.value);
							},
							onKeyDown: (event) => {
								if (event.key !== "Enter" || event.shiftKey) return;
								event.preventDefault();
								send();
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.composerMeta,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: sync_module_css_default.composerTarget,
									children: [
										t("composerTarget"),
										" ",
										props.machineName
									]
								}),
								delivery !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.composerDelivery,
									children: deliveryLine(delivery, t)
								}),
								!props.online && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.composerOffline,
									children: t("offlineQueueHint")
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						size: "sm",
						type: "submit",
						disabled: sending || draft.trim() === "",
						children: sending ? t("sending") : t("send")
					})]
				})
			] });
		}
		/** One transcript row. */
		function Row({ t, row, labels }) {
			if (row.kind === "user") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${sync_module_css_default.turn} ${sync_module_css_default.turnUser}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.turnLabel,
					children: t("you")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sync_module_css_default.bubble,
					children: row.text
				})]
			});
			if (row.kind === "assistant") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.turn,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.turnLabel,
						children: t("assistant")
					}),
					row.reasoning !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningRow, {
						t,
						reasoning: row.reasoning
					}),
					row.text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
						text: row.text,
						labels
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolRowRow, {
				t,
				row
			});
		}
		/** One assistant reasoning block, folded away by default. */
		function ReasoningRow({ t, reasoning }) {
			const [open, setOpen] = react.useState(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline14, {}),
				title: t("reasoning"),
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setOpen((current) => !current);
				},
				className: sync_module_css_default.reasoningRow,
				titleClassName: sync_module_css_default.turnLabel,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sync_module_css_default.reasoning,
					children: reasoning
				})
			});
		}
		/** One tool call and its result, folded into a single row. */
		function ToolRowRow({ t, row }) {
			const [open, setOpen] = react.useState(false);
			const label = row.name === "" ? t("toolResult") : row.name;
			const status = row.pending ? t("sessionRunning") : row.isError ? t("deliveryFailed") : timeLabel$1(row.time, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: row.pending ? "ongoing" : row.isError ? "error" : "done" }),
				title: row.summary === "" ? label : `${label} · ${row.summary}`,
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setOpen((current) => !current);
				},
				className: row.isError ? `${sync_module_css_default.toolRow} ${sync_module_css_default.toolError}` : sync_module_css_default.toolRow,
				titleClassName: sync_module_css_default.toolName,
				collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.toolDetail,
					children: status
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.toolBody,
					children: [
						row.argumentsText !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.toolSection,
							children: t("toolArguments")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: sync_module_css_default.toolCode,
							children: row.argumentsText
						})] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.toolSection,
							children: t("toolResult")
						}),
						row.resultText === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sync_module_css_default.reasoning,
							children: row.pending ? t("toolRunning") : t("toolNoOutput")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							className: sync_module_css_default.toolCode,
							children: row.resultText
						})
					]
				})
			});
		}
		/** The role and link line above the machine list. */
		function roleLine(state, t) {
			const role = state.state.role === "server" ? t("roleServer") : t("roleClient");
			if (state.state.role === "server") return `${role} · ${state.state.listening ? t("statusListening") : t("statusNotListening")}`;
			if (state.state.serverUrl.trim() === "") return `${role} · ${t("statusNotConfigured")}`;
			return `${role} · ${state.state.linked ? t("statusLinked") : t("statusUnlinked")}`;
		}
		/** One machine's activity line. */
		function machineMeta(machine, t) {
			const online = machine.online ? t("machineOnline") : t("machineOffline");
			if (machine.online) return online;
			return `${online} · ${t("lastSeen")} ${timeLabel$1(machine.lastSeen, t)}`;
		}
		/** One Session's second line inside the middle pane. */
		function sessionMeta(session, t) {
			return `${session.cwd ?? session.sessionId} · ${String(session.eventCount)} ${t("eventsCount")}`;
		}
		/** The delivery state of the last prompt, as the composer renders it. */
		function deliveryLine(delivery, t) {
			if (delivery.state === "queued") return t("deliveryQueued");
			if (delivery.state === "delivered") return t("deliveryDelivered");
			if (delivery.state === "accepted") return t("deliveryAccepted");
			if (delivery.state === "expired") return t("deliveryExpired");
			return delivery.error === void 0 ? t("deliveryFailed") : `${t("deliveryFailed")}: ${delivery.error}`;
		}
		/**
		* The machine's Sessions, filtered and running-first.
		* @param machine - the selected machine, when one is.
		* @param query - the current search text.
		* @param runningOnly - whether the running filter is on.
		* @returns the Sessions to list, in render order.
		*/
		function filterSessions(machine, query, runningOnly) {
			const needle = query.trim().toLowerCase();
			return (machine?.sessions ?? []).filter((session) => {
				if (runningOnly && !session.running) return false;
				if (needle === "") return true;
				return session.title.toLowerCase().includes(needle) || (session.cwd ?? "").toLowerCase().includes(needle) || session.sessionId.toLowerCase().includes(needle);
			}).sort((left, right) => Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt);
		}
		/**
		* Group Sessions by the directory they run in, preserving the incoming order.
		* @param sessions - already-filtered Sessions.
		* @returns one group per directory, in first-appearance order.
		*/
		function groupByCwd(sessions) {
			const groups = /* @__PURE__ */ new Map();
			for (const session of sessions) {
				const key = session.cwd ?? "";
				const existing = groups.get(key);
				if (existing === void 0) groups.set(key, [session]);
				else existing.push(session);
			}
			return [...groups].map(([cwd, members]) => ({
				cwd,
				sessions: members
			}));
		}
		/**
		* One relative-time label, from the shared bucketing and this plugin's words.
		* @param at - epoch ms of the moment being described.
		* @param t - the localized copy lookup.
		* @returns the trailing label for one row.
		*/
		function timeLabel$1(at, t) {
			const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(at, Date.now());
			if (unit === "now") return t("timeNow");
			if (unit === "minutes") return `${String(n)} ${t("timeMinutes")}`;
			if (unit === "hours") return `${String(n)} ${t("timeHours")}`;
			if (unit === "days") return `${String(n)} ${t("timeDays")}`;
			if (unit === "months") return `${String(n)} ${t("timeMonths")}`;
			return `${String(n)} ${t("timeYears")}`;
		}
		//#endregion
		//#region src/client/SyncSection.tsx
		/**
		* The sidebar's own sync section, wearing the workspace browser's clothes.
		*
		* It is a section of the browsing region rather than a global panel row, and it
		* is rendered to look like one more workspace directory: the same
		* folder-plus-chevron lead-in, the same 32px row with a hover fill, and the
		* same indented Session rows carrying a trailing time.
		*
		* What it holds is a **glance**, not the console. The column's lower half cannot
		* show every Session of every machine without taking that height from the
		* workspace browser above it, so this lists what a reader needs to decide
		* whether to go look — the machines that are here, what is running, and the few
		* most recent Sessions — and hands everything else to the centre panel. The
		* header row is the way in, in both directions.
		*
		* Clicking the row folds it, as a workspace row does; the hover action opens
		* this plugin's centre panel, which carries the full three-pane console.
		*/
		/** How many Session rows the glance shows before deferring to the panel. */
		const GLANCE_LIMIT = 3;
		/**
		* Render the sidebar sync section.
		* @param props - copy, the column state, the snapshot hook, and the actions.
		* @returns the section, or null in the collapsed rail where a grouped list has
		*   no room — the rail reaches the panel through its own panel row instead.
		*/
		function SyncSection(props) {
			const state = props.useSync((snapshot) => snapshot);
			const { t, wide } = props;
			const [open, setOpen] = react.useState(true);
			if (!wide) return null;
			const { role, machines } = state.state;
			const glance = react.useMemo(() => pickGlance(machines), [machines]);
			const toggle = () => {
				setOpen((current) => !current);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: sync_module_css_default.sectionRoot,
				"aria-label": t("panelTitle"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.wsRow,
					role: "button",
					tabIndex: 0,
					"aria-expanded": open,
					onClick: toggle,
					onKeyDown: (event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						toggle();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${sync_module_css_default.wsSlot} ${sync_module_css_default.wsFolder}`,
							children: open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, {})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${sync_module_css_default.wsSlot} ${sync_module_css_default.wsChevron}`,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, { className: open ? sync_module_css_default.wsArrowOpen : void 0 })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.wsText,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.wsTitle,
								children: t("panelTitle")
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.wsActions,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: sync_module_css_default.wsIconButton,
								"aria-label": t("openOverview"),
								onClick: (event) => {
									event.stopPropagation();
									props.openOverview();
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconShareOutline16, { size: 16 })
							})
						})
					]
				}), !open ? null : role !== "server" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: sync_module_css_default.sectionEmpty,
					children: t("sectionClientHint")
				}) : machines.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: sync_module_css_default.sectionEmpty,
					children: t("sectionEmptyServer")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.wsList,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sync_module_css_default.wsSummary,
							children: summaryLine(machines, t)
						}),
						glance.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [machines.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.wsMachine,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: group.online ? "done" : "idle" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.wsMachineName,
								children: group.machineName
							})]
						}), group.sessions.map((session) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: sync_module_css_default.wsSession,
							"aria-label": `${t("openSession")}: ${session.title}`,
							onClick: () => {
								props.openSession(group.machineName, session.sessionId);
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.wsSlot,
									children: session.running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.wsSessionTitle,
									children: session.title
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.wsSessionTime,
									children: session.running ? t("sessionRunning") : timeLabel(session.updatedAt, t)
								})
							]
						}, session.sessionId))] }, group.machineName)),
						glance.groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: sync_module_css_default.sectionEmpty,
							children: t("machineNoSessions")
						}),
						glance.remainder > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sync_module_css_default.wsMore,
							onClick: props.openOverview,
							children: `${t("viewAll")} (${String(glance.remainder)})`
						})
					]
				})]
			});
		}
		/**
		* Choose what the glance shows: running Sessions first, then the most recent.
		*
		* Machines keep their own groups rather than being flattened into one list —
		* the row does not carry the machine name, so a flat list across machines would
		* be exactly the ambiguity this section exists to avoid. A machine whose slice
		* is empty still counts toward the remainder, so "view all" never understates
		* what the panel holds.
		* @param machines - every machine the server mirrors, newest activity first.
		* @returns the groups to render and how many Sessions were left for the panel.
		*/
		function pickGlance(machines) {
			const groups = [];
			let shown = 0;
			let total = 0;
			for (const machine of machines) {
				const ordered = [...machine.sessions].sort((left, right) => Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt);
				total += ordered.length;
				if (shown >= GLANCE_LIMIT) continue;
				const slice = ordered.slice(0, GLANCE_LIMIT - shown);
				shown += slice.length;
				if (slice.length > 0) groups.push({
					machineName: machine.machineName,
					online: machine.online,
					sessions: slice
				});
			}
			return {
				groups,
				remainder: Math.max(0, total - shown)
			};
		}
		/** The one-line state of the fleet: how many machines and how many running. */
		function summaryLine(machines, t) {
			const online = machines.filter((machine) => machine.online).length;
			const running = machines.reduce((total, machine) => total + machine.sessions.filter((session) => session.running).length, 0);
			const fleet = `${String(online)}/${String(machines.length)} ${t("machinesOnline")}`;
			if (running === 0) return fleet;
			return `${fleet} · ${String(running)} ${t("sessionsRunning")}`;
		}
		/**
		* One relative-time label, from the shared bucketing and this plugin's words.
		* @param at - epoch ms of the Session's last activity.
		* @param t - the localized copy lookup.
		* @returns the trailing label for one row.
		*/
		function timeLabel(at, t) {
			const { unit, n } = (0, _deepseek_ai_dsh_client_ui_primitives.relativeTime)(at, Date.now());
			if (unit === "now") return t("timeNow");
			if (unit === "minutes") return `${String(n)} ${t("timeMinutes")}`;
			if (unit === "hours") return `${String(n)} ${t("timeHours")}`;
			if (unit === "days") return `${String(n)} ${t("timeDays")}`;
			if (unit === "months") return `${String(n)} ${t("timeMonths")}`;
			return `${String(n)} ${t("timeYears")}`;
		}
		//#endregion
		//#region src/shared/protocol.ts
		/**
		* Wire and persisted shapes shared by the Host half, the sync server, and the
		* browser half.
		*
		* Every shape here is plain JSON. The one rule that shapes this file: the Host
		* half never hands a live DSH object (a Session, an Agent, a projection) across
		* a boundary. It reads the leaf scalars it needs and builds one of these.
		*/
		/** The transport path prefix every browser-facing route lives under. */
		const ROUTE_PREFIX = "/dsh-session-sync";
		/** Default listen port of the sync server. */
		const DEFAULT_LISTEN_PORT = 8791;
		/**
		* How long a takeover command stays deliverable after the server accepted it.
		*
		* A prompt is a human act addressed at a Session that may have moved on: a
		* command that sat in a queue while the owning machine was asleep must not be
		* admitted hours later as if it had just been typed. Both ends enforce this —
		* the server retires it and says so, and the origin refuses it even if the
		* server's sweep has not run yet.
		*/
		const COMMAND_TTL_MS = 12e4;
		/** Build the config a fresh install starts from. */
		function defaultConfig(machineName) {
			return {
				machineName,
				serverUrl: "",
				isServer: false,
				password: "",
				listenHost: "0.0.0.0",
				listenPort: DEFAULT_LISTEN_PORT,
				syncSessions: {}
			};
		}
		//#endregion
		//#region src/client/api.ts
		/**
		* Browser-side transport and view state for the sync plugin.
		*
		* Everything goes through the Host routes this package registers under
		* {@link ROUTE_PREFIX}, so the panel is same-origin with the GUI it lives in.
		* Live state arrives on one `EventSource`; the panel and the settings page both
		* read the single snapshot this store publishes, which is why a change made on
		* one surface is already visible on the other.
		*/
		/** How often the local Session list is re-read while the panel is mounted. */
		const SESSION_POLL_MS = 15e3;
		/** The neutral state rendered before the Host has answered. */
		function idleState() {
			return {
				role: "client",
				machineName: "",
				serverUrl: "",
				listening: false,
				linked: false,
				machines: [],
				published: 0
			};
		}
		/** The sync plugin's browser client. */
		var SyncClient = class {
			store;
			source;
			poll;
			started = false;
			constructor() {
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
					ready: false,
					config: defaultConfig(""),
					state: idleState(),
					sessions: [],
					loadingTranscript: false
				});
			}
			/** The observable the slot registrations bind as a renderer-provided hook. */
			get snapshot() {
				return this.store;
			}
			/** Begin reading and hold the live stream open. Idempotent. */
			start() {
				if (this.started) return;
				this.started = true;
				this.refresh();
				this.openStream();
				this.poll = setInterval(() => {
					this.refreshSessions();
					this.refreshState();
				}, SESSION_POLL_MS);
			}
			/** Stop polling and close the stream. Idempotent. */
			stop() {
				this.started = false;
				if (this.poll !== void 0) clearInterval(this.poll);
				this.poll = void 0;
				this.source?.close();
				this.source = void 0;
			}
			/** Re-read configuration, role state, and the local Session list. */
			async refresh() {
				try {
					const [configResponse, sessionsResponse] = await Promise.all([getJson(`${ROUTE_PREFIX}/config`), getJson(`${ROUTE_PREFIX}/sessions`)]);
					this.update({
						ready: true,
						config: configResponse.config,
						state: configResponse.state,
						sessions: sessionsResponse.sessions,
						error: void 0
					});
				} catch (error) {
					this.update({
						ready: true,
						error: describe(error)
					});
				}
			}
			/** Re-read only the local Session list. */
			async refreshSessions() {
				try {
					const { sessions } = await getJson(`${ROUTE_PREFIX}/sessions`);
					this.update({ sessions });
				} catch {}
			}
			/** Re-read the authoritative mirror view, which is what retires a stale badge. */
			async refreshState() {
				try {
					const { state } = await getJson(`${ROUTE_PREFIX}/state`);
					if (!isCompleteState(state)) return;
					this.update({ state });
				} catch {}
			}
			/**
			* Write one partial configuration change.
			* @param patch - fields to change.
			* @returns true when the Host accepted the write.
			*/
			async configure(patch) {
				try {
					const result = await postJson(`${ROUTE_PREFIX}/config`, patch);
					this.update({
						config: result.config,
						state: result.state,
						sessions: result.sessions,
						error: void 0
					});
					return true;
				} catch (error) {
					this.update({ error: describe(error) });
					return false;
				}
			}
			/**
			* Flip one Session's publish switch.
			* @param sessionId - the Session to publish or stop publishing.
			* @param synced - the requested state.
			* @returns true when the Host accepted the write.
			*/
			async setSessionSync(sessionId, synced) {
				return await this.configure({ sessionSync: {
					sessionId,
					synced
				} });
			}
			/**
			* Open one mirrored Session in the centre panel.
			* @param machineName - owning machine.
			* @param sessionId - published Session.
			*/
			async openSession(machineName, sessionId) {
				this.update({
					open: {
						machineName,
						sessionId
					},
					transcript: void 0,
					loadingTranscript: true,
					delivery: void 0
				});
				try {
					const { transcript } = await getJson(`${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(machineName)}&session=${encodeURIComponent(sessionId)}`);
					this.update({
						transcript,
						loadingTranscript: false,
						error: void 0
					});
				} catch (error) {
					this.update({
						loadingTranscript: false,
						error: describe(error)
					});
				}
			}
			/** Leave the open remote Session. */
			closeSession() {
				this.update({
					open: void 0,
					transcript: void 0,
					delivery: void 0
				});
			}
			/**
			* Send one takeover prompt to the machine that owns the open Session.
			* @param text - the prompt text.
			* @returns true when the server accepted and forwarded it.
			*/
			async sendPrompt(text) {
				const open = this.store.getSnapshot().open;
				if (open === void 0) return false;
				try {
					const result = await postJson(`${ROUTE_PREFIX}/command`, {
						machineName: open.machineName,
						sessionId: open.sessionId,
						text
					});
					this.update({
						error: void 0,
						delivery: {
							commandId: result.commandId,
							state: "queued",
							expiresAt: Date.now() + COMMAND_TTL_MS
						}
					});
					return true;
				} catch (error) {
					this.update({ error: describe(error) });
					return false;
				}
			}
			openStream() {
				if (typeof EventSource === "undefined") return;
				const source = new EventSource(`${ROUTE_PREFIX}/events`);
				source.onmessage = (event) => {
					let frame;
					try {
						frame = JSON.parse(event.data);
					} catch {
						return;
					}
					this.consume(frame);
				};
				this.source = source;
			}
			consume(frame) {
				if (frame.type === "state") {
					const previous = this.store.getSnapshot().state;
					const state = isCompleteState(frame.state) ? frame.state : {
						...previous,
						machines: Array.isArray(frame.state.machines) ? frame.state.machines : previous.machines
					};
					this.update({
						state,
						ready: true
					});
					if (previous.published !== state.published) this.refreshSessions();
					return;
				}
				if (frame.type === "events") {
					const snapshot = this.store.getSnapshot();
					const open = snapshot.open;
					if (open === void 0) return;
					if (open.machineName !== frame.machineName || open.sessionId !== frame.sessionId) return;
					const transcript = snapshot.transcript;
					if (transcript === void 0) return;
					this.update({ transcript: {
						...transcript,
						events: [...transcript.events, ...frame.events]
					} });
					return;
				}
				if (frame.type === "command") {
					const delivery = this.store.getSnapshot().delivery;
					if (delivery === void 0 || delivery.commandId !== frame.command.commandId) return;
					this.update({ delivery: {
						commandId: delivery.commandId,
						state: frame.command.state,
						expiresAt: frame.command.expiresAt,
						...frame.command.error === void 0 ? {} : { error: frame.command.error }
					} });
					return;
				}
				this.update({ error: frame.message });
			}
			update(patch) {
				this.store.set({
					...this.store.getSnapshot(),
					...patch
				});
			}
		};
		/** Read one JSON response, turning a non-2xx into a thrown error carrying the server's reason. */
		async function getJson(path) {
			return await decode(await fetch(path, { cache: "no-store" }));
		}
		/** Post one JSON body and read the JSON response. */
		async function postJson(path, body) {
			return await decode(await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			}));
		}
		/** Decode a response, preferring the server's own failure reason. */
		async function decode(response) {
			const text = await response.text();
			if (!response.ok) {
				let reason = `HTTP ${String(response.status)}`;
				try {
					const parsed = JSON.parse(text);
					if (typeof parsed.reason === "string") reason = parsed.reason;
					else if (typeof parsed.error === "string") reason = parsed.error;
				} catch {}
				throw new Error(reason);
			}
			return JSON.parse(text);
		}
		/** Human-readable one-line failure text. */
		function describe(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/**
		* Whether a state frame carries the whole view rather than just a mirror slice.
		* @param state - the frame's state payload.
		* @returns true when every field the surfaces render is present.
		*/
		function isCompleteState(state) {
			return (state.role === "server" || state.role === "client") && Array.isArray(state.machines) && typeof state.machineName === "string" && typeof state.published === "number";
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* Copy for both surfaces.
		*
		* `zh` is the key-set source of truth; `en` repeats every key. Nothing
		* user-visible is spelled inline in a component.
		*/
		/** Dictionary namespace owned by this plugin. */
		const NS = "sessionSync";
		const zh = {
			sectionNav: "会话同步",
			sectionTitle: "会话同步",
			sectionDescription: "把本机选定的会话实时同步到同步服务器；也可以让本机作为服务器，接受其他机器的会话。",
			machineGroup: "本机",
			machineName: "本机名称",
			machineNameHint: "其他机器上看到的名称",
			serverUrl: "服务器域名 / IP",
			serverUrlHint: "例如 192.168.1.10:8791，或 https://sync.example.com",
			isServer: "作为服务器",
			isServerHint: "开启后本机监听端口，接受其他机器的连接；关闭则把本机会话同步到上面的服务器",
			password: "连接密码",
			passwordHint: "两端必须填写相同的密码",
			listenHost: "监听地址",
			listenPort: "监听端口",
			save: "保存",
			saved: "已保存",
			saveFailed: "保存失败",
			unsaved: "有未保存的修改",
			discard: "放弃修改",
			sessions: "会话列表",
			sessionsHint: "勾选需要同步到服务器的会话",
			sessionsEmpty: "本机还没有会话。",
			sessionsLoading: "读取中…",
			sessionRunning: "进行中",
			sessionSynced: "已同步",
			sessionSyncLabel: "同步该会话",
			statusTitle: "状态",
			roleServer: "服务器",
			roleClient: "客户端",
			statusListening: "正在监听",
			statusNotListening: "未监听",
			statusLinked: "已连接到服务器",
			statusNotConfigured: "未填写服务器地址",
			statusUnlinked: "未连接",
			publishedCount: "已同步会话数",
			panelTitle: "服务器同步工作区",
			sectionClientHint: "本机不是同步服务器。",
			sectionEmptyServer: "还没有机器连接。",
			openOverview: "打开同步面板",
			timeNow: "刚刚",
			timeMinutes: "分钟前",
			timeHours: "小时前",
			timeDays: "天前",
			timeMonths: "个月前",
			timeYears: "年前",
			panelEmptyServer: "还没有机器连接。请在另一台机器的「会话同步」设置里填入本机地址，并用相同的密码。",
			panelEmptyClient: "本机不是同步服务器。在设置中开启「作为服务器」，或把本机会话同步到已配置的服务器。",
			machineOnline: "在线",
			machineOffline: "离线",
			machineSessions: "个会话",
			lastSeen: "最后活动",
			openSession: "打开",
			machinesTitle: "机器",
			sessionsTitle: "会话",
			machinesOnline: "台在线",
			sessionsRunning: "个会话进行中",
			viewAll: "查看全部",
			searchSessions: "搜索会话",
			filterAll: "全部",
			filterRunning: "运行中",
			searchEmpty: "没有匹配的会话。",
			machineNoSessions: "这台机器还没有发布会话。",
			selectMachine: "在左侧选择一台机器。",
			selectSession: "从中间的列表打开一个会话，即可阅读并接管。",
			noCwd: "未记录目录",
			eventsCount: "条事件",
			back: "返回",
			transcriptEmpty: "该会话在服务器侧还没有可显示的内容。",
			transcriptLoading: "读取会话内容…",
			transcriptGone: "该会话已停止同步，内容已从服务器移除。",
			you: "用户",
			assistant: "助手",
			tool: "工具",
			toolResult: "工具结果",
			reasoning: "思考",
			toolArguments: "参数",
			toolRunning: "执行中…",
			toolNoOutput: "（无输出）",
			composerPlaceholder: "在服务器侧接管续聊…",
			composerTarget: "发送到",
			send: "发送",
			sending: "发送中",
			readOnly: "只读",
			deliveryQueued: "已提交，等待投递",
			deliveryDelivered: "已投递，等待对方确认",
			deliveryAccepted: "对方已接收",
			deliveryFailed: "投递失败",
			deliveryExpired: "已过期，未执行",
			offlineQueueHint: "对方当前离线，提示会排队，直到它回来或过期。",
			copyCode: "复制",
			copiedCode: "已复制",
			footnotes: "脚注"
		};
		const en = {
			sectionNav: "Session sync",
			sectionTitle: "Session sync",
			sectionDescription: "Publish selected Sessions on this machine to a sync server, or serve as that server for other machines.",
			machineGroup: "This machine",
			machineName: "Machine name",
			machineNameHint: "The name other machines see",
			serverUrl: "Server domain / IP",
			serverUrlHint: "For example 192.168.1.10:8791, or https://sync.example.com",
			isServer: "Act as the server",
			isServerHint: "Listen on a port and accept other machines; off publishes this machine's Sessions to the server above",
			password: "Connection password",
			passwordHint: "Both ends must use the same password",
			listenHost: "Listen address",
			listenPort: "Listen port",
			save: "Save",
			saved: "Saved",
			saveFailed: "Save failed",
			unsaved: "Unsaved changes",
			discard: "Discard",
			sessions: "Sessions",
			sessionsHint: "Tick the Sessions to publish to the server",
			sessionsEmpty: "This machine has no Sessions yet.",
			sessionsLoading: "Loading…",
			sessionRunning: "Running",
			sessionSynced: "Published",
			sessionSyncLabel: "Sync this Session",
			statusTitle: "Status",
			roleServer: "Server",
			roleClient: "Client",
			statusListening: "Listening",
			statusNotListening: "Not listening",
			statusLinked: "Connected to server",
			statusNotConfigured: "No server address set",
			statusUnlinked: "Not connected",
			publishedCount: "Published Sessions",
			panelTitle: "Server sync workspace",
			sectionClientHint: "This machine is not the sync server.",
			sectionEmptyServer: "No machine has connected yet.",
			openOverview: "Open the sync panel",
			timeNow: "now",
			timeMinutes: "min ago",
			timeHours: "h ago",
			timeDays: "d ago",
			timeMonths: "mo ago",
			timeYears: "y ago",
			panelEmptyServer: "No machine has connected yet. On another machine open Session sync settings, enter this machine's address, and use the same password.",
			panelEmptyClient: "This machine is not the sync server. Turn on \"Act as the server\" in settings, or point Session sync at a configured server.",
			machineOnline: "Online",
			machineOffline: "Offline",
			machineSessions: "Sessions",
			lastSeen: "Last seen",
			openSession: "Open",
			machinesTitle: "Machines",
			sessionsTitle: "Sessions",
			machinesOnline: "online",
			sessionsRunning: "running",
			viewAll: "View all",
			searchSessions: "Search Sessions",
			filterAll: "All",
			filterRunning: "Running",
			searchEmpty: "No Session matches.",
			machineNoSessions: "This machine has published no Sessions.",
			selectMachine: "Choose a machine on the left.",
			selectSession: "Open a Session from the list to read it and take it over.",
			noCwd: "No directory recorded",
			eventsCount: "events",
			back: "Back",
			transcriptEmpty: "This Session has nothing to show on the server yet.",
			transcriptLoading: "Loading Session…",
			transcriptGone: "This Session stopped syncing and was removed from the server.",
			you: "User",
			assistant: "Assistant",
			tool: "Tool",
			toolResult: "Tool result",
			reasoning: "Reasoning",
			toolArguments: "Arguments",
			toolRunning: "Running…",
			toolNoOutput: "(no output)",
			composerPlaceholder: "Take over and continue from the server…",
			composerTarget: "Send to",
			send: "Send",
			sending: "Sending",
			readOnly: "Read only",
			deliveryQueued: "Submitted, waiting to be delivered",
			deliveryDelivered: "Delivered, waiting for the machine",
			deliveryAccepted: "Accepted by the machine",
			deliveryFailed: "Delivery failed",
			deliveryExpired: "Expired, not run",
			offlineQueueHint: "This machine is offline; the prompt queues until it returns or expires.",
			copyCode: "Copy",
			copiedCode: "Copied",
			footnotes: "Footnotes"
		};
		//#endregion
		//#region src/client/index.ts
		const name = "dsh-session-sync";
		/** Services this half requires: slots, dictionaries, and panel selection. */
		const inject = [
			"slots",
			"locale",
			"layout"
		];
		/**
		* One id for this plugin's centre panel and for the section's overview
		* gesture.
		*
		* `ctx.layout.selectPanel(id)` validates the id against the registered `main`
		* keys, so the panel key and this constant are one contract.
		*/
		const PANEL_ID = "session-sync";
		/**
		* Mount the settings page, the sidebar section, and the centre panel.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			const client = new SyncClient();
			ctx.effect(() => {
				client.start();
				return () => {
					client.stop();
				};
			}, "dsh-session-sync: live stream");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-session-sync: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: PANEL_ID,
				order: 30,
				label: () => t("sectionNav"),
				locale: NS,
				inject: () => ({
					hooks: { sync: client.snapshot },
					configure: (patch) => client.configure(patch),
					setSessionSync: (sessionId, synced) => client.setSessionSync(sessionId, synced)
				})
			}, ConfigSection));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 40,
				label: () => t("panelTitle")
			}, PanelIcon));
			ctx.slots.inject("sidebar.region.section", () => ctx.slots.register({
				name: "sidebar.region.section",
				locale: NS,
				inject: () => ({
					hooks: { sync: client.snapshot },
					openSession: (machineName, sessionId) => {
						ctx.layout.selectPanel(PANEL_ID);
						return client.openSession(machineName, sessionId);
					},
					openOverview: () => {
						ctx.layout.selectPanel(PANEL_ID);
					}
				})
			}, SyncSection));
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS,
				inject: () => ({
					hooks: { sync: client.snapshot },
					openSession: (machineName, sessionId) => client.openSession(machineName, sessionId),
					closeSession: () => {
						client.closeSession();
					},
					sendPrompt: (text) => client.sendPrompt(text)
				})
			}, SyncPanel));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map