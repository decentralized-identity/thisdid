import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional custom fallback; defaults to the results-card error panel. */
  fallback?: ReactNode;
}
interface State {
  failed: boolean;
}

/**
 * Contains a render crash to its subtree instead of unmounting the whole SPA.
 * The results view renders an attacker-controlled DID document, so a hostile or
 * malformed shape (e.g. a service `type` that is an object) must degrade to an
 * error panel, never blank the page. Remount by giving the boundary a `key`
 * that changes per resolution so a fresh, valid result clears a prior failure.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("ThisDID: results render failed", error, info);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div
        role="alert"
        style={{
          maxWidth: 720,
          margin: "24px auto",
          padding: "18px 20px",
          borderRadius: 14,
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          fontSize: 14.5,
          lineHeight: 1.55,
        }}
      >
        <strong style={{ display: "block", marginBottom: 6 }}>
          This DID document couldn’t be displayed.
        </strong>
        The resolver returned a document in an unexpected shape, so ThisDID
        stopped rendering it rather than risk showing something misleading. Try
        another identifier — the resolver itself is unaffected.
      </div>
    );
  }
}
