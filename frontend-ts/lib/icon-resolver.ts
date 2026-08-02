// Icon source resolver (assets + Ant Design via Iconify CDN)
// ============================================================================

interface ResolvedIconSource {
  src: string;
  isAntd: boolean;
}

function resolveIconSource(icon: unknown, color?: string): ResolvedIconSource {
  const raw = String(icon || '').trim();
  if (!raw) return { src: '', isAntd: false };

  // Ant Design icon shorthand:
  // - "antd:menu-outlined"
  // - "antd:setting-filled"
  if (raw.toLowerCase().startsWith('antd:')) {
    const iconName = raw.slice(5).trim();
    const encodedName = encodeURIComponent(iconName || 'question-circle-outlined');
    const encodedColor = encodeURIComponent(String(color || '').trim() || 'white');
    return {
      src: `https://api.iconify.design/ant-design/${encodedName}.svg?color=${encodedColor}`,
      isAntd: true
    };
  }

  return { src: raw, isAntd: false };
}
