import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from './states';

describe('state components', () => {
  it('shows loading text', () => {
    render(<LoadingState label="Loading sales…" />);
    expect(screen.getByText('Loading sales…')).toBeInTheDocument();
  });

  it('shows empty state with action', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<EmptyState title="No products" hint="Add one." actionLabel="Add" onAction={onAction} />);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('shows error state with retry', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(<ErrorState message="Failed." onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('confirm dialog confirms and cancels', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ConfirmDialog open title="Delete?" message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    rerender(
      <ConfirmDialog open title="Delete?" message="Sure?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
