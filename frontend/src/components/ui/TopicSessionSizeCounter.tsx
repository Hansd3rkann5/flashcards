import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { AppButton } from './AppButton';

interface TopicSessionSizeCounterProps {
  idBase?: string;
  value: number;
  max: number;
  onChange: (nextValue: number) => void;
}

const SESSION_PLUS_LONG_PRESS_MS = 420;

function toSafeCount(value: number | undefined): number {
  const safe = Number(value);
  if (!Number.isFinite(safe)) return 0;
  return Math.max(0, Math.trunc(safe));
}

export function TopicSessionSizeCounter({
  idBase = 'topicSessionSizeCounter',
  value,
  max,
  onChange
}: TopicSessionSizeCounterProps) {
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef(false);

  const safeValue = toSafeCount(value);
  const safeMax = toSafeCount(max);
  const rootId = `${idBase}-root`;
  const valueId = `${idBase}-value`;
  const valueTextId = `${idBase}-valueText`;
  const minusId = `${idBase}-minus`;
  const plusId = `${idBase}-plus`;

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = () => {
    clearLongPress();
    didLongPressRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      didLongPressRef.current = true;
      if (safeMax <= 0) {
        onChange(0);
        return;
      }
      onChange(Math.max(1, safeMax));
    }, SESSION_PLUS_LONG_PRESS_MS);
  };

  useEffect(() => () => clearLongPress(), []);

  return (
    <div id={rootId} className="counter">
      <AppButton
        id={minusId}
        className="btn counter-btn innerGlow"
        icon={<MinusOutlined />}
        style={styles.button}
        ariaLabel="Decrease session size"
        title="Decrease session size"
        onClick={() => {
          if (safeMax <= 0) {
            onChange(0);
            return;
          }
          onChange(Math.max(1, safeValue - 1));
        }}
      />
      <div id={valueId} className="counter-value">
        <span id={valueTextId} className="session-size-value-text">{safeValue}</span>
      </div>
      <AppButton
        id={plusId}
        className="btn counter-btn innerGlow"
        icon={<PlusOutlined />}
        style={styles.button}
        ariaLabel="Increase session size"
        title="Increase session size"
        onPressIn={event => {
          if (event.button !== 0) return;
          startLongPress();
        }}
        onPressOut={() => clearLongPress()}
        onClick={() => {
          if (didLongPressRef.current) {
            didLongPressRef.current = false;
            return;
          }
          if (safeMax <= 0) {
            onChange(0);
            return;
          }
          onChange(Math.min(safeMax, safeValue + 1));
        }}
      />
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  button: {
    width: '72px',
    minWidth: '72px',
    height: 'var(--counter-height)',
    minHeight: 'var(--counter-height)',
    padding: 0,
    borderRadius: '14px',
  }
});
