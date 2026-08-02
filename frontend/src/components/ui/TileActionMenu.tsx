import { EditOutlined } from '@ant-design/icons';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AppButton } from './AppButton';

const MENU_ANIMATION_MS = 180;

export interface TileActionMenuItem {
  id: string;
  label: string;
  tone?: 'green' | 'blue' | 'red';
  onSelect?: () => void;
}

interface TileActionMenuProps {
  id?: string;
  triggerId?: string;
  menuId?: string;
  className?: string;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  triggerAriaLabel?: string;
  triggerTitle?: string;
  triggerIcon?: ReactNode;
  placement?: 'bottom-end' | 'top-end';
  items: TileActionMenuItem[];
}

interface MenuPosition {
  top: number;
  left: number;
}

export function TileActionMenu({
  id,
  triggerId,
  menuId,
  className = '',
  triggerClassName = '',
  triggerStyle,
  triggerAriaLabel = 'Open edit menu',
  triggerTitle = 'Open edit menu',
  triggerIcon = <EditOutlined />,
  placement = 'bottom-end',
  items
}: TileActionMenuProps) {
  const reactId = useId();
  const baseId = id || `tileActionMenu-${reactId.replace(/[:]/g, '')}`;
  const resolvedTriggerId = triggerId || `${baseId}Trigger`;
  const resolvedMenuId = menuId || `${baseId}Panel`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const updatePosition = () => {
    const triggerNode = triggerRef.current;
    const panelNode = panelRef.current;
    if (!triggerNode || !panelNode) return;
    const triggerRect = triggerNode.getBoundingClientRect();
    const panelWidth = panelNode.offsetWidth;
    const panelHeight = panelNode.offsetHeight;
    const nextLeft = Math.max(
      8,
      Math.min(window.innerWidth - panelWidth - 8, triggerRect.right - panelWidth)
    );
    const anchoredTop = triggerRect.top;
    const nextTop = Math.max(
      8,
      Math.min(window.innerHeight - panelHeight - 8, anchoredTop)
    );
    setPosition({
      top: nextTop,
      left: nextLeft
    });
  };

  useLayoutEffect(() => {
    if (!mounted) return;
    updatePosition();
  }, [mounted, visible, placement, items.length]);

  useEffect(() => {
    if (!open) return;
    setMounted(true);
  }, [open]);

  useEffect(() => {
    if (!mounted) return;
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timeout = window.setTimeout(() => {
      setMounted(false);
    }, MENU_ANIMATION_MS);
    return () => window.clearTimeout(timeout);
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
    };
    const handleViewportChange = () => updatePosition();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [mounted]);

  const toneStyleByTone: Record<NonNullable<TileActionMenuItem['tone']>, CSSProperties> = {
    green: {
      background: '#22c55e',
      borderColor: '#22c55e',
      color: '#062314'
    },
    blue: {
      background: '#0ea5e9',
      borderColor: '#0ea5e9',
      color: '#041b2d'
    },
    red: {
      background: '#9a2b1c',
      borderColor: '#9a2b1c',
      color: '#ffe8e8'
    }
  };

  const panelNode = mounted && typeof document !== 'undefined'
    ? createPortal(
      <div
        id={resolvedMenuId}
        ref={panelRef}
        className={['tile-action-menu-panel', visible ? 'is-open' : '', `placement-${placement}`].filter(Boolean).join(' ')}
        role="menu"
        aria-hidden={!visible}
        style={position ? { top: `${position.top}px`, left: `${position.left}px` } : { visibility: 'hidden' }}
      >
        {items.map(item => (
          <button
            key={item.id}
            id={`${baseId}Item-${item.id}`}
            type="button"
            role="menuitem"
            className={[
              'btn',
              'tile-action-menu-item',
              item.tone ? `tile-action-menu-item-${item.tone}` : ''
            ].filter(Boolean).join(' ')}
            style={item.tone ? toneStyleByTone[item.tone] : undefined}
            onClick={() => {
              setOpen(false);
              item.onSelect?.();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>,
      document.body
    )
    : null;

  return (
    <div
      id={baseId}
      ref={rootRef}
      className={['tile-action-menu', mounted ? 'is-open' : '', className].filter(Boolean).join(' ')}
      onClick={event => event.stopPropagation()}
    >
      <AppButton
        id={resolvedTriggerId}
        ref={triggerRef}
        className={['btn tile-action-menu-trigger', mounted ? 'is-open' : '', triggerClassName].filter(Boolean).join(' ')}
        rect
        icon={triggerIcon}
        ariaLabel={triggerAriaLabel}
        title={triggerTitle}
        style={triggerStyle}
        onClick={() => setOpen(previous => !previous)}
      />
      {panelNode}
    </div>
  );
}
