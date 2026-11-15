import * as React from 'react';
import { reportRendererError } from '../lib/ipc';
import { ErrorState } from './ui/states';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    reportRendererError(`React boundary: ${error.message}`);
  }

  override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="p-6">
          <ErrorState
            message={`Something went wrong: ${this.state.error.message}`}
            onRetry={() => this.setState({ error: null })}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
