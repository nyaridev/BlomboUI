import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const error = this.state.error
    if (!error) {
      return this.props.children
    }
    return (
      <pre className="m-4 whitespace-pre-wrap text-sm" style={{ color: '#f44' }}>
        {error.stack || error.message}
      </pre>
    )
  }
}
