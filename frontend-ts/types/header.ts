// Shared header component types (global script scope)
// ============================================================================

type SizeLike = number | string;
interface HitSlopInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}
type ButtonPressEvent = MouseEvent | KeyboardEvent | PointerEvent | Event;
type AppButtonVariant = 'default' | 'sidebarToggle';

interface AppButtonBaseOptions {
  icon: string;
  onClick?: (event: MouseEvent) => void;
  onPress?: (event: ButtonPressEvent) => void;
  onPressIn?: (event: ButtonPressEvent) => void;
  onPressOut?: (event: ButtonPressEvent) => void;
  id?: string;
  title?: string;
  ariaLabel?: string;
  variant?: AppButtonVariant;
  iconColor?: string;
  iconSize?: SizeLike;
  disabled?: boolean;
  loading?: boolean;
  backgroundColor?: string;
  backgroundColorDisabled?: string;
  textStyle?: StyleLike;
  style?: StyleLike;
  disableHapticOnPressOut?: boolean;
  hitSlop?: number | HitSlopInsets;
  visualDisabled?: boolean;
}

type AppButtonOptions = (
  AppButtonBaseOptions
  & { rect: true; width?: SizeLike; height?: SizeLike; }
) | (
  AppButtonBaseOptions
  & { rect?: false | undefined; width: SizeLike; height: SizeLike; }
);

type HeaderButtonOptions = AppButtonOptions;
type HeaderButtonVariant = AppButtonVariant;

interface HeaderComponentOptions {
  title: string;
  id?: string;
  leftButtons?: AppButtonOptions[];
  rightButtons?: AppButtonOptions[];
}
