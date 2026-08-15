import { Prec, StateField, type Extension } from '@codemirror/state';
import { EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { buildWysiwygDecorations } from './decorations/buildDecorations';
import { wysiwygListKeymap } from './commands/listCommands';
import { exitActiveWysiwygBlock } from './commands/widgetCommands';
import { wysiwygSourceBlockField } from './sourceBlockState';
import type { WysiwygExtensionOptions } from './types';

export function createWysiwygExtension(options: WysiwygExtensionOptions = { documentPath: '', locale: 'zh' }): Extension {
  const wysiwygDecorationField = StateField.define<DecorationSet>({
    create(state) {
      return buildWysiwygDecorations(state, options);
    },
    update(decorations, transaction) {
      if (transaction.docChanged && transaction.isUserEvent('input.type.compose')) {
        return decorations.map(transaction.changes);
      }
      if (!transaction.docChanged && !transaction.selection) return decorations;
      return buildWysiwygDecorations(transaction.state, options);
    },
    provide: (field) => EditorView.decorations.from(field)
  });
  return [
    wysiwygSourceBlockField,
    wysiwygDecorationField,
    Prec.high(keymap.of([
      { key: 'Escape', run: exitActiveWysiwygBlock },
      ...wysiwygListKeymap
    ])),
    EditorView.contentAttributes.of({
      'data-inkstack-wysiwyg': 'true',
      'aria-label': 'Markdown WYSIWYG editor'
    })
  ];
}
