import type { CSSProperties } from 'react';
import { ProgressBar } from '../components/ui/progressBar';

export default function HomeView() {
  return (
    <section id="homeView" style={styles.root}>
      <ProgressBar
        id="homeCompleteProgressBar"
        title="Complete Progress"
        totalCards={0}
        segments={[
          { key: 'mastered', label: 'Mastered', value: 0, color: '#22c55e' },
          { key: 'partial', label: 'Partially', value: 0, color: '#f59e0b' },
          { key: 'wrong', label: 'Wrong', value: 0, color: '#ef4444' },
          { key: 'not-answered', label: 'Not answered', value: 0, color: '#64748b' }
        ]}
      />
    </section>
  );
}

const StyleSheet = {
  create<T extends Record<string, CSSProperties>>(input: T): T {
    return input;
  }
};

const styles = StyleSheet.create({
  root: {
    minWidth: 0
  }
});
