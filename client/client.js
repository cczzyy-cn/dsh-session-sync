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
		const css = ".exFxyG_section{flex-direction:column;gap:14px;padding:4px 0 8px;display:flex}.exFxyG_lede{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);margin:0}.exFxyG_group{flex-direction:column;gap:10px;display:flex}.exFxyG_groupTitle{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-strong-13);margin:0}.exFxyG_card{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}.exFxyG_field{flex-direction:column;gap:4px;display:flex}.exFxyG_fieldRow{justify-content:space-between;align-items:center;gap:12px;display:flex}.exFxyG_fieldText{flex-direction:column;gap:2px;min-width:0;display:flex}.exFxyG_label{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}.exFxyG_hint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}.exFxyG_pair{grid-template-columns:minmax(0,1fr) 120px;gap:10px;display:grid}.exFxyG_actions{align-items:center;gap:8px;display:flex}.exFxyG_saved{color:var(--dsw-alias-state-success-primary);font:var(--dsw-font-xxs-12)}.exFxyG_dirty{color:var(--dsw-alias-state-warn-primary);font:var(--dsw-font-xxs-12)}.exFxyG_failed{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12)}.exFxyG_sessionList{flex-direction:column;max-height:280px;display:flex;overflow-y:auto}.exFxyG_sessionRow{justify-content:space-between;align-items:center;gap:12px;min-height:40px;padding:5px 2px;display:flex}.exFxyG_sessionRow+.exFxyG_sessionRow{border-top:.5px solid var(--dsw-alias-border-l1)}.exFxyG_sessionText{flex-direction:column;gap:2px;min-width:0;display:flex}.exFxyG_sessionTitle{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_sessionMeta{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);align-items:center;gap:6px;display:flex}.exFxyG_empty{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);padding:12px 2px}.exFxyG_status{flex-wrap:wrap;gap:6px 18px;display:flex}.exFxyG_statusItem{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);align-items:center;gap:6px;display:flex}.exFxyG_statusValue{color:var(--dsw-alias-label-primary)}.exFxyG_statusBad{color:var(--dsw-alias-state-error-primary)}.exFxyG_statusGood{color:var(--dsw-alias-state-success-primary)}.exFxyG_panel{height:100%;min-height:0;color:var(--dsw-alias-label-primary);display:flex}.exFxyG_listPane{background:var(--dsw-specific-sidebar-fill);border-right:.5px solid var(--dsw-alias-border-l3);flex-direction:column;flex:none;width:280px;min-height:0;display:flex}.exFxyG_listHead{flex-direction:column;flex:none;gap:6px;padding:10px 10px 8px;display:flex}.exFxyG_panel ::placeholder,.exFxyG_panel input::placeholder,.exFxyG_panel textarea::placeholder{color:var(--dsw-alias-label-caption);opacity:1}.exFxyG_listToggle{color:var(--dsw-alias-button-info-fill)}.exFxyG_panel[data-list=hidden] .exFxyG_listPane{display:none}.exFxyG_listStatus{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_list{flex-direction:column;flex:1;gap:3px;min-height:0;margin-right:2px;padding:0 6px 8px;display:flex;overflow-y:auto}.exFxyG_notice{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11);border-radius:8px;align-items:flex-start;gap:6px;margin:2px 2px 6px;padding:6px 8px;display:flex}.exFxyG_noticeText{flex:1;min-width:0}.exFxyG_noticeClose{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;font-size:13px;line-height:13px;display:inline-flex}.exFxyG_noticeClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_treeRow,.exFxyG_treeSession{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;user-select:none;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:0;border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}.exFxyG_treeRow{height:34px}.exFxyG_treeSession{gap:0;height:32px}.exFxyG_treeRow:hover,.exFxyG_treeSession:hover,.exFxyG_treeSessionSelected{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_treeRow:focus-visible,.exFxyG_treeSession:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_panel [data-level=\"1\"]{padding-left:24px}.exFxyG_panel [data-level=\"2\"]{padding-left:40px}.exFxyG_treeSlot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.exFxyG_treeChevron{color:var(--dsw-alias-label-caption);display:none}.exFxyG_treeRow:hover .exFxyG_treeFolder,.exFxyG_treeRow:focus-visible .exFxyG_treeFolder{display:none}.exFxyG_treeRow:hover .exFxyG_treeChevron,.exFxyG_treeRow:focus-visible .exFxyG_treeChevron{display:inline-flex}.exFxyG_arrowOpen{transform:rotate(90deg)}.exFxyG_treeChevron svg{transition:transform .15s var(--ds-ease-in-out)}.exFxyG_rowTitle{min-width:0;font:var(--dsw-font-s-14);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.exFxyG_treeSession .exFxyG_rowTitle{margin:0 6px 0 4px}.exFxyG_rowTime{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);flex:none}.exFxyG_treeRowDim .exFxyG_rowTitle,.exFxyG_treeRowDim .exFxyG_rowTime{color:var(--dsw-alias-label-secondary)}.exFxyG_heroRoot{justify-content:center;align-items:center;min-width:0;height:100%;padding:0 24px;display:flex}.exFxyG_heroStack{flex-direction:column;align-items:center;gap:12px;width:100%;max-width:calc(min(920px,100%) + 32px);display:flex}.exFxyG_heroHeadline{color:var(--dsw-alias-label-primary);flex-wrap:wrap;justify-content:center;align-items:center;gap:12px 10px;font-size:26px;font-weight:500;line-height:32px;display:flex}.exFxyG_heroFish{color:var(--dsw-alias-label-primary);flex:none;justify-content:center;align-items:center;display:inline-flex}.exFxyG_heroTitleGroup{flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 7px;min-width:0;display:flex}.exFxyG_heroBadge{border:.5px solid var(--dsw-alias-interactive-bg-hover);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary-bluish);font-family:var(--ds-font-family-code);white-space:nowrap;border-radius:24px;align-self:flex-start;margin-top:2px;padding:1px 7px 0;font-size:12px;font-weight:500;line-height:18px}.exFxyG_heroHint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);text-align:center;margin:0}.exFxyG_tjRoot{width:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:1;display:flex;overflow:hidden}.exFxyG_tjToolbar{z-index:4;box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:center;gap:2px;height:32px;padding:0 6px;display:flex;position:sticky;top:0}.exFxyG_tjToggle{height:20px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);cursor:pointer;background:0 0;border:0;border-radius:3px;flex:none;align-items:center;gap:4px;padding:0 7px;display:inline-flex}.exFxyG_tjToggleIcon{stroke:currentColor;stroke-width:1.25px;stroke-linecap:round;stroke-linejoin:round;flex:none;width:12px;height:12px}.exFxyG_tjToggle:hover,.exFxyG_tjToggle[aria-pressed=true],.exFxyG_tjAction:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_tjToggle:focus-visible,.exFxyG_tjAction:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.exFxyG_tjAction{height:20px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);cursor:pointer;background:0 0;border:0;border-radius:3px;flex:none;align-items:center;gap:4px;padding:0 5px;display:inline-flex}.exFxyG_tjActionIcon{color:var(--dsw-alias-label-tertiary);font:14px/14px var(--ds-font-family-code)}.exFxyG_tjSearch{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);min-width:84px;height:22px;color:var(--dsw-alias-label-caption);border-radius:4px;flex:0 164px;align-items:center;gap:4px;margin-left:auto;padding:0 6px;display:flex}.exFxyG_tjSearch:focus-within{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1)}.exFxyG_tjSearchIcon{flex:none}.exFxyG_tjSearchInput{width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);background:0 0;border:0;outline:0;padding:0}.exFxyG_tjSearchInput::placeholder{color:var(--dsw-alias-label-caption)}.exFxyG_tjStrip{border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none}.exFxyG_tjPlot{background:var(--dsw-alias-bg-layer-2);grid-template-columns:44px minmax(0,1fr);height:50px;display:grid;overflow:hidden}.exFxyG_tjLaneLabels{border-right:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-caption);font-size:10px;line-height:1;position:relative}.exFxyG_tjLaneLabels span{justify-content:flex-end;align-items:center;height:8px;display:flex;position:absolute;right:3px}.exFxyG_tjLaneLabels span:first-child{top:7px}.exFxyG_tjLaneLabels span:nth-child(2){top:21px}.exFxyG_tjLaneLabels span:nth-child(3){top:35px}.exFxyG_tjTrack{position:relative;overflow:hidden}.exFxyG_tjLanes,.exFxyG_tjTurnBoundaries{position:absolute;inset:7px 0}.exFxyG_tjSpan{top:calc(var(--tj-span-lane) * 14px);left:var(--tj-span-left);width:max(2px, var(--tj-span-width));background:var(--dsw-alias-label-secondary);opacity:.78;cursor:pointer;border:0;border-radius:1px;min-width:2px;height:8px;padding:0;position:absolute}.exFxyG_tjSpan[data-kind=user]{background:var(--dsw-alias-state-business-primary)}.exFxyG_tjSpan[data-kind=assistant],.exFxyG_tjSpan[data-kind=think]{background:var(--dsw-alias-label-primary);opacity:1}.exFxyG_tjSpan[data-kind=tool]{background:var(--dsw-alias-state-warn-label);opacity:1}.exFxyG_tjSpan[data-kind=context]{background:var(--dsw-alias-state-success-primary)}.exFxyG_tjSpan[data-error=true]{background:var(--dsw-alias-state-error-primary)}.exFxyG_tjSpan[data-selected=false]{opacity:.14}.exFxyG_tjSpan[data-current=true]{z-index:1;box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}.exFxyG_tjTurnBoundary{background:var(--dsw-alias-border-l2);width:.5px;position:absolute;top:0;bottom:0}.exFxyG_tjSplit{background:var(--dsw-alias-bg-layer-1);flex:1;min-width:0;min-height:0;display:flex;overflow:hidden}.exFxyG_tjTablePane{flex:1;min-width:0;overflow:hidden auto}.exFxyG_ledgerTable tbody tr[data-selected=true]{background:var(--dsw-alias-interactive-bg-active)}.exFxyG_ledgerTable tbody tr[data-dimmed=true]{opacity:.3}.exFxyG_ledgerTable tbody tr[data-folded=true]{cursor:pointer}.exFxyG_ledgerTable tbody tr[data-folded=true] td{height:20px}.exFxyG_tjFolded{min-width:0;color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:12px;line-height:16px;display:flex}.exFxyG_tjFoldedEllipsis{color:var(--dsw-alias-label-tertiary);flex:none;font-weight:600}.exFxyG_tjFoldedText{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.exFxyG_tjDetails{border-left:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:none;width:clamp(320px,38%,440px);min-width:0;min-height:0;display:flex}.exFxyG_tjDetailsHeader{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;justify-content:space-between;align-items:center;height:42px;padding:0 8px 0 12px;display:flex}.exFxyG_tjDetailsTitle{align-items:center;gap:8px;min-width:0;display:flex}.exFxyG_tjDetailsDot{corner-shape:round;background:var(--dsw-alias-label-secondary);border-radius:50%;flex:none;width:5px;height:5px}.exFxyG_tjDetailsName{font:500 12px/16px var(--ds-font-family-code);flex:none}.exFxyG_tjDetailsLocation{min-width:0;color:var(--dsw-alias-label-tertiary);font:11px/16px var(--ds-font-family-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.exFxyG_tjClose{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;font-size:18px;line-height:18px;display:inline-flex}.exFxyG_tjClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_tjDetailTabs{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);white-space:nowrap;flex:none;gap:1px;width:100%;height:34px;padding:0 8px;display:flex;overflow-x:auto}.exFxyG_tjDetailTab{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);cursor:pointer;background:0 0;border:0;flex:none;padding:0 9px;position:relative}.exFxyG_tjDetailTab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_tjDetailTabActive{color:var(--dsw-alias-state-business-primary)}.exFxyG_tjDetailTabActive:after{background:var(--dsw-alias-state-business-primary);content:\"\";border-radius:1px 1px 0 0;height:2px;position:absolute;bottom:0;left:9px;right:9px}.exFxyG_tjDetailBody{flex:1;min-height:0;overflow:hidden auto}.exFxyG_tjOverview{font:var(--dsw-font-xs-13);margin:0;padding:8px 0}.exFxyG_tjOverview>div{grid-template-columns:94px minmax(0,1fr);align-items:center;min-height:22px;padding:0 14px;display:grid}.exFxyG_tjOverview dt{color:var(--dsw-alias-label-tertiary)}.exFxyG_tjOverview dd{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;margin:0;overflow:hidden}.exFxyG_tjPayload{box-sizing:border-box;overflow-wrap:anywhere;background:var(--dsw-alias-markdown-code-block);min-height:100%;color:var(--dsw-alias-label-primary);font:12px/19px var(--ds-font-family-code);tab-size:2;white-space:pre-wrap;margin:0;padding:14px}.exFxyG_tjMarkdown{padding:6px 14px 8px}.exFxyG_viewPane{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-width:0;min-height:0;display:flex}.exFxyG_viewHeader{border-bottom:.5px solid var(--dsw-alias-border-l3);flex-direction:column;flex:none;padding:10px 20px 0;display:flex}.exFxyG_viewTitleRow{align-items:center;gap:8px;min-width:0;min-height:30px;display:flex}.exFxyG_viewSpacer{flex:1}.exFxyG_viewTabs{z-index:1;gap:36px;margin-top:10px;padding-left:8px;display:flex;position:relative}.exFxyG_viewTab{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;padding:0 0 9px;font-size:13px;font-weight:500;line-height:16px;position:relative}.exFxyG_viewTab:after{content:\"\";background:0 0;border-radius:2px;height:2px;position:absolute;bottom:-1px;left:0;right:0}.exFxyG_viewTabActive{color:var(--dsw-alias-state-business-primary)}.exFxyG_viewTabActive:after{background:var(--dsw-alias-state-business-primary)}.exFxyG_viewTab:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_chromeCluster{flex:none;align-items:center;gap:8px;min-width:0;display:flex}.exFxyG_chromeChip{border:.5px solid var(--dsw-alias-border-l2);corner-shape:round;max-width:200px;min-height:24px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;border-radius:999px;align-items:center;gap:4px;padding:0 8px;display:inline-flex;overflow:hidden}.exFxyG_ringRoot{flex:none;display:inline-flex;position:relative}.exFxyG_ringTrigger{corner-shape:round;cursor:pointer;background:0 0;border:0;border-radius:50%;place-items:center;width:20px;height:20px;padding:0;display:grid}.exFxyG_ringTrigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_ringTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_ringTrack{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2px}.exFxyG_ringFill{fill:none;stroke:var(--dsw-alias-state-business-primary);stroke-width:2px;stroke-linecap:round}.exFxyG_ringPanel{z-index:9;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);white-space:nowrap;border:0;border-radius:10px;flex-direction:column;gap:2px;padding:8px 10px;display:flex;position:absolute;top:26px;right:0}.exFxyG_ringHeadline{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12)}.exFxyG_ringFigures{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11)}.exFxyG_statusRow{width:100%;max-width:calc(min(920px,100%) + 32px);color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxxs-11);font-variant-numeric:tabular-nums;flex-wrap:wrap;justify-content:center;gap:12px;padding:6px 0 0;display:flex}.exFxyG_ledger{background:var(--dsw-alias-bg-layer-1);flex:1;min-height:0;margin-right:2px;overflow-y:auto}.exFxyG_ledgerTable{border-spacing:0;table-layout:fixed;width:100%;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12)}.exFxyG_ledgerTable th{z-index:3;box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-sidebar-fill);height:30px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);text-align:left;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;font-weight:500;position:sticky;top:0;overflow:hidden}.exFxyG_ledgerEventHead{text-align:right;width:122px;padding-right:4px}.exFxyG_ledgerTable td{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l1);text-overflow:ellipsis;white-space:nowrap;height:30px;padding:0 8px;overflow:hidden}.exFxyG_ledgerTable tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}.exFxyG_ledgerEventCell{text-align:right;padding-left:36px;padding-right:4px;position:relative;overflow:visible}.exFxyG_ledgerRail{z-index:4;background:var(--dsw-alias-border-l3);pointer-events:none;width:2px;position:absolute;top:-1px;bottom:-1px;left:0}.exFxyG_ledgerTable tbody tr[data-error=true] .exFxyG_ledgerRail{background:var(--dsw-alias-state-error-primary)}.exFxyG_ledgerTable tbody tr[data-turn-start=true] td:before{z-index:1;background:var(--dsw-alias-border-l1);content:\"\";pointer-events:none;height:2px;position:absolute;top:0;left:0;right:0;transform:translateY(-50%)}.exFxyG_ledgerTable tbody tr[data-turn-start=true]:first-child td:before{content:none}.exFxyG_ledgerTurnLabel{z-index:3;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font:8px/10px var(--ds-font-family-code);font-variant-numeric:tabular-nums;white-space:nowrap;border-radius:0 0 2px;align-items:center;padding:1px 5px;display:inline-grid;position:absolute;top:0;left:0}.exFxyG_ledgerKindSlot{justify-content:flex-end;align-items:center;width:76px;display:inline-flex}.exFxyG_ledgerKind{box-sizing:border-box;letter-spacing:.035em;user-select:none;border:1px solid #0000;border-radius:4px;align-items:center;height:19px;padding:0 5px;font-size:10px;font-weight:650;line-height:16px;display:inline-flex}.exFxyG_kind_user{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.exFxyG_kind_assistant,.exFxyG_kind_think{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}.exFxyG_kind_tool{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}.exFxyG_kind_error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}.exFxyG_kind_system,.exFxyG_kind_policy,.exFxyG_kind_title,.exFxyG_kind_other,.exFxyG_kind_compaction{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform)}.exFxyG_kind_turn,.exFxyG_kind_step,.exFxyG_kind_context{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2)}.exFxyG_ledgerContentCell{padding-left:4px}.exFxyG_ledgerText{color:var(--dsw-alias-label-primary)}.exFxyG_ledgerMono{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:12px}.exFxyG_ledgerResult{grid-template-columns:clamp(180px,36cqw,480px) minmax(0,1fr);align-items:center;gap:8px;min-width:0;display:grid}.exFxyG_ledgerResult>*{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.exFxyG_ledgerErrorText{color:var(--dsw-alias-state-error-primary)}.exFxyG_ledgerArrow{color:var(--dsw-alias-label-caption);display:none}.exFxyG_ledgerDuration{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxxs-11);font-variant-numeric:tabular-nums;margin-left:8px}.exFxyG_viewTitle{min-width:0;font:var(--dsw-font-s-strong-14);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;margin:0;overflow:hidden}.exFxyG_viewMachine{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);white-space:nowrap;flex:none}.exFxyG_viewScroll{flex:1;min-height:0;margin-right:2px;padding:16px 32px;overflow-y:auto}.exFxyG_viewColumn{flex-direction:column;width:100%;max-width:min(920px,100%);margin:0 auto;display:flex}.exFxyG_viewColumn>*+*{margin-top:16px}.exFxyG_userRow{flex-direction:column;align-items:flex-end;display:flex}.exFxyG_bubble{background:var(--dsw-specific-bubble);max-width:min(82%,640px);color:var(--dsw-alias-label-primary);font:var(--dsw-font-s-14);white-space:pre-wrap;word-break:break-word;border-radius:22px;padding:10px 16px}.exFxyG_assistantRow{flex-direction:column;gap:16px;min-width:0;display:flex}.exFxyG_reasoning{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);white-space:pre-wrap}.exFxyG_thinkRoot{flex-direction:column;display:flex}.exFxyG_thinkRoot:not([data-expanded]){height:calc(24px + var(--dsh-content-font-delta,0px))}.exFxyG_thinkLine{position:relative;overflow:hidden}.exFxyG_thinkRoot[data-state=running] .exFxyG_thinkLine:after{content:\"\";inset-block:0;background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite exFxyG_dsh-sync-reasoning-sweep;position:absolute;left:0}@keyframes exFxyG_dsh-sync-reasoning-sweep{0%{left:-300px}90%,to{left:100%}}@media (prefers-reduced-motion:reduce){.exFxyG_thinkRoot[data-state=running] .exFxyG_thinkLine:after{animation:none}}.exFxyG_thinkSummary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));text-overflow:ellipsis;white-space:nowrap;flex:auto;overflow:hidden}.exFxyG_thinkSummaryText{text-overflow:ellipsis;display:block;overflow:hidden}.exFxyG_thinkSummary[data-follow-end]{justify-content:flex-end;display:flex}.exFxyG_thinkSummary[data-follow-end] .exFxyG_thinkSummaryText{text-align:start;text-overflow:clip;flex:none;width:max-content;min-width:100%;overflow:visible}.exFxyG_thinkTitle{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13)}.exFxyG_stopped,.exFxyG_mediaChip{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}.exFxyG_messageActions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;margin-top:16px;margin-left:-6px;display:flex}.exFxyG_userActions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;margin-top:-2px;display:flex}.exFxyG_action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.exFxyG_action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}.exFxyG_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.exFxyG_noticeRow{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));grid-template-columns:10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:2px 0;display:grid}.exFxyG_noticeDot{margin-top:5px}.exFxyG_noticeCopy{overflow-wrap:anywhere;min-width:0}.exFxyG_noticeTitleError{color:var(--dsw-alias-state-error-primary);margin-right:6px;font-weight:600}.exFxyG_noticeTitleWarn{color:var(--dsw-alias-state-warn-primary);margin-right:6px;font-weight:600}.exFxyG_noticeMessage{color:var(--dsw-alias-label-secondary)}.exFxyG_noticeCode{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-markdown-code-block-small)}.exFxyG_retryRow{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}.exFxyG_retrySummary{width:fit-content;color:inherit;cursor:pointer;user-select:none;border-radius:3px;align-items:center;gap:7px;padding:2px 0;list-style:none;display:inline-flex}.exFxyG_retrySummary::-webkit-details-marker{display:none}.exFxyG_retrySummary:after{content:\"\";opacity:.8;border-bottom:1.5px solid;border-right:1.5px solid;width:6px;height:6px;transition:transform .12s;transform:rotate(-45deg)}.exFxyG_retrySummary:hover{color:var(--dsw-alias-label-secondary)}.exFxyG_retrySummary:focus-visible{outline:1.5px solid var(--dsw-alias-button-info-fill);outline-offset:2px}.exFxyG_retryText{color:inherit}.exFxyG_retryRow[data-active] .exFxyG_retryText{background:linear-gradient(90deg, var(--dsw-alias-label-tertiary) 0%, var(--dsw-alias-label-tertiary) 40%, var(--dsw-alias-label-secondary) 50%, var(--dsw-alias-label-tertiary) 60%, var(--dsw-alias-label-tertiary) 100%);color:#0000;background-position:100%;background-size:200% 100%;background-clip:text;animation:1.6s ease-in-out infinite exFxyG_dsh-sync-retry-shimmer}@keyframes exFxyG_dsh-sync-retry-shimmer{0%{background-position:100%}to{background-position:0%}}@media (prefers-reduced-motion:reduce){.exFxyG_retryRow[data-active] .exFxyG_retryText{color:inherit;background:0 0;animation:none}}.exFxyG_retryRow[open] .exFxyG_retrySummary:after{transform:rotate(45deg)}.exFxyG_retryDetails{overflow-wrap:anywhere;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));gap:2px;margin-top:3px;padding-left:14px;display:grid}.exFxyG_retryDetailLabel{color:var(--dsw-alias-label-secondary)}.exFxyG_toolName{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:400;line-height:24px}.exFxyG_toolRow{position:relative;overflow:hidden}.exFxyG_toolRowRunning:after{content:\"\";background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite exFxyG_tool-row-sweep;position:absolute;top:0;bottom:0;left:0}@keyframes exFxyG_tool-row-sweep{0%{left:-300px}90%,to{left:100%}}.exFxyG_toolGlyph{width:16px;height:16px;color:var(--dsw-alias-label-secondary);justify-content:center;align-items:center;display:inline-flex}.exFxyG_toolGlyphError{color:var(--dsw-alias-state-error-primary)}.exFxyG_toolSep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.exFxyG_toolSummary{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:auto;font-size:13px;line-height:24px;overflow:hidden}.exFxyG_ioCard{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex}.exFxyG_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.exFxyG_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.exFxyG_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:.5px}.exFxyG_ioText{min-width:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}.exFxyG_ioTextError{color:var(--dsw-alias-state-error-primary)}.exFxyG_toBottomSlot{z-index:2;pointer-events:none;justify-content:flex-end;height:0;padding-right:8px;display:flex;position:sticky;bottom:16px}.exFxyG_toBottom{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);corner-shape:round;width:34px;height:34px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-fill);box-shadow:var(--dsw-elevation-panel);cursor:pointer;pointer-events:auto;border:0;border-radius:100px;justify-content:center;align-items:center;margin-top:-34px;padding:0;display:flex}.exFxyG_toBottom:hover{background:var(--dsw-alias-button-floating-hover)}.exFxyG_composerRoot{flex-direction:column;flex:none;align-items:center;padding:0 16px 8px;display:flex}.exFxyG_composerCard{box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major);width:100%;max-width:calc(min(920px,100%) + 32px);box-shadow:var(--dsw-elevation-soft);font:var(--dsw-font-s-14);border:0;border-radius:22px;flex-direction:column;gap:12px;padding-top:8px;display:flex}.exFxyG_composerText{box-sizing:border-box;width:100%;min-height:44px;max-height:200px;color:var(--dsw-alias-label-primary);font:inherit;resize:none;background:0 0;border:0;margin:0;padding:8px 16px 0}.exFxyG_composerText::placeholder{color:var(--dsw-alias-placeholder)}.exFxyG_composerText:focus-visible{outline:none}.exFxyG_composerBar{align-items:center;gap:8px;padding:0 10px 10px 16px;display:flex}.exFxyG_composerTarget{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);flex:none}.exFxyG_composerDelivery{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11)}.exFxyG_composerOffline{color:var(--dsw-alias-state-warn-label);font:var(--dsw-font-xxxs-11)}.exFxyG_composerSpacer{flex:1}.exFxyG_sendButton{corner-shape:round;background:var(--dsw-alias-button-info-fill);color:#fff;cursor:pointer;width:34px;height:34px;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);border:0;border-radius:999px;flex:none;place-items:center;display:grid}.exFxyG_sendButton:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}.exFxyG_sendButton:disabled{opacity:.4;cursor:default}.exFxyG_sendButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.exFxyG_error{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12);margin-bottom:10px}.exFxyG_narrowOnly{display:none}@media (width<=719px){.exFxyG_listPane{border-right:0;width:100%}.exFxyG_panel[data-open=true] .exFxyG_listPane,.exFxyG_panel[data-open=false] .exFxyG_viewPane{display:none}.exFxyG_narrowOnly{display:inline-flex}}@media (prefers-reduced-motion:reduce){.exFxyG_treeRow,.exFxyG_treeSession,.exFxyG_treeChevron svg,.exFxyG_sendButton{transition:none}.exFxyG_toolRowRunning:after{animation:none}}";
		const tagId = "dsh-session-sync/sync.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var sync_module_css_default = {
			"action": "exFxyG_action",
			"actions": "exFxyG_actions",
			"arrowOpen": "exFxyG_arrowOpen",
			"assistantRow": "exFxyG_assistantRow",
			"bubble": "exFxyG_bubble",
			"card": "exFxyG_card",
			"chromeChip": "exFxyG_chromeChip",
			"chromeCluster": "exFxyG_chromeCluster",
			"composerBar": "exFxyG_composerBar",
			"composerCard": "exFxyG_composerCard",
			"composerDelivery": "exFxyG_composerDelivery",
			"composerOffline": "exFxyG_composerOffline",
			"composerRoot": "exFxyG_composerRoot",
			"composerSpacer": "exFxyG_composerSpacer",
			"composerTarget": "exFxyG_composerTarget",
			"composerText": "exFxyG_composerText",
			"dirty": "exFxyG_dirty",
			"dsh-sync-reasoning-sweep": "exFxyG_dsh-sync-reasoning-sweep",
			"dsh-sync-retry-shimmer": "exFxyG_dsh-sync-retry-shimmer",
			"empty": "exFxyG_empty",
			"error": "exFxyG_error",
			"failed": "exFxyG_failed",
			"field": "exFxyG_field",
			"fieldRow": "exFxyG_fieldRow",
			"fieldText": "exFxyG_fieldText",
			"group": "exFxyG_group",
			"groupTitle": "exFxyG_groupTitle",
			"heroBadge": "exFxyG_heroBadge",
			"heroFish": "exFxyG_heroFish",
			"heroHeadline": "exFxyG_heroHeadline",
			"heroHint": "exFxyG_heroHint",
			"heroRoot": "exFxyG_heroRoot",
			"heroStack": "exFxyG_heroStack",
			"heroTitleGroup": "exFxyG_heroTitleGroup",
			"hint": "exFxyG_hint",
			"ioCard": "exFxyG_ioCard",
			"ioDivider": "exFxyG_ioDivider",
			"ioLabel": "exFxyG_ioLabel",
			"ioSection": "exFxyG_ioSection",
			"ioText": "exFxyG_ioText",
			"ioTextError": "exFxyG_ioTextError",
			"kind_assistant": "exFxyG_kind_assistant",
			"kind_compaction": "exFxyG_kind_compaction",
			"kind_context": "exFxyG_kind_context",
			"kind_error": "exFxyG_kind_error",
			"kind_other": "exFxyG_kind_other",
			"kind_policy": "exFxyG_kind_policy",
			"kind_step": "exFxyG_kind_step",
			"kind_system": "exFxyG_kind_system",
			"kind_think": "exFxyG_kind_think",
			"kind_title": "exFxyG_kind_title",
			"kind_tool": "exFxyG_kind_tool",
			"kind_turn": "exFxyG_kind_turn",
			"kind_user": "exFxyG_kind_user",
			"label": "exFxyG_label",
			"lede": "exFxyG_lede",
			"ledger": "exFxyG_ledger",
			"ledgerArrow": "exFxyG_ledgerArrow",
			"ledgerContentCell": "exFxyG_ledgerContentCell",
			"ledgerDuration": "exFxyG_ledgerDuration",
			"ledgerErrorText": "exFxyG_ledgerErrorText",
			"ledgerEventCell": "exFxyG_ledgerEventCell",
			"ledgerEventHead": "exFxyG_ledgerEventHead",
			"ledgerKind": "exFxyG_ledgerKind",
			"ledgerKindSlot": "exFxyG_ledgerKindSlot",
			"ledgerMono": "exFxyG_ledgerMono",
			"ledgerRail": "exFxyG_ledgerRail",
			"ledgerResult": "exFxyG_ledgerResult",
			"ledgerTable": "exFxyG_ledgerTable",
			"ledgerText": "exFxyG_ledgerText",
			"ledgerTurnLabel": "exFxyG_ledgerTurnLabel",
			"list": "exFxyG_list",
			"listHead": "exFxyG_listHead",
			"listPane": "exFxyG_listPane",
			"listStatus": "exFxyG_listStatus",
			"listToggle": "exFxyG_listToggle",
			"mediaChip": "exFxyG_mediaChip",
			"messageActions": "exFxyG_messageActions",
			"narrowOnly": "exFxyG_narrowOnly",
			"notice": "exFxyG_notice",
			"noticeClose": "exFxyG_noticeClose",
			"noticeCode": "exFxyG_noticeCode",
			"noticeCopy": "exFxyG_noticeCopy",
			"noticeDot": "exFxyG_noticeDot",
			"noticeMessage": "exFxyG_noticeMessage",
			"noticeRow": "exFxyG_noticeRow",
			"noticeText": "exFxyG_noticeText",
			"noticeTitleError": "exFxyG_noticeTitleError",
			"noticeTitleWarn": "exFxyG_noticeTitleWarn",
			"pair": "exFxyG_pair",
			"panel": "exFxyG_panel",
			"reasoning": "exFxyG_reasoning",
			"retryDetailLabel": "exFxyG_retryDetailLabel",
			"retryDetails": "exFxyG_retryDetails",
			"retryRow": "exFxyG_retryRow",
			"retrySummary": "exFxyG_retrySummary",
			"retryText": "exFxyG_retryText",
			"ringFigures": "exFxyG_ringFigures",
			"ringFill": "exFxyG_ringFill",
			"ringHeadline": "exFxyG_ringHeadline",
			"ringPanel": "exFxyG_ringPanel",
			"ringRoot": "exFxyG_ringRoot",
			"ringTrack": "exFxyG_ringTrack",
			"ringTrigger": "exFxyG_ringTrigger",
			"rowTime": "exFxyG_rowTime",
			"rowTitle": "exFxyG_rowTitle",
			"saved": "exFxyG_saved",
			"section": "exFxyG_section",
			"sendButton": "exFxyG_sendButton",
			"sessionList": "exFxyG_sessionList",
			"sessionMeta": "exFxyG_sessionMeta",
			"sessionRow": "exFxyG_sessionRow",
			"sessionText": "exFxyG_sessionText",
			"sessionTitle": "exFxyG_sessionTitle",
			"status": "exFxyG_status",
			"statusBad": "exFxyG_statusBad",
			"statusGood": "exFxyG_statusGood",
			"statusItem": "exFxyG_statusItem",
			"statusRow": "exFxyG_statusRow",
			"statusValue": "exFxyG_statusValue",
			"stopped": "exFxyG_stopped",
			"thinkLine": "exFxyG_thinkLine",
			"thinkRoot": "exFxyG_thinkRoot",
			"thinkSummary": "exFxyG_thinkSummary",
			"thinkSummaryText": "exFxyG_thinkSummaryText",
			"thinkTitle": "exFxyG_thinkTitle",
			"tjAction": "exFxyG_tjAction",
			"tjActionIcon": "exFxyG_tjActionIcon",
			"tjClose": "exFxyG_tjClose",
			"tjDetailBody": "exFxyG_tjDetailBody",
			"tjDetailTab": "exFxyG_tjDetailTab",
			"tjDetailTabActive": "exFxyG_tjDetailTabActive",
			"tjDetailTabs": "exFxyG_tjDetailTabs",
			"tjDetails": "exFxyG_tjDetails",
			"tjDetailsDot": "exFxyG_tjDetailsDot",
			"tjDetailsHeader": "exFxyG_tjDetailsHeader",
			"tjDetailsLocation": "exFxyG_tjDetailsLocation",
			"tjDetailsName": "exFxyG_tjDetailsName",
			"tjDetailsTitle": "exFxyG_tjDetailsTitle",
			"tjFolded": "exFxyG_tjFolded",
			"tjFoldedEllipsis": "exFxyG_tjFoldedEllipsis",
			"tjFoldedText": "exFxyG_tjFoldedText",
			"tjLaneLabels": "exFxyG_tjLaneLabels",
			"tjLanes": "exFxyG_tjLanes",
			"tjMarkdown": "exFxyG_tjMarkdown",
			"tjOverview": "exFxyG_tjOverview",
			"tjPayload": "exFxyG_tjPayload",
			"tjPlot": "exFxyG_tjPlot",
			"tjRoot": "exFxyG_tjRoot",
			"tjSearch": "exFxyG_tjSearch",
			"tjSearchIcon": "exFxyG_tjSearchIcon",
			"tjSearchInput": "exFxyG_tjSearchInput",
			"tjSpan": "exFxyG_tjSpan",
			"tjSplit": "exFxyG_tjSplit",
			"tjStrip": "exFxyG_tjStrip",
			"tjTablePane": "exFxyG_tjTablePane",
			"tjToggle": "exFxyG_tjToggle",
			"tjToggleIcon": "exFxyG_tjToggleIcon",
			"tjToolbar": "exFxyG_tjToolbar",
			"tjTrack": "exFxyG_tjTrack",
			"tjTurnBoundaries": "exFxyG_tjTurnBoundaries",
			"tjTurnBoundary": "exFxyG_tjTurnBoundary",
			"toBottom": "exFxyG_toBottom",
			"toBottomSlot": "exFxyG_toBottomSlot",
			"tool-row-sweep": "exFxyG_tool-row-sweep",
			"toolGlyph": "exFxyG_toolGlyph",
			"toolGlyphError": "exFxyG_toolGlyphError",
			"toolName": "exFxyG_toolName",
			"toolRow": "exFxyG_toolRow",
			"toolRowRunning": "exFxyG_toolRowRunning",
			"toolSep": "exFxyG_toolSep",
			"toolSummary": "exFxyG_toolSummary",
			"treeChevron": "exFxyG_treeChevron",
			"treeFolder": "exFxyG_treeFolder",
			"treeRow": "exFxyG_treeRow",
			"treeRowDim": "exFxyG_treeRowDim",
			"treeSession": "exFxyG_treeSession",
			"treeSessionSelected": "exFxyG_treeSessionSelected",
			"treeSlot": "exFxyG_treeSlot",
			"userActions": "exFxyG_userActions",
			"userRow": "exFxyG_userRow",
			"viewColumn": "exFxyG_viewColumn",
			"viewHeader": "exFxyG_viewHeader",
			"viewMachine": "exFxyG_viewMachine",
			"viewPane": "exFxyG_viewPane",
			"viewScroll": "exFxyG_viewScroll",
			"viewSpacer": "exFxyG_viewSpacer",
			"viewTab": "exFxyG_viewTab",
			"viewTabActive": "exFxyG_viewTabActive",
			"viewTabs": "exFxyG_viewTabs",
			"viewTitle": "exFxyG_viewTitle",
			"viewTitleRow": "exFxyG_viewTitleRow"
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
		//#region src/client/session-chrome.ts
		/** Longest content excerpt kept for one cell. */
		const EXCERPT_LIMIT = 400;
		/** Longest subagent label kept. */
		const LABEL_LIMIT = 60;
		/** Event types the ledger does not show: bookkeeping the reader never asked for. */
		const HIDDEN_EVENTS = new Set([
			"session/end-seed",
			"agent/inbox/spliced",
			"session/title-llm-request"
		]);
		/**
		* Read the Session's chrome from its mirrored log.
		* @param events - the mirrored events in log order.
		* @returns the chrome the console renders; every field is optional and absent
		*   when the log does not say.
		*/
		function sessionChrome(events) {
			let model;
			let window;
			let used;
			const policy = {};
			const usage = {
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				reasoningTokens: 0
			};
			let turns = 0;
			let steps = 0;
			let firstTime;
			let lastTime;
			let title;
			let stepMs = 0;
			let openTurn = false;
			const subagents = /* @__PURE__ */ new Map();
			const stepStarts = /* @__PURE__ */ new Map();
			for (const event of events) {
				const data = asRecord$1(event.data);
				if (firstTime === void 0) firstTime = event.time;
				lastTime = event.time;
				if (event.type === "request/header") {
					const config = asRecord$1(asRecord$1(data?.["header"])?.["config"]);
					const provider = text$1(config?.["provider"]);
					const name = text$1(config?.["model"]);
					if (provider !== void 0 && name !== void 0) model = {
						provider,
						model: name,
						...text$1(config?.["reasoningEffort"]) === void 0 ? {} : { effort: text$1(config?.["reasoningEffort"]) },
						...number$1(config?.["maxTokens"]) === void 0 ? {} : { maxTokens: number$1(config?.["maxTokens"]) }
					};
					continue;
				}
				if (event.type === "request/context") {
					const reported = number$1(data?.["contextWindow"]);
					if (reported !== void 0 && reported > 0) window = reported;
					const provider = text$1(data?.["provider"]);
					const name = text$1(data?.["model"]);
					if (model === void 0 && provider !== void 0 && name !== void 0) model = {
						provider,
						model: name
					};
					continue;
				}
				if (event.type === "turn/start") {
					const turn = number$1(data?.["turn"]);
					if (turn !== void 0) turns = Math.max(turns, turn);
					openTurn = true;
					continue;
				}
				if (event.type === "turn/end") {
					openTurn = false;
					continue;
				}
				if (event.type === "step/start") {
					steps += 1;
					const turn = number$1(data?.["turn"]);
					const step = number$1(data?.["step"]);
					if (turn !== void 0 && step !== void 0) stepStarts.set(`${String(turn)}\u0000${String(step)}`, event.time);
					continue;
				}
				if (event.type === "step/end") {
					const turn = number$1(data?.["turn"]);
					const step = number$1(data?.["step"]);
					const started = turn === void 0 || step === void 0 ? void 0 : stepStarts.get(`${String(turn)}\u0000${String(step)}`);
					if (started !== void 0) stepMs += Math.max(0, event.time - started);
					continue;
				}
				if (event.type === "assistant/message") {
					const reported = asRecord$1(data?.["usage"]);
					usage.inputTokens += number$1(reported?.["inputTokens"]) ?? 0;
					usage.outputTokens += number$1(reported?.["outputTokens"]) ?? 0;
					usage.cacheReadTokens += number$1(reported?.["cacheReadTokens"]) ?? 0;
					usage.reasoningTokens += number$1(reported?.["reasoningTokens"]) ?? 0;
					const surface = number$1(reported?.["totalTokens"]) ?? (number$1(reported?.["inputTokens"]) ?? 0) + (number$1(reported?.["outputTokens"]) ?? 0);
					if (surface > 0) used = surface;
					continue;
				}
				if (event.type === "permission/preset") {
					policy.preset = text$1(data?.["preset"]) ?? policy.preset;
					continue;
				}
				if (event.type === "sandbox/mode") {
					policy.sandbox = text$1(data?.["mode"]) ?? policy.sandbox;
					continue;
				}
				if (event.type === "approval/policy") {
					policy.approval = text$1(data?.["policy"]) ?? policy.approval;
					continue;
				}
				if (event.type === "session/title") {
					title = text$1(data?.["title"]) ?? title;
					continue;
				}
				if (event.type === "tool/call") {
					const callId = text$1(data?.["callId"]);
					const name = text$1(data?.["name"]);
					if (callId === void 0 || name === void 0) continue;
					if (name !== "subagent" && name !== "subagent_fork") continue;
					subagents.set(callId, {
						callId,
						label: delegationLabel(data?.["arguments"]) ?? name,
						time: event.time,
						done: false,
						isError: false
					});
					continue;
				}
				if (event.type === "tool/result") {
					const callId = text$1(asRecord$1(asRecord$1(data?.["message"])?.["source"])?.["callId"]);
					const seen = callId === void 0 ? void 0 : subagents.get(callId);
					if (seen === void 0) continue;
					seen.done = true;
					seen.isError = data?.["error"] !== void 0;
				}
			}
			const inputTotal = usage.inputTokens + usage.cacheReadTokens;
			const context = window === void 0 || used === void 0 ? void 0 : {
				window,
				used,
				percent: Math.min(100, Math.round(used / window * 100))
			};
			const outputPerSecond = stepMs > 0 && usage.outputTokens > 0 ? Math.round(usage.outputTokens / (stepMs / 1e3)) : void 0;
			return {
				...model === void 0 ? {} : { model },
				...context === void 0 ? {} : { context },
				policy,
				stats: {
					turns,
					steps,
					usage,
					...inputTotal > 0 ? { cacheHitPercent: Math.round(usage.cacheReadTokens / inputTotal * 1e3) / 10 } : {},
					stepMs,
					...outputPerSecond === void 0 ? {} : { outputPerSecond },
					...firstTime === void 0 ? {} : { firstTime },
					...lastTime === void 0 ? {} : { lastTime }
				},
				subagents: [...subagents.values()],
				...title === void 0 ? {} : { title },
				running: openTurn
			};
		}
		/**
		* Project the mirrored log onto the trajectory ledger's rows.
		*
		* One row per event, except that a tool result joins its call's row — the same
		* pairing the transcript uses, because the ledger's content column draws the
		* request and its result side by side.
		* @param events - the mirrored events in log order.
		* @param label - kind-tag text lookup, so the copy stays in the dictionaries.
		* @returns the rows to render, oldest first.
		*/
		function trajectoryCells(events, label) {
			const cells = [];
			const calls = /* @__PURE__ */ new Map();
			let openTurn;
			let currentTurn;
			let currentStep;
			for (const event of events) {
				if (HIDDEN_EVENTS.has(event.type)) continue;
				const data = asRecord$1(event.data);
				if (data === void 0) continue;
				const key = String(event.seq);
				if (event.type === "turn/start") {
					currentTurn = number$1(data["turn"]) ?? currentTurn;
					currentStep = void 0;
				} else if (event.type === "step/start") currentStep = number$1(data["step"]) ?? currentStep;
				const turn = number$1(data["turn"]) ?? currentTurn;
				const step = number$1(data["step"]) ?? currentStep;
				if (event.type === "turn/start") {
					const cell = base(key, "turn", label, event, {
						turn,
						step,
						mono: false
					});
					cell.title = turn === void 0 ? "" : `#${String(turn)}`;
					cell.turnStart = true;
					cells.push(cell);
					openTurn = turn === void 0 ? void 0 : {
						turn,
						last: cell
					};
					continue;
				}
				if (event.type === "turn/end") {
					const reason = text$1(asRecord$1(data["reason"])?.["kind"]);
					const cell = base(key, "turn", label, event, {
						turn,
						step,
						mono: false
					});
					cell.title = reason ?? "";
					cell.turnEnd = true;
					cells.push(cell);
					openTurn = void 0;
					continue;
				}
				if (event.type === "tool/call") {
					const callId = text$1(data["callId"]) ?? "";
					const name = text$1(data["name"]) ?? "tool";
					const raw = text$1(data["arguments"]) ?? "";
					const cell = base(key, "tool", label, event, {
						turn,
						step,
						mono: true
					});
					cell.title = name;
					cell.request = summarizeArguments(raw);
					cell.isError = false;
					cells.push(cell);
					if (callId !== "") calls.set(callId, cell);
					continue;
				}
				if (event.type === "tool/result") {
					const callId = text$1(asRecord$1(asRecord$1(data["message"])?.["source"])?.["callId"]) ?? "";
					const cell = calls.get(callId);
					if (cell !== void 0) {
						cell.result = resultExcerpt(data);
						cell.isError = data["error"] !== void 0 || resultIsError(data);
						cell.durationMs = Math.max(0, event.time - cell.time);
						continue;
					}
					const orphan = base(key, "tool", label, event, {
						turn,
						step,
						mono: true
					});
					orphan.title = "";
					orphan.result = resultExcerpt(data);
					orphan.isError = data["error"] !== void 0 || resultIsError(data);
					cells.push(orphan);
					continue;
				}
				const assistant = event.type === "assistant/message";
				const kind = kindOf(event.type, data);
				const message = asRecord$1(data["message"]);
				const textBody = textOf$1(message?.["content"] ?? data["content"]);
				const cell = base(key, kind, label, event, {
					turn,
					step,
					mono: false
				});
				cell.title = excerpt(textBody);
				if (assistant) {
					const output = number$1(asRecord$1(data["usage"])?.["outputTokens"]);
					if (output !== void 0 && output > 0) cell.tokens = output;
					const reasoning = reasoningOf(message?.["content"]);
					if (cell.title === "" && reasoning !== "") {
						cell.title = excerpt(reasoning);
						cell.kind = "think";
						cell.label = label("think");
					}
				}
				if (kind === "step") cell.title = stepText(data);
				if (kind === "policy") cell.title = excerpt(policyText(event.type, data));
				if (kind === "title" && event.type === "session/title") cell.title = excerpt(text$1(data["title"]) ?? "");
				if (kind === "context") cell.title = event.type === "request/header" ? excerpt(requestHeaderText(data)) : excerpt(contextText(data));
				if (kind === "other") cell.title = event.type;
				cells.push(cell);
				if (openTurn !== void 0) openTurn.last = cell;
			}
			return cells;
		}
		/**
		* Which ledger kind one event type reads as.
		*
		* A type this projection does not know is `other` rather than dropped: the
		* ledger exists to show what happened, and silently hiding an event a newer
		* origin logged would be the one failure a reader cannot detect.
		*/
		function kindOf(type, data) {
			switch (type) {
				case "turn/start":
				case "turn/end": return "turn";
				case "step/start":
				case "step/end": return "step";
				case "assistant/message": return "assistant";
				case "user/message": return asRecord$1(data["source"])?.["kind"] === "user" ? "user" : "system";
				case "system/message": return "system";
				case "request/header":
				case "request/context": return "context";
				case "session/title": return "title";
				case "permission/preset":
				case "sandbox/mode":
				case "approval/policy": return "policy";
				default:
					if (type.startsWith("compaction/")) return "compaction";
					if (type.includes("error")) return "error";
					return "other";
			}
		}
		/**
		* Project the ledger's rows onto the timeline strip.
		*
		* `sequence` gives every row one equal slot — the strip as an index of the
		* ledger. `duration` places each row at its recorded time and removes the idle
		* gaps between rows, so the strip shows where the time actually went without a
		* single long wait flattening everything else (ui-trajectory timeline.ts).
		* @param cells - the ledger's rows, in order.
		* @param scale - which projection to build.
		* @returns the strip's model, or null when there is nothing to draw.
		*/
		function trajectoryTimeline(cells, scale) {
			if (cells.length === 0) return null;
			if (scale === "sequence") {
				const spans = cells.map((cell, index) => ({
					key: cell.key,
					index,
					start: index,
					end: index + 1,
					lane: laneOf(cell.kind),
					kind: cell.kind,
					isError: cell.isError,
					label: cell.title === "" ? cell.label : cell.title
				}));
				return {
					start: 0,
					end: spans.length,
					spans,
					turns: turnBoundaries(cells, spans)
				};
			}
			const raw = cells.map((cell, index) => ({
				cell,
				index,
				start: cell.time,
				end: cell.time + (cell.durationMs ?? 0)
			}));
			let coveredUntil = null;
			let removed = 0;
			const offsets = /* @__PURE__ */ new Map();
			for (const row of [...raw].sort((left, right) => left.start - right.start || left.end - right.end)) {
				if (coveredUntil !== null && row.start > coveredUntil) removed += row.start - coveredUntil;
				offsets.set(row.index, removed);
				coveredUntil = coveredUntil === null ? row.end : Math.max(coveredUntil, row.end);
			}
			const spans = raw.map((row) => {
				const offset = offsets.get(row.index) ?? 0;
				return {
					key: row.cell.key,
					index: row.index,
					start: row.start - offset,
					end: Math.max(row.end - offset, row.start - offset),
					lane: laneOf(row.cell.kind),
					kind: row.cell.kind,
					isError: row.cell.isError,
					label: row.cell.title === "" ? row.cell.label : row.cell.title
				};
			});
			const start = Math.min(...spans.map((span) => span.start));
			const end = Math.max(...spans.map((span) => span.end));
			return {
				start,
				end: end === start ? start + 1 : end,
				spans,
				turns: turnBoundaries(cells, spans)
			};
		}
		/** Where each turn's first row sits in the strip's domain. */
		function turnBoundaries(cells, spans) {
			const boundaries = [];
			const seen = /* @__PURE__ */ new Set();
			for (const [index, cell] of cells.entries()) {
				if (cell.turn === void 0 || seen.has(cell.turn)) continue;
				const span = spans[index];
				if (span === void 0) continue;
				seen.add(cell.turn);
				boundaries.push({
					turn: cell.turn,
					at: span.start
				});
			}
			return boundaries;
		}
		/** The shipped strip's lane for one kind: tools out, messages mid, rest in. */
		function laneOf(kind) {
			if (kind === "tool") return 2;
			if (kind === "assistant" || kind === "think") return 1;
			return 0;
		}
		/** One compact token count: K and M, one decimal below 100. */
		function compactTokens(value) {
			const scaled = (candidate) => candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
			if (value < 1e3) return String(value);
			if (value < 1e6) return `${scaled(value / 1e3)}K`;
			return `${scaled(value / 1e6)}M`;
		}
		/** Collapse whitespace so one value fits a single row. */
		function collapseWhitespace(value) {
			return value.replace(/\s+/g, " ").trim();
		}
		/** One local wall-clock label, from an epoch millisecond. */
		function clockLabel(at) {
			const date = new Date(at);
			const pad = (value) => String(value).padStart(2, "0");
			return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
		}
		/** Build one cell with the fields every row shares. */
		function base(key, kind, label, event, extra) {
			return {
				key,
				kind,
				label: label(kind),
				seq: event.seq,
				time: event.time,
				...extra.turn === void 0 ? {} : { turn: extra.turn },
				...extra.step === void 0 ? {} : { step: extra.step },
				title: "",
				mono: extra.mono,
				isError: false,
				turnStart: false,
				turnEnd: false
			};
		}
		/** The request header's route and tool count, as one line. */
		function requestHeaderText(data) {
			const header = asRecord$1(data["header"]);
			const config = asRecord$1(header?.["config"]);
			const tools = Array.isArray(header?.["tools"]) ? header["tools"].length : void 0;
			const parts = [];
			const provider = text$1(config?.["provider"]);
			const model = text$1(config?.["model"]);
			if (provider !== void 0 && model !== void 0) parts.push(`${provider}/${model}`);
			const effort = text$1(config?.["reasoningEffort"]);
			if (effort !== void 0) parts.push(effort);
			if (tools !== void 0) parts.push(`${String(tools)} tools`);
			return parts.join(" · ");
		}
		/** One step boundary's turn/step pair. */
		function stepText(data) {
			const turn = number$1(data["turn"]);
			const step = number$1(data["step"]);
			if (turn === void 0 || step === void 0) return "";
			return `#${String(turn)}/${String(step)}`;
		}
		/** The route a request context was assembled for, with its window. */
		function contextText(data) {
			const provider = text$1(data["provider"]);
			const model = text$1(data["model"]);
			const window = number$1(data["contextWindow"]);
			const parts = [];
			if (provider !== void 0 && model !== void 0) parts.push(`${provider}/${model}`);
			if (window !== void 0) parts.push(`${String(Math.round(window / 1e3))}k window`);
			return parts.join(" · ");
		}
		/** One policy event as a readable line. */
		function policyText(type, data) {
			const value = text$1(data["preset"]) ?? text$1(data["mode"]) ?? text$1(data["policy"]) ?? "";
			return value === "" ? "" : `${type.split("/")[0] ?? ""}: ${value}`;
		}
		/** One-line gist of a tool call's raw arguments. */
		function summarizeArguments(raw) {
			if (raw === "") return "";
			try {
				const record = asRecord$1(JSON.parse(raw));
				if (record !== void 0) {
					for (const key of [
						"command",
						"cmd",
						"file_path",
						"path",
						"pattern",
						"query",
						"description",
						"prompt",
						"url",
						"text"
					]) {
						const value = record[key];
						if (typeof value === "string" && value.trim() !== "") return excerpt(oneLine$1(value), 160);
					}
					const first = Object.values(record).find((value) => typeof value === "string" && value.trim() !== "");
					if (typeof first === "string") return excerpt(oneLine$1(first), 160);
					return excerpt(oneLine$1(raw), 160);
				}
			} catch {}
			return excerpt(oneLine$1(raw), 160);
		}
		/** The label a subagent delegation carries in its arguments. */
		function delegationLabel(raw) {
			const args = typeof raw === "string" ? raw : "";
			if (args === "") return void 0;
			try {
				const record = asRecord$1(JSON.parse(args));
				const description = record === void 0 ? void 0 : text$1(record["description"]);
				if (description !== void 0) return excerpt(oneLine$1(description), LABEL_LIMIT);
				const prompt = record === void 0 ? void 0 : text$1(record["prompt"]);
				if (prompt !== void 0) return excerpt(oneLine$1(prompt), LABEL_LIMIT);
			} catch {
				return;
			}
		}
		/** Every visible result block's text, bounded. */
		function resultExcerpt(data) {
			const message = asRecord$1(data["message"]);
			const blocks = Array.isArray(message?.["content"]) ? message["content"] : [];
			const parts = [];
			for (const block of blocks) {
				const record = asRecord$1(block);
				if (record === void 0) continue;
				const text = textOf$1(Array.isArray(record["content"]) ? record["content"] : [record]);
				if (text !== "") parts.push(text);
			}
			return excerpt(parts.join("\n"));
		}
		/** Whether a tool result reports failure on any block. */
		function resultIsError(data) {
			const message = asRecord$1(data["message"]);
			return (Array.isArray(message?.["content"]) ? message["content"] : []).some((block) => asRecord$1(block)?.["isError"] === true);
		}
		/** Join the visible text blocks of one content array. */
		function textOf$1(content) {
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) {
				const record = asRecord$1(block);
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
				const record = asRecord$1(block);
				if (record === void 0) continue;
				if (record["type"] === "reasoning" && typeof record["text"] === "string") parts.push(record["text"]);
			}
			return parts.join("\n").trim();
		}
		/** Narrow one unknown value to a plain record. */
		function asRecord$1(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			return value;
		}
		/** One non-empty string, or undefined. */
		function text$1(value) {
			return typeof value === "string" && value.trim() !== "" ? value : void 0;
		}
		/** One finite number, or undefined. */
		function number$1(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : void 0;
		}
		/** Collapse every run of whitespace so one value fits on one line. */
		function oneLine$1(value) {
			return value.replace(/\s+/g, " ").trim();
		}
		/** Bound one excerpt, marking that it was cut. */
		function excerpt(value, limit = EXCERPT_LIMIT) {
			const collapsed = value.trim();
			if (collapsed.length <= limit) return collapsed;
			return `${collapsed.slice(0, limit)}…`;
		}
		//#endregion
		//#region src/client/TrajectoryView.tsx
		/**
		* The trajectory view: the shipped ledger, rebuilt over the mirror.
		*
		* Three parts, copied to the figure from `ui-trajectory`:
		*
		*  - a 32px toolbar — recorded-versus-equal widths, fold every turn, fold every
		*    assistant's calls, and one search box;
		*  - a 50px timeline strip in three lanes (bookkeeping, messages, tools) with a
		*    44px label gutter and a hairline where each turn begins;
		*  - the ledger table beside a right-hand inspector that opens on the row you
		*    click.
		*
		* It reads rows the projection layer already built from the mirrored log, so the
		* one thing this file owns is presentation and the selection state a reader
		* drives. Counts and colours follow the shipped sheet; nothing here invents a
		* metric the log does not carry.
		*/
		/**
		* Render the trajectory tab.
		* @param props - copy, the projected rows, the Session's totals, and markdown chrome.
		* @returns the toolbar, the strip, the ledger and the inspector.
		*/
		function TrajectoryView(props) {
			const { t, cells } = props;
			const [scale, setScale] = react.useState("sequence");
			const [foldedTurns, setFoldedTurns] = react.useState(/* @__PURE__ */ new Set());
			const [foldCalls, setFoldCalls] = react.useState(false);
			const [query, setQuery] = react.useState("");
			const [selected, setSelected] = react.useState(null);
			const rows = react.useMemo(() => displayRows(cells, foldedTurns, foldCalls, query), [
				cells,
				foldedTurns,
				foldCalls,
				query
			]);
			const timeline = react.useMemo(() => trajectoryTimeline(cells, scale), [cells, scale]);
			const selectedCell = selected === null ? void 0 : cells[selected];
			const collapsibleTurns = react.useMemo(() => {
				const counts = /* @__PURE__ */ new Map();
				for (const cell of cells) {
					if (cell.turn === void 0 || cell.kind === "turn" || cell.kind === "system") continue;
					counts.set(cell.turn, (counts.get(cell.turn) ?? 0) + 1);
				}
				return [...counts].filter(([, count]) => count > 1).map(([turn]) => turn);
			}, [cells]);
			const allTurnsFolded = collapsibleTurns.length > 0 && collapsibleTurns.every((turn) => foldedTurns.has(turn));
			const toggleAllTurns = () => {
				setFoldedTurns(allTurnsFolded ? /* @__PURE__ */ new Set() : new Set(collapsibleTurns));
			};
			const toggleTurn = (turn) => {
				setFoldedTurns((current) => {
					const next = new Set(current);
					if (next.has(turn)) next.delete(turn);
					else next.add(turn);
					return next;
				});
			};
			const selectSpan = (span) => {
				setSelected(span.index);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.tjRoot,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.tjToolbar,
						role: "toolbar",
						"aria-label": t("tabTrajectory"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: sync_module_css_default.tjToggle,
								"aria-pressed": scale === "duration",
								title: scale === "duration" ? t("tjEqualWidth") : t("tjActualDuration"),
								onClick: () => {
									setScale((current) => current === "sequence" ? "duration" : "sequence");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
									className: sync_module_css_default.tjToggleIcon,
									viewBox: "0 0 16 16",
									fill: "none",
									"aria-hidden": "true",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx: "8",
										cy: "8",
										r: "5.25"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 4.75V8l2.25 1.5" })]
								}), t("tjDuration")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: sync_module_css_default.tjAction,
								"aria-pressed": allTurnsFolded,
								title: allTurnsFolded ? t("tjExpandTurns") : t("tjFoldTurns"),
								onClick: toggleAllTurns,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjActionIcon,
									"aria-hidden": "true",
									children: allTurnsFolded ? "⊞" : "⊟"
								}), t("tjTurns")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: sync_module_css_default.tjAction,
								"aria-pressed": foldCalls,
								title: foldCalls ? t("tjExpandCalls") : t("tjFoldCalls"),
								onClick: () => {
									setFoldCalls((current) => !current);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjActionIcon,
									"aria-hidden": "true",
									children: foldCalls ? "⊞" : "⊟"
								}), t("tjCalls")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: sync_module_css_default.tjSearch,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {
									size: 11,
									className: sync_module_css_default.tjSearchIcon
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "search",
									className: sync_module_css_default.tjSearchInput,
									"aria-label": t("tjSearch"),
									placeholder: t("tjSearchPlaceholder"),
									value: query,
									onChange: (event) => {
										setQuery(event.currentTarget.value);
									}
								})]
							})
						]
					}),
					timeline !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sync_module_css_default.tjStrip,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: sync_module_css_default.tjPlot,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sync_module_css_default.tjLaneLabels,
								"aria-hidden": "true",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tjLaneSystem") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tjLaneMessage") }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tjLaneTool") })
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sync_module_css_default.tjTrack,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjLanes,
									children: timeline.spans.map((span) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: sync_module_css_default.tjSpan,
										"data-kind": span.kind,
										"data-error": span.isError ? "true" : void 0,
										"data-selected": query === "" || matchSpan(span, cells, query) ? void 0 : "false",
										"data-current": selected === span.index ? "true" : void 0,
										"aria-label": span.label,
										title: span.label,
										style: spanStyle(span, timeline.start, timeline.end),
										onClick: () => {
											selectSpan(span);
										}
									}, span.key))
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjTurnBoundaries,
									"aria-hidden": "true",
									children: timeline.turns.map((turn) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: sync_module_css_default.tjTurnBoundary,
										style: { left: `${String(domainPercent(turn.at, timeline.start, timeline.end))}%` }
									}, turn.turn))
								})]
							})]
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.tjSplit,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: sync_module_css_default.tjTablePane,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
								className: sync_module_css_default.ledgerTable,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
									className: sync_module_css_default.ledgerEventHead,
									children: t("ledgerEvent")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("ledgerContent") })] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", {
									"data-kind": row.cell.kind,
									"data-turn-start": row.cell.turnStart ? "true" : void 0,
									"data-error": row.cell.isError ? "true" : void 0,
									"data-folded": row.folded === void 0 ? void 0 : "true",
									"data-selected": selected === row.index ? "true" : void 0,
									"data-dimmed": query !== "" && !row.match ? "true" : void 0,
									onClick: () => {
										if (row.folded !== void 0 && row.cell.turn !== void 0) toggleTurn(row.cell.turn);
										else setSelected(row.index);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
										className: sync_module_css_default.ledgerEventCell,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.ledgerRail,
												"aria-hidden": "true"
											}),
											row.cell.turnStart && row.cell.turn !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.ledgerTurnLabel,
												children: `T${String(row.cell.turn)}`
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: sync_module_css_default.ledgerKindSlot,
												children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `${sync_module_css_default.ledgerKind} ${sync_module_css_default[`kind_${row.cell.kind}`] ?? ""}`,
													children: row.cell.label
												})
											})
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
										className: sync_module_css_default.ledgerContentCell,
										children: row.folded === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Content, {
											cell: row.cell,
											t
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: sync_module_css_default.tjFolded,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: sync_module_css_default.tjFoldedEllipsis,
													"aria-hidden": "true",
													children: "…"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: sync_module_css_default.tjFoldedText,
													children: `${t("tjFoldedRows")} ${String(row.folded)}`
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: sync_module_css_default.tjFoldedText,
													children: row.cell.title
												})
											]
										})
									})]
								}, row.cell.key)) })]
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Inspector, {
							t,
							labels: props.labels,
							stats: props.stats,
							cell: selectedCell,
							onClose: () => {
								setSelected(null);
							}
						})]
					})
				]
			});
		}
		/** One ledger row's content cell. */
		function Content({ cell, t }) {
			if (cell.request === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: cell.mono ? sync_module_css_default.ledgerMono : sync_module_css_default.ledgerText,
				children: cell.title
			});
			const result = cell.result === void 0 || cell.result === "" ? cell.durationMs === void 0 ? t("toolRunning") : t("toolNoOutput") : collapseWhitespace(cell.result);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: sync_module_css_default.ledgerResult,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: sync_module_css_default.ledgerMono,
						children: [cell.title, cell.request === "" ? "" : ` ${cell.request}`]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: cell.isError ? `${sync_module_css_default.ledgerMono} ${sync_module_css_default.ledgerErrorText}` : sync_module_css_default.ledgerMono,
						children: result
					})]
				}),
				cell.durationMs !== void 0 && cell.durationMs > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.ledgerDuration,
					children: `${String(cell.durationMs)} ms`
				}),
				cell.tokens !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.ledgerDuration,
					children: `${String(cell.tokens)} tok`
				})
			] });
		}
		/**
		* The right-hand inspector, in the shipped panel's shape: a 42px header naming
		* the row, a 34px tab strip, and a body that draws the row's own payloads.
		*/
		function Inspector(props) {
			const { t, cell } = props;
			const tabs = react.useMemo(() => {
				if (cell === void 0) return [];
				const available = [{
					id: "overview",
					label: t("tjOverview")
				}];
				if (cell.request !== void 0) available.push({
					id: "request",
					label: t("tjRequest")
				});
				if (cell.result !== void 0) available.push({
					id: "response",
					label: t("tjResponse")
				});
				if (cell.request === void 0 && cell.result === void 0 && cell.title !== "") available.push({
					id: "body",
					label: t("tjBody")
				});
				return available;
			}, [cell, t]);
			const [tab, setTab] = react.useState("overview");
			const close = props.onClose;
			react.useEffect(() => {
				setTab("overview");
			}, [cell?.key]);
			react.useEffect(() => {
				if (cell === void 0) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") close();
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [cell, close]);
			if (cell === void 0) return null;
			const location = [
				cell.turn === void 0 ? void 0 : `T${String(cell.turn)}`,
				cell.step === void 0 ? void 0 : `S${String(cell.step)}`,
				`#${String(cell.seq)}`
			].filter((part) => part !== void 0).join(" · ");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.tjDetails,
				role: "complementary",
				"aria-label": t("tjOverview"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.tjDetailsHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sync_module_css_default.tjDetailsTitle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjDetailsDot,
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjDetailsName,
									children: cell.label
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.tjDetailsLocation,
									children: location
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sync_module_css_default.tjClose,
							"aria-label": t("tjClose"),
							onClick: props.onClose,
							children: "×"
						})]
					}),
					tabs.length > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sync_module_css_default.tjDetailTabs,
						role: "tablist",
						children: tabs.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": tab === entry.id,
							className: tab === entry.id ? `${sync_module_css_default.tjDetailTab} ${sync_module_css_default.tjDetailTabActive}` : sync_module_css_default.tjDetailTab,
							onClick: () => {
								setTab(entry.id);
							},
							children: entry.label
						}, entry.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.tjDetailBody,
						children: [
							tab === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
								className: sync_module_css_default.tjOverview,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjKind") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: cell.label })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("ledgerTurn") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: cell.turn === void 0 ? "—" : String(cell.turn) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjStep") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: cell.step === void 0 ? "—" : String(cell.step) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjSeq") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: String(cell.seq) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjTime") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: clockLabel(cell.time) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjElapsed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: cell.durationMs === void 0 ? "—" : `${String(cell.durationMs)} ms` })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjTokens") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: cell.tokens === void 0 ? "—" : String(cell.tokens) })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjCacheHit") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: props.stats.cacheHitPercent === void 0 ? "—" : `${String(props.stats.cacheHitPercent)}%` })] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: t("tjTotalTokens") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children: compactTokens(props.stats.usage.inputTokens + props.stats.usage.cacheReadTokens + props.stats.usage.outputTokens) })] })
								]
							}),
							tab === "request" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								className: sync_module_css_default.tjPayload,
								children: cell.request ?? ""
							}),
							tab === "response" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								className: cell.isError ? `${sync_module_css_default.tjPayload} ${sync_module_css_default.ledgerErrorText}` : sync_module_css_default.tjPayload,
								children: cell.result ?? t("toolNoOutput")
							}),
							tab === "body" && (cell.kind === "assistant" || cell.kind === "think" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sync_module_css_default.tjMarkdown,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
									text: cell.title,
									labels: props.labels
								})
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								className: sync_module_css_default.tjPayload,
								children: cell.title
							}))
						]
					})
				]
			});
		}
		/** Position one span inside the strip's domain. */
		function spanStyle(span, start, end) {
			const left = domainPercent(span.start, start, end);
			const width = domainPercent(span.end, start, end) - left;
			return {
				"--tj-span-left": `${String(left)}%`,
				"--tj-span-width": `${String(Math.max(width, 0))}%`,
				"--tj-span-lane": String(span.lane)
			};
		}
		/** One position as a share of the strip's domain. */
		function domainPercent(value, start, end) {
			const span = end - start;
			if (span <= 0) return 0;
			return Math.min(100, Math.max(0, (value - start) / span * 100));
		}
		/** Whether one span's row matches the active search. */
		function matchSpan(span, cells, query) {
			const cell = cells[span.index];
			return cell === void 0 ? true : matches$1(cell, query);
		}
		/** Whether one row's own text carries the search text. */
		function matches$1(cell, query) {
			const needle = query.trim().toLowerCase();
			if (needle === "") return true;
			return cell.title.toLowerCase().includes(needle) || (cell.request ?? "").toLowerCase().includes(needle) || (cell.result ?? "").toLowerCase().includes(needle) || cell.label.toLowerCase().includes(needle);
		}
		/**
		* Fold the ledger's rows down to what the reader asked to see.
		*
		* A folded turn keeps one 20px summary row in its first row's place — the
		* shipped ledger's own treatment — and a folded assistant drops the tool rows
		* that follow it, which is what "fold calls" means in that ledger.
		* @param cells - every row, in order.
		* @param foldedTurns - turns the reader folded.
		* @param foldCalls - whether tool rows after an assistant row are hidden.
		* @param query - the active search text; a row that misses it renders dimmed.
		* @returns the rows to draw, each carrying its own search verdict.
		*/
		function displayRows(cells, foldedTurns, foldCalls, query) {
			const rows = [];
			const folded = /* @__PURE__ */ new Set();
			let previousKind;
			for (const [index, cell] of cells.entries()) {
				if (cell.turn !== void 0 && foldedTurns.has(cell.turn)) {
					if (folded.has(cell.turn)) continue;
					folded.add(cell.turn);
					const summary = cells.find((candidate) => candidate.turn === cell.turn && candidate.title !== "");
					rows.push({
						cell: summary === void 0 ? cell : {
							...cell,
							title: summary.title
						},
						index,
						folded: cells.filter((candidate) => candidate.turn === cell.turn).length,
						match: summary === void 0 ? matches$1(cell, query) : matches$1(summary, query)
					});
					continue;
				}
				if (foldCalls && cell.kind === "tool" && (previousKind === "assistant" || previousKind === "think")) continue;
				rows.push({
					cell,
					index,
					match: matches$1(cell, query)
				});
				previousKind = cell.kind;
			}
			return rows;
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
			/** Retry chains by `retryId`, so an attempt updates its chain's one row. */
			const chains = /* @__PURE__ */ new Map();
			for (const event of applySurface(events)) {
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
				if (event.type === "llm/retry") {
					const retryId = text(data["retryId"]);
					const existing = retryId === "" ? void 0 : chains.get(retryId);
					const row = existing ?? {
						kind: "retry",
						key: String(event.seq),
						time: event.time,
						retry: 1,
						delayMs: 0,
						state: "scheduled",
						failure: ""
					};
					row.retry = number(data["retry"]) ?? row.retry;
					row.delayMs = number(data["delayMs"]) ?? row.delayMs;
					row.state = "scheduled";
					row.time = event.time;
					const maximum = number(data["maxRetries"]);
					if (maximum === void 0) delete row.maximum;
					else row.maximum = maximum;
					row.failure = failureText(data["failure"]);
					if (existing === void 0) {
						rows.push(row);
						if (retryId !== "") chains.set(retryId, row);
					}
					continue;
				}
				if (event.type === "llm/retry-started") {
					const retryId = text(data["retryId"]);
					const row = retryId === "" ? void 0 : chains.get(retryId);
					if (row !== void 0 && number(data["retry"]) === row.retry) row.state = "started";
					continue;
				}
				if (event.type === "turn/end") {
					for (const row of chains.values()) if (row.state === "scheduled" && row.time <= event.time) row.state = "cancelled";
					const reason = asRecord(data["reason"]);
					const kind = reason?.["kind"];
					if (kind === "error") {
						const failure = asRecord(reason?.["error"]);
						rows.push({
							kind: "notice",
							key: String(event.seq),
							time: event.time,
							tone: "error",
							message: text(failure?.["message"]),
							...text(failure?.["code"]) === "" ? {} : { code: text(failure?.["code"]) }
						});
					} else if (kind === "max-tokens") rows.push({
						kind: "notice",
						key: String(event.seq),
						time: event.time,
						tone: "warning",
						message: ""
					});
					continue;
				}
				const row = toRow(event, data);
				if (row !== void 0) rows.push(row);
			}
			return rows;
		}
		/**
		* Apply the log's surface operations.
		*
		* An event either appends to the conversation or replaces a range of it. The
		* mirror used to lose the distinction, which showed a compaction as the old
		* window *plus* the one that superseded it; keeping it makes the rows read as
		* the conversation rather than as its entire history.
		* @param events - the mirrored events in log order.
		* @returns the events the Session's surface actually holds, in order.
		*/
		function applySurface(events) {
			const surface = [];
			for (const event of events) {
				const op = event.surfaceOp;
				if (typeof op === "object" && op !== null && op.op === "replace") {
					if (typeof op.startSeq === "number" && typeof op.endSeq === "number") for (let index = surface.length - 1; index >= 0; index -= 1) {
						const seq = surface[index]?.seq;
						if (seq !== void 0 && seq >= op.startSeq && seq <= op.endSeq) surface.splice(index, 1);
					}
				}
				surface.push(event);
			}
			return surface;
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
				const blocks = blocksOf(asRecord(data["message"])?.["content"]);
				const interrupted = data["interrupted"] === true;
				if (blocks.length === 0 && !interrupted) return void 0;
				return {
					kind: "assistant",
					key,
					time: event.time,
					blocks,
					interrupted
				};
			}
		}
		/**
		* Read one assistant content array as ordered blocks.
		*
		* Order is the point: the model interleaves reasoning and prose, and collapsing
		* every reasoning block to the top would reorder what it actually wrote. Tool
		* calls are dropped here because the chat view renders them as their own rows.
		* @param content - the message's content array.
		* @returns the visible blocks, in authored order.
		*/
		function blocksOf(content) {
			if (!Array.isArray(content)) return [];
			const blocks = [];
			for (const candidate of content) {
				const record = asRecord(candidate);
				if (record === void 0) continue;
				const type = record["type"];
				if (type === "text") {
					const text = typeof record["text"] === "string" ? record["text"].trim() : "";
					if (text !== "") blocks.push({
						kind: "text",
						text
					});
					continue;
				}
				if (type === "reasoning") {
					const text = typeof record["text"] === "string" ? record["text"].trim() : "";
					if (text !== "") blocks.push({
						kind: "reasoning",
						text
					});
					continue;
				}
				if (type === "tool-call") continue;
				if (type === "image") {
					blocks.push({
						kind: "image",
						detail: imageDetail(record)
					});
					continue;
				}
				blocks.push({
					kind: "unknown",
					payload: record
				});
			}
			return blocks;
		}
		/** Describe an image block from the facts the mirror does carry. */
		function imageDetail(record) {
			const attachment = asRecord(record["attachment"]);
			const mediaType = text(attachment?.["mediaType"]);
			const bytes = number(attachment?.["bytes"]);
			const parts = [mediaType];
			if (bytes !== void 0) parts.push(`${String(Math.round(bytes / 1024))} KB`);
			return parts.filter((part) => part !== "").join(" · ");
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
		/** One-line failure text out of an `LlmFailure`-shaped record. */
		function failureText(value) {
			return text(asRecord(value)?.["message"]);
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
		/** One optional string. */
		function text(value) {
			return typeof value === "string" ? value : "";
		}
		/** One optional number. */
		function number(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : void 0;
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
		//#region src/client/tool-presentation.ts
		/** Wire names whose row reads as one family, checked in order. */
		const FAMILIES = [
			{
				glyph: "browse",
				labelKey: "toolLabelRead",
				match: /^(read|view|cat|notebook_read|read_image|read_family)/
			},
			{
				glyph: "edit",
				labelKey: "toolLabelEdit",
				match: /^(write|edit|str_replace|apply_patch|file_mutation|patch|create_file)/
			},
			{
				glyph: "search",
				labelKey: "toolLabelSearch",
				match: /^(grep|glob|find|list_dir|ls)/
			},
			{
				glyph: "browse",
				labelKey: "toolLabelSearch",
				match: /^(web_search|search_web)/
			},
			{
				glyph: "globe",
				labelKey: "toolLabelWeb",
				match: /^(web_fetch|fetch|browse|web)/
			},
			{
				glyph: "terminal",
				labelKey: "toolLabelTerminal",
				match: /^(pwsh|powershell|bash|sh|shell|zsh|cmd|term|terminal|exec|process)/
			},
			{
				glyph: "terminal",
				labelKey: "toolLabelCode",
				match: /^(run_code|code|python|node|eval)/
			},
			{
				glyph: "question",
				labelKey: "toolLabelAsk",
				match: /^(ask_user_question|ask_question|question|elicit)/
			},
			{
				glyph: "plan",
				labelKey: "toolLabelPlan",
				match: /^(todo|plan|update_plan|checklist)/
			},
			{
				glyph: "share",
				labelKey: "toolLabelSubagent",
				match: /^(subagent|workflow|task)/
			}
		];
		/**
		* Present one tool call.
		* @param name - the wire tool name, as the origin logged it.
		* @returns the glyph and the title key, or the generic fallback.
		*/
		function toolPresentation(name) {
			const wire = name.trim().toLowerCase();
			for (const family of FAMILIES) {
				if (!family.match.test(wire)) continue;
				return {
					glyph: family.glyph,
					labelKey: family.labelKey
				};
			}
			return wire === "" ? { glyph: "generic" } : {
				glyph: "generic",
				labelKey: "toolLabelGeneric",
				wire: name
			};
		}
		//#endregion
		//#region src/client/SyncPanel.tsx
		/**
		* The centre panel: the server's console over every machine that publishes here.
		*
		* Two panes and a three-level tree. The list groups by machine, then by the
		* directory a Session runs in, then lists the Sessions themselves 閳?the shape
		* the sidebar's workspace browser uses, so a remote Session reads the way a
		* local one does. The talk column beside it is the conversation the DSH client
		* already shows, wearing that UI's own clothes: a centered content column, a
		* right-aligned user bubble, markdown answers, folded tool rows, and an elevated
		* composer card with a circular send button.
		*
		* There is no machine pane: the machine is the tree's first level, so picking one
		* is the same act as opening the list.
		*
		* Registered into the `main` slot under the same key as this plugin's sidebar
		* panel row, so the frame's panel selector and the sidebar entry resolve to the
		* same place without either knowing about the other.
		*/
		/**
		* How close to the floor still counts as being at it.
		*
		* The shipped ChatView's own constant: a reader within this many pixels of the
		* bottom is following the tail, and anything further is reading.
		*/
		const FOLLOW_THRESHOLD = 24;
		/**
		* Render the sync panel.
		* @param props - copy, the snapshot hook, and the actions.
		* @returns the panel.
		*/
		function SyncPanel(props) {
			const state = props.useSync((snapshot) => snapshot);
			const { t } = props;
			const [query, setQuery] = react.useState("");
			const [collapsed, setCollapsed] = react.useState({});
			/** The reset count the reader has already acknowledged. */
			const [dismissedResets, setDismissedResets] = react.useState(0);
			/**
			* Whether the list column is put away.
			*
			* The list is the console's own column inside the centre surface, so hiding it
			* is a view state of this component, not of the Host sidebar: the transcript
			* then gets the whole width, which is what reading a mirrored Session wants.
			*/
			const [listHidden, setListHidden] = react.useState(false);
			const machines = state.state.machines;
			const open = state.open;
			const groups = react.useMemo(() => buildTree(machines, query), [machines, query]);
			const searching = query.trim() !== "";
			const isOpen = (key) => searching ? true : collapsed[key] !== true;
			const toggle = react.useCallback((key) => {
				setCollapsed((current) => ({
					...current,
					[key]: current[key] !== true
				}));
			}, []);
			const session = (open === void 0 ? void 0 : machines.find((candidate) => candidate.machineName === open.machineName)?.sessions.find((candidate) => candidate.sessionId === open.sessionId)) ?? (open === void 0 ? void 0 : {
				sessionId: open.sessionId,
				title: open.sessionId,
				updatedAt: Date.now(),
				running: false,
				eventCount: 0
			});
			const online = open === void 0 ? false : machines.find((candidate) => candidate.machineName === open.machineName)?.online ?? false;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.panel,
				"data-open": open === void 0 ? "false" : "true",
				"data-list": listHidden ? "hidden" : "shown",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
					className: sync_module_css_default.listPane,
					"aria-label": t("sessionsTitle"),
					"aria-hidden": listHidden,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.listHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, {}),
							className: sync_module_css_default.inputWrap,
							value: query,
							placeholder: t("searchSessions"),
							"aria-label": t("searchSessions"),
							onChange: (event) => {
								setQuery(event.target.value);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.listStatus,
							children: state.stream === "connecting" ? `${roleLine(state, t)} · ${t("streamReconnecting")}` : roleLine(state, t)
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.list,
						role: "tree",
						children: [
							state.mirrorResets > dismissedResets && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: sync_module_css_default.notice,
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: sync_module_css_default.noticeText,
									children: t("mirrorResetNotice")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: sync_module_css_default.noticeClose,
									"aria-label": t("tjClose"),
									onClick: () => {
										setDismissedResets(state.mirrorResets);
									},
									children: "脳"
								})]
							}),
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
							state.ready && machines.length > 0 && groups.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sync_module_css_default.empty,
								children: t("searchEmpty")
							}),
							groups.map((group) => {
								const machineKey = group.machine.machineName;
								const machineOpen = isOpen(machineKey);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreeRow, {
										level: 0,
										icon: "machine",
										open: machineOpen,
										dim: !group.machine.online,
										label: group.machine.machineName,
										trailing: machineTrailing(group.machine, t),
										rowKey: machineKey,
										onToggleKey: toggle
									}),
									machineOpen && group.machine.sessions.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: sync_module_css_default.empty,
										children: t("machineNoSessions")
									}),
									machineOpen && group.projects.map((project) => {
										const projectKey = `${machineKey}\u0000${project.cwd}`;
										const projectOpen = isOpen(projectKey);
										const projectLabel = project.cwd === "" ? t("noCwd") : project.cwd;
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TreeRow, {
											level: 1,
											icon: "project",
											open: projectOpen,
											label: projectLabel,
											trailing: String(project.sessions.length),
											rowKey: projectKey,
											onToggleKey: toggle
										}), projectOpen && project.sessions.map((candidate) => {
											const selected = open?.sessionId === candidate.sessionId;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
												type: "button",
												role: "treeitem",
												"aria-selected": selected,
												"data-level": 2,
												className: selected ? `${sync_module_css_default.treeSession} ${sync_module_css_default.treeSessionSelected}` : sync_module_css_default.treeSession,
												"aria-label": `${t("openSession")}: ${candidate.title}`,
												title: candidate.title,
												onClick: () => {
													props.openSession(group.machine.machineName, candidate.sessionId);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: sync_module_css_default.treeSlot,
														children: candidate.running && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" })
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: sync_module_css_default.rowTitle,
														children: candidate.title
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: sync_module_css_default.rowTime,
														children: candidate.running ? t("sessionRunning") : timeLabel(candidate.updatedAt, t)
													})
												]
											}, candidate.sessionId);
										})] }, projectKey);
									})
								] }, machineKey);
							})
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
					className: sync_module_css_default.viewPane,
					"aria-label": t("panelTitle"),
					children: open === void 0 || session === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HeroPlaceholder, { t }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Conversation, {
						t,
						state,
						session,
						machineName: open.machineName,
						online,
						closeSession: props.closeSession,
						sendPrompt: props.sendPrompt,
						listHidden,
						toggleList: () => {
							setListHidden((current) => !current);
						}
					})
				})]
			});
		}
		/**
		* One foldable tree row: the machine and project levels, which differ in their
		* depth, their leading glyph, and their trailing text.
		*
		* A machine wears the globe its sidebar panel row uses —the two are the same
		* thing seen from two places —while a directory keeps the folder the workspace
		* browser gives it. Both still swap to the expand arrow on hover, because that
		* arrow is the only affordance saying the row folds.
		*/
		const TreeRow = react.memo(function TreeRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "treeitem",
				"aria-expanded": props.open,
				"aria-label": props.label,
				title: props.label,
				"data-level": props.level,
				className: props.dim === true ? `${sync_module_css_default.treeRow} ${sync_module_css_default.treeRowDim}` : sync_module_css_default.treeRow,
				onClick: () => {
					props.onToggleKey(props.rowKey);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${sync_module_css_default.treeSlot} ${sync_module_css_default.treeFolder}`,
						children: props.icon === "machine" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 16 }) : props.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpen16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderClose16, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${sync_module_css_default.treeSlot} ${sync_module_css_default.treeChevron}`,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFill14, { className: props.open ? sync_module_css_default.arrowOpen : void 0 })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.rowTitle,
						children: props.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.rowTime,
						children: props.trailing
					})
				]
			});
		});
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
			const [tab, setTab] = react.useState("chat");
			const body = react.useRef(null);
			/** The reading column, whose height is what growth moves. */
			const column = react.useRef(null);
			/** Whether the reader is at the floor of the transcript. */
			const [atBottom, setAtBottom] = react.useState(true);
			const scrollToBottom = react.useCallback((smooth = true) => {
				const el = body.current;
				if (el === null) return;
				if (smooth && typeof el.scrollTo === "function") el.scrollTo({
					top: el.scrollHeight,
					behavior: "smooth"
				});
				else el.scrollTop = el.scrollHeight;
			}, []);
			react.useEffect(() => {
				const el = body.current;
				if (el === null) return;
				const onScroll = () => {
					setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD);
				};
				onScroll();
				el.addEventListener("scroll", onScroll, { passive: true });
				return () => {
					el.removeEventListener("scroll", onScroll);
				};
			}, [tab, state.open?.sessionId]);
			react.useEffect(() => {
				const node = column.current;
				if (node === null || typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(() => {
					if (atBottom) scrollToBottom(false);
				});
				observer.observe(node);
				return () => {
					observer.disconnect();
				};
			}, [
				atBottom,
				scrollToBottom,
				tab,
				state.open?.sessionId
			]);
			react.useEffect(() => {
				setAtBottom(true);
				scrollToBottom(false);
			}, [state.open?.sessionId, scrollToBottom]);
			const rows = react.useMemo(() => toRows(state.transcript?.events ?? []), [state.transcript]);
			const chrome = react.useMemo(() => sessionChrome(state.transcript?.events ?? []), [state.transcript]);
			const cells = react.useMemo(() => trajectoryCells(state.transcript?.events ?? [], kindLabel(t)), [state.transcript, t]);
			const labels = react.useMemo(() => ({
				code: {
					copyLabel: t("copyCode"),
					copiedLabel: t("copiedCode")
				},
				footnotes: t("footnotes")
			}), [t]);
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
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: sync_module_css_default.viewHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.viewTitleRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								size: "sm",
								className: sync_module_css_default.listToggle,
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPanelLeftOutline16, {}),
								"aria-label": props.listHidden ? t("listShow") : t("listHide"),
								onClick: props.toggleList
							}),
							"          ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								size: "sm",
								className: sync_module_css_default.narrowOnly,
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutline14, {}),
								"aria-label": t("back"),
								onClick: props.closeSession
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
								className: sync_module_css_default.viewTitle,
								children: session.title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.viewMachine,
								children: props.machineName
							}),
							session.running && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "ongoing" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.viewMachine,
								children: t("sessionRunning")
							})] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: sync_module_css_default.viewSpacer }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChromeChips, {
								t,
								chrome
							})
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.viewTabs,
						role: "tablist",
						"aria-label": t("panelTitle"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": tab === "chat",
							className: tab === "chat" ? `${sync_module_css_default.viewTab} ${sync_module_css_default.viewTabActive}` : sync_module_css_default.viewTab,
							onClick: () => {
								setTab("chat");
							},
							children: t("tabChat")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": tab === "trajectory",
							className: tab === "trajectory" ? `${sync_module_css_default.viewTab} ${sync_module_css_default.viewTabActive}` : sync_module_css_default.viewTab,
							onClick: () => {
								setTab("trajectory");
							},
							children: t("tabTrajectory")
						})]
					})]
				}),
				tab === "trajectory" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrajectoryView, {
					t,
					cells,
					stats: chrome.stats,
					labels
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.viewScroll,
					ref: body,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.viewColumn,
						ref: column,
						children: [
							state.error !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: sync_module_css_default.error,
								children: state.error
							}),
							state.transcript === void 0 && !state.loadingTranscript ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sync_module_css_default.empty,
								children: t("transcriptGone")
							}) : state.loadingTranscript ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sync_module_css_default.empty,
								children: t("transcriptLoading")
							}) : rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: sync_module_css_default.empty,
								children: t("transcriptEmpty")
							}) : rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TranscriptLine, {
								t,
								row,
								labels
							}, row.key)),
							(state.live.reasoning !== "" || state.live.text !== "") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: sync_module_css_default.assistantRow,
								children: [state.live.reasoning !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningRow, {
									t,
									reasoning: state.live.reasoning,
									streaming: true
								}), state.live.text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
									text: state.live.text,
									labels
								})]
							})
						]
					}), !atBottom && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sync_module_css_default.toBottomSlot,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: sync_module_css_default.toBottom,
							"aria-label": t("chatToBottom"),
							onClick: () => {
								scrollToBottom();
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})
						})
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.composerRoot,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: sync_module_css_default.composerCard,
						onSubmit: (event) => {
							event.preventDefault();
							send();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: sync_module_css_default.composerText,
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
							className: sync_module_css_default.composerBar,
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
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: sync_module_css_default.composerSpacer }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "submit",
									className: sync_module_css_default.sendButton,
									disabled: sending || draft.trim() === "",
									"aria-label": sending ? t("sending") : t("send"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutline16, {})
								})
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusRow, {
						t,
						stats: chrome.stats
					})]
				})
			] });
		}
		/**
		* The header's right-hand cluster:涓婁笅鏂囧崰鐢ㄧ巼 ring, and the model, preset and
		* subagent facts the log reports.
		*
		* Every one of these is a **reading**, not a control: the mirror can see what
		* the owning machine is doing and cannot change it. The shipped session header
		* carries selectors in these seats; this console shows the same facts without
		* pretending a click would do something.
		*/
		function ChromeChips({ t, chrome }) {
			const { model, context, policy, subagents } = chrome;
			const preset = policy.preset === void 0 ? void 0 : policy.preset === "danger-full-access" ? t("presetDangerFullAccess") : policy.preset;
			const subagentLabel = subagents.length === 0 ? t("chromeSubagentsNone") : subagents.map((seen) => `${seen.label}${seen.isError ? " !" : ""}`).join("\n");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: sync_module_css_default.chromeCluster,
				children: [
					model !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: `${t("chromeModel")}: ${model.provider}/${model.model}`,
						side: "bottom",
						delayMs: 200,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sync_module_css_default.chromeChip,
							children: [model.model, model.effort === void 0 ? "" : ` · ${model.effort}`]
						})
					}),
					preset !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: `${t("chromePreset")}: ${preset}`,
						side: "bottom",
						delayMs: 200,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.chromeChip,
							children: preset
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label: subagentLabel,
						side: "bottom",
						delayMs: 200,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.chromeChip,
							children: `${t("chromeSubagents")} ${String(subagents.length)}`
						})
					}),
					context !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ContextRing, {
						t,
						context
					})
				]
			});
		}
		/**
		* The composer's context-occupancy ring (14px, 2px stroke) and the panel its
		* click opens: the shipped meter's geometry, fed by the last request's own
		* numbers instead of the projection.
		*/
		function ContextRing({ t, context }) {
			const [open, setOpen] = react.useState(false);
			const radius = 5.5;
			const circumference = 2 * Math.PI * radius;
			const reading = `${String(context.percent)}%`;
			const label = `${t("chromeContextUsed")} ${reading}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: sync_module_css_default.ringRoot,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label,
					side: "bottom",
					delayMs: 200,
					disabled: open,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: sync_module_css_default.ringTrigger,
						"aria-label": label,
						"aria-haspopup": "dialog",
						"aria-expanded": open,
						onClick: () => {
							setOpen((current) => !current);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
							viewBox: "0 0 14 14",
							width: "14",
							height: "14",
							"aria-hidden": "true",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: sync_module_css_default.ringTrack,
								cx: "7",
								cy: "7",
								r: radius
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								className: sync_module_css_default.ringFill,
								cx: "7",
								cy: "7",
								r: radius,
								strokeDasharray: `${String(circumference * context.percent / 100)} ${String(circumference)}`,
								transform: "rotate(-90 7 7)"
							})]
						})
					})
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: sync_module_css_default.ringPanel,
					role: "dialog",
					"aria-label": label,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: sync_module_css_default.ringHeadline,
						children: [
							t("chromeContextUsed"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: reading })
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.ringFigures,
						children: `~${compactTokens(context.used)} / ${compactTokens(context.window)}`
					})]
				})]
			});
		}
		/** The status row under the composer card: turns, steps, throughput, cache. */
		function StatusRow({ t, stats }) {
			if (stats.turns === 0 && stats.steps === 0) return null;
			const parts = [`${String(stats.turns)} ${t("statusTurns")}`, `${String(stats.steps)} ${t("statusSteps")}`];
			if (stats.outputPerSecond !== void 0) parts.push(`${String(stats.outputPerSecond)} ${t("statusTokens")}/s`);
			const total = stats.usage.inputTokens + stats.usage.cacheReadTokens + stats.usage.outputTokens;
			const tail = [];
			if (total > 0) tail.push(`${compactTokens(total)} ${t("statusTokens")}`);
			if (stats.cacheHitPercent !== void 0) tail.push(`${t("statusCacheHit")} ${String(stats.cacheHitPercent)}%`);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.statusRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: parts.join(" · ") }), tail.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tail.join(" · ") })]
			});
		}
		/**
		* The ledger's kind-tag text, from the dictionaries.
		* @param t - the localized copy lookup.
		* @returns a lookup from a projected kind to its tag.
		*/
		function kindLabel(t) {
			return (kind) => t(`kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`);
		}
		/**
		* What the talk column shows before something is open.
		*
		* It is the client's own new-session hero —the fish, the headline, the preview
		* badge —copied to the figure (ui-conversation HeroShell), because an empty
		* column in this product already has a face and inventing a second one would
		* make the console look like a different application. The one addition is the
		* hint line: unlike a new session, this column is not waiting for a draft, it is
		* waiting for a row to be picked in the list beside it.
		*
		* The hover swim morph is not copied: it is three baked path variants and an
		* SMIL interpolation, all decoration for a placeholder that is about to be
		* replaced by a conversation.
		*/
		function HeroPlaceholder({ t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sync_module_css_default.heroRoot,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.heroStack,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.heroHeadline,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.heroFish,
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.FishLogo, { size: 34 })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: sync_module_css_default.heroTitleGroup,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("heroHeadline") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: sync_module_css_default.heroBadge,
								children: t("heroPreview")
							})]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: sync_module_css_default.heroHint,
						children: t("selectSession")
					})]
				})
			});
		}
		/** One transcript row, in the shapes the DSH conversation uses. */
		function TranscriptLine({ t, row, labels }) {
			if (row.kind === "user") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.userRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sync_module_css_default.bubble,
					children: row.text
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageActions, {
					t,
					text: row.text,
					place: "user"
				})]
			});
			if (row.kind === "assistant") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.assistantRow,
				children: [
					row.blocks.map((block, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistantBlockView, {
						t,
						block,
						labels
					}, index)),
					row.interrupted && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.stopped,
						children: t("stopped")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageActions, {
						t,
						text: assistantTextOf(row.blocks),
						place: "assistant"
					})
				]
			});
			if (row.kind === "notice") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NoticeLine, {
				t,
				row
			});
			if (row.kind === "retry") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RetryLine, {
				t,
				row
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolCallRow, {
				t,
				row
			});
		}
		/** One block of an assistant message. */
		function AssistantBlockView({ t, block, labels }) {
			if (block.kind === "reasoning") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ReasoningRow, {
				t,
				reasoning: block.text
			});
			if (block.kind === "text") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, {
				text: block.text,
				labels
			});
			if (block.kind === "image") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: sync_module_css_default.mediaChip,
				children: [t("imageBlock"), block.detail === "" ? "" : ` · ${block.detail}`]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.JsonBlock, {
				label: t("unknownBlock"),
				payload: block.payload,
				truncatedLabel: (total) => `${t("jsonTruncated")} ${String(total)}`
			});
		}
		/** The plain text the copy action writes for one assistant message. */
		function assistantTextOf(blocks) {
			return blocks.filter((block) => block.kind === "text").map((block) => block.text).join("\n\n");
		}
		/**
		* Copy chrome shared by user and assistant rows — the shipped `IconActions`.
		*
		* The copy feedback is local because the primitive that owns it
		* (`useCopyFeedback`) is not part of the published surface; the behaviour is the
		* shipped one: a one-second check swap, and no second write while it shows.
		*/
		function MessageActions({ t, text, place }) {
			const [copied, setCopied] = react.useState(false);
			const timer = react.useRef(null);
			react.useEffect(() => () => {
				if (timer.current !== null) clearTimeout(timer.current);
			}, []);
			const onCopy = () => {
				if (copied) return;
				(0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(text).then((ok) => {
					if (!ok) return;
					setCopied(true);
					timer.current = setTimeout(() => {
						timer.current = null;
						setCopied(false);
					}, 1e3);
				});
			};
			if (text === "") return null;
			const label = copied ? t("copiedCode") : t("messageCopy");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: place === "user" ? sync_module_css_default.userActions : sync_module_css_default.messageActions,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label,
					side: "bottom",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: sync_module_css_default.action,
						"aria-label": label,
						onClick: onCopy,
						children: copied ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {})
					})
				})
			});
		}
		/** One turn-end notice: why a turn stopped producing. */
		function NoticeLine({ t, row }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.noticeRow,
				role: "status",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
						state: row.tone === "error" ? "error" : "warning",
						className: sync_module_css_default.noticeDot
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.noticeCopy,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: row.tone === "error" ? sync_module_css_default.noticeTitleError : sync_module_css_default.noticeTitleWarn,
							children: row.tone === "error" ? t("turnFailed") : t("turnMaxTokens")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.noticeMessage,
							children: row.message !== "" ? row.message : t("turnMaxTokensHint")
						})]
					}),
					row.code !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
						className: sync_module_css_default.noticeCode,
						children: row.code
					})
				]
			});
		}
		/** One model-retry chain, as the shipped chat renders it. */
		function RetryLine({ t, row }) {
			const deadline = react.useMemo(() => Date.now() + row.delayMs, [row.delayMs, row.key]);
			const [seconds, setSeconds] = react.useState(() => countdownSeconds(deadline));
			const active = row.state === "scheduled";
			react.useEffect(() => {
				if (!active) return;
				const timer = window.setInterval(() => {
					setSeconds(countdownSeconds(deadline));
				}, 500);
				return () => {
					window.clearInterval(timer);
				};
			}, [active, deadline]);
			const status = row.state === "scheduled" ? t("retryActive") : row.state === "started" ? t("retryStarted") : t("retryCancelled");
			const attempt = `${t("retryAttempt")} ${String(row.retry)}${row.maximum === void 0 ? "" : ` ${t("retryOf")} ${String(row.maximum)}`} ${t("retryAttempts")}`.trim();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				className: sync_module_css_default.retryRow,
				"data-active": active || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
					className: sync_module_css_default.retrySummary,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.retryText,
						role: "status",
						children: `${t("retryTitle")} · ${status} · ${attempt}${active ? ` · ${String(seconds)} ${t("retrySeconds")}` : ""}`
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.retryDetails,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.retryDetailLabel,
						children: t("retryDelay")
					}), `${String(Math.round(row.delayMs))} ms`] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.retryDetailLabel,
						children: t("retryFailure")
					}), row.failure] })]
				})]
			});
		}
		/** Whole seconds left before a scheduled attempt runs, never below one. */
		function countdownSeconds(deadline) {
			return Math.max(1, Math.ceil((deadline - Date.now()) / 1e3));
		}
		/**
		* One assistant reasoning block, folded away by default.
		*
		* A block that is still streaming is summarised by its latest line rather than
		* its first, as the shipped row does for a live block: on this deployment the
		* first line is complete within milliseconds of the step starting, so a folded
		* block summarised by it would never appear to move.
		*/
		function ReasoningRow({ t, reasoning, streaming }) {
			const [open, setOpen] = react.useState(false);
			const summary = (streaming === true ? lastLineOf(reasoning) : firstLineOf(reasoning)).replaceAll("**", "");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sync_module_css_default.thinkRoot,
				"data-state": streaming === true ? "running" : "ok",
				"data-expanded": open || void 0,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: sync_module_css_default.thinkLine,
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline14, { size: 14 }),
					title: t("reasoning"),
					open,
					expandable: true,
					expandOnRowClick: true,
					onToggle: () => {
						setOpen((current) => !current);
					},
					titleClassName: sync_module_css_default.thinkTitle,
					collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: sync_module_css_default.toolSep }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.thinkSummary,
						"data-follow-end": streaming === true || void 0,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.thinkSummaryText,
							children: summary
						})
					})] }),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: sync_module_css_default.reasoning,
						children: reasoning
					})
				})
			});
		}
		/** The first line of a reasoning block, which is what its collapsed row shows. */
		function firstLineOf(text) {
			const newline = text.indexOf("\n");
			return (newline === -1 ? text : text.slice(0, newline)).trim();
		}
		/**
		* The newest line a streaming block has reached.
		*
		* Trailing blank lines are skipped: the text ends wherever the model is, so the
		* last line is usually still being written and often empty.
		*/
		function lastLineOf(text) {
			const lines = text.split("\n");
			for (let index = lines.length - 1; index >= 0; index -= 1) {
				const line = lines[index].trim();
				if (line !== "") return line;
			}
			return "";
		}
		/** One tool call and its result, folded into a single row with an IN/OUT card. */
		function ToolCallRow({ t, row }) {
			const [open, setOpen] = react.useState(false);
			const [resultOpen, setResultOpen] = react.useState(false);
			const presentation = toolPresentation(row.name);
			const generic = presentation.glyph === "generic" && presentation.wire !== void 0;
			const label = presentation.labelKey === void 0 ? row.name === "" ? t("toolResult") : row.name : t(presentation.labelKey);
			const summary = presentation.wire === void 0 ? row.summary : [presentation.wire, row.summary].filter((part) => part !== "").join(" · ");
			const glyph = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: row.isError ? `${sync_module_css_default.toolGlyph} ${sync_module_css_default.toolGlyphError}` : sync_module_css_default.toolGlyph,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolGlyphIcon, { glyph: presentation.glyph })
			});
			const argumentsCard = row.argumentsText === "" ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: sync_module_css_default.ioCard,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.ioSection,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.ioLabel,
						children: t("toolArguments")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: sync_module_css_default.ioText,
						children: row.argumentsText
					})]
				})
			});
			if (generic) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: glyph(),
				title: label,
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setOpen((current) => !current);
				},
				className: toolRowClass(row.pending),
				titleClassName: sync_module_css_default.toolName,
				collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.toolSummary,
					children: summary
				}),
				children: argumentsCard
			}), row.pending ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.toolGlyph,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: row.isError ? "error" : "done" })
				}),
				title: t("toolResult"),
				open: resultOpen,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setResultOpen((current) => !current);
				},
				className: sync_module_css_default.toolRow,
				titleClassName: sync_module_css_default.toolName,
				collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.toolSummary,
					children: timeLabel(row.time, t)
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sync_module_css_default.ioCard,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.ioSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.ioLabel,
							children: t("toolResult")
						}), row.resultText === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.ioText,
							children: t("toolNoOutput")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: row.isError ? `${sync_module_css_default.ioText} ${sync_module_css_default.ioTextError}` : sync_module_css_default.ioText,
							children: row.resultText
						})]
					})
				})
			})] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
				icon: glyph(),
				title: label,
				open,
				expandable: true,
				expandOnRowClick: true,
				onToggle: () => {
					setOpen((current) => !current);
				},
				className: toolRowClass(row.pending),
				titleClassName: sync_module_css_default.toolName,
				collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: sync_module_css_default.toolSep }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: sync_module_css_default.toolSummary,
					children: summary !== "" ? summary : timeLabel(row.time, t)
				})] }),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.ioCard,
					children: [row.argumentsText !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.ioSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.ioLabel,
							children: t("toolArguments")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.ioText,
							children: row.argumentsText
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: sync_module_css_default.ioDivider })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: sync_module_css_default.ioSection,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.ioLabel,
							children: t("toolResult")
						}), row.resultText === "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: sync_module_css_default.ioText,
							children: row.pending ? t("toolRunning") : t("toolNoOutput")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: row.isError ? `${sync_module_css_default.ioText} ${sync_module_css_default.ioTextError}` : sync_module_css_default.ioText,
							children: row.resultText
						})]
					})]
				})
			});
		}
		/**
		* A tool row's class: a call in flight carries the sweep the shipped row uses
		* for the same state, and every other row carries the plain one.
		* @param running - whether the call is still waiting for its result.
		* @returns the row's class names.
		*/
		function toolRowClass(running) {
			return running ? `${sync_module_css_default.toolRow} ${sync_module_css_default.toolRowRunning}` : sync_module_css_default.toolRow;
		}
		/**
		* The glyph a tool family leads with —the same mark the shipped toolview for
		* that family registers, at 14 inside the row's 16px leading box.
		*/
		function ToolGlyphIcon({ glyph }) {
			switch (glyph) {
				case "browse": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutline16, { size: 14 });
				case "edit": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutline16, { size: 14 });
				case "search": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutline16, { size: 14 });
				case "terminal": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutline14, { size: 14 });
				case "globe": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutline14, { size: 14 });
				case "question": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQuestionOutline14, { size: 14 });
				case "plan": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChecklistOutline14, { size: 14 });
				case "share": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconShareOutline16, { size: 14 });
				default: return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkle16, { size: 14 });
			}
		}
		/** The role and link line under the list's search box. */
		function roleLine(state, t) {
			const role = state.state.role === "server" ? t("roleServer") : t("roleClient");
			if (state.state.role === "server") return `${role} · ${state.state.listening ? t("statusListening") : t("statusNotListening")}`;
			if (state.state.serverUrl.trim() === "") return `${role} · ${t("statusNotConfigured")}`;
			if (!state.state.linked) return `${role} · ${t("statusUnlinked")}`;
			const publish = state.state.publish;
			if (publish === void 0) return `${role} · ${t("statusLinked")} · ${t("statusNeverPublished")}`;
			if (!publish.ok) return `${role} · ${t("statusLinked")} · ${t("statusPublishFailed")}${publish.error === void 0 ? "" : `: ${publish.error}`}`;
			const follow = state.state.follow;
			if (follow !== void 0 && follow.events === 0) return `${role} · ${t("statusLinked")} · ${t("statusFollowSilent")}${follow.frames.length === 0 ? "" : ` (${follow.frames.join(", ")})`}`;
			return Date.now() - publish.at > 3e4 ? `${role} · ${t("statusLinked")} · ${t("statusPublishStalled")}` : `${role} · ${t("statusLinked")} · ${t("statusPublishOk")}`;
		}
		/** What a machine row says on its trailing cell. */
		function machineTrailing(machine, t) {
			if (!machine.online) return `${t("machineOffline")} · ${timeLabel(machine.lastSeen, t)}`;
			const running = machine.sessions.filter((session) => session.running).length;
			if (running > 0) return `${String(running)} ${t("sessionsRunning")}`;
			return `${String(machine.sessions.length)} ${t("machineSessions")}`;
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
		* Group the mirror into machines, their directories, and their Sessions.
		* @param machines - every machine the server mirrors, newest activity first.
		* @param query - the current search text.
		* @returns the tree to render; machines and directories with no match are gone.
		*/
		function buildTree(machines, query) {
			const needle = query.trim().toLowerCase();
			const groups = [];
			const ordered = [...machines].sort((left, right) => left.machineName.localeCompare(right.machineName));
			for (const machine of ordered) {
				const sessions = machine.sessions.filter((session) => needle === "" || matches(session, needle)).sort((left, right) => Number(right.running) - Number(left.running) || right.updatedAt - left.updatedAt);
				if (needle !== "" && sessions.length === 0) continue;
				const directories = /* @__PURE__ */ new Map();
				for (const session of sessions) {
					const key = session.cwd ?? "";
					const bucket = directories.get(key);
					if (bucket === void 0) directories.set(key, [session]);
					else bucket.push(session);
				}
				groups.push({
					machine,
					projects: [...directories].sort(([left], [right]) => left.localeCompare(right)).map(([cwd, members]) => ({
						cwd,
						sessions: members
					}))
				});
			}
			return groups;
		}
		/** Whether one Session matches the search text. */
		function matches(session, needle) {
			return session.title.toLowerCase().includes(needle) || (session.cwd ?? "").toLowerCase().includes(needle) || session.sessionId.toLowerCase().includes(needle);
		}
		/**
		* One relative-time label, from the shared bucketing and this plugin's words.
		* @param at - epoch ms of the moment being described.
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
		/**
		* How many command states to remember for a command this browser has not been
		* told about yet.
		*
		* A status frame and the POST response that mints the command's id travel by
		* different roads, and the frame routinely wins: the server hands the command to
		* the owning machine and narrates that immediately, while the response still has
		* to come back. Dropping those frames left the composer on "submitted" for a
		* command the machine had already accepted.
		*/
		const EARLY_COMMAND_LIMIT = 16;
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
		/** The step number that means "no step is streaming". */
		const NO_STEP = -1;
		/**
		* The empty live row.
		*
		* A blank row rather than `undefined`: the panel asks whether either text is
		* non-empty, and a step's first frame is what fills one.
		*/
		function noLive() {
			return {
				reasoning: "",
				text: "",
				turn: NO_STEP,
				step: NO_STEP
			};
		}
		/**
		* Whether one mirrored event settles the attempt a live row belongs to.
		*
		* Both spellings matter: a step that produced a message commits
		* `assistant/message`, while a stream that failed or was aborted with nothing
		* to keep commits `assistant/attempt`. Clearing only on the first left a
		* failed step's thinking on screen indefinitely.
		* @param event - one mirrored durable event.
		* @returns true when the live row for its step is over.
		*/
		function isSettlement(event) {
			return event.type === "assistant/message" || event.type === "assistant/attempt";
		}
		/** The sync plugin's browser client. */
		var SyncClient = class {
			store;
			source;
			poll;
			started = false;
			/** Status frames that arrived before this browser knew their command's id. */
			earlyCommands = /* @__PURE__ */ new Map();
			/** Whether this page has ever held an open stream. */
			sawOpen = false;
			/** Whether this page has ever seen a machine in the mirror. */
			sawMachines = false;
			constructor() {
				this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({
					ready: false,
					config: defaultConfig(""),
					state: idleState(),
					sessions: [],
					loadingTranscript: false,
					live: noLive(),
					stream: "connecting",
					mirrorResets: 0
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
					live: noLive(),
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
					delivery: void 0,
					live: noLive()
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
					const known = this.earlyCommands.get(result.commandId);
					this.earlyCommands.delete(result.commandId);
					this.update({
						error: void 0,
						delivery: known ?? {
							commandId: result.commandId,
							state: "queued",
							expiresAt: Date.now() + 12e4
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
				source.onopen = () => {
					const first = !this.sawOpen;
					this.sawOpen = true;
					const snapshot = this.store.getSnapshot();
					const reset = !first && this.sawMachines && snapshot.state.machines.length === 0;
					this.update({
						stream: "open",
						...reset ? { mirrorResets: snapshot.mirrorResets + 1 } : {}
					});
					if (!first) this.refresh();
				};
				source.onerror = () => {
					this.update({ stream: "connecting" });
				};
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
					this.update({
						transcript: {
							...transcript,
							events: [...transcript.events, ...frame.events]
						},
						...frame.events.some(isSettlement) ? { live: noLive() } : {}
					});
					return;
				}
				if (frame.type === "stream") {
					const snapshot = this.store.getSnapshot();
					const open = snapshot.open;
					if (open === void 0) return;
					if (open.machineName !== frame.machineName || open.sessionId !== frame.sessionId) return;
					const live = snapshot.live;
					if (frame.turn < live.turn || frame.turn === live.turn && frame.step < live.step) return;
					const advanced = frame.turn > live.turn || frame.turn === live.turn && frame.step > live.step;
					const base = advanced ? {
						...noLive(),
						turn: frame.turn,
						step: frame.step
					} : live;
					const shown = frame.kind === "reasoning" ? base.reasoning : base.text;
					if (!advanced && frame.text !== "" && frame.text.length < shown.length && shown.startsWith(frame.text)) return;
					this.update({ live: frame.kind === "reasoning" ? {
						...base,
						reasoning: frame.text
					} : {
						...base,
						text: frame.text
					} });
					return;
				}
				if (frame.type === "command") {
					const delivery = {
						commandId: frame.command.commandId,
						state: frame.command.state,
						expiresAt: frame.command.expiresAt,
						...frame.command.error === void 0 ? {} : { error: frame.command.error }
					};
					const current = this.store.getSnapshot().delivery;
					if (current !== void 0 && current.commandId === frame.command.commandId) {
						this.update({ delivery });
						return;
					}
					this.earlyCommands.delete(frame.command.commandId);
					this.earlyCommands.set(frame.command.commandId, delivery);
					while (this.earlyCommands.size > EARLY_COMMAND_LIMIT) {
						const oldest = this.earlyCommands.keys().next();
						if (oldest.done === true) break;
						this.earlyCommands.delete(oldest.value);
					}
					return;
				}
				this.update({ error: frame.message });
			}
			/**
			* Publish one patch, remembering that this page once held machines.
			*
			* That memory is what makes an empty mirror a reset rather than a fleet that
			* never connected: the empty window itself is only a couple of seconds wide,
			* so the notice has to be raised by the reconnect rather than by what the
			* next read happens to find.
			*/
			update(patch) {
				const next = {
					...this.store.getSnapshot(),
					...patch
				};
				if (next.state.machines.length > 0) this.sawMachines = true;
				this.store.set(next);
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
			sessionSyncLabel: "同步该会话",
			statusTitle: "状态",
			roleServer: "服务器",
			roleClient: "客户端",
			statusListening: "正在监听",
			statusNotListening: "未监听",
			statusLinked: "已连接到服务器",
			statusNeverPublished: "尚未成功发布",
			statusPublishOk: "正在发布",
			statusPublishStalled: "发布停滞（30 秒内无成功发布）",
			statusPublishFailed: "发布失败",
			statusFollowSilent: "follow 未产出事件",
			statusNotConfigured: "未填写服务器地址",
			statusUnlinked: "未连接",
			publishedCount: "已同步会话数",
			panelTitle: "服务器同步工作区",
			timeNow: "刚刚",
			timeMinutes: "分钟前",
			timeHours: "小时前",
			timeDays: "天前",
			timeMonths: "个月前",
			timeYears: "年前",
			panelEmptyServer: "还没有机器连接。请在另一台机器的「会话同步」设置里填入本机地址，并用相同的密码。",
			panelEmptyClient: "本机不是同步服务器。在设置中开启「作为服务器」，或把本机会话同步到已配置的服务器。",
			machineOffline: "离线",
			machineSessions: "个会话",
			openSession: "打开",
			sessionsTitle: "会话",
			sessionsRunning: "个会话进行中",
			searchSessions: "搜索会话",
			listHide: "收起会话列表",
			chatToBottom: "滚动到底部",
			listShow: "展开会话列表",
			searchEmpty: "没有匹配的会话。",
			streamReconnecting: "正在重连…",
			mirrorResetNotice: "同步服务已重启，镜像已清空；各机器会在约 10 秒内重新发布。",
			machineNoSessions: "这台机器还没有发布会话。",
			selectSession: "从列表打开一个会话，即可阅读并接管。",
			noCwd: "未记录目录",
			heroHeadline: "探索未至之境",
			heroPreview: "预览版",
			tabChat: "对话",
			tabTrajectory: "轨迹",
			ledgerEmpty: "这个会话在服务器侧还没有可显示的事件。",
			ledgerEvent: "事件",
			ledgerContent: "内容",
			ledgerTurn: "轮次",
			chromeContext: "上下文占用率",
			chromeModel: "模型",
			chromePreset: "预设",
			chromeSubagents: "子代理",
			chromeSubagentsNone: "没有子代理",
			chromeContextUsed: "上下文已用",
			presetDangerFullAccess: "完全权限",
			statusTurns: "轮",
			statusSteps: "步",
			statusTokens: "tok",
			statusCacheHit: "缓存命中",
			kindTurn: "轮次",
			kindStep: "步骤",
			kindUser: "用户",
			kindSystem: "系统",
			kindAssistant: "助手",
			kindThink: "思考",
			kindTool: "工具",
			kindPolicy: "策略",
			kindTitle: "标题",
			kindCompaction: "压缩",
			kindContext: "上下文",
			kindError: "错误",
			kindOther: "其他",
			tjDuration: "时长",
			tjActualDuration: "按实际时长显示",
			tjEqualWidth: "按等宽显示",
			tjTurns: "轮次",
			tjCalls: "调用",
			tjFoldTurns: "折叠全部轮次",
			tjExpandTurns: "展开全部轮次",
			tjFoldCalls: "折叠全部调用",
			tjExpandCalls: "展开全部调用",
			tjSearch: "搜索事件",
			tjSearchPlaceholder: "搜索事件…",
			tjLaneSystem: "系统",
			tjLaneMessage: "消息",
			tjLaneTool: "工具",
			tjFoldedRows: "已折叠事件",
			tjOverview: "概览",
			tjRequest: "请求",
			tjResponse: "响应",
			tjBody: "正文",
			tjKind: "类型",
			tjStep: "步骤",
			tjSeq: "序号",
			tjTime: "时间",
			tjElapsed: "耗时",
			tjTokens: "输出 tokens",
			tjTotalTokens: "总 tokens",
			tjCacheHit: "缓存命中",
			tjClose: "关闭",
			back: "返回",
			transcriptEmpty: "该会话在服务器侧还没有可显示的内容。",
			transcriptLoading: "读取会话内容…",
			transcriptGone: "该会话已停止同步，内容已从服务器移除。",
			toolResult: "工具结果",
			toolLabelRead: "读取",
			toolLabelEdit: "编辑",
			toolLabelSearch: "搜索",
			toolLabelWeb: "网页",
			toolLabelSubagent: "子代理",
			toolLabelPlan: "计划",
			toolLabelAsk: "提问",
			toolLabelTerminal: "终端",
			toolLabelCode: "代码",
			toolLabelGeneric: "工具调用",
			reasoning: "思考",
			toolArguments: "参数",
			toolRunning: "执行中…",
			toolNoOutput: "（无输出）",
			composerPlaceholder: "在服务器侧接管续聊…",
			composerTarget: "发送到",
			send: "发送",
			sending: "发送中",
			deliveryQueued: "已提交，等待投递",
			deliveryDelivered: "已投递，等待对方确认",
			deliveryAccepted: "对方已接收",
			deliveryFailed: "投递失败",
			deliveryExpired: "已过期，未执行",
			offlineQueueHint: "对方当前离线，提示会排队，直到它回来或过期。",
			copyCode: "复制",
			copiedCode: "已复制",
			footnotes: "脚注",
			stopped: "已停止",
			imageBlock: "图片",
			unknownBlock: "未知内容块",
			jsonTruncated: "已截断，共",
			retryTitle: "模型重试",
			retryScheduled: "等待重试",
			retryActive: "重试中",
			retryStarted: "已重试",
			retryCancelled: "重试已取消",
			retryAttempt: "第",
			retryOf: "次，共",
			retryAttempts: "次",
			retrySeconds: "秒后重试",
			retryDelay: "延迟",
			retryFailure: "失败原因",
			turnFailed: "本轮失败",
			turnMaxTokens: "已达输出上限",
			turnMaxTokensHint: "本轮达到模型输出上限，回答可能被截断。",
			messageCopy: "复制这条消息"
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
			sessionSyncLabel: "Sync this Session",
			statusTitle: "Status",
			roleServer: "Server",
			roleClient: "Client",
			statusListening: "Listening",
			statusNotListening: "Not listening",
			statusLinked: "Connected to server",
			statusNeverPublished: "nothing published yet",
			statusPublishOk: "publishing",
			statusPublishStalled: "publishing stalled (nothing accepted for 30s)",
			statusPublishFailed: "publish failed",
			statusFollowSilent: "follow yields nothing",
			statusNotConfigured: "No server address set",
			statusUnlinked: "Not connected",
			publishedCount: "Published Sessions",
			panelTitle: "Server sync workspace",
			timeNow: "now",
			timeMinutes: "min ago",
			timeHours: "h ago",
			timeDays: "d ago",
			timeMonths: "mo ago",
			timeYears: "y ago",
			panelEmptyServer: "No machine has connected yet. On another machine open Session sync settings, enter this machine's address, and use the same password.",
			panelEmptyClient: "This machine is not the sync server. Turn on \"Act as the server\" in settings, or point Session sync at a configured server.",
			machineOffline: "Offline",
			machineSessions: "Sessions",
			openSession: "Open",
			sessionsTitle: "Sessions",
			sessionsRunning: "running",
			searchSessions: "Search Sessions",
			listHide: "Hide the Session list",
			chatToBottom: "Scroll to bottom",
			listShow: "Show the Session list",
			searchEmpty: "No Session matches.",
			streamReconnecting: "reconnecting…",
			mirrorResetNotice: "The sync service restarted and its mirror is empty; machines re-publish within about 10 seconds.",
			machineNoSessions: "This machine has published no Sessions.",
			selectSession: "Open a Session from the list to read it and take it over.",
			noCwd: "No directory recorded",
			heroHeadline: "Into the Unknown",
			heroPreview: "Preview",
			tabChat: "Chat",
			tabTrajectory: "Trajectory",
			ledgerEmpty: "This Session has no events to show on the server yet.",
			ledgerEvent: "Event",
			ledgerContent: "Content",
			ledgerTurn: "Turn",
			chromeContext: "Context used",
			chromeModel: "Model",
			chromePreset: "Preset",
			chromeSubagents: "Subagents",
			chromeSubagentsNone: "No subagents",
			chromeContextUsed: "Context used",
			presetDangerFullAccess: "Full access",
			statusTurns: "turns",
			statusSteps: "steps",
			statusTokens: "tok",
			statusCacheHit: "cache hit",
			kindTurn: "TURN",
			kindStep: "STEP",
			kindUser: "USER",
			kindSystem: "SYSTEM",
			kindAssistant: "ASSISTANT",
			kindThink: "THINK",
			kindTool: "TOOL",
			kindPolicy: "POLICY",
			kindTitle: "TITLE",
			kindCompaction: "COMPACT",
			kindContext: "CONTEXT",
			kindError: "ERROR",
			kindOther: "OTHER",
			tjDuration: "Duration",
			tjActualDuration: "Use recorded durations",
			tjEqualWidth: "Use equal widths",
			tjTurns: "Turns",
			tjCalls: "Calls",
			tjFoldTurns: "Fold every turn",
			tjExpandTurns: "Expand every turn",
			tjFoldCalls: "Fold every call",
			tjExpandCalls: "Expand every call",
			tjSearch: "Search events",
			tjSearchPlaceholder: "Search events…",
			tjLaneSystem: "System",
			tjLaneMessage: "Message",
			tjLaneTool: "Tool",
			tjFoldedRows: "Folded events",
			tjOverview: "Overview",
			tjRequest: "Request",
			tjResponse: "Response",
			tjBody: "Body",
			tjKind: "Kind",
			tjStep: "Step",
			tjSeq: "Seq",
			tjTime: "Time",
			tjElapsed: "Elapsed",
			tjTokens: "Output tokens",
			tjTotalTokens: "Total tokens",
			tjCacheHit: "Cache hit",
			tjClose: "Close",
			back: "Back",
			transcriptEmpty: "This Session has nothing to show on the server yet.",
			transcriptLoading: "Loading Session…",
			transcriptGone: "This Session stopped syncing and was removed from the server.",
			toolResult: "Tool result",
			toolLabelRead: "Read",
			toolLabelEdit: "Edit",
			toolLabelSearch: "Search",
			toolLabelWeb: "Web",
			toolLabelSubagent: "Subagent",
			toolLabelPlan: "Plan",
			toolLabelAsk: "Question",
			toolLabelTerminal: "Terminal",
			toolLabelCode: "Code",
			toolLabelGeneric: "Tool call",
			reasoning: "Reasoning",
			toolArguments: "Arguments",
			toolRunning: "Running…",
			toolNoOutput: "(no output)",
			composerPlaceholder: "Take over and continue from the server…",
			composerTarget: "Send to",
			send: "Send",
			sending: "Sending",
			deliveryQueued: "Submitted, waiting to be delivered",
			deliveryDelivered: "Delivered, waiting for the machine",
			deliveryAccepted: "Accepted by the machine",
			deliveryFailed: "Delivery failed",
			deliveryExpired: "Expired, not run",
			offlineQueueHint: "This machine is offline; the prompt queues until it returns or expires.",
			copyCode: "Copy",
			copiedCode: "Copied",
			footnotes: "Footnotes",
			stopped: "Stopped",
			imageBlock: "Image",
			unknownBlock: "Unknown content block",
			jsonTruncated: "Truncated, total",
			retryTitle: "Model retry",
			retryScheduled: "Retry scheduled",
			retryActive: "Retrying",
			retryStarted: "Retried",
			retryCancelled: "Retry cancelled",
			retryAttempt: "attempt",
			retryOf: "of",
			retryAttempts: "",
			retrySeconds: "seconds until the next attempt",
			retryDelay: "Delay",
			retryFailure: "Failure",
			turnFailed: "Turn failed",
			turnMaxTokens: "Output limit reached",
			turnMaxTokensHint: "This turn reached the model output limit; the answer may be cut short.",
			messageCopy: "Copy this message"
		};
		//#endregion
		//#region src/client/index.ts
		const name = "dsh-session-sync";
		/** Services this half requires: slot registration and dictionaries. */
		const inject = ["slots", "locale"];
		/**
		* One id for this plugin's centre panel and for its sidebar panel row.
		*
		* `ctx.layout.selectPanel(id)` validates the id against the registered `main`
		* keys, so the panel key and this constant are one contract.
		*/
		const PANEL_ID = "session-sync";
		/**
		* Mount the settings page, the sidebar panel row, and the console.
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