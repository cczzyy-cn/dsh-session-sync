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
		let react_dom = require("react-dom");
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\sync.module.css.mjs
		const css$6 = ".Emn1LG_section{flex-direction:column;gap:14px;padding:4px 0 8px;display:flex}.Emn1LG_lede{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xs-13);margin:0}.Emn1LG_group{flex-direction:column;gap:10px;display:flex}.Emn1LG_groupTitle{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-strong-13);margin:0}.Emn1LG_card{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:10px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}.Emn1LG_field{flex-direction:column;gap:4px;display:flex}.Emn1LG_fieldRow{justify-content:space-between;align-items:center;gap:12px;display:flex}.Emn1LG_fieldText{flex-direction:column;gap:2px;min-width:0;display:flex}.Emn1LG_label{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13)}.Emn1LG_hint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12)}.Emn1LG_pair{grid-template-columns:minmax(0,1fr) 120px;gap:10px;display:grid}.Emn1LG_actions{align-items:center;gap:8px;display:flex}.Emn1LG_saved{color:var(--dsw-alias-state-success-primary);font:var(--dsw-font-xxs-12)}.Emn1LG_dirty{color:var(--dsw-alias-state-warn-primary);font:var(--dsw-font-xxs-12)}.Emn1LG_failed{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12)}.Emn1LG_sessionList{flex-direction:column;max-height:280px;display:flex;overflow-y:auto}.Emn1LG_sessionRow{justify-content:space-between;align-items:center;gap:12px;min-height:40px;padding:5px 2px;display:flex}.Emn1LG_sessionRow+.Emn1LG_sessionRow{border-top:.5px solid var(--dsw-alias-border-l1)}.Emn1LG_sessionText{flex-direction:column;gap:2px;min-width:0;display:flex}.Emn1LG_sessionTitle{color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.Emn1LG_sessionMeta{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);align-items:center;gap:6px;display:flex}.Emn1LG_empty{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);padding:12px 2px}.Emn1LG_status{flex-wrap:wrap;gap:6px 18px;display:flex}.Emn1LG_statusItem{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);align-items:center;gap:6px;display:flex}.Emn1LG_statusValue{color:var(--dsw-alias-label-primary)}.Emn1LG_statusBad{color:var(--dsw-alias-state-error-primary)}.Emn1LG_statusGood{color:var(--dsw-alias-state-success-primary)}.Emn1LG_panel{height:100%;min-height:0;color:var(--dsw-alias-label-primary);display:flex}.Emn1LG_listPane{background:var(--dsw-specific-sidebar-fill);border-right:.5px solid var(--dsw-alias-border-l3);flex-direction:column;flex:none;width:280px;min-height:0;display:flex}.Emn1LG_listHead{flex-direction:column;flex:none;gap:6px;padding:10px 10px 8px;display:flex}.Emn1LG_panel ::placeholder,.Emn1LG_panel input::placeholder,.Emn1LG_panel textarea::placeholder{color:var(--dsw-alias-label-caption);opacity:1}.Emn1LG_listToggle{color:var(--dsw-alias-button-info-fill)}.Emn1LG_panel[data-list=hidden] .Emn1LG_listPane{display:none}.Emn1LG_listStatus{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.Emn1LG_list{flex-direction:column;flex:1;gap:3px;min-height:0;margin-right:2px;padding:0 6px 8px;display:flex;overflow-y:auto}.Emn1LG_notice{background:var(--dsw-alias-state-warn-tertiary);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11);border-radius:8px;align-items:flex-start;gap:6px;margin:2px 2px 6px;padding:6px 8px;display:flex}.Emn1LG_noticeText{flex:1;min-width:0}.Emn1LG_noticeClose{width:14px;height:14px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:4px;flex:none;justify-content:center;align-items:center;padding:0;font-size:13px;line-height:13px;display:inline-flex}.Emn1LG_noticeClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_treeRow,.Emn1LG_treeSession{box-sizing:border-box;width:100%;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;user-select:none;transition:background var(--ds-transition-duration-fast) var(--ds-ease-in-out);background:0 0;border:0;border-radius:8px;align-items:center;gap:6px;padding:0 8px;display:flex}.Emn1LG_treeRow{height:34px}.Emn1LG_treeSession{gap:0;height:32px}.Emn1LG_treeRow:hover,.Emn1LG_treeSession:hover,.Emn1LG_treeSessionSelected{background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_treeRow:focus-visible,.Emn1LG_treeSession:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.Emn1LG_panel [data-level=\"1\"]{padding-left:24px}.Emn1LG_panel [data-level=\"2\"]{padding-left:40px}.Emn1LG_treeSlot{width:16px;height:20px;color:var(--dsw-alias-label-tertiary);flex:none;justify-content:center;align-items:center;display:inline-flex}.Emn1LG_treeChevron{color:var(--dsw-alias-label-caption);display:none}.Emn1LG_treeRow:hover .Emn1LG_treeFolder,.Emn1LG_treeRow:focus-visible .Emn1LG_treeFolder{display:none}.Emn1LG_treeRow:hover .Emn1LG_treeChevron,.Emn1LG_treeRow:focus-visible .Emn1LG_treeChevron{display:inline-flex}.Emn1LG_arrowOpen{transform:rotate(90deg)}.Emn1LG_treeChevron svg{transition:transform .15s var(--ds-ease-in-out)}.Emn1LG_rowTitle{min-width:0;font:var(--dsw-font-s-14);text-overflow:ellipsis;white-space:nowrap;flex:1;overflow:hidden}.Emn1LG_treeSession .Emn1LG_rowTitle{margin:0 6px 0 4px}.Emn1LG_rowTime{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);flex:none}.Emn1LG_treeRowDim .Emn1LG_rowTitle,.Emn1LG_treeRowDim .Emn1LG_rowTime{color:var(--dsw-alias-label-secondary)}.Emn1LG_heroRoot{justify-content:center;align-items:center;min-width:0;height:100%;padding:0 24px;display:flex}.Emn1LG_heroStack{flex-direction:column;align-items:center;gap:12px;width:100%;max-width:calc(min(920px,100%) + 32px);display:flex}.Emn1LG_heroHeadline{color:var(--dsw-alias-label-primary);flex-wrap:wrap;justify-content:center;align-items:center;gap:12px 10px;font-size:26px;font-weight:500;line-height:32px;display:flex}.Emn1LG_heroFish{color:var(--dsw-alias-label-primary);flex:none;justify-content:center;align-items:center;display:inline-flex}.Emn1LG_heroTitleGroup{flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 7px;min-width:0;display:flex}.Emn1LG_heroBadge{border:.5px solid var(--dsw-alias-interactive-bg-hover);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary-bluish);font-family:var(--ds-font-family-code);white-space:nowrap;border-radius:24px;align-self:flex-start;margin-top:2px;padding:1px 7px 0;font-size:12px;font-weight:500;line-height:18px}.Emn1LG_heroHint{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);text-align:center;margin:0}.Emn1LG_tjRoot{width:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:1;display:flex;overflow:hidden}.Emn1LG_tjToolbar{z-index:4;box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex:none;align-items:center;gap:2px;height:32px;padding:0 6px;display:flex;position:sticky;top:0}.Emn1LG_tjToggle{height:20px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);cursor:pointer;background:0 0;border:0;border-radius:3px;flex:none;align-items:center;gap:4px;padding:0 7px;display:inline-flex}.Emn1LG_tjToggleIcon{stroke:currentColor;stroke-width:1.25px;stroke-linecap:round;stroke-linejoin:round;flex:none;width:12px;height:12px}.Emn1LG_tjToggle:hover,.Emn1LG_tjToggle[aria-pressed=true],.Emn1LG_tjAction:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_tjToggle:focus-visible,.Emn1LG_tjAction:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary);outline-offset:1px}.Emn1LG_tjAction{height:20px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);cursor:pointer;background:0 0;border:0;border-radius:3px;flex:none;align-items:center;gap:4px;padding:0 5px;display:inline-flex}.Emn1LG_tjActionIcon{color:var(--dsw-alias-label-tertiary);font:14px/14px var(--ds-font-family-code)}.Emn1LG_tjSearch{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-2);min-width:84px;height:22px;color:var(--dsw-alias-label-caption);border-radius:4px;flex:0 164px;align-items:center;gap:4px;margin-left:auto;padding:0 6px;display:flex}.Emn1LG_tjSearch:focus-within{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-1)}.Emn1LG_tjSearchIcon{flex:none}.Emn1LG_tjSearchInput{width:100%;min-width:0;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12);background:0 0;border:0;outline:0;padding:0}.Emn1LG_tjSearchInput::placeholder{color:var(--dsw-alias-label-caption)}.Emn1LG_tjStrip{border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none}.Emn1LG_tjPlot{background:var(--dsw-alias-bg-layer-2);grid-template-columns:44px minmax(0,1fr);height:50px;display:grid;overflow:hidden}.Emn1LG_tjLaneLabels{border-right:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-caption);font-size:10px;line-height:1;position:relative}.Emn1LG_tjLaneLabels span{justify-content:flex-end;align-items:center;height:8px;display:flex;position:absolute;right:3px}.Emn1LG_tjLaneLabels span:first-child{top:7px}.Emn1LG_tjLaneLabels span:nth-child(2){top:21px}.Emn1LG_tjLaneLabels span:nth-child(3){top:35px}.Emn1LG_tjTrack{position:relative;overflow:hidden}.Emn1LG_tjLanes,.Emn1LG_tjTurnBoundaries{position:absolute;inset:7px 0}.Emn1LG_tjSpan{top:calc(var(--tj-span-lane) * 14px);left:var(--tj-span-left);width:max(2px, var(--tj-span-width));background:var(--dsw-alias-label-secondary);opacity:.78;cursor:pointer;border:0;border-radius:1px;min-width:2px;height:8px;padding:0;position:absolute}.Emn1LG_tjSpan[data-kind=user]{background:var(--dsw-alias-state-business-primary)}.Emn1LG_tjSpan[data-kind=assistant],.Emn1LG_tjSpan[data-kind=think]{background:var(--dsw-alias-label-primary);opacity:1}.Emn1LG_tjSpan[data-kind=tool]{background:var(--dsw-alias-state-warn-label);opacity:1}.Emn1LG_tjSpan[data-kind=context]{background:var(--dsw-alias-state-success-primary)}.Emn1LG_tjSpan[data-error=true]{background:var(--dsw-alias-state-error-primary)}.Emn1LG_tjSpan[data-selected=false]{opacity:.14}.Emn1LG_tjSpan[data-current=true]{z-index:1;box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary)}.Emn1LG_tjTurnBoundary{background:var(--dsw-alias-border-l2);width:.5px;position:absolute;top:0;bottom:0}.Emn1LG_tjSplit{background:var(--dsw-alias-bg-layer-1);flex:1;min-width:0;min-height:0;display:flex;overflow:hidden}.Emn1LG_tjTablePane{flex:1;min-width:0;overflow:hidden auto}.Emn1LG_ledgerTable tbody tr[data-selected=true]{background:var(--dsw-alias-interactive-bg-active)}.Emn1LG_ledgerTable tbody tr[data-dimmed=true]{opacity:.3}.Emn1LG_ledgerTable tbody tr[data-folded=true]{cursor:pointer}.Emn1LG_ledgerTable tbody tr[data-folded=true] td{height:20px}.Emn1LG_tjFolded{min-width:0;color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:12px;line-height:16px;display:flex}.Emn1LG_tjFoldedEllipsis{color:var(--dsw-alias-label-tertiary);flex:none;font-weight:600}.Emn1LG_tjFoldedText{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.Emn1LG_tjDetails{border-left:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);flex-direction:column;flex:none;width:clamp(320px,38%,440px);min-width:0;min-height:0;display:flex}.Emn1LG_tjDetailsHeader{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);flex:none;justify-content:space-between;align-items:center;height:42px;padding:0 8px 0 12px;display:flex}.Emn1LG_tjDetailsTitle{align-items:center;gap:8px;min-width:0;display:flex}.Emn1LG_tjDetailsDot{corner-shape:round;background:var(--dsw-alias-label-secondary);border-radius:50%;flex:none;width:5px;height:5px}.Emn1LG_tjDetailsName{font:500 12px/16px var(--ds-font-family-code);flex:none}.Emn1LG_tjDetailsLocation{min-width:0;color:var(--dsw-alias-label-tertiary);font:11px/16px var(--ds-font-family-code);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.Emn1LG_tjClose{width:28px;height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;border-radius:6px;flex:none;justify-content:center;align-items:center;padding:0;font-size:18px;line-height:18px;display:inline-flex}.Emn1LG_tjClose:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_tjDetailTabs{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);white-space:nowrap;flex:none;gap:1px;width:100%;height:34px;padding:0 8px;display:flex;overflow-x:auto}.Emn1LG_tjDetailTab{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xs-13);cursor:pointer;background:0 0;border:0;flex:none;padding:0 9px;position:relative}.Emn1LG_tjDetailTab:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_tjDetailTabActive{color:var(--dsw-alias-state-business-primary)}.Emn1LG_tjDetailTabActive:after{background:var(--dsw-alias-state-business-primary);content:\"\";border-radius:1px 1px 0 0;height:2px;position:absolute;bottom:0;left:9px;right:9px}.Emn1LG_tjDetailBody{flex:1;min-height:0;overflow:hidden auto}.Emn1LG_tjOverview{font:var(--dsw-font-xs-13);margin:0;padding:8px 0}.Emn1LG_tjOverview>div{grid-template-columns:94px minmax(0,1fr);align-items:center;min-height:22px;padding:0 14px;display:grid}.Emn1LG_tjOverview dt{color:var(--dsw-alias-label-tertiary)}.Emn1LG_tjOverview dd{min-width:0;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;margin:0;overflow:hidden}.Emn1LG_tjPayload{box-sizing:border-box;overflow-wrap:anywhere;background:var(--dsw-alias-markdown-code-block);min-height:100%;color:var(--dsw-alias-label-primary);font:12px/19px var(--ds-font-family-code);tab-size:2;white-space:pre-wrap;margin:0;padding:14px}.Emn1LG_tjMarkdown{padding:6px 14px 8px}.Emn1LG_viewPane{background:var(--dsw-alias-bg-base);flex-direction:column;flex:1;min-width:0;min-height:0;display:flex}.Emn1LG_viewHeader{border-bottom:.5px solid var(--dsw-alias-border-l3);flex-direction:column;flex:none;padding:10px 20px 0;display:flex}.Emn1LG_viewTitleRow{align-items:center;gap:8px;min-width:0;min-height:30px;display:flex}.Emn1LG_viewSpacer{flex:1}.Emn1LG_viewTabs{z-index:1;gap:36px;margin-top:10px;padding-left:8px;display:flex;position:relative}.Emn1LG_viewTab{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;padding:0 0 9px;font-size:13px;font-weight:500;line-height:16px;position:relative}.Emn1LG_viewTab:after{content:\"\";background:0 0;border-radius:2px;height:2px;position:absolute;bottom:-1px;left:0;right:0}.Emn1LG_viewTabActive{color:var(--dsw-alias-state-business-primary)}.Emn1LG_viewTabActive:after{background:var(--dsw-alias-state-business-primary)}.Emn1LG_viewTab:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.Emn1LG_chromeCluster{flex:none;align-items:center;gap:8px;min-width:0;display:flex}.Emn1LG_chromeChip{border:.5px solid var(--dsw-alias-border-l2);corner-shape:round;max-width:200px;min-height:24px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11);text-overflow:ellipsis;white-space:nowrap;border-radius:999px;align-items:center;gap:4px;padding:0 8px;display:inline-flex;overflow:hidden}.Emn1LG_ringRoot{flex:none;display:inline-flex;position:relative}.Emn1LG_ringTrigger{corner-shape:round;cursor:pointer;background:0 0;border:0;border-radius:50%;place-items:center;width:20px;height:20px;padding:0;display:grid}.Emn1LG_ringTrigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_ringTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.Emn1LG_ringTrack{fill:none;stroke:var(--dsw-alias-border-l3);stroke-width:2px}.Emn1LG_ringFill{fill:none;stroke:var(--dsw-alias-state-business-primary);stroke-width:2px;stroke-linecap:round}.Emn1LG_ringPanel{z-index:9;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);white-space:nowrap;border:0;border-radius:10px;flex-direction:column;gap:2px;padding:8px 10px;display:flex;position:absolute;top:26px;right:0}.Emn1LG_ringHeadline{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12)}.Emn1LG_ringFigures{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11)}.Emn1LG_statusRow{width:100%;max-width:calc(min(920px,100%) + 32px);color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxxs-11);font-variant-numeric:tabular-nums;flex-wrap:wrap;justify-content:center;gap:12px;padding:6px 0 0;display:flex}.Emn1LG_ledger{background:var(--dsw-alias-bg-layer-1);flex:1;min-height:0;margin-right:2px;overflow-y:auto}.Emn1LG_ledgerTable{border-spacing:0;table-layout:fixed;width:100%;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xxs-12)}.Emn1LG_ledgerTable th{z-index:3;box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-sidebar-fill);height:30px;color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);text-align:left;text-overflow:ellipsis;white-space:nowrap;padding:0 8px;font-weight:500;position:sticky;top:0;overflow:hidden}.Emn1LG_ledgerEventHead{text-align:right;width:122px;padding-right:4px}.Emn1LG_ledgerTable td{box-sizing:border-box;border-bottom:.5px solid var(--dsw-alias-border-l1);text-overflow:ellipsis;white-space:nowrap;height:30px;padding:0 8px;overflow:hidden}.Emn1LG_ledgerTable tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}.Emn1LG_ledgerEventCell{text-align:right;padding-left:36px;padding-right:4px;position:relative;overflow:visible}.Emn1LG_ledgerRail{z-index:4;background:var(--dsw-alias-border-l3);pointer-events:none;width:2px;position:absolute;top:-1px;bottom:-1px;left:0}.Emn1LG_ledgerTable tbody tr[data-error=true] .Emn1LG_ledgerRail{background:var(--dsw-alias-state-error-primary)}.Emn1LG_ledgerTable tbody tr[data-turn-start=true] td:before{z-index:1;background:var(--dsw-alias-border-l1);content:\"\";pointer-events:none;height:2px;position:absolute;top:0;left:0;right:0;transform:translateY(-50%)}.Emn1LG_ledgerTable tbody tr[data-turn-start=true]:first-child td:before{content:none}.Emn1LG_ledgerTurnLabel{z-index:3;box-sizing:border-box;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font:8px/10px var(--ds-font-family-code);font-variant-numeric:tabular-nums;white-space:nowrap;border-radius:0 0 2px;align-items:center;padding:1px 5px;display:inline-grid;position:absolute;top:0;left:0}.Emn1LG_ledgerKindSlot{justify-content:flex-end;align-items:center;width:76px;display:inline-flex}.Emn1LG_ledgerKind{box-sizing:border-box;letter-spacing:.035em;user-select:none;border:1px solid #0000;border-radius:4px;align-items:center;height:19px;padding:0 5px;font-size:10px;font-weight:650;line-height:16px;display:inline-flex}.Emn1LG_kind_user{color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.Emn1LG_kind_assistant,.Emn1LG_kind_think{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}.Emn1LG_kind_tool{color:var(--dsw-alias-state-warn-label);background:var(--dsw-alias-state-warn-tertiary)}.Emn1LG_kind_error{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}.Emn1LG_kind_system,.Emn1LG_kind_policy,.Emn1LG_kind_title,.Emn1LG_kind_other,.Emn1LG_kind_compaction{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-module-platform)}.Emn1LG_kind_turn,.Emn1LG_kind_step,.Emn1LG_kind_context{color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-layer-2)}.Emn1LG_ledgerContentCell{padding-left:4px}.Emn1LG_ledgerText{color:var(--dsw-alias-label-primary)}.Emn1LG_ledgerMono{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:12px}.Emn1LG_ledgerResult{grid-template-columns:clamp(180px,36cqw,480px) minmax(0,1fr);align-items:center;gap:8px;min-width:0;display:grid}.Emn1LG_ledgerResult>*{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.Emn1LG_ledgerErrorText{color:var(--dsw-alias-state-error-primary)}.Emn1LG_ledgerDuration{color:var(--dsw-alias-label-caption);font:var(--dsw-font-xxxs-11);font-variant-numeric:tabular-nums;margin-left:8px}.Emn1LG_viewTitle{min-width:0;font:var(--dsw-font-s-strong-14);text-overflow:ellipsis;white-space:nowrap;flex:0 auto;margin:0;overflow:hidden}.Emn1LG_viewMachine{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxs-12);white-space:nowrap;flex:none}.Emn1LG_viewScroll{flex:1;min-height:0;margin-right:2px;padding:16px 32px;overflow-y:auto}.Emn1LG_officialPane{flex-direction:column;flex:1;min-height:0;display:flex;overflow:hidden}.Emn1LG_officialPane>*{flex:1;min-height:0}.Emn1LG_viewColumn{flex-direction:column;width:100%;max-width:min(920px,100%);margin:0 auto;display:flex}.Emn1LG_viewColumn>*+*{margin-top:16px}.Emn1LG_userRow{flex-direction:column;align-items:flex-end;gap:6px;display:flex}.Emn1LG_bubble{max-width:min(calc(var(--dsh-chat-content-width,748px) * .702), 82%);background:var(--dsw-specific-bubble);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;border-radius:22px;padding:10px 16px}.Emn1LG_assistantRow{flex-direction:column;gap:16px;min-width:0;display:flex}.Emn1LG_messageActions{margin-top:4px;margin-left:-6px}.Emn1LG_stopped,.Emn1LG_mediaChip{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary);border-radius:6px;align-self:flex-start;padding:0 6px;font-size:11px;line-height:18px}.Emn1LG_action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.Emn1LG_action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}.Emn1LG_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.Emn1LG_timeStart{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px}.Emn1LG_timeEnd{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap}.Emn1LG_noticeRow{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));grid-template-columns:10px minmax(0,1fr) auto;align-items:start;gap:8px;padding:2px 0;display:grid}.Emn1LG_noticeDot{margin-top:5px}.Emn1LG_noticeCopy{overflow-wrap:anywhere;min-width:0}.Emn1LG_noticeTitleError{color:var(--dsw-alias-state-error-primary);margin-right:6px;font-weight:600}.Emn1LG_noticeTitleWarn{color:var(--dsw-alias-state-warn-primary);margin-right:6px;font-weight:600}.Emn1LG_noticeMessage{color:var(--dsw-alias-label-secondary)}.Emn1LG_noticeCode{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-markdown-code-block-small)}.Emn1LG_retryRow{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}.Emn1LG_retrySummary{width:fit-content;color:inherit;cursor:pointer;user-select:none;border-radius:3px;align-items:center;gap:7px;padding:2px 0;list-style:none;display:inline-flex}.Emn1LG_retrySummary::-webkit-details-marker{display:none}.Emn1LG_retrySummary:after{content:\"\";opacity:.8;border-bottom:1.5px solid;border-right:1.5px solid;width:6px;height:6px;transition:transform .12s;transform:rotate(-45deg)}.Emn1LG_retrySummary:hover{color:var(--dsw-alias-label-secondary)}.Emn1LG_retrySummary:focus-visible{outline:1.5px solid var(--dsw-alias-button-info-fill);outline-offset:2px}.Emn1LG_retryText{color:inherit}.Emn1LG_retryRow[data-active] .Emn1LG_retryText{background:linear-gradient(90deg, var(--dsw-alias-label-tertiary) 0%, var(--dsw-alias-label-tertiary) 40%, var(--dsw-alias-label-secondary) 50%, var(--dsw-alias-label-tertiary) 60%, var(--dsw-alias-label-tertiary) 100%);color:#0000;background-position:100%;background-size:200% 100%;background-clip:text;animation:1.6s ease-in-out infinite Emn1LG_dsh-sync-retry-shimmer}@keyframes Emn1LG_dsh-sync-retry-shimmer{0%{background-position:100%}to{background-position:0%}}@media (prefers-reduced-motion:reduce){.Emn1LG_retryRow[data-active] .Emn1LG_retryText{color:inherit;background:0 0;animation:none}}.Emn1LG_retryRow[open] .Emn1LG_retrySummary:after{transform:rotate(45deg)}.Emn1LG_retryDetails{overflow-wrap:anywhere;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));gap:2px;margin-top:3px;padding-left:14px;display:grid}.Emn1LG_retryDetailLabel{color:var(--dsw-alias-label-secondary)}.Emn1LG_toBottomSlot{z-index:2;pointer-events:none;justify-content:flex-end;height:0;padding-right:8px;display:flex;position:sticky;bottom:16px}.Emn1LG_toBottom{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);corner-shape:round;width:34px;height:34px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-button-floating-fill);box-shadow:var(--dsw-elevation-panel);cursor:pointer;pointer-events:auto;border:0;border-radius:100px;justify-content:center;align-items:center;margin-top:-34px;padding:0;display:flex}.Emn1LG_toBottom:hover{background:var(--dsw-alias-button-floating-hover)}.Emn1LG_composerRoot{flex-direction:column;flex:none;align-items:center;padding:0 16px 8px;display:flex}.Emn1LG_composerCard{box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);background:var(--dsw-specific-input-major);width:100%;max-width:calc(min(920px,100%) + 32px);box-shadow:var(--dsw-elevation-soft);font:var(--dsw-font-s-14);border:0;border-radius:22px;flex-direction:column;gap:12px;padding-top:8px;display:flex}.Emn1LG_composerText{box-sizing:border-box;width:100%;min-height:44px;max-height:200px;color:var(--dsw-alias-label-primary);font:inherit;resize:none;background:0 0;border:0;margin:0;padding:8px 16px 0}.Emn1LG_composerText::placeholder{color:var(--dsw-alias-placeholder)}.Emn1LG_composerText:focus-visible{outline:none}.Emn1LG_composerBar{align-items:center;gap:8px;padding:0 10px 10px 16px;display:flex}.Emn1LG_composerTarget{color:var(--dsw-alias-label-tertiary);font:var(--dsw-font-xxxs-11);flex:none}.Emn1LG_composerDelivery{color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-11)}.Emn1LG_composerOffline{color:var(--dsw-alias-state-warn-label);font:var(--dsw-font-xxxs-11)}.Emn1LG_composerSpacer{flex:1}.Emn1LG_sendButton{corner-shape:round;background:var(--dsw-alias-button-info-fill);color:#fff;cursor:pointer;width:34px;height:34px;transition:background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);border:0;border-radius:999px;flex:none;place-items:center;display:grid}.Emn1LG_sendButton:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}.Emn1LG_sendButton:disabled{opacity:.4;cursor:default}.Emn1LG_sendButton:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-state-business-primary);outline:none}.Emn1LG_error{color:var(--dsw-alias-state-error-primary);font:var(--dsw-font-xxs-12);margin-bottom:10px}.Emn1LG_narrowOnly{display:none}@media (width<=719px){.Emn1LG_listPane{border-right:0;width:100%}.Emn1LG_panel[data-open=true] .Emn1LG_listPane,.Emn1LG_panel[data-open=false] .Emn1LG_viewPane{display:none}.Emn1LG_narrowOnly{display:inline-flex}}@media (prefers-reduced-motion:reduce){.Emn1LG_treeRow,.Emn1LG_treeSession,.Emn1LG_treeChevron svg,.Emn1LG_sendButton{transition:none}}";
		const tagId$6 = "dsh-session-sync/sync.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$6) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId$6;
			tag.textContent = css$6;
			document.head.appendChild(tag);
		}
		var sync_module_css_default = {
			"action": "Emn1LG_action",
			"actions": "Emn1LG_actions",
			"arrowOpen": "Emn1LG_arrowOpen",
			"assistantRow": "Emn1LG_assistantRow",
			"bubble": "Emn1LG_bubble",
			"card": "Emn1LG_card",
			"chromeChip": "Emn1LG_chromeChip",
			"chromeCluster": "Emn1LG_chromeCluster",
			"composerBar": "Emn1LG_composerBar",
			"composerCard": "Emn1LG_composerCard",
			"composerDelivery": "Emn1LG_composerDelivery",
			"composerOffline": "Emn1LG_composerOffline",
			"composerRoot": "Emn1LG_composerRoot",
			"composerSpacer": "Emn1LG_composerSpacer",
			"composerTarget": "Emn1LG_composerTarget",
			"composerText": "Emn1LG_composerText",
			"dirty": "Emn1LG_dirty",
			"dsh-sync-retry-shimmer": "Emn1LG_dsh-sync-retry-shimmer",
			"empty": "Emn1LG_empty",
			"error": "Emn1LG_error",
			"failed": "Emn1LG_failed",
			"field": "Emn1LG_field",
			"fieldRow": "Emn1LG_fieldRow",
			"fieldText": "Emn1LG_fieldText",
			"group": "Emn1LG_group",
			"groupTitle": "Emn1LG_groupTitle",
			"heroBadge": "Emn1LG_heroBadge",
			"heroFish": "Emn1LG_heroFish",
			"heroHeadline": "Emn1LG_heroHeadline",
			"heroHint": "Emn1LG_heroHint",
			"heroRoot": "Emn1LG_heroRoot",
			"heroStack": "Emn1LG_heroStack",
			"heroTitleGroup": "Emn1LG_heroTitleGroup",
			"hint": "Emn1LG_hint",
			"kind_assistant": "Emn1LG_kind_assistant",
			"kind_compaction": "Emn1LG_kind_compaction",
			"kind_context": "Emn1LG_kind_context",
			"kind_error": "Emn1LG_kind_error",
			"kind_other": "Emn1LG_kind_other",
			"kind_policy": "Emn1LG_kind_policy",
			"kind_step": "Emn1LG_kind_step",
			"kind_system": "Emn1LG_kind_system",
			"kind_think": "Emn1LG_kind_think",
			"kind_title": "Emn1LG_kind_title",
			"kind_tool": "Emn1LG_kind_tool",
			"kind_turn": "Emn1LG_kind_turn",
			"kind_user": "Emn1LG_kind_user",
			"label": "Emn1LG_label",
			"lede": "Emn1LG_lede",
			"ledger": "Emn1LG_ledger",
			"ledgerContentCell": "Emn1LG_ledgerContentCell",
			"ledgerDuration": "Emn1LG_ledgerDuration",
			"ledgerErrorText": "Emn1LG_ledgerErrorText",
			"ledgerEventCell": "Emn1LG_ledgerEventCell",
			"ledgerEventHead": "Emn1LG_ledgerEventHead",
			"ledgerKind": "Emn1LG_ledgerKind",
			"ledgerKindSlot": "Emn1LG_ledgerKindSlot",
			"ledgerMono": "Emn1LG_ledgerMono",
			"ledgerRail": "Emn1LG_ledgerRail",
			"ledgerResult": "Emn1LG_ledgerResult",
			"ledgerTable": "Emn1LG_ledgerTable",
			"ledgerText": "Emn1LG_ledgerText",
			"ledgerTurnLabel": "Emn1LG_ledgerTurnLabel",
			"list": "Emn1LG_list",
			"listHead": "Emn1LG_listHead",
			"listPane": "Emn1LG_listPane",
			"listStatus": "Emn1LG_listStatus",
			"listToggle": "Emn1LG_listToggle",
			"mediaChip": "Emn1LG_mediaChip",
			"messageActions": "Emn1LG_messageActions",
			"narrowOnly": "Emn1LG_narrowOnly",
			"notice": "Emn1LG_notice",
			"noticeClose": "Emn1LG_noticeClose",
			"noticeCode": "Emn1LG_noticeCode",
			"noticeCopy": "Emn1LG_noticeCopy",
			"noticeDot": "Emn1LG_noticeDot",
			"noticeMessage": "Emn1LG_noticeMessage",
			"noticeRow": "Emn1LG_noticeRow",
			"noticeText": "Emn1LG_noticeText",
			"noticeTitleError": "Emn1LG_noticeTitleError",
			"noticeTitleWarn": "Emn1LG_noticeTitleWarn",
			"officialPane": "Emn1LG_officialPane",
			"pair": "Emn1LG_pair",
			"panel": "Emn1LG_panel",
			"retryDetailLabel": "Emn1LG_retryDetailLabel",
			"retryDetails": "Emn1LG_retryDetails",
			"retryRow": "Emn1LG_retryRow",
			"retrySummary": "Emn1LG_retrySummary",
			"retryText": "Emn1LG_retryText",
			"ringFigures": "Emn1LG_ringFigures",
			"ringFill": "Emn1LG_ringFill",
			"ringHeadline": "Emn1LG_ringHeadline",
			"ringPanel": "Emn1LG_ringPanel",
			"ringRoot": "Emn1LG_ringRoot",
			"ringTrack": "Emn1LG_ringTrack",
			"ringTrigger": "Emn1LG_ringTrigger",
			"rowTime": "Emn1LG_rowTime",
			"rowTitle": "Emn1LG_rowTitle",
			"saved": "Emn1LG_saved",
			"section": "Emn1LG_section",
			"sendButton": "Emn1LG_sendButton",
			"sessionList": "Emn1LG_sessionList",
			"sessionMeta": "Emn1LG_sessionMeta",
			"sessionRow": "Emn1LG_sessionRow",
			"sessionText": "Emn1LG_sessionText",
			"sessionTitle": "Emn1LG_sessionTitle",
			"status": "Emn1LG_status",
			"statusBad": "Emn1LG_statusBad",
			"statusGood": "Emn1LG_statusGood",
			"statusItem": "Emn1LG_statusItem",
			"statusRow": "Emn1LG_statusRow",
			"statusValue": "Emn1LG_statusValue",
			"stopped": "Emn1LG_stopped",
			"timeEnd": "Emn1LG_timeEnd",
			"timeStart": "Emn1LG_timeStart",
			"tjAction": "Emn1LG_tjAction",
			"tjActionIcon": "Emn1LG_tjActionIcon",
			"tjClose": "Emn1LG_tjClose",
			"tjDetailBody": "Emn1LG_tjDetailBody",
			"tjDetailTab": "Emn1LG_tjDetailTab",
			"tjDetailTabActive": "Emn1LG_tjDetailTabActive",
			"tjDetailTabs": "Emn1LG_tjDetailTabs",
			"tjDetails": "Emn1LG_tjDetails",
			"tjDetailsDot": "Emn1LG_tjDetailsDot",
			"tjDetailsHeader": "Emn1LG_tjDetailsHeader",
			"tjDetailsLocation": "Emn1LG_tjDetailsLocation",
			"tjDetailsName": "Emn1LG_tjDetailsName",
			"tjDetailsTitle": "Emn1LG_tjDetailsTitle",
			"tjFolded": "Emn1LG_tjFolded",
			"tjFoldedEllipsis": "Emn1LG_tjFoldedEllipsis",
			"tjFoldedText": "Emn1LG_tjFoldedText",
			"tjLaneLabels": "Emn1LG_tjLaneLabels",
			"tjLanes": "Emn1LG_tjLanes",
			"tjMarkdown": "Emn1LG_tjMarkdown",
			"tjOverview": "Emn1LG_tjOverview",
			"tjPayload": "Emn1LG_tjPayload",
			"tjPlot": "Emn1LG_tjPlot",
			"tjRoot": "Emn1LG_tjRoot",
			"tjSearch": "Emn1LG_tjSearch",
			"tjSearchIcon": "Emn1LG_tjSearchIcon",
			"tjSearchInput": "Emn1LG_tjSearchInput",
			"tjSpan": "Emn1LG_tjSpan",
			"tjSplit": "Emn1LG_tjSplit",
			"tjStrip": "Emn1LG_tjStrip",
			"tjTablePane": "Emn1LG_tjTablePane",
			"tjToggle": "Emn1LG_tjToggle",
			"tjToggleIcon": "Emn1LG_tjToggleIcon",
			"tjToolbar": "Emn1LG_tjToolbar",
			"tjTrack": "Emn1LG_tjTrack",
			"tjTurnBoundaries": "Emn1LG_tjTurnBoundaries",
			"tjTurnBoundary": "Emn1LG_tjTurnBoundary",
			"toBottom": "Emn1LG_toBottom",
			"toBottomSlot": "Emn1LG_toBottomSlot",
			"treeChevron": "Emn1LG_treeChevron",
			"treeFolder": "Emn1LG_treeFolder",
			"treeRow": "Emn1LG_treeRow",
			"treeRowDim": "Emn1LG_treeRowDim",
			"treeSession": "Emn1LG_treeSession",
			"treeSessionSelected": "Emn1LG_treeSessionSelected",
			"treeSlot": "Emn1LG_treeSlot",
			"userRow": "Emn1LG_userRow",
			"viewColumn": "Emn1LG_viewColumn",
			"viewHeader": "Emn1LG_viewHeader",
			"viewMachine": "Emn1LG_viewMachine",
			"viewPane": "Emn1LG_viewPane",
			"viewScroll": "Emn1LG_viewScroll",
			"viewSpacer": "Emn1LG_viewSpacer",
			"viewTab": "Emn1LG_viewTab",
			"viewTabActive": "Emn1LG_viewTabActive",
			"viewTabs": "Emn1LG_viewTabs",
			"viewTitle": "Emn1LG_viewTitle",
			"viewTitleRow": "Emn1LG_viewTitleRow"
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
			/**
			* The one consumer told what the mirror reported as it arrives.
			*
			* Held rather than fanned out: it is the console's shipped-renderer mirror,
			* which is a view of the same stream, not a second reader of it.
			*/
			observer;
			/** The running flag already reported to that consumer. */
			reportedRunning;
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
			/**
			* Register the one consumer told what the mirror reports as it arrives.
			*
			* Notifications are delivered before the store publishes the same fact: the
			* shipped-renderer pane binds its Session reference from the opening, so its
			* first render after the change already has a Session to draw and never has
			* to render a reference that has just been released.
			* @param observer - the consumer; at most one is held at a time.
			* @returns an idempotent disposer that detaches it.
			*/
			observe(observer) {
				this.observer = observer;
				return () => {
					if (this.observer === observer) this.observer = void 0;
				};
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
				const open = {
					machineName,
					sessionId
				};
				this.reportedRunning = void 0;
				this.notify((observer) => {
					observer.opened(open);
				});
				this.update({
					open,
					transcript: void 0,
					loadingTranscript: true,
					live: noLive(),
					delivery: void 0
				});
				try {
					const { transcript } = await getJson(`${ROUTE_PREFIX}/transcript?machine=${encodeURIComponent(machineName)}&session=${encodeURIComponent(sessionId)}`);
					this.notify((observer) => {
						observer.loaded(open, transcript);
					});
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
				this.notify((observer) => {
					observer.closed();
				});
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
					this.notify((observer) => {
						observer.appended(open, frame);
					});
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
					this.notify((observer) => {
						observer.streamed(open, frame);
					});
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
				this.notifyRunning();
			}
			/**
			* Tell the observer something, and never let it take the transport with it.
			*
			* Mirroring into the shipped renderer is an enhancement: a consumer that
			* cannot be fed is detached (leaving the console on its own pane) and its
			* failure is reported where every other failure is, rather than thrown into
			* the action that happened to be running.
			*/
			notify(deliver) {
				const observer = this.observer;
				if (observer === void 0) return;
				try {
					deliver(observer);
				} catch (error) {
					this.observer = void 0;
					this.update({ error: describe(error) });
				}
			}
			/**
			* Report the open Session's running flag when the mirror moves it.
			*
			* The flag is a mirror reading rather than an event, so it has no frame of
			* its own: every snapshot write funnels through here and the reading is
			* compared against the last one reported.
			*/
			notifyRunning() {
				if (this.observer === void 0) return;
				const snapshot = this.store.getSnapshot();
				const open = snapshot.open;
				if (open === void 0) {
					this.reportedRunning = void 0;
					return;
				}
				const running = snapshot.state.machines.find((machine) => machine.machineName === open.machineName)?.sessions.find((candidate) => candidate.sessionId === open.sessionId)?.running ?? snapshot.transcript?.running ?? false;
				if (running === this.reportedRunning) return;
				this.reportedRunning = running;
				this.notify((observer) => {
					observer.running(open, running);
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
		//#region src/client/official-session.tsx
		/**
		* The plugin's mirror, projected onto the shipped DSH conversation renderer.
		*
		* The console hand-draws a remote Session's conversation because a browser
		* plugin cannot import another plugin's components. A DSH build that offers
		* `ctx.sessions.adopt` removes that limit: the plugin adopts the remote Session
		* under a synthetic local identity, feeds the mirror's own envelopes into it,
		* and lets the shipped `conversation.content` factory draw it — so the pane is
		* the product's real conversation rather than a copy of it.
		*
		* Everything in this module is feature-detected and structurally typed. The
		* adoption API is newer than the builds this plugin has to keep working on, so
		* nothing here may assume it exists: {@link OfficialSessions.supported} is false
		* without it, and the console then keeps its own pane untouched.
		*/
		/**
		* The child slot the console's `main` entry declares for the shipped
		* Conversation.
		*
		* A non-root child is what hands the panel its `SessionProvider` and
		* `renderSlot` seats, and `session` is the scope the shipped content needs: the
		* occurrence is bound to the adopted Session the panel retains. This is the
		* shape ui-subagent's `SidebarChatTab` uses for its own embedded chat.
		*/
		const OFFICIAL_SLOT = "session-sync.conversation";
		/** Consumer label this plugin registers on every reference it retains. */
		const OFFICIAL_SOURCE = "sessionSync";
		/**
		* Synthetic local identity of one adopted remote Session.
		*
		* Local identities are minted as `session-<uuid>`; this prefix cannot come out
		* of that generator, so an adopted Session can never collide with a local one —
		* the one rule the adoption API states about the id it is given.
		* @param open - the remote Session's own address.
		* @returns the stable synthetic id.
		*/
		function officialSessionId(open) {
			return `dsh-session-sync:${open.machineName}/${open.sessionId}`;
		}
		/**
		* One refused verb, as the client Session face returns refusals.
		*
		* The shape is structural on purpose: a `RemoteResult` error branch carrying a
		* `RemoteError`-like failure, so a consumer that checks `result.ok` or rethrows
		* `result.error` gets a real error with a stable code.
		* @param code - the failure code.
		* @param message - the human diagnostic.
		* @returns the refused outcome.
		*/
		function refused(code, message) {
			return {
				ok: false,
				error: {
					name: "RemoteError",
					code,
					message,
					details: {},
					isDSHRemoteError: true
				}
			};
		}
		/**
		* One live attempt's identity, from the plugin's own live key.
		*
		* The transport already keys a live row by turn and step, and both a live frame
		* and the settlement that ends it carry that pair — so the same attempt id is
		* derived on both sides with no hidden state to keep in step.
		* @param turn - the turn the step belongs to.
		* @param step - the step within the turn.
		* @returns the attempt id.
		*/
		function attemptKey(turn, step) {
			return `${String(turn)}:${String(step)}`;
		}
		/**
		* The turn|step a settlement event closes, when it names one.
		* @param event - one durable envelope.
		* @returns the attempt id, or undefined for an envelope without coordinates.
		*/
		function settlementAttemptId(event) {
			const data = asRecord$4(event.data);
			const turn = data?.["turn"];
			const step = data?.["step"];
			return typeof turn === "number" && typeof step === "number" ? attemptKey(turn, step) : void 0;
		}
		/** The adapter key of one remote Session: machine and id, in one string. */
		function remoteKey(machineName, sessionId) {
			return `${machineName}\u0000${sessionId}`;
		}
		/** Narrow one unknown value to a plain record. */
		function asRecord$4(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			return value;
		}
		/**
		* One adopted remote Session, and the frames fed into it.
		*
		* One instance per opened remote Session. Every method is safe to call after
		* {@link OfficialMirror.release}: a Session switch and the panel closing can
		* both ask for the end, and a frame that was in flight may still arrive.
		*/
		var OfficialMirror = class {
			/** The reference the shipped pane binds this Session with. */
			reference;
			handle;
			/** The live attempt whose text is on screen, by the plugin's turn|step key. */
			liveAttempt;
			released = false;
			/**
			* Adopt one remote Session and retain the reference that binds it.
			* @param service - the adopt-capable client Sessions service.
			* @param open - the remote Session's own address.
			* @param summary - row facts for the renderer's pre-event chrome.
			* @param transport - the plugin's transport, for the composer's own verb.
			*/
			constructor(service, open, summary, transport) {
				const sessionId = officialSessionId(open);
				this.handle = service.adopt({
					sessionId,
					summary,
					verbs: { prompt: async (content, _mode, signal) => {
						if (signal?.aborted === true) return refused("gateway/cancelled", "the submission was cancelled");
						if (content.some((part) => part.type !== "text")) return refused("gateway/bad-request", "the sync takeover path carries text prompts only");
						const text = content.map((part) => part.text ?? "").join("\n");
						if (text.trim() === "") return refused("gateway/bad-request", "the prompt was empty");
						if (!await transport.sendPrompt(text)) return refused("gateway/internal", "the sync server refused the prompt");
						return {
							ok: true,
							value: { accepted: true }
						};
					} },
					running: summary.running
				});
				try {
					this.reference = service.retain(sessionId, { source: OFFICIAL_SOURCE });
				} catch (error) {
					this.handle.release();
					throw error;
				}
			}
			/**
			* Replace the whole mirrored window, which is what opening a Session does.
			* @param transcript - the opening window, in log order.
			*/
			replace(transcript) {
				if (this.released) return;
				this.handle.replace(transcript.events, false);
				this.handle.setRunning(transcript.running);
			}
			/**
			* Feed one `events` frame's durable envelopes, in order.
			*
			* A settlement goes through `settle` rather than `append`: it is the durable
			* end of a live attempt, and the plugin's own rule — a settlement clears the
			* step's streaming text — is exactly that act.
			* @param events - the frame's envelopes.
			*/
			appendEvents(events) {
				if (this.released) return;
				for (const event of events) {
					if (isSettlement(event)) {
						this.settle(event);
						continue;
					}
					this.handle.append(event);
				}
			}
			/**
			* Feed one live delta frame: the whole step text so far, replaced as it grows.
			* @param frame - the accepted frame, already ordered by the transport.
			*/
			stream(frame) {
				if (this.released) return;
				const attemptId = attemptKey(frame.turn, frame.step);
				if (frame.text === "") {
					if (this.liveAttempt !== attemptId) return;
					this.closeLive({ attemptId });
					return;
				}
				this.liveAttempt = attemptId;
				this.handle.live({
					attemptId,
					turn: frame.turn,
					step: frame.step,
					kind: frame.kind,
					text: frame.text
				});
			}
			/**
			* Report the origin's running flag, which the mirror tracks apart from events.
			* @param running - whether the origin reports a turn in flight.
			*/
			setRunning(running) {
				if (this.released) return;
				this.handle.setRunning(running);
			}
			/**
			* Release the adopted Session and its reference.
			*
			* Idempotent, and total: a Session switch and the panel closing can both ask,
			* and the live attempt is abandoned first so the renderer is not left holding
			* text for an attempt that will never settle.
			*/
			release() {
				if (this.released) return;
				this.released = true;
				const live = this.liveAttempt;
				this.liveAttempt = void 0;
				if (live !== void 0) try {
					this.handle.abandon({ attemptId: live });
				} catch {}
				try {
					this.handle.release();
				} catch {}
				try {
					this.reference.release();
				} catch {}
			}
			/** Close one live attempt with its durable settlement, or with nothing. */
			closeLive(o) {
				if (o.event === void 0) this.handle.abandon({ attemptId: o.attemptId });
				else this.handle.settle({
					attemptId: o.attemptId,
					event: o.event
				});
				if (this.liveAttempt === o.attemptId) this.liveAttempt = void 0;
			}
			/** Settle the attempt one durable event ends. */
			settle(event) {
				const attemptId = settlementAttemptId(event) ?? this.liveAttempt ?? `settled:${String(event.seq)}`;
				this.closeLive({
					attemptId,
					event
				});
			}
		};
		/**
		* The bridge between the console's transport and the shipped renderer.
		*
		* It implements the transport observer: the console tells it what the mirror
		* reported, and it keeps one adopted Session for whichever remote Session is
		* open. The panel binds `referenceFor(...)` around the shipped content, which is
		* how the pane's Session identity reaches the renderer.
		*/
		var OfficialSessions = class {
			ctx;
			transport;
			current;
			/** The running flag already reported, so a poll does not restate it. */
			lastRunning;
			/**
			* @param ctx - the client context, read only for the Sessions service.
			* @param transport - the plugin's transport client.
			*/
			constructor(ctx, transport) {
				this.ctx = ctx;
				this.transport = transport;
			}
			/** Whether this build can render a Session through the shipped conversation. */
			get supported() {
				return this.service() !== void 0;
			}
			/**
			* The reference to bind for one remote Session, for the panel's render.
			* @param machineName - owning machine.
			* @param sessionId - the remote Session's own id.
			* @returns the retained reference while exactly that Session is adopted.
			*/
			referenceFor(machineName, sessionId) {
				const current = this.current;
				if (current === void 0) return void 0;
				return current.key === remoteKey(machineName, sessionId) ? current.mirror.reference : void 0;
			}
			/**
			* The panel opened a Session: adopt it, replacing whatever was adopted before.
			* @param open - the remote Session.
			*/
			opened(open) {
				const service = this.service();
				if (service === void 0) return;
				const key = remoteKey(open.machineName, open.sessionId);
				if (this.current?.key === key) return;
				this.release();
				this.current = {
					key,
					mirror: new OfficialMirror(service, open, this.summaryOf(open), this.transport)
				};
			}
			/**
			* The opening window arrived.
			* @param open - the remote Session it belongs to.
			* @param transcript - the window.
			*/
			loaded(open, transcript) {
				if (this.matches(open)) this.current?.mirror.replace(transcript);
			}
			/**
			* One `events` frame arrived.
			* @param open - the remote Session it belongs to.
			* @param frame - the frame.
			*/
			appended(open, frame) {
				if (this.matches(open)) this.current?.mirror.appendEvents(frame.events);
			}
			/**
			* One accepted live delta frame arrived.
			* @param open - the remote Session it belongs to.
			* @param frame - the frame.
			*/
			streamed(open, frame) {
				if (this.matches(open)) this.current?.mirror.stream(frame);
			}
			/**
			* The mirror moved the open Session's running flag.
			* @param open - the remote Session it belongs to.
			* @param running - the new reading.
			*/
			running(open, running) {
				if (!this.matches(open)) return;
				if (running === this.lastRunning) return;
				this.lastRunning = running;
				this.current?.mirror.setRunning(running);
			}
			/** The panel left its Session. */
			closed() {
				this.release();
			}
			/** Release the adopted Session, if any. Idempotent. */
			release() {
				const current = this.current;
				this.current = void 0;
				this.lastRunning = void 0;
				current?.mirror.release();
			}
			/** Whether the adopted Session is the one a frame names. */
			matches(open) {
				return this.current?.key === remoteKey(open.machineName, open.sessionId);
			}
			/**
			* The summary the shipped renderer shows before it has read an event.
			*
			* The mirror's own row when the Session is still published, and the id as a
			* placeholder title when it is not — the console's list shows the same
			* placeholder for a Session that was un-published while it was open.
			*/
			summaryOf(open) {
				const row = this.rowOf(open);
				const title = row?.title ?? open.sessionId;
				return {
					id: officialSessionId(open),
					sessionId: open.sessionId,
					title,
					displayTitle: title,
					...row?.cwd === void 0 ? {} : { cwd: row.cwd },
					updatedAt: row?.updatedAt ?? Date.now(),
					running: row?.running ?? false,
					blank: row !== void 0 && row.eventCount === 0,
					retainedBy: {}
				};
			}
			/** The mirror's row for one remote Session, while it is published. */
			rowOf(open) {
				return this.transport.snapshot.getSnapshot().state.machines.find((machine) => machine.machineName === open.machineName)?.sessions.find((session) => session.sessionId === open.sessionId);
			}
			/**
			* The adoption API, feature-detected on the client context.
			*
			* `sessions` is deliberately absent from this plugin's `inject` list: the
			* console has to load on builds that predate the adoption API, and a required
			* service the half cannot use would stop the whole half from applying. The
			* lookup is lazy because the service may be registered after this plugin
			* applies, and cheap because it runs once per panel render.
			*/
			service() {
				const service = this.ctx.get?.("sessions");
				if (typeof service !== "object" || service === null) return void 0;
				const candidate = service;
				return typeof candidate.adopt === "function" && typeof candidate.retain === "function" ? candidate : void 0;
			}
		};
		/**
		* The shipped Conversation's chat View, selected at this occurrence.
		*
		* The Factory's own default local Component renders `conversation.session` with
		* no View request; the sidebar chat pins `chat`, so a Session whose roster would
		* open elsewhere still lands on its conversation.
		*/
		function ChatView(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: props.renderSlot("conversation.session", { view: "chat" }) });
		}
		/**
		* The shipped Conversation content, drawn for the console's open Session.
		*
		* `embedded` is the variant the sidebar chat uses for a Session that sits
		* beside the shell's own; the console's pane is exactly that. The phase is
		* `active`: what the mirror holds is a conversation, while the hero belongs to
		* a local new Session, which a remote one never is.
		* @param props - the renderer's Factory dispatcher.
		* @returns the shipped content occurrence.
		*/
		function OfficialConversation({ renderFactorySlot }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: renderFactorySlot("conversation.content", {
				variant: "embedded",
				phase: "active",
				hero: false
			}, { slots: { views: ChatView } }) });
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular, { size: props.size });
		}
		//#endregion
		//#region src/client/session-chrome.ts
		/** Longest content excerpt kept for one cell. */
		const EXCERPT_LIMIT = 400;
		/** Longest subagent label kept. */
		const LABEL_LIMIT = 60;
		/** Event types the ledger does not show: bookkeeping the reader never asked for. */
		const HIDDEN_EVENTS = /* @__PURE__ */ new Set([
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
				const data = asRecord$3(event.data);
				if (firstTime === void 0) firstTime = event.time;
				lastTime = event.time;
				if (event.type === "request/header") {
					const config = asRecord$3(asRecord$3(data?.["header"])?.["config"]);
					const provider = text$1(config?.["provider"]);
					const name = text$1(config?.["model"]);
					if (provider !== void 0 && name !== void 0) model = {
						provider,
						model: name,
						...text$1(config?.["reasoningEffort"]) === void 0 ? {} : { effort: text$1(config?.["reasoningEffort"]) },
						...number$2(config?.["maxTokens"]) === void 0 ? {} : { maxTokens: number$2(config?.["maxTokens"]) }
					};
					continue;
				}
				if (event.type === "request/context") {
					const reported = number$2(data?.["contextWindow"]);
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
					const turn = number$2(data?.["turn"]);
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
					const turn = number$2(data?.["turn"]);
					const step = number$2(data?.["step"]);
					if (turn !== void 0 && step !== void 0) stepStarts.set(`${String(turn)}\u0000${String(step)}`, event.time);
					continue;
				}
				if (event.type === "step/end") {
					const turn = number$2(data?.["turn"]);
					const step = number$2(data?.["step"]);
					const started = turn === void 0 || step === void 0 ? void 0 : stepStarts.get(`${String(turn)}\u0000${String(step)}`);
					if (started !== void 0) stepMs += Math.max(0, event.time - started);
					continue;
				}
				if (event.type === "assistant/message") {
					const reported = asRecord$3(data?.["usage"]);
					usage.inputTokens += number$2(reported?.["inputTokens"]) ?? 0;
					usage.outputTokens += number$2(reported?.["outputTokens"]) ?? 0;
					usage.cacheReadTokens += number$2(reported?.["cacheReadTokens"]) ?? 0;
					usage.reasoningTokens += number$2(reported?.["reasoningTokens"]) ?? 0;
					const surface = number$2(reported?.["totalTokens"]) ?? (number$2(reported?.["inputTokens"]) ?? 0) + (number$2(reported?.["outputTokens"]) ?? 0);
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
					const callId = text$1(asRecord$3(asRecord$3(data?.["message"])?.["source"])?.["callId"]);
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
				const data = asRecord$3(event.data);
				if (data === void 0) continue;
				const key = String(event.seq);
				if (event.type === "turn/start") {
					currentTurn = number$2(data["turn"]) ?? currentTurn;
					currentStep = void 0;
				} else if (event.type === "step/start") currentStep = number$2(data["step"]) ?? currentStep;
				const turn = number$2(data["turn"]) ?? currentTurn;
				const step = number$2(data["step"]) ?? currentStep;
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
					const reason = text$1(asRecord$3(data["reason"])?.["kind"]);
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
					const callId = text$1(asRecord$3(asRecord$3(data["message"])?.["source"])?.["callId"]) ?? "";
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
				const message = asRecord$3(data["message"]);
				const textBody = textOf$1(message?.["content"] ?? data["content"]);
				const cell = base(key, kind, label, event, {
					turn,
					step,
					mono: false
				});
				cell.title = excerpt(textBody);
				if (assistant) {
					const output = number$2(asRecord$3(data["usage"])?.["outputTokens"]);
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
				case "user/message": return asRecord$3(data["source"])?.["kind"] === "user" ? "user" : "system";
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
			const header = asRecord$3(data["header"]);
			const config = asRecord$3(header?.["config"]);
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
			const turn = number$2(data["turn"]);
			const step = number$2(data["step"]);
			if (turn === void 0 || step === void 0) return "";
			return `#${String(turn)}/${String(step)}`;
		}
		/** The route a request context was assembled for, with its window. */
		function contextText(data) {
			const provider = text$1(data["provider"]);
			const model = text$1(data["model"]);
			const window = number$2(data["contextWindow"]);
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
				const record = asRecord$3(JSON.parse(raw));
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
				const record = asRecord$3(JSON.parse(args));
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
			const message = asRecord$3(data["message"]);
			const blocks = Array.isArray(message?.["content"]) ? message["content"] : [];
			const parts = [];
			for (const block of blocks) {
				const record = asRecord$3(block);
				if (record === void 0) continue;
				const text = textOf$1(Array.isArray(record["content"]) ? record["content"] : [record]);
				if (text !== "") parts.push(text);
			}
			return excerpt(parts.join("\n"));
		}
		/** Whether a tool result reports failure on any block. */
		function resultIsError(data) {
			const message = asRecord$3(data["message"]);
			return (Array.isArray(message?.["content"]) ? message["content"] : []).some((block) => asRecord$3(block)?.["isError"] === true);
		}
		/** Join the visible text blocks of one content array. */
		function textOf$1(content) {
			if (!Array.isArray(content)) return "";
			const parts = [];
			for (const block of content) {
				const record = asRecord$3(block);
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
				const record = asRecord$3(block);
				if (record === void 0) continue;
				if (record["type"] === "reasoning" && typeof record["text"] === "string") parts.push(record["text"]);
			}
			return parts.join("\n").trim();
		}
		/** Narrow one unknown value to a plain record. */
		function asRecord$3(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			return value;
		}
		/** One non-empty string, or undefined. */
		function text$1(value) {
			return typeof value === "string" && value.trim() !== "" ? value : void 0;
		}
		/** One finite number, or undefined. */
		function number$2(value) {
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
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, {
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
		//#region src/client/message-stats.ts
		/** Two-digit, zero-padded number. */
		function pad2(value) {
			return String(value).padStart(2, "0");
		}
		/**
		* Compact local timestamp for a message's actions row: `HH:mm` on the same
		* calendar day, a month/day template earlier this year, a year template beyond.
		* @param time - Unix epoch ms from the source Session event.
		* @param t - translate seat supplying the date templates.
		* @param now - reference instant for the day/year cut.
		* @returns the date-aware clock string.
		*/
		function formatMessageClock(time, t, now = Date.now()) {
			const date = new Date(time);
			const reference = new Date(now);
			const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
			if (date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate()) return clock;
			const params = {
				y: date.getFullYear(),
				m: date.getMonth() + 1,
				d: date.getDate()
			};
			return `${date.getFullYear() === reference.getFullYear() ? t("clockMd", params) : t("clockYmd", params)} ${clock}`;
		}
		/**
		* Localized elapsed duration: whole seconds under a minute, then minutes.
		* @param ms - elapsed milliseconds; negatives clamp to zero.
		* @param t - translate seat supplying the duration templates.
		* @returns the display string.
		*/
		function formatRunDuration(ms, t) {
			const total = Math.max(0, Math.floor(ms / 1e3));
			const minutes = Math.floor(total / 60);
			const seconds = total % 60;
			return minutes > 0 ? t("durationMinutes", {
				minutes,
				seconds: pad2(seconds)
			}) : t("durationSeconds", { seconds });
		}
		/**
		* Sub-turn latency figure: one decimal under ten seconds, whole seconds beyond.
		* Unit-less, so the locale template owns the second suffix.
		* @param ms - latency in milliseconds; negatives clamp to zero.
		* @returns the display number in seconds, without unit.
		*/
		function formatLatencySeconds(ms) {
			const seconds = Math.max(0, ms) / 1e3;
			return seconds < 10 ? String(Math.round(seconds * 10) / 10) : String(Math.round(seconds));
		}
		/**
		* Decode-throughput figure: whole tokens from ten up, one decimal below.
		* @param tps - tokens per second.
		* @returns the display number, without unit.
		*/
		function formatTokensPerSecond(tps) {
			const clamped = Math.max(0, tps);
			return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10);
		}
		/**
		* Compact token count: 517 / 12.2K / 517K / 1.2M.
		* @param value - a non-negative token count.
		* @param t - translate seat supplying the magnitude suffixes.
		* @returns the compact display string.
		*/
		function formatTokens(value, t) {
			const scaled = (candidate) => candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10);
			if (value < 1e3) return String(value);
			if (value < 1e6) return t("numberThousand", { value: scaled(value / 1e3) });
			return t("numberMillion", { value: scaled(value / 1e6) });
		}
		/**
		* Exact integer token count with the locale's digit grouping.
		* @param value - a non-negative safe integer.
		* @param t - translate seat supplying the group separator.
		* @returns the unrounded display string.
		*/
		function formatExactTokens(value, t) {
			const digits = String(value);
			const groups = [];
			for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
			return groups.join(t("numberGroupSeparator"));
		}
		/** Round a cache-read ratio to exact percentage units, ties rounded up. */
		function roundedPercentUnits(cacheReadTokens, denominator, decimalPlaces) {
			const scale = (decimalPlaces === 0 ? 1 : 10) * 100;
			const doubledScale = scale * 2;
			const quotient = Math.floor(denominator / doubledScale);
			const remainder = denominator % doubledScale;
			let lower = 0;
			let upper = scale;
			while (lower < upper) {
				const candidate = Math.floor((lower + upper + 1) / 2);
				const factor = candidate * 2 - 1;
				if (cacheReadTokens >= factor * quotient + Math.ceil(factor * remainder / doubledScale)) lower = candidate;
				else upper = candidate - 1;
			}
			return lower;
		}
		/** Render percentage units at the requested precision. */
		function displayPercentUnits(units, decimalPlaces) {
			if (decimalPlaces === 0) return String(units);
			const whole = Math.floor(units / 10);
			const tenths = units % 10;
			return tenths === 0 ? String(whole) : `${whole}.${tenths}`;
		}
		/**
		* Cache-hit share that never rounds a partial hit up to 100%.
		* @param cacheReadTokens - prompt tokens served from cache.
		* @param promptTokens - aggregate prompt tokens.
		* @param decimalPlaces - ordinary precision; a partial hit that would round to
		*   100 automatically takes enough extra precision to stay honest.
		* @returns the percentage text, or null when there was no prompt input.
		*/
		function formatCacheHitPercent(cacheReadTokens, promptTokens, decimalPlaces = 0) {
			if (promptTokens === 0) return null;
			const missed = promptTokens - cacheReadTokens;
			if (missed === 0) return "100";
			const units = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces);
			if (units < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(units, decimalPlaces);
			let places = 1;
			let gap = missed * 200;
			const tens = Math.floor(promptTokens / 10);
			while (gap <= tens) {
				gap *= 10;
				places += 1;
			}
			const ones = promptTokens % 10;
			let loss = 5;
			for (let candidate = 1; candidate < 5; candidate += 1) {
				const factor = candidate * 2 + 1;
				if (gap <= factor * tens + Math.floor(factor * ones / 10)) {
					loss = candidate;
					break;
				}
			}
			return `99.${"9".repeat(places - 1)}${10 - loss}`;
		}
		/** The prompt-side buckets plus output, which is what a turn's total counts. */
		function billedInputTokens(usage) {
			return usage.input + usage.cacheRead + usage.cacheWrite;
		}
		/** A turn's total tokens: every prompt-side bucket plus output. */
		function turnTotalTokens(usage) {
			return billedInputTokens(usage) + usage.output;
		}
		//#endregion
		//#region src/client/tool-cards.ts
		/** Variant titles, plus the wire names the shipped client titles individually. */
		const VARIANT_TITLE_KEYS = {
			search: "toolLabelSearch",
			read: "toolLabelRead",
			bash: "toolTitleBash",
			write: "toolTitleWrite",
			edit: "toolLabelEdit",
			code: "toolLabelCode",
			others: "toolLabelGeneric"
		};
		const TOOL_TITLE_KEYS = {
			pwsh: "toolTitlePwsh",
			bash: "toolTitleBash",
			write: "toolTitleWrite",
			grep: "toolTitleGrep",
			glob: "toolTitleGlob",
			web_search: "toolTitleWebSearch",
			web_fetch: "toolTitleWebFetch",
			read_image: "toolTitleReadImage"
		};
		/** `deriveSummary`'s key priority per variant. */
		const SUMMARY_KEYS$1 = {
			bash: ["description", "command"],
			read: [
				"path",
				"file_path",
				"url"
			],
			search: [
				"query",
				"pattern",
				"url"
			],
			write: ["path", "file_path"],
			edit: ["path", "file_path"],
			code: ["description"],
			others: []
		};
		/** Variants whose path argument is worth opening, and the keys it can hide in. */
		const FILE_PATH_VARIANTS = [
			"read",
			"write",
			"edit"
		];
		const FILE_PATH_KEYS = ["path", "file_path"];
		/** Classify one wire tool name — `TOOL_VARIANTS`. */
		function classifyTool(name) {
			const wire = name.trim().toLowerCase();
			if (wire === "bash" || wire === "pwsh") return "bash";
			if (wire === "read" || wire === "read_image" || wire === "web_fetch" || wire === "cordis_package_inspect" || wire === "cordis_runtime_inspect") return "read";
			if (wire === "web_search" || wire === "grep" || wire === "glob") return "search";
			if (wire === "write") return "write";
			if (wire === "edit") return "edit";
			if (wire === "run_code") return "code";
			return "others";
		}
		/**
		* Reduce one mirrored tool row to the shipped row model.
		* @param row - the projected tool row.
		* @param cwd - the Session workspace, when the mirror knows it.
		* @param home - the Host account home, when the mirror knows it.
		* @returns the variant, title key, summary, state, and body inputs.
		*/
		function toolRowModel(row, cwd, home) {
			const variant = classifyTool(row.name);
			const argsRaw = row.argumentsRaw;
			const state = row.pending ? "running" : row.errorCode === "interrupted" ? "stopped" : row.isError ? "error" : "ok";
			const titleKey = TOOL_TITLE_KEYS[row.name.trim().toLowerCase()] ?? VARIANT_TITLE_KEYS[variant];
			const base = argsRaw === "" ? row.callId : abbreviateHomePath(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home);
			const summary = variant === "others" && row.name !== "" ? `${row.name} · ${base}` : base;
			const filePath = FILE_PATH_VARIANTS.includes(variant) ? pickString(parseArgs(argsRaw), FILE_PATH_KEYS) : void 0;
			const output = row.pending ? null : resultText(row) || null;
			return {
				variant,
				titleKey,
				summary,
				...filePath === void 0 ? {} : { filePath },
				bodyRaw: argsRaw === "" ? null : argsRaw,
				output,
				errorSummary: state === "error" && output !== null ? firstLine(output) : null,
				state
			};
		}
		/** One-line gist for a row that has no card — `deriveSummary`. */
		function deriveSummary(variant, argsRaw) {
			const args = parseArgs(argsRaw);
			if (args === void 0) return firstLine(argsRaw);
			if (variant === "search" && Array.isArray(args["queries"])) {
				const queries = args["queries"].filter((entry) => typeof entry === "string" && entry !== "").map(firstLine);
				if (queries.length > 0) return queries.join(", ");
			}
			const named = pickString(args, SUMMARY_KEYS$1[variant]);
			if (named !== void 0) return firstLine(named);
			for (const value of Object.values(args)) if (typeof value === "string" && value !== "") return firstLine(value);
			return firstLine(argsRaw);
		}
		/**
		* Derive the terminal card — `terminalCardModel`.
		* @param row - the projected tool row.
		* @param sessionCwd - the Session workspace, used when the call names no workdir.
		* @returns the card, or null when the shipped card declines this call.
		*/
		function terminalCard(row, sessionCwd) {
			const parsed = parseCall(row);
			if (parsed === void 0) return null;
			const call = shellCall(parsed.name, parsed.args) ?? terminalSendCall(parsed.name, parsed.args);
			if (call === null || call.kind === "shell" && call.background) return null;
			const cwd = resolveTerminalCwd(call.kind === "shell" ? call.workdir : void 0, sessionCwd);
			if (row.pending) return {
				command: call.kind === "shell" ? call.command : call.text,
				...cwd === void 0 ? {} : { cwd },
				running: true
			};
			if (row.isError || call.kind === "shell" && call.persistent || isSpilledShell(row, call)) return null;
			const text = singleResultText(row);
			if (text === void 0) return null;
			const status = call.kind === "terminal-send" ? { output: text } : parseExitStatus(text);
			return {
				command: call.kind === "shell" ? call.command : call.text,
				...cwd === void 0 ? {} : { cwd },
				output: status.output,
				...status.exitCode === void 0 ? {} : { exitCode: status.exitCode },
				...status.signal === void 0 ? {} : { signal: status.signal },
				...call.kind === "shell" && call.description !== void 0 ? { description: call.description } : {},
				running: false
			};
		}
		/** Whether a settled terminal card reports failure — `terminalFailed`. */
		function terminalFailed(card) {
			return card.running !== true && (card.exitCode !== void 0 && card.exitCode !== 0 || card.signal !== void 0);
		}
		/** Validate one `bash`/`pwsh` call — `shellCall`. */
		function shellCall(name, args) {
			if (name !== "bash" && name !== "pwsh") return null;
			const command = args["command"];
			if (typeof command !== "string" || command.trim() === "") return null;
			const timeoutMs = args["timeoutMs"];
			if (timeoutMs !== void 0 && (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) return null;
			const workdir = args["workdir"];
			if (workdir !== void 0 && typeof workdir !== "string") return null;
			const background = args["run_in_background"];
			if (background !== void 0 && typeof background !== "boolean") return null;
			if (!validEscalationFields(args)) return null;
			const description = args["description"];
			if (description === void 0) return {
				kind: "shell",
				command,
				description: void 0,
				workdir: void 0,
				background: false,
				persistent: true
			};
			if (typeof description !== "string" || description.trim() === "") return null;
			return {
				kind: "shell",
				command,
				description,
				workdir: typeof workdir === "string" ? workdir : void 0,
				background: background === true,
				persistent: false
			};
		}
		/** Validate one `terminal_send` call. */
		function terminalSendCall(name, args) {
			if (name !== "terminal_send") return null;
			const sessionId = args["sessionId"];
			const text = args["text"];
			if (typeof sessionId !== "string" || sessionId === "" || typeof text !== "string") return null;
			return {
				kind: "terminal-send",
				text,
				sessionId
			};
		}
		/** Split a settled shell's trailing status marker off its output. */
		function parseExitStatus(text) {
			const killed = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text);
			if (killed !== null) return {
				output: text.slice(0, killed.index),
				signal: killed[1]
			};
			const exit = /\n\[exit code: (\d+)\]$/.exec(text);
			if (exit !== null) return {
				output: text.slice(0, exit.index),
				exitCode: Number(exit[1])
			};
			return {
				output: text,
				exitCode: 0
			};
		}
		/** Whether a settled shell's output was spilled to a file — `isSpilledShellCall`. */
		function isSpilledShell(row, call) {
			if (call.kind !== "shell" || call.background) return false;
			const text = singleResultText(row);
			return text !== void 0 && hasSpillNotice(text);
		}
		/**
		* Whether text ends with the spill notice that hides a result behind a file.
		* @param text - the result text.
		* @returns true when the last segment is that notice.
		*/
		function hasSpillNotice(text) {
			const segment = text.split("\n\n").at(-1) ?? "";
			if (!segment.startsWith("(")) return false;
			const at = segment.indexOf(" Full formatted result stored at: ");
			if (at < 0) return false;
			const omitted = segment.slice(1, at);
			return (omitted === "" || omitted === "More bytes were omitted." || /^Omitted \d+ bytes\.$/.test(omitted)) && segment.slice(at + 34).includes(". ");
		}
		/**
		* Derive the read card — `readCardModel`.
		* @param row - the projected tool row.
		* @param cwd - the Session workspace, when known.
		* @param home - the Host account home, when known.
		* @returns the card, or null when the shipped card declines this read.
		*/
		function readCard(row, cwd, home) {
			if (!row.pending && row.isError) return null;
			if (row.pending) return null;
			const parsed = parseCall(row);
			if (parsed === void 0 || parsed.name !== "read") return null;
			const filePath = parsed.args["file_path"];
			if (typeof filePath !== "string" || filePath.trim() === "") return null;
			if (!validPositiveInteger(parsed.args["offset"]) && parsed.args["offset"] !== void 0) return null;
			if (!validPositiveInteger(parsed.args["limit"]) && parsed.args["limit"] !== void 0) return null;
			const meta = readMeta(row);
			if (meta === void 0) return null;
			const text = singleResultText(row);
			if (text === void 0) return null;
			if (!/^<path>[^\n]*<\/path>\n<type>file<\/type>\n<content>\n([\s\S]*)\n<\/content>$/u.test(text)) return null;
			return {
				label: abbreviateHomePath(relativizeToCwd(meta.path, cwd), home),
				lines: meta.lines,
				totalLines: meta.totalLines,
				...meta.lang === void 0 ? {} : { lang: meta.lang }
			};
		}
		/** The read `meta` shape, validated line by line. */
		function readMeta(row) {
			const meta = asRecord$2(row.meta);
			if (meta === void 0) return void 0;
			const path = meta["path"];
			if (typeof path !== "string") return void 0;
			const offset = meta["offset"];
			if (!validPositiveInteger(offset)) return void 0;
			const totalLines = meta["totalLines"];
			if (typeof totalLines !== "number" || !Number.isInteger(totalLines) || totalLines < 0) return void 0;
			const raw = meta["lines"];
			if (!Array.isArray(raw)) return void 0;
			const lang = meta["lang"];
			if (lang !== void 0 && typeof lang !== "string") return void 0;
			const lines = [];
			let previous = offset - 1;
			for (const candidate of raw) {
				const line = asRecord$2(candidate);
				if (line === void 0) return void 0;
				const number = line["number"];
				if (typeof number !== "number" || !Number.isInteger(number) || number <= previous) return void 0;
				if (number > totalLines) return void 0;
				if (typeof line["text"] !== "string") return void 0;
				previous = number;
				lines.push({
					number,
					text: line["text"]
				});
			}
			return {
				path,
				offset,
				lines,
				totalLines,
				...lang === void 0 ? {} : { lang }
			};
		}
		/**
		* Derive the file-mutation card — `diffCardModel`.
		* @param row - the projected tool row.
		* @returns the card, or null when the shipped card declines this call.
		*/
		function diffCard(row) {
			const intended = intendedDiff(row);
			if (intended === null) return null;
			if (row.pending) return { diffs: [intended.diff] };
			if (intended.tool === "str_replace_editor" || row.isError) return null;
			const applied = appliedDiffs(row.meta);
			if (applied === null || applied === "empty") return intended.tool === "write" ? { diffs: [intended.diff] } : null;
			return { diffs: applied };
		}
		/** The change a call intends, before any result is read. */
		function intendedDiff(row) {
			const parsed = parseCall(row);
			if (parsed === void 0) return null;
			const args = parsed.args;
			if (parsed.name === "str_replace_editor") {
				const path = args["path"];
				if (typeof path !== "string" || path.trim() === "") return null;
				const command = args["command"];
				if (command === "create") {
					const fileText = args["file_text"];
					if (fileText !== void 0 && typeof fileText !== "string") return null;
					return {
						tool: parsed.name,
						diff: {
							path,
							oldText: null,
							newText: typeof fileText === "string" ? fileText : ""
						}
					};
				}
				if (command === "str_replace") {
					const oldStr = args["old_str"];
					const newStr = args["new_str"];
					if (oldStr !== void 0 && typeof oldStr !== "string") return null;
					if (newStr !== void 0 && typeof newStr !== "string") return null;
					return {
						tool: parsed.name,
						diff: {
							path,
							oldText: typeof oldStr === "string" ? oldStr : null,
							newText: typeof newStr === "string" ? newStr : ""
						}
					};
				}
				return null;
			}
			const filePath = args["file_path"];
			if (typeof filePath !== "string" || filePath.trim() === "") return null;
			if (!validEscalationFields(args)) return null;
			if (parsed.name === "write") {
				const content = args["content"];
				if (typeof content !== "string") return null;
				return {
					tool: "write",
					diff: {
						path: filePath,
						oldText: null,
						newText: content
					}
				};
			}
			if (parsed.name === "edit") {
				const oldString = args["old_string"];
				const newString = args["new_string"];
				if (typeof oldString !== "string" || typeof newString !== "string") return null;
				const replaceAll = args["replace_all"];
				if (replaceAll !== void 0 && typeof replaceAll !== "boolean") return null;
				return {
					tool: "edit",
					diff: {
						path: filePath,
						oldText: oldString || null,
						newText: newString
					}
				};
			}
			return null;
		}
		/** The applied hunks a result carries, all-or-nothing. */
		function appliedDiffs(meta) {
			const record = asRecord$2(meta);
			if (record === void 0) return null;
			const diffs = record["diffs"];
			if (!Array.isArray(diffs)) return null;
			if (diffs.length === 0) return "empty";
			const hunks = [];
			for (const candidate of diffs) {
				const hunk = asRecord$2(candidate);
				if (hunk === void 0) return null;
				const path = hunk["path"];
				const oldText = hunk["oldText"];
				const newText = hunk["newText"];
				if (typeof path !== "string") return null;
				if (oldText !== null && typeof oldText !== "string") return null;
				if (typeof newText !== "string") return null;
				hunks.push({
					path,
					oldText,
					newText
				});
			}
			return hunks;
		}
		/** `+added -removed` over every hunk, as the shipped footer counts them. */
		function diffStat(diffs) {
			let added = 0;
			let removed = 0;
			for (const hunk of diffs) {
				if (hunk.oldText !== null) removed += contentLines(hunk.oldText).length;
				added += contentLines(hunk.newText).length;
			}
			return `+${String(added)} -${String(removed)}`;
		}
		/** A diff side's content lines: a single trailing newline is a terminator. */
		function contentLines(text) {
			if (text === "") return [];
			const lines = text.split("\n");
			if (lines.length > 1 && lines.at(-1) === "") lines.pop();
			return lines;
		}
		/**
		* Derive the search card — `searchCardModel`.
		* @param row - the projected tool row.
		* @returns the card and the recovery text, or null when the card declines.
		*/
		function searchCard(row) {
			if (row.pending || row.isError) return null;
			const parsed = parseCall(row);
			if (parsed === void 0) return null;
			const name = parsed.name;
			if (name !== "grep" && name !== "glob") return null;
			const pattern = parsed.args["pattern"];
			if (typeof pattern !== "string") return null;
			if (name === "grep" && pattern === "") return null;
			if (name === "glob" && pattern.trim() === "") return null;
			const path = parsed.args["path"];
			if (path !== void 0 && (typeof path !== "string" || path.trim() === "")) return null;
			const include = parsed.args["include"];
			if (include !== void 0 && (typeof include !== "string" || !validInclude(include))) return null;
			const meta = asRecord$2(row.meta);
			if (meta === void 0) return null;
			const truncated = meta["truncated"];
			const total = meta["total"];
			if (typeof truncated !== "boolean") return null;
			if (typeof total !== "number" || !Number.isInteger(total) || total < 0) return null;
			const recovery = truncated ? flattenContent(row) || void 0 : void 0;
			if (name === "grep") {
				if (meta["shape"] !== "matches") return null;
				const files = searchFiles(meta["files"]);
				if (files === null) return null;
				return {
					card: {
						kind: "matches",
						files,
						truncated,
						total
					},
					...recovery === void 0 ? {} : { recovery }
				};
			}
			if (meta["shape"] !== "paths" || !Array.isArray(meta["paths"])) return null;
			if (!meta["paths"].every((entry) => typeof entry === "string")) return null;
			return {
				card: {
					kind: "paths",
					paths: [...meta["paths"]],
					truncated,
					total
				},
				...recovery === void 0 ? {} : { recovery }
			};
		}
		/** An include glob the tool actually accepts. */
		function validInclude(include) {
			if (include.trim() === "") return false;
			if (include.startsWith("!")) return false;
			let depth = 0;
			for (const character of include) if (character === "{") depth += 1;
			else if (character === "}") depth = Math.max(0, depth - 1);
			else if (character === "," && depth === 0) return false;
			return true;
		}
		/** Validate one result's file groups. */
		function searchFiles(value) {
			if (!Array.isArray(value)) return null;
			const files = [];
			for (const candidate of value) {
				const group = asRecord$2(candidate);
				if (group === void 0) return null;
				const path = group["path"];
				const matches = group["matches"];
				if (typeof path !== "string" || !Array.isArray(matches)) return null;
				const lines = [];
				for (const entry of matches) {
					const match = asRecord$2(entry);
					if (match === void 0) return null;
					const lineNumber = match["lineNumber"];
					if (typeof lineNumber !== "number" || !Number.isInteger(lineNumber) || lineNumber < 1) return null;
					if (typeof match["line"] !== "string") return null;
					lines.push({
						lineNumber,
						line: match["line"]
					});
				}
				files.push({
					path,
					matches: lines
				});
			}
			return files;
		}
		/**
		* Derive the web card — `webCardModel`.
		* @param row - the projected tool row.
		* @returns the card, or null when the shipped card declines this call.
		*/
		function webCard(row) {
			if (row.pending || row.isError) return null;
			const parsed = parseCall(row);
			if (parsed === void 0) return null;
			const meta = asRecord$2(row.meta);
			if (meta === void 0 || typeof meta["truncated"] !== "boolean") return null;
			const truncated = meta["truncated"];
			if (parsed.name === "web_search") {
				const queries = parsed.args["queries"];
				if (!Array.isArray(queries) || queries.length === 0) return null;
				if (!queries.every((entry) => typeof entry === "string" && entry.trim() !== "")) return null;
				const answer = meta["answer"];
				if (answer !== void 0 && typeof answer !== "string") return null;
				const sources = webSources(meta["sources"]);
				if (sources === null) return null;
				return {
					kind: "search",
					...answer === void 0 ? {} : { answer },
					sources,
					truncated
				};
			}
			if (parsed.name === "web_fetch") {
				const url = parsed.args["url"];
				if (typeof url !== "string" || url.trim() === "") return null;
				if (typeof meta["url"] !== "string") return null;
				const statusCode = meta["statusCode"];
				if (typeof statusCode !== "number" || !Number.isInteger(statusCode)) return null;
				return {
					kind: "fetch",
					url: meta["url"],
					statusCode,
					truncated
				};
			}
			return null;
		}
		/** Validate one result's cited sources. */
		function webSources(value) {
			if (!Array.isArray(value)) return null;
			const sources = [];
			for (const candidate of value) {
				const source = asRecord$2(candidate);
				if (source === void 0) return null;
				const url = source["url"];
				if (typeof url !== "string") return null;
				const titles = {};
				for (const key of [
					"title",
					"snippet",
					"publishedAt"
				]) {
					const field = source[key];
					if (field === void 0) continue;
					if (typeof field !== "string") return null;
					titles[key] = field;
				}
				sources.push({
					url,
					...titles
				});
			}
			return sources;
		}
		/** Localized chrome for `TerminalBlock`. */
		function terminalBlockLabels(t) {
			return {
				signal: (signal) => t("terminalSignal", { signal }),
				exitCode: (code) => t("terminalExitCode", { code }),
				noExitCode: t("terminalNoExitCode"),
				running: t("terminalRunning"),
				failed: t("terminalFailed"),
				done: t("terminalDone"),
				copy: t("copyCode"),
				copied: t("copiedCode"),
				noOutput: t("terminalNoOutput"),
				collapseAria: t("terminalCollapseAria"),
				collapse: t("collapse"),
				expandAria: (hidden) => t("terminalExpandAria", { n: hidden }),
				expand: (hidden) => t("terminalExpandRest", { n: hidden })
			};
		}
		/** Localized chrome for `DiffBlock`. */
		function diffBlockLabels(t) {
			return {
				copy: t("copyCode"),
				copied: t("copiedCode"),
				collapseAria: t("diffCollapseAria"),
				expandAria: (count) => t("diffExpandAria", { count }),
				collapse: t("collapse"),
				expand: (count) => t("diffExpandRest", { count }),
				files: (count) => t(count === 1 ? "diffFilesOne" : "diffFilesOther", { count })
			};
		}
		/** Localized chrome for `ReadBlock`. */
		function readBlockLabels(t) {
			return {
				window: (shown, total) => t("readWindow", {
					shown,
					total
				}),
				copy: t("copyCode"),
				copied: t("copiedCode"),
				collapseAria: t("readCollapseAria"),
				expandAria: (count) => t("readExpandAria", { count }),
				collapse: t("collapse"),
				expand: (count) => t("readExpandRest", { count })
			};
		}
		/** Localized chrome for `SearchBlock`. */
		function searchBlockLabels(t) {
			return {
				pathsSummary: (shown, total, truncated) => t(truncated ? "searchPathsTruncated" : "searchPaths", {
					shown,
					total
				}),
				matchesSummary: (shown, total, files, truncated) => t(truncated ? "searchMatchesTruncated" : "searchMatches", {
					shown,
					total,
					files
				}),
				copy: t("copyCode"),
				copied: t("copiedCode"),
				noResults: t("searchNoResults"),
				collapseAria: t("searchCollapseAria"),
				expandAria: (count) => t("searchExpandAria", { count }),
				collapse: t("collapse"),
				expand: (count) => t("searchExpandRest", { count })
			};
		}
		/** Localized chrome for `WebBlock`. */
		function webBlockLabels(t) {
			return {
				noResults: t("webNoResults"),
				sourcesTruncated: t("webSourcesTruncated"),
				http: t("webHttp"),
				contentTruncated: t("webContentTruncated"),
				markdown: {
					code: {
						copyLabel: t("copyCode"),
						copiedLabel: t("copiedCode")
					},
					footnotes: t("footnotes")
				}
			};
		}
		/** A parsed tool call, or undefined when the arguments are not an object. */
		function parseCall(row) {
			const args = parseArgs(row.argumentsRaw);
			if (args === void 0) return void 0;
			return {
				name: row.name,
				args
			};
		}
		/** Parse a raw arguments string into an object — `parsedToolCall`. */
		function parseArgs(raw) {
			return asRecord$2(parseJson$1(raw));
		}
		/** The result's text when it is exactly one text block — `singleResultText`. */
		function singleResultText(row) {
			if (row.resultBlocks.length !== 1) return void 0;
			const only = asRecord$2(row.resultBlocks[0]);
			return only?.["type"] === "text" && typeof only["text"] === "string" ? only["text"] : void 0;
		}
		/** Every text block joined — `flattenContent`. */
		function flattenContent(row) {
			const parts = [];
			for (const block of row.resultBlocks) {
				const record = asRecord$2(block);
				if (record?.["type"] === "text" && typeof record["text"] === "string") parts.push(record["text"]);
			}
			return parts.join("\n");
		}
		/** The flattened result text a generic row shows — `resultText`. */
		function resultText(row) {
			const parts = [];
			for (const block of row.resultBlocks) {
				const record = asRecord$2(block);
				if (record === void 0) continue;
				if (record["type"] === "text" && typeof record["text"] === "string") parts.push(record["text"]);
				else parts.push(JSON.stringify(record, null, 2));
			}
			return parts.join("\n");
		}
		/** Both escalation fields must be absent, or a valid pair. */
		function validEscalationFields(args) {
			const permissions = args["sandbox_permissions"];
			const justification = args["justification"];
			if (permissions === void 0 && justification === void 0) return true;
			if (permissions !== "workspace-write" && permissions !== "danger-full-access") return false;
			return typeof justification === "string" && justification.trim() !== "";
		}
		/** First key in `keys` whose value is a non-empty string. */
		function pickString(args, keys) {
			for (const key of keys) {
				const value = args[key];
				if (typeof value === "string" && value !== "") return value;
			}
		}
		/** One optional positive integer. */
		function validPositiveInteger(value) {
			return typeof value === "number" && Number.isInteger(value) && value >= 1;
		}
		/** The first line of a possibly multi-line value. */
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		/** Resolve a call's workdir against the Session workspace — `resolveTerminalCwd`. */
		function resolveTerminalCwd(workdir, sessionCwd) {
			if (workdir === void 0 || workdir === "") return sessionCwd;
			if (sessionCwd === void 0 || sessionCwd === "") return normalizeSegments(workdir);
			return normalizeSegments(resolveWorkspacePath(sessionCwd, workdir));
		}
		/** Collapse `.`/`..` segments without changing the authored separators. */
		function normalizeSegments(path) {
			const separator = path.includes("\\") ? "\\" : "/";
			const segments = path.split(/[/\\]+/);
			const kept = [];
			for (const segment of segments) {
				if (segment === "" || segment === ".") continue;
				if (segment === ".." && kept.length > 0 && kept.at(-1) !== "..") kept.pop();
				else if (segment === ".." && kept.length === 0) kept.push(segment);
				else kept.push(segment);
			}
			return (/^[/\\]/.test(path) ? separator : "") + kept.join(separator);
		}
		/** Resolve a workspace-relative path — `resolveWorkspacePath`. */
		function resolveWorkspacePath(cwd, path) {
			if (/^([/\\]|[A-Za-z]:[/\\])/.test(path)) return path;
			const separator = /^[A-Za-z]:\\/.test(cwd) && cwd.includes("\\") ? "\\" : "/";
			return `${cwd.replace(/[/\\]+$/, "")}${separator}${path.replace(/^[/\\]+/, "")}`;
		}
		/** Strip the Session workspace prefix — `relativizeToCwd`. */
		function relativizeToCwd(text, cwd) {
			if (cwd === void 0 || cwd === "") return text;
			const root = cwd.replace(/[/\\]+$/, "");
			if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1);
			return text;
		}
		/** Collapse a POSIX path under the account home — `abbreviateHomePath`. */
		function abbreviateHomePath(path, home) {
			if (home === void 0 || home === "") return path;
			if (/^[A-Za-z]:[/\\]/.test(path) || path.startsWith("\\\\")) return path;
			if (/^[A-Za-z]:[/\\]/.test(home) || home.startsWith("\\\\")) return path;
			const root = home.replace(/\/+$/, "");
			if (root === "" || root === "/") return path;
			if (path.replace(/\/+$/, "") === root) return "~";
			if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
			return path;
		}
		/** One optional JSON object. */
		function asRecord$2(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			return value;
		}
		/** Parse JSON, treating failure as "not an object". */
		function parseJson$1(raw) {
			try {
				return JSON.parse(raw);
			} catch {
				return;
			}
		}
		//#endregion
		//#region src/client/turn-metrics.ts
		/** One packed delta run's fragments, in order. */
		function runFragments(run) {
			if (run.type === "tool-call-chunks") return Array.isArray(run.args) ? run.args : [];
			if (run.type === "text-chunks" || run.type === "reasoning-chunks") return Array.isArray(run.texts) ? run.texts : [];
		}
		/** Time of the first member of one packed run that passes `predicate`. */
		function firstRunMemberTime(run, predicate) {
			const fragments = runFragments(run);
			if (fragments === void 0 || typeof run.time0 !== "number") return void 0;
			const deltas = Array.isArray(run.dt) ? run.dt : [];
			let time = run.time0;
			for (let index = 0; index < fragments.length; index += 1) {
				const delta = deltas[index - 1];
				if (index > 0) {
					if (typeof delta !== "number") return void 0;
					time += delta;
				}
				if (predicate(String(fragments[index]))) return time;
			}
		}
		/** Time of the first member of one packed run that carries a token. */
		function runFirstTokenTime(run) {
			if (run.type === "tool-call-chunks" && run.name !== void 0) return typeof run.time0 === "number" ? run.time0 : void 0;
			return firstRunMemberTime(run, (fragment) => fragment !== "");
		}
		/**
		* Whether one chunk carries the model's first output token, per the shipped
		* `isTokenDelta`: a non-empty text or reasoning fragment, or a Tool-call
		* fragment carrying arguments or a name. Block, usage and finish chunks do not.
		*/
		function isTokenDelta(chunk) {
			if (typeof chunk !== "object" || chunk === null) return false;
			const record = chunk;
			switch (record["type"]) {
				case "text-delta":
				case "reasoning-delta": return record["text"] !== "";
				case "tool-call-delta": return record["argumentsDelta"] !== "" || record["name"] !== void 0;
				default: return false;
			}
		}
		/**
		* Time of the first token in one durable settlement's compact stream.
		* @param stream - the settlement's stream records.
		* @returns the first token's time, or undefined when the stream carries none.
		*/
		function firstTokenTimeOf(stream) {
			if (!Array.isArray(stream)) return void 0;
			for (const candidate of stream) {
				if (typeof candidate !== "object" || candidate === null) continue;
				const record = candidate;
				const time = record.type === "chunk" ? isTokenDelta(record.chunk) && typeof record.time === "number" ? record.time : void 0 : runFirstTokenTime(record);
				if (time !== void 0) return time;
			}
		}
		/** A number from an unknown value, or undefined. */
		function number$1(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : void 0;
		}
		/** One record as a plain object, or undefined. */
		function asRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		/** Provider-reported completion tokens, or null when unrecorded. */
		function usageOutputTokens(usage) {
			const output = number$1(asRecord$1(usage)?.["outputTokens"]);
			return output !== void 0 && output >= 0 ? output : null;
		}
		/** `provider/model` named by an assistant settlement's message source. */
		function routeOf(message) {
			const source = asRecord$1(asRecord$1(message)?.["source"]);
			const provider = source?.["provider"];
			const model = source?.["model"];
			return typeof provider === "string" && typeof model === "string" ? `${provider}/${model}` : void 0;
		}
		/**
		* Fold the mirrored events into per-turn footer metrics.
		*
		* The fold shares `turn-metrics.ts`'s window semantics: a step contributes its
		* TTFT only when both its start and its first token are in the mirror, and its
		* decode time and output tokens only when both are recorded.
		* @param events - the surface events.
		* @returns Turn number → available metrics; turns with none are absent.
		*/
		function turnMetricsOf(events) {
			const folds = /* @__PURE__ */ new Map();
			const stepStarts = /* @__PURE__ */ new Map();
			for (const event of events) {
				const data = asRecord$1(event.data);
				const turn = number$1(data?.["turn"]);
				const step = number$1(data?.["step"]);
				if (turn === void 0) continue;
				if (event.type === "step/start" && step !== void 0) {
					stepStarts.set(`${turn}/${step}`, event.time);
					continue;
				}
				if (event.type !== "assistant/message" || step === void 0) continue;
				const message = data?.["message"];
				const firstToken = firstTokenTimeOf(data?.["stream"]) ?? null;
				const stepStartTime = stepStarts.get(`${turn}/${step}`) ?? null;
				const reading = {
					ttftMs: stepStartTime !== null && firstToken !== null ? Math.max(0, firstToken - stepStartTime) : null,
					decodeMs: firstToken !== null ? Math.max(0, event.time - firstToken) : null,
					outputTokens: usageOutputTokens(data?.["usage"])
				};
				let fold = folds.get(turn);
				if (fold === void 0) {
					fold = {
						firstStep: step,
						firstStepTtftMs: reading.ttftMs,
						decodeMs: 0,
						outputTokens: 0,
						sampled: false
					};
					folds.set(turn, fold);
				} else if (step < fold.firstStep) {
					fold.firstStep = step;
					fold.firstStepTtftMs = reading.ttftMs;
				}
				if (fold.routes === void 0) {
					const route = routeOf(message);
					if (route !== void 0) fold.routes = route;
				}
				if (reading.decodeMs !== null && reading.outputTokens !== null) {
					fold.decodeMs += reading.decodeMs;
					fold.outputTokens += reading.outputTokens;
					fold.sampled = true;
				}
			}
			const metrics = /* @__PURE__ */ new Map();
			for (const [turn, fold] of folds) {
				const entry = {};
				if (fold.firstStepTtftMs !== null) entry.ttftMs = fold.firstStepTtftMs;
				if (fold.sampled && fold.decodeMs > 0) entry.tokensPerSecond = fold.outputTokens / (fold.decodeMs / 1e3);
				if (fold.routes !== void 0) entry.routes = fold.routes;
				metrics.set(turn, entry);
			}
			return metrics;
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
			const surface = applySurface(events);
			const facts = turnFactsOf(surface);
			for (const event of surface) {
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
					row.resultBlocks = resultBlocksOf(data);
					row.isError = isErrorOf(data);
					row.errorCode = errorCodeOf(data);
					row.errorSummary = row.isError ? firstLineOfText(row.resultText) : "";
					row.meta = data["meta"];
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
				const row = toRow(event, data, facts);
				if (row !== void 0) rows.push(row);
			}
			markTurnTails(rows);
			return rows;
		}
		/**
		* Fold each turn's own facts out of its events.
		*
		* A turn carries its billed usage on the assistant messages it commits, and its
		* wall time between `turn/start` and `turn/end` — a running turn measures to its
		* newest event, so the reading moves as the mirror does rather than on a timer.
		* @param events - the surface events.
		* @returns the facts of every turn the log holds.
		*/
		function turnFactsOf(events) {
			const facts = /* @__PURE__ */ new Map();
			const starts = /* @__PURE__ */ new Map();
			for (const event of events) {
				const data = asRecord(event.data);
				const turn = number(data?.["turn"]);
				if (turn === void 0) continue;
				if (event.type === "turn/start") {
					starts.set(turn, event.time);
					continue;
				}
				if (event.type === "turn/end") {
					const started = starts.get(turn);
					const existing = facts.get(turn);
					facts.set(turn, {
						usage: existing?.usage ?? emptyUsage(),
						...started === void 0 ? {} : { runMs: Math.max(0, event.time - started) },
						running: false,
						...existing?.metrics === void 0 ? {} : { metrics: existing.metrics }
					});
					continue;
				}
				if (event.type !== "assistant/message") continue;
				const current = facts.get(turn) ?? {
					usage: emptyUsage(),
					running: true
				};
				const reported = asRecord(data?.["usage"]);
				current.usage.input += number(reported?.["inputTokens"]) ?? 0;
				current.usage.output += number(reported?.["outputTokens"]) ?? 0;
				current.usage.cacheRead += number(reported?.["cacheReadTokens"]) ?? 0;
				current.usage.cacheWrite += number(reported?.["cacheWriteTokens"]) ?? 0;
				current.usage.reasoning += number(reported?.["reasoningTokens"]) ?? 0;
				facts.set(turn, current);
			}
			const newest = events.reduce((latest, event) => Math.max(latest, event.time), 0);
			for (const [turn, entry] of facts) {
				if (!entry.running) continue;
				const started = starts.get(turn);
				if (started !== void 0) entry.runMs = Math.max(0, newest - started);
			}
			for (const [turn, metrics] of turnMetricsOf(events)) {
				const entry = facts.get(turn);
				if (entry === void 0) continue;
				entry.metrics = metrics;
			}
			return facts;
		}
		/** A zeroed usage total. */
		function emptyUsage() {
			return {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				reasoning: 0
			};
		}
		/**
		* Mark the row each turn's actions belong to.
		*
		* The shipped conversation puts a turn's actions on its closing message, so one
		* answer carries one copy button however many steps the turn took. A turn whose
		* last row is reasoning only keeps its actions on the answer that preceded it,
		* which is the row a reader copies.
		* @param rows - the projected rows, in order.
		*/
		function markTurnTails(rows) {
			const answered = /* @__PURE__ */ new Map();
			const anyBlock = /* @__PURE__ */ new Map();
			for (let index = 0; index < rows.length; index += 1) {
				const row = rows[index];
				if (row?.kind !== "assistant" || row.blocks.length === 0) continue;
				anyBlock.set(row.turn, index);
				if (row.blocks.some((block) => block.kind === "text")) answered.set(row.turn, index);
			}
			for (const [turn, index] of anyBlock) {
				const target = rows[answered.get(turn) ?? index];
				if (target?.kind === "assistant") target.tail = true;
			}
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
		function toRow(event, data, facts) {
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
				const turn = number(data["turn"]);
				const turnFacts = turn === void 0 ? void 0 : facts.get(turn);
				return {
					kind: "assistant",
					key,
					time: event.time,
					blocks,
					interrupted,
					...turnFacts === void 0 ? {} : { facts: turnFacts },
					turn: turn ?? 0,
					tail: false
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
				description: descriptionOf(raw),
				errorSummary: "",
				errorCode: "",
				argumentsRaw: raw,
				argumentsText: formatArguments(raw),
				resultBlocks: [],
				resultText: "",
				meta: void 0,
				isError: false,
				pending: true
			};
		}
		/** Build the row for a `tool/result` whose call is not in the window. */
		function toolResultOnlyRow(event, callId, data) {
			const resultText = resultTextOf(data);
			const isError = isErrorOf(data);
			return {
				kind: "tool",
				key: String(event.seq),
				time: event.time,
				callId,
				name: "",
				summary: "",
				description: "",
				errorSummary: isError ? firstLineOfText(resultText) : "",
				errorCode: errorCodeOf(data),
				argumentsRaw: "",
				argumentsText: "",
				resultBlocks: resultBlocksOf(data),
				resultText,
				meta: data["meta"],
				isError,
				pending: false
			};
		}
		/** Read the pairing id a `tool/result` carries on its message source. */
		function callIdOf(data) {
			const source = asRecord(asRecord(data["message"])?.["source"]);
			return typeof source?.["callId"] === "string" ? source["callId"] : "";
		}
		/** The result's content blocks, unwrapped from the `tool-result` envelope. */
		function resultBlocksOf(data) {
			const message = asRecord(data["message"]);
			const first = asRecord((Array.isArray(message?.["content"]) ? message["content"] : [])[0]);
			return Array.isArray(first?.["content"]) ? first["content"] : [];
		}
		/** The structured failure code a result carries, when it carries one. */
		function errorCodeOf(data) {
			const error = asRecord(data["error"]);
			return typeof error?.["code"] === "string" ? error["code"] : "";
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
		/**
		* The call's own one-line description.
		*
		* The shipped terminal row shows this instead of the command it runs, which is
		* the difference between a row that says what the call is for and one that
		* repeats a shell line.
		* @param raw - the call's raw arguments string.
		* @returns the description, or an empty string when the tool was given none.
		*/
		function descriptionOf(raw) {
			if (raw === "") return "";
			const description = asRecord(parseJson(raw))?.["description"];
			return typeof description === "string" ? oneLine(description) : "";
		}
		/** The first non-empty line, which is what a failure summary shows. */
		function firstLineOfText(text) {
			for (const line of text.split("\n")) {
				const trimmed = line.trim();
				if (trimmed !== "") return trimmed;
			}
			return "";
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
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\accessibility.module.css.mjs
		const css$5 = "._8eMdKa_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId$5 = "dsh-session-sync/accessibility.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$5) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId$5;
			tag.textContent = css$5;
			document.head.appendChild(tag);
		}
		var accessibility_module_css_default = { "visuallyHidden": "_8eMdKa_visuallyHidden" };
		//#endregion
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\MessageIconActions.module.css.mjs
		const css$4 = ".RWTQrG_actions{height:calc(28px + var(--dsh-content-font-delta,0px));align-items:center;gap:8px;display:flex}.RWTQrG_timeStart{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px}.RWTQrG_timeEnd{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap}@media (hover:hover){[data-actions-reveal=hover] .RWTQrG_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])) .RWTQrG_actions{opacity:0;transition:opacity 80ms}[data-actions-reveal=hover]:hover .RWTQrG_actions,[data-actions-reveal=hover]:focus-within .RWTQrG_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):hover .RWTQrG_actions,:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering]):has(~:is([data-chat-flow-kind=user],[data-chat-flow-kind=steering])):focus-within .RWTQrG_actions{opacity:1}}.RWTQrG_action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.RWTQrG_action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}.RWTQrG_action:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}.RWTQrG_action[data-unavailable]{cursor:default;opacity:.4}.RWTQrG_action[data-unavailable]:hover{color:var(--dsw-alias-label-tertiary);background:0 0}.RWTQrG_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId$4 = "dsh-session-sync/MessageIconActions.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$4) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId$4;
			tag.textContent = css$4;
			document.head.appendChild(tag);
		}
		var MessageIconActions_module_css_default = {
			"action": "RWTQrG_action",
			"actions": "RWTQrG_actions",
			"timeEnd": "RWTQrG_timeEnd",
			"timeStart": "RWTQrG_timeStart",
			"visuallyHidden": "RWTQrG_visuallyHidden"
		};
		//#endregion
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\ReasoningRow.module.css.mjs
		const css$3 = "._5Ynq8G_root{flex-direction:column;display:flex}._5Ynq8G_root:not([data-expanded]){contain:size layout;height:calc(24px + var(--dsh-content-font-delta,0px))}._5Ynq8G_row{position:relative;overflow:hidden}._5Ynq8G_root[data-state=running] ._5Ynq8G_row:after{content:\"\";inset-block:0;background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite _5Ynq8G_dsh-reasoning-row-sweep;position:absolute;left:0}@keyframes _5Ynq8G_dsh-reasoning-row-sweep{0%{left:-300px}90%,to{left:100%}}._5Ynq8G_leading{flex-shrink:0}._5Ynq8G_chevron{color:var(--dsw-alias-label-secondary)}._5Ynq8G_title{font-weight:400}._5Ynq8G_separator{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}._5Ynq8G_summary{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:nowrap;flex:auto;overflow:hidden}._5Ynq8G_summaryText{text-overflow:ellipsis;display:block;overflow:hidden}._5Ynq8G_summary[data-follow-end]{justify-content:flex-end;display:flex}._5Ynq8G_summary[data-follow-end] ._5Ynq8G_summaryText{text-align:start;text-overflow:clip;flex:none;width:max-content;min-width:100%;overflow:visible}._5Ynq8G_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));white-space:pre-wrap;word-break:break-word}@media (prefers-reduced-motion:reduce){._5Ynq8G_root[data-state=running] ._5Ynq8G_row:after{animation:none}}";
		const tagId$3 = "dsh-session-sync/ReasoningRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$3) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId$3;
			tag.textContent = css$3;
			document.head.appendChild(tag);
		}
		var ReasoningRow_module_css_default = {
			"chevron": "_5Ynq8G_chevron",
			"dsh-reasoning-row-sweep": "_5Ynq8G_dsh-reasoning-row-sweep",
			"leading": "_5Ynq8G_leading",
			"root": "_5Ynq8G_root",
			"row": "_5Ynq8G_row",
			"separator": "_5Ynq8G_separator",
			"summary": "_5Ynq8G_summary",
			"summaryText": "_5Ynq8G_summaryText",
			"thinkBody": "_5Ynq8G_thinkBody",
			"title": "_5Ynq8G_title"
		};
		//#endregion
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\ToolRow.module.css.mjs
		const css$2 = ".XHM18W_root{flex-direction:column;display:flex}.XHM18W_row{position:relative;overflow:hidden}.XHM18W_root[data-state=running] .XHM18W_row:after{content:\"\";background:linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--dsw-alias-bg-base) 60%, transparent) 55%, transparent 100%);pointer-events:none;width:300px;animation:2.6s ease-out infinite XHM18W_dsh-tool-row-sweep;position:absolute;top:0;bottom:0;left:0}@keyframes XHM18W_dsh-tool-row-sweep{0%{left:-300px}90%,to{left:100%}}.XHM18W_leading{flex-shrink:0}.XHM18W_root[data-tool^=cordis_] .XHM18W_leading,.XHM18W_root[data-tool^=cordis_] .XHM18W_title{color:var(--dsw-alias-state-business-primary)}.XHM18W_root[data-tool^=cordis_] .XHM18W_title{font-weight:500}.XHM18W_root[data-tool^=cordis_] .XHM18W_sep{background:var(--dsw-alias-state-business-primary)}.XHM18W_chevron{color:var(--dsw-alias-label-secondary)}.XHM18W_title{font-weight:400}.XHM18W_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.XHM18W_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);flex:auto;overflow:hidden}.XHM18W_summarySuffix{white-space:nowrap;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);flex:none;margin-left:4px}.XHM18W_diffStat{font-family:var(--ds-font-family-code);font-size:calc(var(--dsh-content-font-size-secondary,13px) - 2px);color:var(--dsw-alias-label-caption);margin-left:10px;transform:translateY(.5px)}.XHM18W_fileLink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-secondary);text-decoration:underline dotted;text-decoration-color:var(--dsw-alias-label-tertiary);text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:0 auto;margin:0;padding:0;text-decoration-thickness:1px;overflow:hidden}.XHM18W_fileLink:hover{color:var(--dsw-alias-label-primary);text-decoration-color:currentColor}.XHM18W_errorSummary{color:var(--dsw-alias-state-error-primary)}.XHM18W_bodyWrap{flex-direction:column;display:flex}.XHM18W_inspectButton{border:.5px solid var(--dsw-alias-border-l3);corner-shape:round;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.XHM18W_root:hover .XHM18W_inspectButton,.XHM18W_inspectButton:focus-visible{opacity:1}.XHM18W_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.XHM18W_bodyScroll{max-height:260px;overflow-y:auto}.XHM18W_ioCard{border:.5px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);border-radius:12px;flex-direction:column;margin:4px 0 4px 4px;display:flex}.XHM18W_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.XHM18W_ioSection::-webkit-scrollbar-thumb{background-clip:padding-box;border:2px solid #0000;border-radius:6px}.XHM18W_ioSection::-webkit-scrollbar-track{margin:6px 0}.XHM18W_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.XHM18W_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:.5px}.XHM18W_ioText{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary)}.XHM18W_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}.XHM18W_codeBody,.XHM18W_terminalBody,.XHM18W_diffBody,.XHM18W_readBody,.XHM18W_imageBody,.XHM18W_searchBody,.XHM18W_webBody{margin:4px 0 4px 4px}.XHM18W_searchRecovery{white-space:pre-wrap;overflow-wrap:anywhere;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary);margin:4px 0 4px 4px}.XHM18W_imageLabel{overflow-wrap:anywhere;font:var(--dsw-font-sm-13);color:var(--dsw-alias-label-secondary);margin-bottom:4px}.XHM18W_imageMeta{white-space:pre-wrap;overflow-wrap:anywhere;font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-tertiary)}.XHM18W_codeBody{--dsl-code-block-content-font:var(--dsw-font-markdown-code-block-small)}.XHM18W_terminalBody{--dsl-terminal-font:var(--dsw-font-markdown-code-block-small);--dsl-terminal-line-height:18px;--dsl-terminal-output-max-height:224px;border:.5px solid var(--dsw-alias-border-l1)}.XHM18W_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId$2 = "dsh-session-sync/ToolRow.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$2) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId$2;
			tag.textContent = css$2;
			document.head.appendChild(tag);
		}
		var ToolRow_module_css_default = {
			"bodyScroll": "XHM18W_bodyScroll",
			"bodyWrap": "XHM18W_bodyWrap",
			"chevron": "XHM18W_chevron",
			"codeBody": "XHM18W_codeBody",
			"diffBody": "XHM18W_diffBody",
			"diffStat": "XHM18W_diffStat",
			"dsh-tool-row-sweep": "XHM18W_dsh-tool-row-sweep",
			"errorSummary": "XHM18W_errorSummary",
			"fileLink": "XHM18W_fileLink",
			"imageBody": "XHM18W_imageBody",
			"imageLabel": "XHM18W_imageLabel",
			"imageMeta": "XHM18W_imageMeta",
			"inspectButton": "XHM18W_inspectButton",
			"ioCard": "XHM18W_ioCard",
			"ioDivider": "XHM18W_ioDivider",
			"ioLabel": "XHM18W_ioLabel",
			"ioSection": "XHM18W_ioSection",
			"ioText": "XHM18W_ioText",
			"leading": "XHM18W_leading",
			"readBody": "XHM18W_readBody",
			"root": "XHM18W_root",
			"row": "XHM18W_row",
			"searchBody": "XHM18W_searchBody",
			"searchRecovery": "XHM18W_searchRecovery",
			"sep": "XHM18W_sep",
			"summary": "XHM18W_summary",
			"summarySuffix": "XHM18W_summarySuffix",
			"terminalBody": "XHM18W_terminalBody",
			"title": "XHM18W_title",
			"visuallyHidden": "XHM18W_visuallyHidden",
			"webBody": "XHM18W_webBody"
		};
		//#endregion
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\TurnUsagePanel.module.css.mjs
		const css$1 = ".Vf0xqa_root{min-width:0;display:inline-flex}.Vf0xqa_root+.Vf0xqa_root{margin-left:-6px}.Vf0xqa_trigger{min-width:0;height:calc(28px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);font-variant-numeric:tabular-nums;line-height:calc(24px + var(--dsh-content-font-delta,0px));white-space:nowrap;cursor:pointer;background:0 0;border:none;border-radius:28px;align-items:center;gap:4px;padding:6px 8px;display:inline-flex}.Vf0xqa_label{text-overflow:ellipsis;min-width:0;overflow:hidden}.Vf0xqa_trigger svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px));flex:none}.Vf0xqa_trigger:hover,.Vf0xqa_trigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}@media (width<=480px){.Vf0xqa_trigger{width:calc(28px + var(--dsh-content-font-delta,0px));justify-content:center;padding:6px}.Vf0xqa_trigger .Vf0xqa_label{display:none}.Vf0xqa_root+.Vf0xqa_root{margin-left:0}}";
		const tagId$1 = "dsh-session-sync/TurnUsagePanel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var TurnUsagePanel_module_css_default = {
			"label": "Vf0xqa_label",
			"root": "Vf0xqa_root",
			"trigger": "Vf0xqa_trigger"
		};
		//#endregion
		//#region \0dsh-css:C:\Users\14339\Desktop\git\dsh-session-sync\src\client\stat-dialog.module.css.mjs
		const css = ".Q8mwTG_panel{z-index:1100;box-sizing:border-box;background:var(--dsw-specific-menu);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;border-radius:12px;padding:16px;font-size:12px;line-height:18px;position:fixed}.Q8mwTG_title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}.Q8mwTG_titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}.Q8mwTG_titleValue{font-variant-numeric:tabular-nums}.Q8mwTG_titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}.Q8mwTG_titleLabel svg{flex:none;width:14px;height:14px}.Q8mwTG_details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}.Q8mwTG_details dt,.Q8mwTG_details dd{min-width:0;margin:0}.Q8mwTG_details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}.Q8mwTG_details .Q8mwTG_route{overflow-wrap:anywhere}.Q8mwTG_reasoning{color:var(--dsw-alias-label-tertiary);white-space:nowrap}";
		const tagId = "dsh-session-sync/stat-dialog.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-sync";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var stat_dialog_module_css_default = {
			"details": "Q8mwTG_details",
			"panel": "Q8mwTG_panel",
			"reasoning": "Q8mwTG_reasoning",
			"route": "Q8mwTG_route",
			"title": "Q8mwTG_title",
			"titleLabel": "Q8mwTG_titleLabel",
			"titleRule": "Q8mwTG_titleRule",
			"titleValue": "Q8mwTG_titleValue"
		};
		//#endregion
		//#region src/client/stat-panels.tsx
		/**
		* The shipped turn-stat dialogs: a database pill labelled with the turn's total
		* that click-opens the per-turn usage dialog, and a clock pill labelled with the
		* turn's wall time that click-opens the turn-time dialog.
		*
		* Ported from `ui-chat`'s `TurnUsagePanel.tsx` and `stat-dialog.ts`, which a
		* plugin cannot import: the seat (open state, viewport-clamped placement above
		* the trigger, outside-pointer and Escape close) and the panel's markup are
		* theirs, and its skin is `stat-dialog.module.css` copied verbatim. The pills
		* themselves wear the copied `TurnUsagePanel.module.css`.
		*/
		/** Viewport margin the placement clamp keeps (the shipped Menu portal margin). */
		const PANEL_MARGIN = 12;
		/** Distance between the trigger's top edge and the panel's bottom. */
		const PANEL_GAP = 8;
		/**
		* Unplaced portal panel: hidden but laid out, so the clamp measures real
		* dimensions (the `useAnchoredPosition` measure pass).
		*/
		const MEASURE_STYLE = {
			visibility: "hidden",
			left: 0,
			top: 0
		};
		/**
		* One trigger-anchored dialog seat: open state, viewport-clamped placement, and
		* close on an outside pointer or Escape.
		* @returns the seat; spread `pos ?? MEASURE_STYLE` onto the portaled panel.
		*/
		function useStatDialog() {
			const [open, setOpen] = react.useState(false);
			const rootRef = react.useRef(null);
			const panelRef = react.useRef(null);
			const pos = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: rootRef,
				panelRef,
				side: "top",
				gap: PANEL_GAP,
				margin: PANEL_MARGIN
			});
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, setOpen, panelRef);
			react.useEffect(() => {
				if (!open) return;
				const onKeyDown = (event) => {
					if (event.key === "Escape") setOpen(false);
				};
				document.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("keydown", onKeyDown);
				};
			}, [open]);
			return {
				open,
				setOpen,
				rootRef,
				panelRef,
				pos
			};
		}
		/** One dialog row: a term and its figure. */
		function Row({ label, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dd", { children })] });
		}
		/** The shipped exact-count spelling: the number plus its `tok` unit. */
		function exactCount(value, t) {
			return t("turnUsageCount", { count: formatExactTokens(value, t) });
		}
		/**
		* Turn-usage pill with its click-open details dialog.
		*
		* The shipped dialog reads provider buckets; the mirror carries the same ones on
		* each assistant message, so `TurnUsage` maps onto them one for one. A bucket the
		* turn never reported is left out rather than shown as a zero, which is what the
		* shipped panel does with an absent field.
		* @param props - the turn's usage, its route, and the translate seat.
		* @returns the trigger and, while open, its portaled dialog.
		*/
		function TurnUsagePill({ usage, metrics, t }) {
			const { open, setOpen, rootRef, panelRef, pos } = useStatDialog();
			const total = turnTotalTokens(usage);
			const prompt = billedInputTokens(usage);
			const cacheHit = usage.cacheRead > 0 ? formatCacheHitPercent(usage.cacheRead, prompt, 1) : null;
			const routes = metrics?.routes ?? "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: rootRef,
				className: TurnUsagePanel_module_css_default.root,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: TurnUsagePanel_module_css_default.trigger,
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: TurnUsagePanel_module_css_default.label,
						children: t("turnUsageConsumed", { total: formatTokens(total, t) })
					})]
				}), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: panelRef,
					className: stat_dialog_module_css_default.panel,
					role: "dialog",
					"aria-label": t("turnUsageTitle"),
					style: pos ?? MEASURE_STYLE,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: stat_dialog_module_css_default.title,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: stat_dialog_module_css_default.titleLabel,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconDatabaseOutlineRegular, {}), t("turnUsageTitle")]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: stat_dialog_module_css_default.titleValue,
								children: exactCount(total, t)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: stat_dialog_module_css_default.titleRule,
							"aria-hidden": true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: stat_dialog_module_css_default.details,
							"data-turn-usage-details": true,
							children: [
								routes !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnUsageModel"),
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: stat_dialog_module_css_default.route,
										children: routes
									})
								}),
								cacheHit !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnUsageCacheHit"),
									children: `${cacheHit}%`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnUsageInput"),
									children: exactCount(usage.input, t)
								}),
								usage.cacheRead > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnUsageCacheRead"),
									children: exactCount(usage.cacheRead, t)
								}),
								usage.cacheWrite > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnUsageCacheWrite"),
									children: exactCount(usage.cacheWrite, t)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Row, {
									label: t("turnUsageOutput"),
									children: [exactCount(usage.output, t), usage.reasoning > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: stat_dialog_module_css_default.reasoning,
										children: t("turnUsageReasoning", { tokens: exactCount(usage.reasoning, t) })
									})]
								})
							]
						})
					]
				}), document.body)]
			});
		}
		/**
		* Turn-time pill with its click-open details dialog.
		*
		* The duration always stands; throughput and TTFT appear only when the turn's
		* steps recorded them, which is the shipped panel's own rule.
		* @param props - the turn's run time, its folded metrics, and the translate seat.
		* @returns the trigger and, while open, its portaled dialog.
		*/
		function TurnTimePill({ runMs, metrics, t }) {
			const { open, setOpen, rootRef, panelRef, pos } = useStatDialog();
			const tokensPerSecond = metrics?.tokensPerSecond;
			const ttftMs = metrics?.ttftMs;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				ref: rootRef,
				className: TurnUsagePanel_module_css_default.root,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: TurnUsagePanel_module_css_default.trigger,
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconClockOutlineRegular, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: TurnUsagePanel_module_css_default.label,
						children: t("messageRanFor", { duration: formatRunDuration(runMs, t) })
					})]
				}), open && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: panelRef,
					className: stat_dialog_module_css_default.panel,
					role: "dialog",
					"aria-label": t("turnTimeTitle"),
					style: pos ?? MEASURE_STYLE,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: stat_dialog_module_css_default.title,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: stat_dialog_module_css_default.titleLabel,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconClockOutlineRegular, {}), t("turnTimeTitle")]
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: stat_dialog_module_css_default.titleRule,
							"aria-hidden": true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dl", {
							className: stat_dialog_module_css_default.details,
							"data-turn-time-details": true,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnTimeDuration"),
									children: formatRunDuration(runMs, t)
								}),
								tokensPerSecond !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnTimeSpeed"),
									children: t("tokensPerSecond", { tps: formatTokensPerSecond(tokensPerSecond) })
								}),
								ttftMs !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
									label: t("turnTimeTtft"),
									children: t("durationSeconds", { seconds: formatLatencySeconds(ttftMs) })
								})
							]
						})
					]
				}), document.body)]
			});
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
							icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, {}),
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
						official: props.official,
						renderSlot: props.renderSlot,
						SessionProvider: props.SessionProvider,
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
						children: props.icon === "machine" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular, { size: 16 }) : props.open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconFolderCloseRegular, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${sync_module_css_default.treeSlot} ${sync_module_css_default.treeChevron}`,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTriangleRightFillRegular, { className: props.open ? sync_module_css_default.arrowOpen : void 0 })
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
			const latestTurn = react.useMemo(() => rows.reduce((newest, row) => row.kind === "assistant" && row.turn > newest ? row.turn : newest, state.live.turn), [rows, state.live.turn]);
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
			const shipped = props.official.supported && props.renderSlot !== void 0 && props.SessionProvider !== void 0 && state.transcript !== void 0 ? props.official.referenceFor(props.machineName, session.sessionId) : void 0;
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
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconPanelLeftOutlineRegular, {}),
								"aria-label": props.listHidden ? t("listShow") : t("listHide"),
								onClick: props.toggleList
							}),
							"          ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								variant: "ghost",
								size: "sm",
								className: sync_module_css_default.narrowOnly,
								icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronLeftOutlineRegular, {}),
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
				}) : shipped !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sync_module_css_default.officialPane,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(props.SessionProvider, {
						session: shipped,
						children: props.renderSlot(OFFICIAL_SLOT, {})
					})
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
								labels,
								latestTurn
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
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {})
						})
					})]
				}),
				(shipped === void 0 || tab === "trajectory") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRightUpOutlineRegular, {})
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
		function TranscriptLine({ t, row, labels, latestTurn }) {
			if (row.kind === "user") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: sync_module_css_default.userRow,
				"data-chat-flow-kind": "user",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: sync_module_css_default.bubble,
					children: row.text
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageActions, {
					t,
					text: row.text,
					place: "user",
					time: row.time
				})]
			});
			if (row.kind === "assistant") {
				const settled = row.tail && row.facts?.running !== true;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: sync_module_css_default.assistantRow,
					"data-chat-flow-kind": "assistant",
					"data-chat-turn": row.turn,
					...settled ? { "data-actions-reveal": row.turn >= latestTurn ? "always" : "hover" } : {},
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
						settled && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MessageActions, {
							t,
							text: assistantTextOf(row.blocks),
							place: "assistant",
							time: row.time,
							...row.facts === void 0 ? {} : { facts: row.facts }
						})
					]
				});
			}
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
		* Copy, turn usage, turn time, and the message clock — the shipped `IconActions`
		* row plus the two turn-stat pills that sit in it.
		*
		* The copy feedback is local because the primitive that owns it
		* (`useCopyFeedback`) is not part of the published surface; the behaviour is the
		* shipped one: a one-second check swap, and no second write while it shows. Both
		* pills are the shipped ones (`stat-panels.tsx`): a click opens their detail
		* dialog in a portal above the trigger.
		*/
		function MessageActions({ t, text, place, time, facts }) {
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
			const label = copied ? t("copiedCode") : t("messageCopy");
			const clock = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: place === "user" ? MessageIconActions_module_css_default.timeStart : MessageIconActions_module_css_default.timeEnd,
				children: formatMessageClock(time, t)
			});
			const total = facts === void 0 ? 0 : turnTotalTokens(facts.usage);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: place === "user" ? MessageIconActions_module_css_default.actions : `${MessageIconActions_module_css_default.actions} ${sync_module_css_default.messageActions}`,
				children: [
					place === "user" && clock,
					text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label,
						side: "bottom",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: MessageIconActions_module_css_default.action,
							"aria-label": label,
							onClick: onCopy,
							children: copied ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular, {})
						})
					}),
					facts !== void 0 && total > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnUsagePill, {
						t,
						usage: facts.usage,
						metrics: facts.metrics
					}),
					facts !== void 0 && facts.runMs !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnTimePill, {
						t,
						runMs: facts.runMs,
						metrics: facts.metrics
					}),
					place === "assistant" && clock
				]
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ReasoningRow_module_css_default.root,
				"data-variant": "think",
				"data-state": streaming === true ? "running" : "ok",
				"data-expanded": open || void 0,
				children: [streaming === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: accessibility_module_css_default.visuallyHidden,
					children: t("rowRunning")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: ReasoningRow_module_css_default.row,
					leadingClassName: ReasoningRow_module_css_default.leading,
					titleClassName: ReasoningRow_module_css_default.title,
					chevronClassName: ReasoningRow_module_css_default.chevron,
					icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutlineRegular, { size: 14 }),
					title: t("reasoning"),
					open,
					expandable: true,
					expandOnRowClick: true,
					onToggle: () => {
						setOpen((current) => !current);
					},
					collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ReasoningRow_module_css_default.separator,
						"aria-hidden": true
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: ReasoningRow_module_css_default.summary,
						"data-follow-end": streaming === true || void 0,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ReasoningRow_module_css_default.summaryText,
							children: summary
						})
					})] }),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ReasoningRow_module_css_default.thinkBody,
						children: reasoning
					})
				})]
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
		/**
		* One tool call, folded into a single row — the shipped `ToolRow` chassis.
		*
		* One row, never two: the shipped generic card puts the arguments and the
		* result in the expanded body's IN/OUT sections rather than spending a second
		* row on the result. The collapsed line is the failure line, or a terminal
		* card's own description, or the arguments' gist; a diff row carries its
		* `+added -removed` size; and the body is the first shipped card the call and
		* its result can build, falling back to the IN/OUT sections.
		*/
		function ToolCallRow({ t, row }) {
			const [open, setOpen] = react.useState(false);
			const model = toolRowModel(row);
			const terminal = terminalCard(row);
			const diff = diffCard(row);
			const read = readCard(row);
			const search = searchCard(row);
			const web = webCard(row);
			const state = model.state === "ok" && terminal !== null && terminalFailed(terminal) ? "error" : model.state;
			const card = terminal ?? diff ?? read ?? search ?? web;
			const failureLine = state === "error" ? model.errorSummary : null;
			const summaryText = failureLine ?? terminal?.description ?? model.summary;
			const bodyRaw = model.filePath !== void 0 ? null : model.bodyRaw;
			const stat = failureLine === null && diff !== null ? diffStat(diff.diffs) : null;
			const expandable = bodyRaw !== null || model.output !== null || card !== null;
			const leading = () => {
				if (state === "error") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ToolRow_module_css_default.leading,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" })
				});
				if (state === "stopped") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ToolRow_module_css_default.leading,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" })
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ToolRow_module_css_default.leading,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToolGlyphIcon, { glyph: toolPresentation(row.name).glyph })
				});
			};
			const status = state === "running" ? t("rowRunning") : state === "error" ? t("rowFailed") : state === "stopped" ? t("rowStopped") : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ToolRow_module_css_default.root,
				"data-state": state,
				"data-variant": model.variant,
				"data-tool": row.name,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: ToolRow_module_css_default.row,
					leadingClassName: ToolRow_module_css_default.leading,
					titleClassName: ToolRow_module_css_default.title,
					chevronClassName: ToolRow_module_css_default.chevron,
					icon: leading(),
					title: t(model.titleKey),
					open: open && expandable,
					expandable,
					expandOnRowClick: true,
					onToggle: () => {
						setOpen((current) => !current);
					},
					collapsedContent: summaryText !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ToolRow_module_css_default.sep,
							"aria-hidden": true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: failureLine !== null ? ToolRow_module_css_default.errorSummary : ToolRow_module_css_default.summary,
							children: summaryText
						}),
						stat !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: ToolRow_module_css_default.diffStat,
							children: stat
						})
					] }),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: ToolRow_module_css_default.bodyWrap,
						children: terminal !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
							...terminal,
							maxLines: Infinity,
							labels: terminalBlockLabels(t),
							className: ToolRow_module_css_default.terminalBody
						}) : diff !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DiffBlock, {
							diffs: [...diff.diffs],
							labels: diffBlockLabels(t),
							maxLines: 8,
							className: ToolRow_module_css_default.diffBody
						}) : read !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.ReadBlock, {
							...read,
							labels: readBlockLabels(t),
							maxLines: 8,
							className: ToolRow_module_css_default.readBody
						}) : search !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.SearchBlock, {
							...search.card,
							labels: searchBlockLabels(t),
							maxLines: 8,
							className: ToolRow_module_css_default.searchBody
						}), search.recovery !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: ToolRow_module_css_default.searchRecovery,
							children: search.recovery
						})] }) : web !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.WebBlock, {
							...web,
							labels: webBlockLabels(t),
							className: ToolRow_module_css_default.webBody
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ToolRow_module_css_default.ioCard,
							children: [
								bodyRaw !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: ToolRow_module_css_default.ioSection,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioLabel,
										children: t("rowInput")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioText,
										children: row.argumentsText
									})]
								}), model.output !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: ToolRow_module_css_default.ioDivider,
									"aria-hidden": true
								})] }),
								model.output !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: ToolRow_module_css_default.ioSection,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioLabel,
										children: t("rowOutput")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioText,
										"data-error": state === "error" || void 0,
										children: model.output
									})]
								}),
								bodyRaw === null && model.output === null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: ToolRow_module_css_default.ioSection,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioLabel,
										children: t("rowOutput")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: ToolRow_module_css_default.ioText,
										children: model.state === "running" ? t("toolRunning") : t("toolNoOutput")
									})]
								})
							]
						})
					})
				}), status !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: ToolRow_module_css_default.visuallyHidden,
					children: status
				})]
			});
		}
		/**
		* The glyph a tool family leads with —the same mark the shipped toolview for
		* that family registers, at 14 inside the row's 16px leading box.
		*/
		function ToolGlyphIcon({ glyph }) {
			switch (glyph) {
				case "browse": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBrowseOutlineRegular, { size: 14 });
				case "edit": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconEditOutlineRegular, { size: 14 });
				case "search": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSearchOutlineRegular, { size: 14 });
				case "terminal": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular, { size: 14 });
				case "globe": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconGlobeOutlineRegular, { size: 14 });
				case "question": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconQuestionOutlineRegular, { size: 14 });
				case "plan": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChecklistOutlineRegular, { size: 14 });
				case "share": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconShareOutlineRegular, { size: 14 });
				default: return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconSparkleRegular, { size: 14 });
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
			copiedCode: "复制成功",
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
			messageCopy: "复制",
			toolTitleWrite: "写入",
			toolTitlePwsh: "Pwsh",
			toolTitleBash: "Bash",
			toolTitleGrep: "Grep",
			toolTitleGlob: "Glob",
			toolTitleWebSearch: "网页搜索",
			toolTitleWebFetch: "网页获取",
			toolTitleReadImage: "读取图片",
			rowInput: "输入",
			rowOutput: "输出",
			collapse: "收起",
			diffCollapseAria: "收起差异",
			diffExpandAria: "展开其余 {count} 行差异",
			diffExpandRest: "… 其余 {count} 行",
			diffFilesOne: "{count} 个文件",
			diffFilesOther: "{count} 个文件",
			readWindow: "显示 {shown} / {total} 行",
			readCollapseAria: "收起内容",
			readExpandAria: "展开其余 {count} 行",
			readExpandRest: "… 其余 {count} 行",
			searchPaths: "{shown} 个·径",
			searchPathsTruncated: "显示 {shown} / 共 {total} 个·径",
			searchMatches: "{shown} 处匹配 · {files} 个文件",
			searchMatchesTruncated: "显示 {shown} / 共 {total} 处匹配 · {files} 个文件",
			searchNoResults: "无结果",
			searchCollapseAria: "收起结果",
			searchExpandAria: "展开其余 {count} 行结果",
			searchExpandRest: "… 其余 {count} 行",
			webNoResults: "未找到结果",
			webSourcesTruncated: "来源列表已截断",
			webHttp: "HTTP",
			webContentTruncated: "内容已截断",
			terminalSignal: "信号 {signal}",
			terminalExitCode: "退出码 {code}",
			terminalNoExitCode: "未正常退出",
			terminalRunning: "执行中",
			terminalFailed: "失败",
			terminalDone: "完成",
			terminalNoOutput: "（无输出）",
			terminalCollapseAria: "收起输出",
			terminalExpandAria: "展开其余 {n} 行输出",
			terminalExpandRest: "… 其余 {n} 行",
			terminalSendInput: "（发送输入）",
			terminalSession: "终端 {sessionId}",
			rowRunning: "执行中",
			rowFailed: "失败",
			rowStopped: "已停止",
			clockMd: "{m}月{d}日",
			clockYmd: "{y}年{m}月{d}日",
			durationSeconds: "{seconds}秒",
			durationMinutes: "{minutes}分{seconds}秒",
			numberThousand: "{value}K",
			numberMillion: "{value}M",
			numberGroupSeparator: ",",
			messageRanFor: "用时 {duration}",
			turnUsageTitle: "本轮用量",
			turnUsageConsumed: "用量 {total}",
			turnUsageCount: "{count} tok",
			turnUsageModel: "提供方 / 模型",
			turnUsageCacheHit: "缓存命中",
			turnUsageInput: "未缓存输入",
			turnUsageCacheRead: "缓存读取",
			turnUsageCacheWrite: "缓存写入",
			turnUsageOutput: "输出",
			turnUsageReasoning: "（其中推理 {tokens}）",
			turnTimeTitle: "本轮用时和速度",
			turnTimeDuration: "本轮总用时",
			turnTimeSpeed: "输出速度（TPS）",
			turnTimeTtft: "首 token 用时（TTFT）",
			tokensPerSecond: "{tps} tok/s"
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
			messageCopy: "Copy",
			toolTitleWrite: "Write",
			toolTitlePwsh: "Pwsh",
			toolTitleBash: "Bash",
			toolTitleGrep: "Grep",
			toolTitleGlob: "Glob",
			toolTitleWebSearch: "Search",
			toolTitleWebFetch: "Fetch",
			toolTitleReadImage: "Read image",
			rowInput: "IN",
			rowOutput: "OUT",
			collapse: "Collapse",
			diffCollapseAria: "Collapse diff",
			diffExpandAria: "Expand {count} more diff lines",
			diffExpandRest: "… {count} more lines",
			diffFilesOne: "{count} file",
			diffFilesOther: "{count} files",
			readWindow: "Showing {shown} of {total} lines",
			readCollapseAria: "Collapse content",
			readExpandAria: "Expand {count} more lines",
			readExpandRest: "… {count} more lines",
			searchPaths: "{shown} paths",
			searchPathsTruncated: "Showing {shown} of {total} paths",
			searchMatches: "{shown} matches · {files} files",
			searchMatchesTruncated: "Showing {shown} of {total} matches · {files} files",
			searchNoResults: "No results",
			searchCollapseAria: "Collapse results",
			searchExpandAria: "Expand {count} more result lines",
			searchExpandRest: "… {count} more lines",
			webNoResults: "No results found",
			webSourcesTruncated: "Source list truncated",
			webHttp: "HTTP",
			webContentTruncated: "Content truncated",
			terminalSignal: "signal {signal}",
			terminalExitCode: "exit code {code}",
			terminalNoExitCode: "no exit code",
			terminalRunning: "Running",
			terminalFailed: "Failed",
			terminalDone: "Done",
			terminalNoOutput: "No output",
			terminalCollapseAria: "Collapse output",
			terminalExpandAria: "Expand the remaining {n} output lines",
			terminalExpandRest: "… {n} more lines",
			terminalSendInput: "(send input)",
			terminalSession: "Terminal {sessionId}",
			rowRunning: "Running",
			rowFailed: "Failed",
			rowStopped: "Stopped",
			clockMd: "{m}/{d}",
			clockYmd: "{y}/{m}/{d}",
			durationSeconds: "{seconds}s",
			durationMinutes: "{minutes}m {seconds}s",
			numberThousand: "{value}K",
			numberMillion: "{value}M",
			numberGroupSeparator: ",",
			messageRanFor: "Ran for {duration}",
			turnUsageTitle: "Turn usage",
			turnUsageConsumed: "Usage {total}",
			turnUsageCount: "{count} tok",
			turnUsageModel: "Provider / model",
			turnUsageCacheHit: "Cache hit",
			turnUsageInput: "Uncached input",
			turnUsageCacheRead: "Cached input",
			turnUsageCacheWrite: "Cache write",
			turnUsageOutput: "Output",
			turnUsageReasoning: " ({tokens} reasoning)",
			turnTimeTitle: "Turn time and speed",
			turnTimeDuration: "Total run time",
			turnTimeSpeed: "Tokens per second (TPS)",
			turnTimeTtft: "Time to first token (TTFT)",
			tokensPerSecond: "{tps} tok/s"
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
			const official = new OfficialSessions(ctx, client);
			ctx.effect(() => {
				const detach = client.observe(official);
				return () => {
					detach();
					official.release();
				};
			}, "dsh-session-sync: shipped-renderer mirror");
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
				children: { [OFFICIAL_SLOT]: {
					kind: "single",
					scope: "session"
				} },
				inject: () => ({
					hooks: { sync: client.snapshot },
					openSession: (machineName, sessionId) => client.openSession(machineName, sessionId),
					closeSession: () => {
						client.closeSession();
					},
					sendPrompt: (text) => client.sendPrompt(text),
					official
				})
			}, SyncPanel));
			ctx.slots.inject(OFFICIAL_SLOT, () => ctx.slots.register({ name: OFFICIAL_SLOT }, OfficialConversation));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map