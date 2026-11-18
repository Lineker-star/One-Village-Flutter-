/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

interface Props {
  children: ReactNode;
  lang?: "fr" | "en";
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

// Root-level error boundary: catches any component throw inside <App/> and renders a
// friendly fallback instead of the default blank white screen React 19 would otherwise
// show. A malformed provider row, a failed image that breaks rendering, a missing Supabase
// field — anything that throws during render — is caught here so the user can retry or
// reload without losing their session.
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to console so the error is visible in devtools / Vercel logs.
    console.error("[ErrorBoundary] Caught render error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    const lang = this.props.lang || "fr";
    const t = {
      fr: {
        title: "Oops ! Une erreur est survenue",
        subtitle: "L'application a rencontré un problème inattendu.",
        reload: "Recharger la page",
        retry: "Réessayer",
        back: "Retour à l'accueil",
        details: "Détails de l'erreur (pour les développeurs)",
      },
      en: {
        title: "Oops! Something went wrong",
        subtitle: "The app encountered an unexpected error.",
        reload: "Reload the page",
        retry: "Try again",
        back: "Back to home",
        details: "Error details (for developers)",
      },
    }[lang];

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FBF7F0] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-amber-100 p-8 text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>

            <div>
              <h1 className="text-xl font-bold text-amber-950">{t.title}</h1>
              <p className="text-xs text-amber-800 mt-1.5">{t.subtitle}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={this.handleReload}
                className="flex items-center justify-center gap-1.5 px-5 py-3 bg-amber-800 hover:bg-amber-900 text-white font-medium rounded-xl text-sm transition-all shadow-sm cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                {t.reload}
              </button>
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-1.5 px-5 py-3 border border-amber-200 text-amber-900 hover:bg-amber-50 font-medium rounded-xl text-sm transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                {t.retry}
              </button>
            </div>

            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-[11px] font-semibold text-amber-800 cursor-pointer hover:text-amber-950">
                  {t.details}
                </summary>
                <pre className="mt-2 text-[10px] font-mono bg-amber-50 border border-amber-100 rounded-lg p-3 overflow-x-auto text-amber-950 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                  {this.state.error.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}