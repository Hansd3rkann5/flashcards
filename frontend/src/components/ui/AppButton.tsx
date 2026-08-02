import type { CSSProperties, MouseEventHandler, PointerEventHandler, ReactNode } from 'react';
import { forwardRef, useId, useMemo, useState } from 'react';

type SizeValue = number | string;

export interface AppButtonProps {
  id?: string;
  iconId?: string;
  labelId?: string;
  icon?: ReactNode;
  children?: ReactNode;
  ariaLabel?: string;
  title?: string;
  buttonType?: 'button' | 'submit' | 'reset';
  rect?: boolean;
  width?: SizeValue;
  height?: SizeValue;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onPressIn?: PointerEventHandler<HTMLButtonElement>;
  onPressOut?: PointerEventHandler<HTMLButtonElement>;
}

function toCssSize(value: SizeValue | undefined, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  const raw = String(value ?? '').trim();
  return raw || fallback;
}

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(function AppButton({
  id,
  iconId,
  labelId,
  icon,
  children,
  ariaLabel,
  title,
  buttonType = 'button',
  rect = false,
  width,
  height,
  disabled = false,
  className = '',
  style: styleOverride,
  onClick,
  onPressIn,
  onPressOut
}: AppButtonProps, ref) {
  const [pressed, setPressed] = useState(false);
  const reactId = useId();
  const resolvedId = id || `appButton-${reactId.replace(/[:]/g, '')}`;
  const resolvedIconId = icon ? (iconId || `${resolvedId}-icon`) : undefined;
  const resolvedLabelId = children ? (labelId || `${resolvedId}-label`) : undefined;

  const sizeStyle = useMemo<CSSProperties>(() => {
    if (rect) {
      return {
        width: toCssSize(width, 'var(--s40)'),
        height: toCssSize(height, 'var(--s40)')
      };
    }
    return {
      width: toCssSize(width, 'auto'),
      height: toCssSize(height, 'var(--s44)')
    };
  }, [rect, width, height]);
  const buttonStyle = useMemo<CSSProperties>(() => ({
    ...styles.base,
    ...(rect ? styles.rect : styles.regular),
    ...sizeStyle,
    ...(disabled ? styles.disabled : {}),
    ...(pressed ? styles.pressed : {}),
    ...(styleOverride || {})
  }), [rect, sizeStyle, disabled, pressed, styleOverride]);

  return (
    <button
      ref={ref}
      id={resolvedId}
      type={buttonType}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      className={className}
      style={buttonStyle}
      onClick={onClick}
      onPointerDown={event => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPointerUp={event => {
        setPressed(false);
        onPressOut?.(event);
      }}
      onPointerLeave={event => {
        setPressed(false);
        onPressOut?.(event);
      }}
      onPointerCancel={event => {
        setPressed(false);
        onPressOut?.(event);
      }}
    >
      {icon ? <span id={resolvedIconId} style={styles.icon}>{icon}</span> : null}
      {children ? <span id={resolvedLabelId} style={styles.label}>{children}</span> : null}
    </button>
  );
});

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  base: {
    border: 'none',
    borderRadius: 'var(--radius)',
    background: '#273655',
    color: '#edf2ff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--s8)',
    cursor: 'pointer',
    transition: 'transform 140ms ease, opacity 140ms ease, background-color 140ms ease',
    fontWeight: 700,
    padding: '0 var(--s12)'
  },
  rect: {
    width: 'var(--s40)',
    minWidth: 'var(--s40)',
    height: 'var(--s40)',
    padding: 0
  },
  regular: {
    minHeight: 'var(--s44)'
  },
  pressed: {
    transform: 'scale(0.97)',
    opacity: 0.72
  },
  disabled: {
    opacity: 0.55,
    cursor: 'not-allowed'
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    fontSize: 'var(--s16)',
    lineHeight: 1
  },
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  }
});
