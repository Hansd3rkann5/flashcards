import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  OrderedListOutlined,
  TableOutlined,
  UnorderedListOutlined
} from '@ant-design/icons';
import type { CSSProperties, ReactNode } from 'react';
import { AppButton } from './AppButton';

export type EditorTextAlign = 'left' | 'center' | 'justify';

interface EditorTextToolbarProps {
  idBase: string;
  align: EditorTextAlign;
  onAlignChange: (nextAlign: EditorTextAlign) => void;
  onInsertList: (kind: 'ul' | 'ol') => void;
  onInsertTable: () => void;
  extraContent?: ReactNode;
}

export function EditorTextToolbar({
  idBase,
  align,
  onAlignChange,
  onInsertList,
  onInsertTable,
  extraContent
}: EditorTextToolbarProps) {
  return (
    <div id={`${idBase}-root`} style={styles.root}>
      <div id={`${idBase}-alignSegment`} style={styles.segment}>
        <AppButton
          id={`${idBase}-alignLeft`}
          className="btn btn-small toolbar-btn align-icon-btn"
          rect
          icon={<AlignLeftOutlined />}
          ariaLabel="Align left"
          title="Align left"
          style={align === 'left' ? styles.activeButton : styles.button}
          onClick={() => onAlignChange('left')}
        />
        <AppButton
          id={`${idBase}-alignCenter`}
          className="btn btn-small toolbar-btn align-icon-btn"
          rect
          icon={<AlignCenterOutlined />}
          ariaLabel="Align center"
          title="Align center"
          style={align === 'center' ? styles.activeButton : styles.button}
          onClick={() => onAlignChange('center')}
        />
        <AppButton
          id={`${idBase}-alignJustify`}
          className="btn btn-small toolbar-btn align-icon-btn"
          rect
          icon={<TableOutlined rotate={90} />}
          ariaLabel="Align justify"
          title="Align justify"
          style={align === 'justify' ? styles.activeButton : styles.button}
          onClick={() => onAlignChange('justify')}
        />
      </div>
      <div id={`${idBase}-insertSegment`} style={styles.segment}>
        <AppButton
          id={`${idBase}-unorderedList`}
          className="btn btn-small toolbar-btn"
          icon={<UnorderedListOutlined />}
          style={styles.textButton}
          onClick={() => onInsertList('ul')}
        >
          List
        </AppButton>
        <AppButton
          id={`${idBase}-orderedList`}
          className="btn btn-small toolbar-btn"
          icon={<OrderedListOutlined />}
          style={styles.textButton}
          onClick={() => onInsertList('ol')}
        >
          Numbered
        </AppButton>
        <AppButton
          id={`${idBase}-table`}
          className="btn btn-small toolbar-btn"
          icon={<TableOutlined />}
          style={styles.textButton}
          onClick={onInsertTable}
        >
          Table
        </AppButton>
      </div>
      {extraContent ? <div id={`${idBase}-extra`} style={styles.extra}>{extraContent}</div> : null}
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--s8)',
    alignItems: 'center'
  },
  segment: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: 'var(--s8)',
    alignItems: 'center',
    padding: 'var(--s6)',
    borderRadius: '14px',
    background: 'rgba(11, 18, 32, 0.5)'
  },
  extra: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    gap: 'var(--s8)',
    alignItems: 'center'
  },
  button: {
    width: '40px',
    minWidth: '40px',
    height: '40px',
    minHeight: '40px',
    borderRadius: '12px',
    background: 'rgba(31, 45, 73, 0.88)',
    color: '#edf2ff'
  },
  activeButton: {
    width: '40px',
    minWidth: '40px',
    height: '40px',
    minHeight: '40px',
    borderRadius: '12px',
    background: 'var(--subject-accent, #2dd4bf)',
    color: '#08131d'
  },
  textButton: {
    minHeight: '40px',
    borderRadius: '12px',
    background: 'rgba(31, 45, 73, 0.88)',
    color: '#edf2ff',
    fontWeight: 400,
    fontSize: '0.9rem',
    paddingInline: '14px'
  }
});
