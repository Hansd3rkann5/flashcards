import type { ChangeEventHandler, CSSProperties, FormEventHandler, ReactNode } from 'react';
import { useId } from 'react';
import { CloseOutlined } from '@ant-design/icons';
import { AppButton } from './AppButton';

export interface AppDialogField {
  id: string;
  name?: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'search' | 'url' | 'number';
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export interface AppDialogAction {
  id: string;
  label: string;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
}

interface AppDialogProps {
  id?: string;
  open: boolean;
  title: string;
  description?: string;
  fields?: AppDialogField[];
  actions?: AppDialogAction[];
  message?: string;
  showCloseButton?: boolean;
  children?: ReactNode;
  closeIcon?: ReactNode;
  backdropStyle?: CSSProperties;
  dialogStyle?: CSSProperties;
  contentStyle?: CSSProperties;
  formStyle?: CSSProperties;
  actionsStyle?: CSSProperties;
  onClose?: () => void;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

export function AppDialog({
  id,
  open,
  title,
  description = '',
  fields = [],
  actions = [],
  message = '',
  showCloseButton = true,
  children,
  closeIcon,
  backdropStyle,
  dialogStyle,
  contentStyle,
  formStyle,
  actionsStyle,
  onClose,
  onSubmit
}: AppDialogProps) {
  const reactId = useId();
  const baseId = id || `appDialog-${reactId.replace(/[:]/g, '')}`;
  const hasFormContent = fields.length > 0 || actions.length > 0;
  if (!open) return null;

  return (
    <div
      id={`${baseId}-backdrop`}
      style={{ ...styles.backdrop, ...(backdropStyle || {}) }}
      onClick={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        id={baseId}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ ...styles.dialog, ...(dialogStyle || {}) }}
      >
        <header id={`${baseId}-header`} style={styles.header}>
          <h2 id={`${baseId}-title`} style={styles.title}>{title}</h2>
          {showCloseButton && onClose ? (
            <div id={`${baseId}-closeWrap`} style={styles.closeButtonWrap}>
              <AppButton
                id={`${baseId}-closeBtn`}
                rect
                icon={closeIcon || <CloseOutlined />}
                ariaLabel="Close dialog"
                title="Close dialog"
                onClick={onClose}
                style={styles.closeButton}
              />
            </div>
          ) : null}
        </header>

        {description ? <p id={`${baseId}-description`} style={styles.description}>{description}</p> : null}

        {children ? <div id={`${baseId}-content`} style={contentStyle}>{children}</div> : null}

        {hasFormContent ? (
          <form id={`${baseId}-form`} style={{ ...styles.form, ...(formStyle || {}) }} onSubmit={onSubmit} autoComplete="on">
            {fields.map(field => (
              <label
                key={field.id}
                id={`${baseId}-fieldLabel-${String(field.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'field'}`}
                htmlFor={field.id}
                style={styles.fieldLabel}
              >
                <span id={`${baseId}-fieldLabelText-${String(field.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'field'}`} style={styles.span} >{field.label}</span>
                <input
                  id={field.id}
                  name={field.name || field.id}
                  type={field.type || 'text'}
                  autoComplete={field.autoComplete}
                  required={field.required}
                  placeholder={field.placeholder}
                  value={field.value}
                  onChange={field.onChange}
                  style={styles.input}
                />
              </label>
            ))}

            <div id={`${baseId}-actions`} style={{ ...styles.actions, ...(actionsStyle || {}) }}>
              {actions.map(action => (
                <AppButton
                  key={action.id}
                  id={`${baseId}-action-${String(action.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'button'}`}
                  buttonType={action.type || 'button'}
                  width="100%"
                  disabled={action.disabled}
                  onClick={action.onClick}
                  style={{
                    ...styles.actionButton,
                    ...(action.variant === 'primary' ? styles.actionPrimary : {}),
                    ...(action.variant === 'secondary' ? styles.actionSecondary : {}),
                    ...(action.variant === 'danger' ? styles.actionDanger : {})
                  }}
                >
                  {action.label}
                </AppButton>
              ))}
            </div>
          </form>
        ) : null}

        {message ? (
          <div id={`${baseId}-message`} style={styles.message} aria-live="polite">{message}</div>
        ) : null}
      </section>
    </div>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    display: 'grid',
    placeItems: 'center',
    background: 'rgba(8, 14, 28, 0.72)',
    padding: 'var(--s16)'
  },
  dialog: {
    width: 'min(100%, 480px)',
    border: '1px solid #30476f',
    borderRadius: 'var(--radius)',
    background: 'linear-gradient(180deg, rgba(18, 27, 47, 0.96) 0%, rgba(12, 20, 36, 0.98) 100%)',
    boxShadow: '0 0 var(--s24) rgba(10, 20, 38, 0.45)',
    padding: 'var(--s16)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--s12)'
  },
  header: {
    position: 'relative',
    display: 'grid',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 'var(--s40)',
    paddingBottom: 'var(--s16)',
    marginBottom: 'var(--s8)',
    borderBottom: '1px solid rgba(48, 71, 111, 0.8)',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    lineHeight: 1.2,
    textAlign: 'center'
  },
  closeButtonWrap: {
    position: 'absolute',
    right: 0,
    top: 'calc(50% - var(--s8))',
    transform: 'translateY(-50%)'
  },
  closeButton: {
    background: 'linear-gradient(180deg, #8f2539 0%, #5f1728 100%)',
    color: '#fff',
    borderRadius: '16px'
  },
  description: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.4,
    color: '#b8c9e5'
  },
  form: {
    display: 'grid',
    gap: 'var(--s12)'
  },
  span: {
    paddingLeft: 'var(--s12)',
  },
  fieldLabel: {
    display: 'grid',
    gap: 'var(--s4)',
    fontSize: '0.875rem',
    color: '#d5e0f3',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid #344f79',
    borderRadius: 'var(--s12)',
    background: 'rgba(13, 21, 39, 0.95)',
    color: '#edf2ff',
    minHeight: 'var(--s44)',
    padding: '0 var(--s12)',
    outline: 'none'
  },
  actions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'var(--s8)'
  },
  actionButton: {
    minHeight: 'var(--s44)'
  },
  actionPrimary: {
    background: 'var(--button, #2dd4bf)',
    color: '#0d1a2b'
  },
  actionSecondary: {
    background: '#273655',
    color: '#edf2ff'
  },
  actionDanger: {
    background: '#7f1d1d',
    color: '#ffe8e8'
  },
  message: {
    minHeight: 'var(--s16)',
    fontSize: '0.75rem',
    lineHeight: 1.4,
    color: '#b8c9e5'
  }
});
