import * as CodeMirror from 'codemirror';

import {
    JupyterFrontEnd, JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
    INotebookTracker, NotebookActions, NotebookPanel
} from '@jupyterlab/notebook';

import {
    MarkdownCell
} from '@jupyterlab/cells';

import {
    CodeMirrorEditor
} from '@jupyterlab/codemirror';

import {
    ReadonlyJSONObject
} from '@phosphor/coreutils';

import {
    ElementExt
} from '@phosphor/domutils';

import '../style/index.css';
// Previously the vim keymap was loaded by JupyterLab, but now
// it is lazy loaded, so we have to load it explicitly
import 'codemirror/keymap/vim.js';

/**
 * A boolean indicating whether the platform is Mac.
 */
const IS_MAC = !!navigator.platform.match(/Mac/i);

/**
 * Initialization data for the jupyterlab_vim extension.
 */
const extension: JupyterFrontEndPlugin<void> = {
    id: 'jupyterlab_vim',
    autoStart: true,
    activate: activateCellVim,
    requires: [INotebookTracker]
};

class VimCell {

    constructor(app: JupyterFrontEnd, tracker: INotebookTracker) {
        this._tracker = tracker;
        this._app = app;
        this._onActiveCellChanged();
        this._tracker.activeCellChanged.connect(this._onActiveCellChanged, this);
    }

