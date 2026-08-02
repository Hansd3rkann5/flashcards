import { useId, useState } from 'react';
import type { CSSProperties } from 'react';
import { TileActionMenu } from './TileActionMenu';
import { normalizeHexColor } from '../../lib/subjects';

interface SubjectTileProps {
  id?: string;
  subjectName: string;
  accent?: string;
  onClick?: () => void;
  onEdit?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function SubjectTile({
  id,
  subjectName,
  accent = '#dac75e',
  onClick,
  onEdit,
  onArchive,
  onDelete
}: SubjectTileProps) {
  const [isHovered, setIsHovered] = useState(false);
  const reactId = useId();
  const baseId = id || `subjectTile-${reactId.replace(/[:]/g, '')}`;
  const accentHex = normalizeHexColor(accent);
  const tileVars: CSSProperties = {
    '--tile-accent': accentHex,
    '--subject-accent': accentHex,
    '--subject-accent-bg': hexToRgba(accentHex, 0.18),
    '--subject-accent-glow': hexToRgba(accentHex, 0.34)
  } as CSSProperties;

  return (
    <div
      id={baseId}
      style={{
        ...styles.tile,
        ...styles.subjectTile,
        ...(isHovered ? styles.tileHover : {}),
        ...(isHovered ? styles.subjectTileHover : {}),
        ...tileVars
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open subject ${subjectName}`}
      onPointerEnter={event => {
        if (event.pointerType === 'mouse') setIsHovered(true);
      }}
      onPointerLeave={() => setIsHovered(false)}
      onClick={onClick}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      }}
    >
      <div id={`${baseId}-row`} style={styles.subjectRow}>
        <div id={`${baseId}-name`} style={styles.subjectName}>{subjectName}</div>
        <TileActionMenu
          id={`${baseId}-actionMenu`}
          triggerId={`${baseId}-editBtn`}
          menuId={`${baseId}-editMenu`}
          className="subject-tile-action-menu"
          triggerClassName="subject-tile-edit-btn"
          triggerAriaLabel={`Open subject menu for ${subjectName}`}
          triggerTitle={`Open subject menu for ${subjectName}`}
          placement="top-end"
          items={[
            { id: 'edit', label: 'Edit', tone: 'green', onSelect: onEdit },
            { id: 'archive', label: 'Archive', tone: 'blue', onSelect: onArchive },
            { id: 'delete', label: 'Delete', tone: 'red', onSelect: onDelete }
          ]}
        />
      </div>
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  tile: {
    border: '1px solid var(--subject-accent)',
    borderRadius: 'var(--radius, var(--s16))',
    padding: 'var(--tile-padding, var(--s12) var(--s12))',
    background: 'linear-gradient(180deg, var(--tile-accent-bg, #17223b) 0%, #17223b 70%)',
    cursor: 'pointer',
    transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    position: 'relative',
    overflow: 'visible',
    transformOrigin: 'center center'
  },
  subjectTile: {
    borderLeftWidth: 'var(--s8)',
    borderLeftStyle: 'solid',
    borderLeftColor: 'var(--subject-accent, var(--tile-accent, var(--accent, #dac75e)))',
    background: 'linear-gradient(180deg, var(--subject-accent-bg, var(--tile-accent-bg, #17223b)) 0%, #17223b 72%)',
    boxShadow: 'inset 0 0 0 1px rgba(13, 22, 40, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--s12)',
    minHeight: 'var(--s56)',
    zIndex: 0
  },
  tileHover: {
    transform: 'scale(1.02)'
  },
  subjectTileHover: {
    borderLeftColor: 'var(--subject-accent, var(--tile-accent, var(--accent, #dac75e)))',
    background: 'linear-gradient(180deg, var(--subject-accent-bg, var(--tile-accent-bg, #17223b)) 0%, rgba(255, 255, 255, 0.06) 100%)',
    boxShadow: 'inset 0 0 0 1px var(--subject-accent-glow, rgba(45, 212, 191, 0.34)), inset 0 0 16px color-mix(in srgb, var(--subject-accent, var(--tile-accent, var(--accent, #dac75e))) 26%, transparent), inset 0 0 48px color-mix(in srgb, var(--subject-accent, var(--tile-accent, var(--accent, #dac75e))) 12%, transparent)'
  },
  subjectName: {
    flex: 1,
    minWidth: 0,
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#e5edf7',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  subjectRow: {
    width: '100%',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--s8)'
  }
});

function hexToRgba(hex: string, alpha: number): string {
  const safe = normalizeHexColor(hex).slice(1);
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, Number(alpha)));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
