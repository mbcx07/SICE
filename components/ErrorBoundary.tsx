
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
          <div className="bg-white p-12 rounded-[40px] shadow-2xl max-w-xl border border-red-100 animate-in zoom-in">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="text-red-600" size={40} />
            </div>
            <h1 className="text-3xl font-black text-slate-800 uppercase mb-4 tracking-tight">Error Interno detectado</h1>
            <p className="text-slate-600 mb-8 leading-relaxed">
              La aplicación experimentó un fallo en el renderizado. Esto puede deberse a datos corruptos o una interrupción en la conexión con la nube.
            </p>
            <div className="bg-slate-50 p-4 rounded-2xl mb-8 text-left">
               <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-widest">Detalle técnico:</p>
               <p className="text-xs font-mono text-red-800 break-all">{this.state.error?.message || "Excepción de runtime desconocida"}</p>
            </div>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-5 bg-imss text-white font-black uppercase tracking-widest rounded-2xl hover:bg-imss-dark transition-all flex items-center justify-center gap-3 shadow-xl"
            >
              <RefreshCw size={20} /> Reiniciar Aplicación
            </button>
          </div>
        </div>
      );
    }

    // Fix: Access children via this.props.children
    return (this as any).props.children;
  }
}

