import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommandDetailsDialog } from '../../../../components/admin/agent-details/CommandDetailsDialog';
import type { AgentCommand } from '../../../../services/agentService';

const baseCommand: AgentCommand = {
  command_id: 'c-1',
  agent_id: 'a-1',
  command_type: 'update_packages',
  status: 'completed',
  result_payload: null,
  executed_at: new Date().toISOString(),
} as any;

describe('CommandDetailsDialog', () => {
  it('renders the command type in the header', () => {
    render(<CommandDetailsDialog command={baseCommand} onClose={jest.fn()} />);
    expect(screen.getByText(/Command details:/)).toBeInTheDocument();
    expect(screen.getByText(/update_packages/)).toBeInTheDocument();
  });

  it('shows the top-level status', () => {
    render(<CommandDetailsDialog command={baseCommand} onClose={jest.fn()} />);
    // 'completed' appears twice (header type + status badge); just ensure it's present.
    expect(screen.getAllByText('completed').length).toBeGreaterThan(0);
  });

  it('calls onClose when the X button is clicked', () => {
    const onClose = jest.fn();
    const { container } = render(
      <CommandDetailsDialog command={baseCommand} onClose={onClose} />
    );
    const closeBtn = container.querySelector('button');
    if (!closeBtn) throw new Error('expected close button');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a top-level error message when present', () => {
    render(
      <CommandDetailsDialog
        command={{ ...baseCommand, error_message: 'agent unreachable' } as any}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText('agent unreachable')).toBeInTheDocument();
  });

  it('reads per-package results from result_payload.result (update_packages shape)', () => {
    const cmd = {
      ...baseCommand,
      result_payload: {
        status: 'completed_with_failures',
        result: {
          status: 'completed_with_failures',
          manager: 'apt',
          summary: { total: 3, succeeded: 1, failed: 1, skipped: 1 },
          results: [
            { package: 'curl', outcome: 'succeeded' },
            { package: 'vim', outcome: 'failed', stderr: 'package not found' },
            { package: 'bash', outcome: 'skipped', skipped_reason: 'already current' },
          ],
        },
      },
    } as any;

    render(<CommandDetailsDialog command={cmd} onClose={jest.fn()} />);
    // Section headers
    expect(screen.getByText(/Failed \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Skipped \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Succeeded \(1\)/)).toBeInTheDocument();
    // Specific package names
    expect(screen.getByText('vim')).toBeInTheDocument();
    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByText('curl')).toBeInTheDocument();
    // Stderr is auto-expanded for failed packages
    expect(screen.getByText('package not found')).toBeInTheDocument();
  });

  it('reads per-package results when stored directly under result_payload (alternate shape)', () => {
    const cmd = {
      ...baseCommand,
      command_type: 'something_else',
      result_payload: {
        results: [{ package: 'foo', outcome: 'succeeded' }],
      },
    } as any;

    render(<CommandDetailsDialog command={cmd} onClose={jest.fn()} />);
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText(/Succeeded \(1\)/)).toBeInTheDocument();
  });

  it('shows summary counts from the inner summary object', () => {
    const cmd = {
      ...baseCommand,
      result_payload: {
        result: {
          summary: { total: 10, succeeded: 7, failed: 1, skipped: 2 },
          results: [],
        },
      },
    } as any;

    render(<CommandDetailsDialog command={cmd} onClose={jest.fn()} />);
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument(); // succeeded
  });

  it('shows pre_flight_error when present (e.g. Windows Update reboot pending)', () => {
    const cmd = {
      ...baseCommand,
      result_payload: {
        result: {
          pre_flight_error: 'Reboot pending — cannot install updates',
          results: [],
        },
      },
    } as any;

    render(<CommandDetailsDialog command={cmd} onClose={jest.fn()} />);
    // Both the "Pre-flight: ..." span and the inner JSON dump match the
    // regex; just assert at least one element matches.
    expect(
      screen.getAllByText(/Reboot pending — cannot install updates/).length
    ).toBeGreaterThan(0);
  });

  it('falls back to raw payload when no per-package list is available', () => {
    const cmd = {
      ...baseCommand,
      command_type: 'ping',
      result_payload: { latency_ms: 12, jitter_ms: 1.5 },
    } as any;

    render(<CommandDetailsDialog command={cmd} onClose={jest.fn()} />);
    expect(screen.getByText(/Raw result payload/)).toBeInTheDocument();
    // The JSON block contains the keys
    expect(screen.getByText(/latency_ms/)).toBeInTheDocument();
  });

  it('does not crash on null/undefined result_payload', () => {
    expect(() =>
      render(
        <CommandDetailsDialog
          command={{ ...baseCommand, result_payload: null } as any}
          onClose={jest.fn()}
        />
      )
    ).not.toThrow();
  });
});
