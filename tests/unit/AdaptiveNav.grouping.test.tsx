import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdaptiveNav, type NavItem } from '@/components/ui/adaptive-nav';

const icon = <span aria-hidden="true">•</span>;

function buildItem(id: string, group?: string, overrides: Partial<NavItem> = {}): NavItem {
  return {
    id,
    icon,
    label: id,
    ...(group ? { group } : {}),
    ...overrides,
  };
}

describe('AdaptiveNav grouping', () => {
  it('renders inline separators when group changes', () => {
    const { container } = render(
      <AdaptiveNav
        displayMode="with-labels"
        items={[
          buildItem('one', 'a'),
          buildItem('two', 'a'),
          buildItem('three', 'b'),
        ]}
      />
    );

    const separators = container.querySelectorAll('.bg-border');
    expect(separators.length).toBeGreaterThanOrEqual(1);
  });

  it('renders menu-only groups with separators in overflow menu', async () => {
    render(
      <AdaptiveNav
        displayMode="with-labels"
        items={[
          buildItem('inline', 'a'),
          buildItem('menu-a', 'a', { menuOnly: true }),
          buildItem('menu-b', 'b', { menuOnly: true }),
        ]}
      />
    );

    const trigger = screen.getByTitle('More options');
    fireEvent.pointerDown(trigger);

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('menu-a')).toBeInTheDocument();
    expect(within(menu).getByText('menu-b')).toBeInTheDocument();

    const menuSeparators = menu.querySelectorAll('[role="separator"]');
    expect(menuSeparators.length).toBeGreaterThanOrEqual(1);
  });

  it('shows all visible items in burger mode', async () => {
    const user = userEvent.setup();

    render(
      <AdaptiveNav
        layoutMode="burger"
        items={[buildItem('one', 'a'), buildItem('two', 'b')]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Menu' }));

    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
  });
});
