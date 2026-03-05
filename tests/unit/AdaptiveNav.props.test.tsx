import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdaptiveNav, type NavItem } from '@/components/ui/adaptive-nav';
import { MenuItem } from '@/components/ui/AdaptiveNav/MenuItem';

const icon = <span aria-hidden="true">•</span>;

function item(id: string, overrides: Partial<NavItem> = {}): NavItem {
  return {
    id,
    icon,
    label: id,
    ...overrides,
  };
}

describe('AdaptiveNav props behavior', () => {
  it('supports customRender and customMenuRender passthrough', () => {
    render(
      <AdaptiveNav
        items={[
          item('custom-inline', {
            customRender: () => <button type="button">Inline custom</button>,
          }),
        ]}
      />
    );

    expect(screen.getByRole('button', { name: 'Inline custom' })).toBeInTheDocument();

    render(
      <MenuItem
        item={item('custom-menu', {
          customMenuRender: () => <div>Menu custom</div>,
        })}
      />
    );

    expect(screen.getByText('Menu custom')).toBeInTheDocument();
  });

  it('disables loading buttons and animates icon container class', () => {
    render(
      <AdaptiveNav
        displayMode="with-labels"
        items={[item('loading', { loading: true, onClick: vi.fn() })]}
      />
    );

    const button = screen.getByRole('button', { name: 'loading' });
    expect(button).toBeDisabled();
    expect(button.innerHTML).toContain('animate-spin');
  });

  it('hides items when visible is false or hidden is true', () => {
    render(
      <AdaptiveNav
        displayMode="with-labels"
        items={[
          item('shown'),
          item('hidden-prop', { hidden: true }),
          item('visible-prop', { visible: false }),
        ]}
      />
    );

    expect(screen.getByText('shown')).toBeInTheDocument();
    expect(screen.queryByText('hidden-prop')).not.toBeInTheDocument();
    expect(screen.queryByText('visible-prop')).not.toBeInTheDocument();
  });
});
