import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { AppButton } from './AppButton';
import { AppDialog } from './AppDialog';

type TableCellAlign = 'left' | 'center' | 'right';

interface TableCellDraft {
  text: string;
  align: TableCellAlign;
  rowSpan: number;
  colSpan: number;
  covered: boolean;
}

interface TablePoint {
  row: number;
  column: number;
}

interface TableGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  onInsert: (markdown: string) => void;
}

const MIN_ROWS = 1;
const MAX_ROWS = 12;
const MIN_COLUMNS = 1;
const MAX_COLUMNS = 8;

function createDefaultCell(row: number, column: number, hasHeader: boolean): TableCellDraft {
  return {
    text: '',
    align: 'left',
    rowSpan: 1,
    colSpan: 1,
    covered: false
  };
}

function getCellPlaceholder(row: number, column: number, hasHeader: boolean): string {
  if (hasHeader && row === 0) return `Header ${column + 1}`;
  const bodyRow = hasHeader ? row : row + 1;
  return `R${bodyRow}C${column + 1}`;
}

function createGrid(bodyRows: number, columns: number, hasHeader: boolean): TableCellDraft[][] {
  const totalRows = getTotalRows(bodyRows, hasHeader);
  return Array.from({ length: totalRows }, (_, row) => (
    Array.from({ length: columns }, (_unused, column) => createDefaultCell(row, column, hasHeader))
  ));
}

