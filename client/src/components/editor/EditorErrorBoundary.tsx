import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode; onError?: (message: string) => void }
interface State { error: Error | null }

export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State { return { error } }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Customer editor render failure', error, info.componentStack)
    this.props.onError?.(error.message)
  }

  render() {
    if (!this.state.error) return this.props.children
    return this.props.fallback ?? <section className="m-4 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800" role="alert"><h2 className="font-bold">This part of the editor could not be displayed.</h2><p className="mt-1 text-sm">Your other photos and edits are still safe.</p><button className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-bold" onClick={() => this.setState({ error: null })} type="button">Try again</button></section>
  }
}
