import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('App error boundary caught:', error, info);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Read DEV inside render so vi.stubEnv can flip it per-test.
    // Prod builds get only the generic copy + error code; the raw message /
    // stack are gated behind a dev-only <details>.
    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
        <div className="bati-card rounded-lg p-8 max-w-lg">
          <h1 className="text-xl font-bold text-bati-terra mb-2">Une erreur est survenue</h1>
          <p className="text-sm text-bati-muted mb-4">
            L&apos;application a rencontré un problème inattendu. Veuillez réessayer ; si
            l&apos;erreur persiste, signalez le code ci-dessous au support.
          </p>
          <p className="text-xs text-bati-muted mb-4">
            Code&nbsp;: <code className="font-mono">{error.name}</code>
          </p>
          {isDev && (
            <details className="mb-4">
              <summary className="text-xs text-bati-muted cursor-pointer">
                Détails (dev uniquement)
              </summary>
              <pre className="text-xs bg-bati-bg p-3 rounded border border-bati-border overflow-auto mt-2">
                {error.message}
                {error.stack ? `\n\n${error.stack}` : ''}
              </pre>
            </details>
          )}
          <button
            onClick={this.reset}
            className="px-4 py-2 bg-bati-teal text-white rounded hover:opacity-90"
            type="button"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }
}
