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
    return this.props.fallback ?? <section className="m-4 rounded-[20px] border border-cs-alert-error-border bg-cs-alert-error-bg p-5 text-cs-alert-error-fg" role="alert"><h2 className="font-extrabold">Phần này của trang ghép khung chưa hiển thị được.</h2><p className="mt-1 text-sm">Các ảnh và chỉnh sửa khác của bạn vẫn được giữ.</p><button className="cs-btn-chrome mt-3 min-h-11 rounded-[16px] px-4 text-sm font-bold text-cs-ink" onClick={() => this.setState({ error: null })} type="button">Thử lại</button></section>
  }
}
