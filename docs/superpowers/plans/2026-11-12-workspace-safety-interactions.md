# Workspace safety and interactions implementation plan

Goal: isolate file-area clear, keep workbench at normal window level, improve canvas pointer operations and practical commands without changing visual direction or content storage.
Architecture: existing SQLite worker transactions and settings, existing single native window with independent quick/workbench mode policies, existing React/SVG canvas. Content IDs and canvas references remain separate.

- [x] P0: reproduce global-clear coupling; replace file-area clear with transactional file_refs-only preview/clear/undo, scope guard, persistent recovery, safe legacy alias; UI exact count/confirm/cancel; storage rollback/restart/owner regression before P1.
- [x] P1: mode-specific alwaysOnTop policy, saved sticky preference, non-activating reveal when appropriate; window unit tests and Electron native level regression.
- [x] P2: node-body drag, pointer threshold, frame-coalesced previews, middle/Space pan, pointer-centered wheel zoom and trackpad pan; target-near create/context menu and editable edge endpoints.
- [x] P3: Shift selection, Shift-drag marquee, batch move/hide/undo-redo, internal copy/paste with new content IDs, search locate, persisted grid/snap/minimap settings, grid arrangement.
- [x] Verification: fault-injected SQLite clear rollback, restart and file owners; actual Electron file clear/cancel/undo, window mode switching, canvas pointer/commands, screenshots desktop/390px; build and required suites. Document actual limits, do not claim OS foreground or touch hardware coverage without evidence.

Key files: desktop/engines/{storage-worker,install-services,window-manager}.cjs, desktop/main.cjs, src/{FileStation,board,main}.tsx/ts, src/xigra/TopologyWorkspace.tsx and topology.css, src/topology.ts, new focused regression tests. No production database migration or automatic topology clear.
