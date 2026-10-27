import { Component, type ReactNode } from 'react';

/** Keeps a bug in one page from blanking the whole app: shows the error and a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="page">
        <p className="error">Something went wrong on this page: {this.state.error.message}</p>
        <button className="primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </section>
    );
  }
}
