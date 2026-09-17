// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchableList } from './SearchableList';

interface Fixture {
  id: string;
  name: string;
  cardNo: string;
}

const fixtures: Fixture[] = [
  { id: '1', name: 'Marcus Taylor', cardNo: 'ACT-001' },
  { id: '2', name: 'Evelyn Johnson', cardNo: 'ACT-002' },
  { id: '3', name: 'Mamadou N\'Diaye', cardNo: 'ACT-003' },
];

function renderList(onSelect = vi.fn()) {
  render(
    <SearchableList<Fixture>
      items={fixtures}
      getKey={(f) => f.id}
      getSearchableText={(f) => `${f.name} ${f.cardNo}`}
      placeholder="Search..."
      emptyMessage="No results"
      onSelect={onSelect}
      renderItem={(f, isSelected) => (
        <div data-testid={`item-${f.id}`} data-selected={isSelected}>
          {f.name} — {f.cardNo}
        </div>
      )}
    />
  );
  return onSelect;
}

describe('SearchableList', () => {
  it('renders all items (up to maxResults) when the search box is empty', () => {
    renderList();
    expect(screen.getByText(/Marcus Taylor/)).toBeInTheDocument();
    expect(screen.getByText(/Evelyn Johnson/)).toBeInTheDocument();
    expect(screen.getByText(/Mamadou N'Diaye/)).toBeInTheDocument();
  });

  it('filters items by the search query, matching on any field in getSearchableText', async () => {
    renderList();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search...'), 'evelyn');

    expect(screen.getByText(/Evelyn Johnson/)).toBeInTheDocument();
    expect(screen.queryByText(/Marcus Taylor/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mamadou N'Diaye/)).not.toBeInTheDocument();
  });

  it('filters by a field other than the display name (e.g. card number)', async () => {
    renderList();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search...'), 'act-003');

    expect(screen.getByText(/Mamadou N'Diaye/)).toBeInTheDocument();
    expect(screen.queryByText(/Marcus Taylor/)).not.toBeInTheDocument();
  });

  it('shows the empty-state message when no item matches', async () => {
    renderList();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText('Search...'), 'nobody-matches-this');

    expect(screen.getByText('No results')).toBeInTheDocument();
  });

  it('calls onSelect with the matching item when a row is clicked', async () => {
    const onSelect = renderList();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('item-2'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(fixtures[1]);
  });

  it('marks the item matching selectedKey as selected via renderItem', () => {
    render(
      <SearchableList<Fixture>
        items={fixtures}
        getKey={(f) => f.id}
        getSearchableText={(f) => f.name}
        selectedKey="2"
        onSelect={vi.fn()}
        renderItem={(f, isSelected) => (
          <div data-testid={`item-${f.id}`} data-selected={isSelected}>
            {f.name}
          </div>
        )}
      />
    );

    expect(screen.getByTestId('item-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('item-1')).toHaveAttribute('data-selected', 'false');
  });
});
