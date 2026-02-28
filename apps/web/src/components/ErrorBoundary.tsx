import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useLanguageStore } from '@/stores/language';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const messages = {
  en: { error: 'Something went wrong', retry: 'Try again' },
  ru: { error: 'Что-то пошло не так', retry: 'Попробовать снова' },
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {return this.props.fallback;}
      const lang = useLanguageStore.getState().language;
      const t = messages[lang];
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
          <p className="text-muted-foreground text-sm">{t.error}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-xs text-primary underline"
          >
            {t.retry}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