function getTotalRows(bodyRows: number, hasHeader: boolean): number {
  return Math.max(MIN_ROWS, bodyRows) + (hasHeader ? 1 : 0);
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function cloneCells(cells: TableCellDraft[][]): TableCellDraft[][] {
  return cells.map(row => row.map(cell => ({ ...cell })));
}

function resizeGrid(
  cells: TableCellDraft[][],
  bodyRows: number,
  columns: number,
  hasHeader: boolean
): TableCellDraft[][] {
  const totalRows = getTotalRows(bodyRows, hasHeader);
  return Array.from({ length: totalRows }, (_, row) => (
    Array.from({ length: columns }, (_unused, column) => {
      const existing = cells[row]?.[column];
      if (!existing) return createDefaultCell(row, column, hasHeader);
      return {
        ...existing,
        rowSpan: 1,
        colSpan: 1,
        covered: false
      };
    })
  ));
}

function getRange(start: TablePoint | null, end: TablePoint | null): {
  top: number;
  left: number;
  bottom: number;
  right: number;
} | null {
  if (!start) return null;
  const safeEnd = end || start;
  return {
    top: Math.min(start.row, safeEnd.row),
    left: Math.min(start.column, safeEnd.column),
    bottom: Math.max(start.row, safeEnd.row),
    right: Math.max(start.column, safeEnd.column)
  };
}

function isCellInRange(row: number, column: number, start: TablePoint | null, end: TablePoint | null): boolean {
  const range = getRange(start, end);
  if (!range) return false;
  return row >= range.top && row <= range.bottom && column >= range.left && column <= range.right;
}

function getRangeLabel(start: TablePoint | null, end: TablePoint | null): string {
  const range = getRange(start, end);
  if (!range) return 'Cell: none selected';
  if (range.top === range.bottom && range.left === range.right) {
    return `Cell: R${range.top + 1}C${range.left + 1}`;
  }
  return `Cells: R${range.top + 1}C${range.left + 1} - R${range.bottom + 1}C${range.right + 1}`;
}

function findVisibleCell(cells: TableCellDraft[][], point: TablePoint): TablePoint {
  if (!cells[point.row]?.[point.column]?.covered) return point;
  for (let row = 0; row < cells.length; row += 1) {
    for (let column = 0; column < (cells[row]?.length || 0); column += 1) {
      const candidate = cells[row][column];
      if (!candidate || candidate.covered) continue;
      const bottom = row + Math.max(1, candidate.rowSpan) - 1;
      const right = column + Math.max(1, candidate.colSpan) - 1;
      if (point.row >= row && point.row <= bottom && point.column >= column && point.column <= right) {
        return { row, column };
      }
    }
  }
  return point;
}

function escapeTableText(value: string): string {
  return String(value || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}

function buildCellMarkdown(cell: TableCellDraft, includeNoHeader = false): string {
  const tokens: string[] = [];
  if (includeNoHeader) tokens.push('[[noheader]]');
  if (cell.covered) tokens.push('[[merge]]');
  if (!cell.covered && (cell.rowSpan > 1 || cell.colSpan > 1)) {
    tokens.push(`[[span:${cell.rowSpan}x${cell.colSpan}]]`);
  }
  if (!cell.covered && cell.align !== 'left') tokens.push(`[[align:${cell.align}]]`);
  return `${tokens.join('')}${escapeTableText(cell.text)}`;
}

function buildMarkdownTable(cells: TableCellDraft[][], bodyRows: number, columns: number, hasHeader: boolean): string {
  const totalRows = getTotalRows(bodyRows, hasHeader);
  const safeCells = resizeGrid(cells, bodyRows, columns, hasHeader);
  const headerCells = Array.from({ length: columns }, (_unused, column) => (
    buildCellMarkdown(safeCells[0]?.[column] || createDefaultCell(0, column, hasHeader), !hasHeader && column === 0)
  ));
  const alignCells = Array.from({ length: columns }, (_unused, column) => {
    const source = safeCells[0]?.[column];
    if (source?.align === 'center') return ':---:';
    if (source?.align === 'right') return '---:';
    return '---';
  });
  const firstBodyRow = hasHeader ? 1 : 1;
  const bodyLines = Array.from({ length: Math.max(0, totalRows - firstBodyRow) }, (_unused, offset) => {
    const row = firstBodyRow + offset;
    const values = Array.from({ length: columns }, (_innerUnused, column) => (
      buildCellMarkdown(safeCells[row]?.[column] || createDefaultCell(row, column, hasHeader))
    ));
    return `| ${values.join(' | ')} |`;
  });
  return [
    `| ${headerCells.join(' | ')} |`,
    `| ${alignCells.join(' | ')} |`,
    ...bodyLines
  ].join('\n');
}

export function TableGeneratorDialog({ open, onClose, onInsert }: TableGeneratorDialogProps) {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);
  const [cells, setCells] = useState<TableCellDraft[][]>(() => createGrid(3, 3, true));
  const [selectionStart, setSelectionStart] = useState<TablePoint | null>({ row: 0, column: 0 });
  const [selectionEnd, setSelectionEnd] = useState<TablePoint | null>(null);

  useEffect(() => {
    if (!open) return;
    setRows(3);
    setColumns(3);
    setHasHeader(true);
    setCells(createGrid(3, 3, true));
    setSelectionStart({ row: 0, column: 0 });
    setSelectionEnd(null);
  }, [open]);

  useEffect(() => {
    setCells(previous => resizeGrid(previous, rows, columns, hasHeader));
    setSelectionStart(previous => previous && previous.row < getTotalRows(rows, hasHeader) && previous.column < columns
      ? previous
      : { row: 0, column: 0 });
    setSelectionEnd(previous => previous && previous.row < getTotalRows(rows, hasHeader) && previous.column < columns
      ? previous
      : null);
  }, [rows, columns, hasHeader]);

  const selectionLabel = useMemo(() => getRangeLabel(selectionStart, selectionEnd), [selectionStart, selectionEnd]);
  const selectedRange = getRange(selectionStart, selectionEnd);
  const canMerge = !!selectedRange && (selectedRange.bottom > selectedRange.top || selectedRange.right > selectedRange.left);
  const selectedRoot = selectionStart ? findVisibleCell(cells, selectionStart) : null;
  const canUnmerge = !!selectedRoot && (
    (cells[selectedRoot.row]?.[selectedRoot.column]?.rowSpan || 1) > 1
    || (cells[selectedRoot.row]?.[selectedRoot.column]?.colSpan || 1) > 1
    || cells[selectedRoot.row]?.[selectedRoot.column]?.covered === true
  );

  const updateRows = (nextRows: number) => setRows(clampInt(nextRows, MIN_ROWS, MAX_ROWS));
  const updateColumns = (nextColumns: number) => setColumns(clampInt(nextColumns, MIN_COLUMNS, MAX_COLUMNS));

  const updateCellText = (row: number, column: number, text: string) => {
    setCells(previous => {
      const next = cloneCells(previous);
      if (next[row]?.[column]) next[row][column].text = text;
      return next;
    });
  };

  const updateSelectedAlignment = (align: TableCellAlign) => {
    setCells(previous => {
      const next = cloneCells(previous);
      const range = getRange(selectionStart, selectionEnd);
      if (!range) return next;
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (let column = range.left; column <= range.right; column += 1) {
          if (next[row]?.[column]) next[row][column].align = align;
        }
      }
      return next;
    });
  };

  const mergeSelected = () => {
    const range = getRange(selectionStart, selectionEnd);
    if (!range || !canMerge) return;
    setCells(previous => {
      const next = cloneCells(previous);
      const root = next[range.top]?.[range.left];
      if (!root) return next;
      root.rowSpan = range.bottom - range.top + 1;
      root.colSpan = range.right - range.left + 1;
      root.covered = false;
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (let column = range.left; column <= range.right; column += 1) {
          if (row === range.top && column === range.left) continue;
          if (!next[row]?.[column]) continue;
          next[row][column].covered = true;
          next[row][column].rowSpan = 1;
          next[row][column].colSpan = 1;
        }
      }
      return next;
    });
    setSelectionStart({ row: range.top, column: range.left });
    setSelectionEnd(null);
  };

  const unmergeSelected = () => {
    if (!selectedRoot) return;
    const root = cells[selectedRoot.row]?.[selectedRoot.column];
    if (!root) return;
    setCells(previous => {
      const next = cloneCells(previous);
      const base = next[selectedRoot.row]?.[selectedRoot.column];
      if (!base) return next;
      const bottom = selectedRoot.row + Math.max(1, base.rowSpan) - 1;
      const right = selectedRoot.column + Math.max(1, base.colSpan) - 1;
      for (let row = selectedRoot.row; row <= bottom; row += 1) {
        for (let column = selectedRoot.column; column <= right; column += 1) {
          if (!next[row]?.[column]) continue;
          next[row][column].covered = false;
          next[row][column].rowSpan = 1;
          next[row][column].colSpan = 1;
        }
      }
      return next;
    });
  };

  const insertTable = () => {
    onInsert(buildMarkdownTable(cells, rows, columns, hasHeader));
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || !event.shiftKey) return;
    event.preventDefault();
    insertTable();
  };

  return (
    <AppDialog
      id="tableGeneratorDialog"
      open={open}
      title="Table Generator"
      onClose={onClose}
      closeIcon={<CloseOutlined />}
      backdropStyle={{
        background: 'rgba(8, 14, 28, 0.55)',
        backdropFilter: 'blur(8px)'
      }}
      dialogStyle={{
        width: 'min(92vw, 1120px)',
        maxHeight: '88dvh',
        padding: 'var(--s24)',
        gap: 'var(--s16)'
      }}
      contentStyle={{ minHeight: 0 }}
    >
      <div className="table-generator" onKeyDown={handleKeyDown}>
        <div className="table-generator-controls">
          <NumberStepper
            label="Rows"
            value={rows}
            min={MIN_ROWS}
            max={MAX_ROWS}
            onChange={updateRows}
          />
          <NumberStepper
            label="Columns"
            value={columns}
            min={MIN_COLUMNS}
            max={MAX_COLUMNS}
            onChange={updateColumns}
          />
          <div className="table-generator-side-controls">
            <label className="table-generator-toggle">
              <span>Header</span>
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={event => setHasHeader(event.target.checked)}
              />
            </label>
            <div className="table-generator-align-controls" aria-label="Cell alignment">
              <AppButton rect className="btn table-generator-icon-btn" icon={<AlignLeftOutlined />} ariaLabel="Align selected left" title="Align selected left" onClick={() => updateSelectedAlignment('left')} />
              <AppButton rect className="btn table-generator-icon-btn" icon={<AlignCenterOutlined />} ariaLabel="Align selected center" title="Align selected center" onClick={() => updateSelectedAlignment('center')} />
              <AppButton rect className="btn table-generator-icon-btn" icon={<AlignRightOutlined />} ariaLabel="Align selected right" title="Align selected right" onClick={() => updateSelectedAlignment('right')} />
            </div>
            <div className="table-generator-merge-controls">
              <AppButton className="btn table-generator-small-btn" disabled={!canMerge} onClick={mergeSelected}>Merge</AppButton>
              <AppButton className="btn table-generator-small-btn" disabled={!canUnmerge} onClick={unmergeSelected}>Unmerge</AppButton>
            </div>
          </div>
        </div>

        <div className="table-generator-selection tiny">{selectionLabel}</div>
        <div className="table-generator-help tiny">
          Edit cells directly. Click start cell, then Shift+Click end cell to select a full range, then Merge/Unmerge. Use Shift + Enter to insert/update.
        </div>

        <div className="table-generator-preview-wrap">
          <table className="table-generator-preview">
            <tbody>
              {cells.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {row.map((cell, columnIndex) => {
                    if (cell.covered) return null;
                    const CellTag = hasHeader && rowIndex === 0 ? 'th' : 'td';
                    return (
                      <CellTag
                        key={`cell-${rowIndex}-${columnIndex}`}
                        rowSpan={cell.rowSpan}
                        colSpan={cell.colSpan}
                        className={[
                          isCellInRange(rowIndex, columnIndex, selectionStart, selectionEnd) ? 'is-selected' : '',
                          cell.align === 'center' ? 'is-align-center' : '',
                          cell.align === 'right' ? 'is-align-right' : ''
                        ].filter(Boolean).join(' ')}
                        onClick={event => {
                          const point = { row: rowIndex, column: columnIndex };
                          if (event.shiftKey && selectionStart) {
                            setSelectionEnd(point);
                            return;
                          }
                          setSelectionStart(point);
                          setSelectionEnd(null);
                        }}
                      >
                        <textarea
                          value={cell.text}
                          placeholder={getCellPlaceholder(rowIndex, columnIndex, hasHeader)}
                          style={{ textAlign: cell.align }}
                          onChange={event => updateCellText(rowIndex, columnIndex, event.target.value)}
                          onFocus={() => {
                            setSelectionStart({ row: rowIndex, column: columnIndex });
                            setSelectionEnd(null);
                          }}
                        />
                      </CellTag>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <AppButton className="btn table-generator-insert-btn" onClick={insertTable}>
          Insert Table
        </AppButton>
      </div>
    </AppDialog>
  );
}

function NumberStepper({
  label,
  value,
  min,
  max,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (nextValue: number) => void;
}) {
  return (
    <div className="table-generator-stepper">
      <label>{label}</label>
      <div className="table-generator-stepper-row">
        <AppButton rect className="btn table-generator-icon-btn" disabled={value <= min} onClick={() => onChange(value - 1)}>-</AppButton>
        <input
          value={value}
          inputMode="numeric"
          onChange={event => onChange(Number(event.target.value))}
          aria-label={label}
        />
        <AppButton rect className="btn table-generator-icon-btn" disabled={value >= max} onClick={() => onChange(value + 1)}>+</AppButton>
      </div>
    </div>
  );
}