    private _onActiveCellChanged(): void {
        // if (this._prevActive && !this._prevActive.isDisposed) {
        //     this._prevActive.metadata.changed.disconnect(this._onMetadataChanged, this);
        // }
        let activeCell = this._tracker.activeCell;

        if (activeCell !== null) {
            const {commands} = this._app;
            let editor = activeCell.editor as CodeMirrorEditor;
            editor.setOption('keyMap', 'vim');
            let extraKeys = editor.getOption('extraKeys') || {};

            if (!IS_MAC) {
                extraKeys['Ctrl-C'] = false;
            }
            extraKeys['Esc'] = CodeMirror.prototype.leaveInsertMode;
            // extraKeys["Esc"] = function(cm: any) {
            //     if (editor.state.vim.insertMode && editor.state.vim.visualMode)
            //         (CodeMirror as any).Vim.handleKey(editor.editor, '<Esc>');
            //     else
            //         commands.execute('docmanager:save');
            // };

            CodeMirror.prototype.save = () => {
                commands.execute('docmanager:save');
            };

            extraKeys["Ctrl-A"] = function(cm: any) {
                if (editor.state.vim.insertMode)
                    cm.execCommand('goLineStartSmart');
                else
                    return CodeMirror.Pass;
            };
            extraKeys["Ctrl-E"] = function(cm: any) {
                if (editor.state.vim.insertMode)
                    cm.execCommand('goLineEnd');
                else
                    return CodeMirror.Pass;
            };
            extraKeys["Ctrl-O"] = function(cm: any) {
                if (editor.state.vim.insertMode)
                    cm.execCommand('killLine');
                else
                    return CodeMirror.Pass;
            };
            extraKeys["Ctrl-K"] = function(cm: any) {
                if (editor.state.vim.insertMode)
                    cm.execCommand('goLineUp');
                else
                    return CodeMirror.Pass;
            };
            extraKeys["Ctrl-J"] = function(cm: any) {
                if (editor.state.vim.insertMode)
                    cm.execCommand('goLineDown');
                else
                    return CodeMirror.Pass;
            };
            extraKeys["Alt-B"] = function(cm: any) {
                cm.execCommand('goWordLeft');
                if (!editor.state.vim.insertMode)
                    (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
            };
            extraKeys["Alt-F"] = function(cm: any) {
                cm.execCommand('goWordRight');
                if (!editor.state.vim.insertMode)
                    (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
            };
            extraKeys["Ctrl-D"] = function(cm: any) {
                if (editor.state.vim.insertMode)
                    cm.execCommand('delCharAfter');
                else
                    return CodeMirror.Pass;
            };
            extraKeys["Alt-D"] = function(cm: any) {
                cm.execCommand('delWordAfter');
                if (!editor.state.vim.insertMode)
                    (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
            };
            extraKeys["Alt-Backspace"] = function(cm: any) {
                cm.execCommand('delWordBefore');
                if (!editor.state.vim.insertMode)
                    (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
            };
            extraKeys["Alt-A"] = 'selectAll';
            editor.setOption('extraKeys', extraKeys);

            let lcm = CodeMirror as any;
            let lvim = lcm.Vim as any;
            lvim.defineEx('quit', 'q', function(cm: any) {
                commands.execute('notebook:enter-command-mode');
            });

            (CodeMirror as any).Vim.handleKey(editor.editor, '<Esc>');
            lvim.defineMotion('moveByLinesOrCell', (cm: any, head: any, motionArgs: any, vim: any) => {
                let cur = head;
                let endCh = cur.ch;
                let currentCell = activeCell;
                // TODO: these references will be undefined
                // Depending what our last motion was, we may want to do different
                // things. If our last motion was moving vertically, we want to
                // preserve the HPos from our last horizontal move.  If our last motion
                // was going to the end of a line, moving vertically we should go to
                // the end of the line, etc.
                switch (vim.lastMotion) {
                    case 'moveByLines':
                    case 'moveByDisplayLines':
                    case 'moveByScroll':
                    case 'moveToColumn':
                    case 'moveToEol':
                        // JUPYTER PATCH: add our custom method to the motion cases
                    case 'moveByLinesOrCell':
                        endCh = vim.lastHPos;
                        break;
                    default:
                        vim.lastHPos = endCh;
                }
                let repeat = motionArgs.repeat + (motionArgs.repeatOffset || 0);
                let line = motionArgs.forward ? cur.line + repeat : cur.line - repeat;
                let first = cm.firstLine();
                let last = cm.lastLine();
                // Vim cancels linewise motions that start on an edge and move beyond
                // that edge. It does not cancel motions that do not start on an edge.

                // JUPYTER PATCH BEGIN
                // here we insert the jumps to the next cells
                if (line < first || line > last) {
                    // var currentCell = ns.notebook.get_selected_cell();
                    // var currentCell = tracker.activeCell;
                    // var key = '';
                    if (currentCell.model.type === 'markdown') {
                        (currentCell as MarkdownCell).rendered = true;
                        // currentCell.execute();
                    }
                    if (motionArgs.forward) {
                        // ns.notebook.select_next();
                        commands.execute('notebook:move-cursor-down');
                        // key = 'j';
                    } else {
                        // ns.notebook.select_prev();
                        commands.execute('notebook:move-cursor-up');
                        // key = 'k';
                    }
                    // ns.notebook.edit_mode();
                    // var new_cell = ns.notebook.get_selected_cell();
                    // if (currentCell !== new_cell && !!new_cell) {
                    //     // The selected cell has moved. Move the cursor at very end
                    //     var cm2 = new_cell.code_mirror;
                    //     cm2.setCursor({
                    //         ch:   cm2.getCursor().ch,
                    //         line: motionArgs.forward ? cm2.firstLine() : cm2.lastLine()
                    //     });
                    //     // Perform remaining repeats
                    //     repeat = motionArgs.forward ? line - last : first - line;
                    //     repeat -= 1;
                    //     if (Math.abs(repeat) > 0) {
                    //         CodeMirror.Vim.handleKey(cm2, repeat + key);  // e.g. 4j, 6k, etc.
                    //     }
                    // }
                    return;
                }
                // JUPYTER PATCH END

                // if (motionArgs.toFirstChar){
                //     endCh = findFirstNonWhiteSpaceCharacter(cm.getLine(line));
                //     vim.lastHPos = endCh;
                // }
                vim.lastHSPos = cm.charCoords(CodeMirror.Pos(line, endCh), 'div').left;
                return (CodeMirror as any).Pos(line, endCh);
            });

            // lvim.mapCommand(
            //     'k', 'motion', 'moveByLinesOrCell',
            //     { forward: false, linewise: true },
            //     { context: 'normal' }
            // );
            // lvim.mapCommand(
            //     'j', 'motion', 'moveByLinesOrCell',
            //     { forward: true, linewise: true },
            //     { context: 'normal' }
            // );

            // Serve as references
            // lvim.defineAction('moveCellDown', (cm: any, actionArgs: any) => {
            //     commands.execute('notebook:move-cell-down');
            // });
            // lvim.defineAction('moveCellUp', (cm: any, actionArgs: any) => {
            //     commands.execute('notebook:move-cell-up');
            // });
            // lvim.mapCommand('<C-e>', 'action', 'moveCellDown', {}, {extra: 'normal'});
            // lvim.mapCommand('<C-y>', 'action', 'moveCellUp', {}, {extra: 'normal'});
            // lvim.defineAction('splitCell', (cm: any, actionArgs: any) => {
            //     commands.execute('notebook:split-cell-at-cursor');
            // });
            // lvim.mapCommand('-', 'action', 'splitCell', {}, {extra: 'normal'});
            //
            // lvim.mapCommand(
            //     // '<C-a>', 'action', 'moveToFirstNonWhiteSpaceCharacter', {}, { extra: 'insert' }
            //     { keys: '<C-a>', type: 'motion', name: 'moveToFirstNonWhiteSpaceCharacter', context: 'insert' },
            // );

            let my_move = function (cm: any, head: any, motionArgs: any, vim: any) {
                var cur = head;
                switch (vim.lastMotion) {
                    case 'moveByDisplayLines':
                    case 'moveByScroll':
                    case 'moveByLines':
                    case 'moveToColumn':
                    case 'moveToEol':
                        break;
                    default:
                        vim.lastHSPos = cm.charCoords(cur,'div').left;
                }

                var repeat = motionArgs.repeat;
                var res=cm.findPosV(cur,(motionArgs.forward ? repeat : -repeat),'line',vim.lastHSPos);
                if (res.hitSide) {
                    if (motionArgs.forward) {
                        var lastCharCoords = cm.charCoords(res, 'div');
                        var goalCoords = { top: lastCharCoords.top + 8, left: vim.lastHSPos };
                        var res = cm.coordsChar(goalCoords, 'div');
                    } else {
                        var resCoords = cm.charCoords((CodeMirror as any).Pos(cm.firstLine(), 0), 'div');
                        resCoords.left = vim.lastHSPos;
                        res = cm.coordsChar(resCoords, 'div');
                    }
                }
                vim.lastHPos = res.ch;
                return res;
            };
            lvim.defineMotion('moveByScrollHalf', (cm: any, head: any, motionArgs: any, vim: any) => {
                var scrollbox = cm.getScrollInfo();
                var curEnd = null;
                var repeat = motionArgs.repeat;
                if (!repeat) {
                    repeat =  24;
                }
                var orig = cm.charCoords(head, 'local');
                motionArgs.repeat = repeat;
                var curEnd = my_move(cm, head, motionArgs, vim);
                if (!curEnd) {
                    return null;
                }
                var dest = cm.charCoords(curEnd, 'local');
                cm.scrollTo(null, scrollbox.top + dest.top - orig.top);
                return curEnd;
            });
            function findFirstNonWhiteSpaceCharacter(text: any) {
                if (!text) {
                    return 0;
                }
                var firstNonWS = text.search(/\S/);
                return firstNonWS == -1 ? text.length : firstNonWS;
            }
            lvim.defineMotion(
                "smartstart",
                (cm: any, head: any, motionArgs: any, vim: any) => {
                    var cursor = head;
                    let nonEmpty = findFirstNonWhiteSpaceCharacter(cm.getLine(cursor.line));
                    if (0 < cursor.ch && cursor.ch <= nonEmpty) return (CodeMirror as any).Pos(head.line, 0);
                    else return (CodeMirror as any).Pos(cursor.line, nonEmpty);
                }
            );
            lvim.defineMotion(
                "startup",
                (cm: any, head: any, motionArgs: any, vim: any) => {
                    var cursor = head;
                    let nonEmpty = findFirstNonWhiteSpaceCharacter(cm.getLine(cursor.line));
                    if (cursor.ch > nonEmpty)
                        return (CodeMirror as any).Pos(cursor.line, nonEmpty);
                    else if (0 < cursor.ch && cursor.ch <= nonEmpty)
                        return (CodeMirror as any).Pos(head.line, 0);
                    else if (head.line > 0)
                        return (CodeMirror as any).Pos(head.line - 1, cm.getLine(head.line - 1).length);
                    else return cursor;
                }
            );
            lvim._mapCommand({
                keys: "<C-u>",
                type: "operatorMotion",
                operator: "delete",
                motion: "startup",
                motionArgs: { inclusive: false },
                context: "insert"
            });
            lvim._mapCommand({ keys: "0", type: "motion", motion: "smartstart" });
            lvim.defineAction(
                "moveHalf",
                (cm: any, actionArgs: any) => {
                    let head = cm.getCursor();
                    var line = actionArgs.forward ? head.line + 24 : head.line - 24;
                    if (line < cm.firstLine()) line = cm.firstLine();
                    if (line > cm.lastLine()) line = cm.lastLine();
                    cm.setCursor((CodeMirror as any).Pos(line, head.ch));
                }
            );
            lvim._mapCommand({
                keys: "<C-d>",
                type: "action",
                action: "moveHalf",
                actionArgs: { forward: true },
                context: "normal"
            });
            lvim._mapCommand({
                keys: "<C-u>",
                type: "action",
                action: "moveHalf",
                actionArgs: { forward: false },
                context: "normal"
            });
            lvim.defineAction(
                "comment",
                (cm: any, actionArgs: any) => {
                    cm.execCommand('toggleComment');
                }
            );
            lvim._mapCommand({
                keys: "gl",
                type: "action",
                action: "comment"
            });
        }
    }

    private _tracker: INotebookTracker;
    private _app: JupyterFrontEnd;
}

function activateCellVim(app: JupyterFrontEnd, tracker: INotebookTracker): Promise<void> {

    Promise.all([app.restored]).then(([args]) => {
        const { commands, shell } = app;
        function getCurrent(args: ReadonlyJSONObject): NotebookPanel | null {
            const widget = tracker.currentWidget;
            const activate = args['activate'] !== false;

            if (activate && widget) {
                shell.activateById(widget.id);
            }

            return widget;
        }
        function isEnabled(): boolean {
            return tracker.currentWidget !== null &&
                tracker.currentWidget === app.shell.currentWidget;
        }

        commands.addCommand('run-cell-edit', {
            label: 'Run Cell and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.run(content, context.session);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('run-cell-and-select-next-edit', {
            label: 'Run Cell and Edit Next Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.runAndAdvance(content, context.session);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('run-cell-and-insert-below-edit', {
            label: 'Run Cell and Insert Edit Below Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.runAndInsert(content, context.session);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('run-all-edit', {
            label: 'Run All and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.runAll(content, context.session);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('run-above-edit', {
            label: 'Run Above and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { context, content } = current;
                    NotebookActions.runAllAbove(content, context.session);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('undo-cell-action-edit', {
            label: 'Undo Cell Action Edit',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.undo(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('redo-cell-action-edit', {
            label: 'Redo Cell Action Edit',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.redo(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('cut-cell-and-edit', {
            label: 'Cut Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.cut(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('copy-cell-and-edit', {
            label: 'Copy Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.copy(content);
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('paste-cell-and-edit', {
            label: 'Paste Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.paste(content, 'below');
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('paste-above-cell-and-edit', {
            label: 'Paste Above Cell(s) and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.paste(content, 'above');
                    content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('merge-and-edit', {
            label: 'Merge and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    NotebookActions.mergeCells(content);
                    current.content.mode = 'edit';
                }
            },
            isEnabled
        });
        commands.addCommand('merge-above-and-edit', {
            label: 'Merge Above and Edit Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCellIndex > 0)
                    {
                        NotebookActions.selectAbove(content);
                        NotebookActions.mergeCells(content);
                        current.content.mode = 'edit';
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('enter-insert-mode', {
            label: 'Enter Insert Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        // let editor = content.activeCell.editor as CodeMirrorEditor;
                        current.content.mode = 'edit';
                        // (CodeMirror as any).Vim.handleKey(editor.editor, 'i');
                    }
                }
            },
            isEnabled
        });

        commands.addCommand("vim-ctrl-b", {
            label: "vim-ctrl-b",
            execute: args => {
                const current = getCurrent(args);
                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        if (editor.state.vim.insertMode)
                            editor.execCommand('goCharLeft');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand("vim-ctrl-f", {
            label: "vim-ctrl-f",
            execute: args => {
                const current = getCurrent(args);
                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        if (editor.state.vim.insertMode)
                            editor.execCommand('goCharRight');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('vim-ctrl-i', {
            label: 'vim-ctrl-i',
            execute: args => {
                const current = getCurrent(args);
                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        if (editor.state.vim.insertMode)
                            editor.execCommand('indentAuto');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('vim-ctrl-u', {
            label: 'vim-ctrl-u',
            execute: args => {
                const current = getCurrent(args);
                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        (CodeMirror as any).Vim.handleKey(editor.editor, '<C-u>');
                        if (!editor.state.vim.insertMode)
                            commands.execute('center-cell');
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('vim-ctrl-d', {
            label: 'vim-ctrl-d',
            execute: args => {
                const current = getCurrent(args);
                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        (CodeMirror as any).Vim.handleKey(editor.editor, '<C-d>');
                        if (!editor.state.vim.insertMode)
                            commands.execute('center-cell');
                    }
                }
            },
            isEnabled
        });

        commands.addCommand('leave-insert-mode', {
            label: 'Leave Insert Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        if (editor.state.vim.insertMode || editor.state.vim.visualMode)
                            (CodeMirror as any).Vim.handleKey(editor.editor, '<Esc>');
                        else
                            commands.execute('docmanager:save');
                    }
                }
            },
            isEnabled
        });

        commands.addCommand('enter-notebook-mode', {
            label: 'Leave Insert Mode',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        commands.execute('notebook:enter-command-mode')
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('select-first-cell', {
            label: 'Select First Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    content.activeCellIndex = 0;
                    content.deselectAll();
                    if (content.activeCell !== null) {
                        ElementExt.scrollIntoViewIfNeeded(
                            content.node,
                            content.activeCell.node
                        );
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('select-last-cell', {
            label: 'Select Last Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    content.activeCellIndex = current.content.widgets.length - 1;
                    content.deselectAll();
                    if (content.activeCell !== null) {
                        ElementExt.scrollIntoViewIfNeeded(
                            content.node,
                            content.activeCell.node
                        );
                    }
                }
            },
            isEnabled
        });
        commands.addCommand('center-cell', {
            label: 'Center Cell',
            execute: args => {
                const current = getCurrent(args);

                if (current) {
                    const { content } = current;
                    if (content.activeCell !== null) {
                        let editor = content.activeCell.editor as CodeMirrorEditor;
                        var cur = editor.getCursor("head").line;
                        var end = editor.lastLine();
                        let er = content.activeCell.inputArea.node.getBoundingClientRect();
                        current.content.scrollToPosition(er.bottom - (end - cur) * editor.lineHeight, 0);
                    }
                }
            },
            isEnabled
        });

        // vim bindings remapped
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl I'],
            command: 'vim-ctrl-i'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl B'],
            command: 'vim-ctrl-b'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl F'],
            command: 'vim-ctrl-f'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl U'],
            command: 'vim-ctrl-u'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl D'],
            command: 'vim-ctrl-d'
        });


        // vim bindings with ctrl-c leader key
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'U'],
            command: 'undo-cell-action-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'Ctrl R'],
            command: 'redo-cell-action-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', '-'],
            command: 'notebook:split-cell-at-cursor'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'D'],
            command: 'cut-cell-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'Ctrl C'],
            command: 'kernelmenu:interrupt'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'Y'],
            command: 'copy-cell-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'P'],
            command: 'paste-cell-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'O'],
            command: 'notebook:insert-cell-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'G', 'G'],
            command: 'select-first-cell'
        });
        // TODO leader key with Shift sub keys doesn't work
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'Ctrl P'],
            command: 'paste-above-cell-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'Ctrl O'],
            command: 'notebook:insert-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl C', 'Ctrl G'],
            command: 'select-last-cell'
        });

        // vim bindings misc
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl Enter'],
            command: 'run-cell-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Shift Enter'],
            command: 'run-cell-and-select-next-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt Enter'],
            command: 'run-cell-and-insert-below-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt R'],
            command: 'run-all-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt U'],
            command: 'run-above-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt J'],
            command: 'notebook:move-cursor-down'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt K'],
            command: 'notebook:move-cursor-up'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt Shift J'],
            command: 'notebook:move-cell-down'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt Shift K'],
            command: 'notebook:move-cell-up'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt M'],
            command: 'merge-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt Shift M'],
            command: 'merge-above-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt 1'],
            command: 'notebook:change-cell-to-code'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt 2'],
            command: 'notebook:change-cell-to-markdown'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Alt 3'],
            command: 'notebook:change-cell-to-raw'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Escape'],
            command: 'leave-insert-mode'
        });

        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Shift Escape'],
            command: 'enter-notebook-mode'
        });

        // notebook focused
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['I'],
            command: 'enter-insert-mode'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift M'],
            command: 'merge-and-edit'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['G', 'G'],
            command: 'select-first-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift G'],
            command: 'select-last-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Y', 'Y'],
            command: 'notebook:copy-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['D', 'D'],
            command: 'notebook:cut-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift P'],
            command: 'notebook:paste-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['P'],
            command: 'notebook:paste-cell-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['O'],
            command: 'notebook:insert-cell-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Shift O'],
            command: 'notebook:insert-cell-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['U'],
            command: 'notebook:undo-cell-action'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl R'],
            command: 'notebook:redo-cell-action'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl J'],
            command: 'notebook:move-cell-down'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl K'],
            command: 'notebook:move-cell-up'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl Shift J'],
            command: 'notebook:extend-marked-cells-below'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook:focus',
            keys: ['Ctrl Shift K'],
            command: 'notebook:extend-marked-cells-above'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode',
            keys: ['Ctrl L'],
            command: 'center-cell'
        });
        commands.addKeyBinding({
            selector: '.jp-Notebook.jp-mod-editMode .jp-InputArea-editor:not(.jp-mod-has-primary-selection)',
            keys: ['Ctrl G'],
            command: 'tooltip:launch-notebook'
        });

        // tslint:disable:no-unused-expression
        new VimCell(app, tracker);
    });

    return Promise.resolve();
}

export default extension;
