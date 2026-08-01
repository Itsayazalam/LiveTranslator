import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TranslationPanel } from '../components/Panels';

describe('TranslationPanel', () => {
  it('renders partial translation text', () => {
    render(
      <TranslationPanel
        text=""
        partial="Namaste"
        lang="Hindi"
        onCopy={() => {}}
        isActive
        isTranslating={false}
      />,
    );

    expect(screen.getByTestId('translation-display').textContent).toBe('Namaste');
    cleanup();
  });

  it('renders final translation when partial is empty', () => {
    render(
      <TranslationPanel
        text="Namaste duniya"
        partial=""
        lang="Hindi"
        onCopy={() => {}}
        isActive
        isTranslating={false}
      />,
    );

    expect(screen.getByTestId('translation-display').textContent).toBe('Namaste duniya');
    cleanup();
  });

  it('shows translating placeholder while batch translation runs', () => {
    render(
      <TranslationPanel
        text=""
        partial=""
        lang="Hindi"
        onCopy={() => {}}
        isActive
        isTranslating
      />,
    );

    expect(screen.getByTestId('translation-display').textContent).toBe('Translating…');
    cleanup();
  });

  it('shows press space hint while listening', () => {
    render(
      <TranslationPanel
        text=""
        partial=""
        lang="Hindi"
        onCopy={() => {}}
        isActive
        isTranslating={false}
      />,
    );

    expect(screen.getByTestId('translation-display').textContent).toBe('Press Space to translate');
    cleanup();
  });
});
