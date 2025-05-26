import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

// Only render once
const root = ReactDOM.createRoot(document.getElementById('root'));

// Error handler for React errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-xl font-bold text-red-700 mb-3">Something went wrong:</h2>
          <pre className="p-4 bg-white rounded border border-red-100 text-red-600 overflow-auto">
            {this.state.error && this.state.error.toString()}
          </pre>
          <div className="mt-4">
            <button 
              className="px-4 py-2 bg-blue-600 text-white rounded"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Use StrictMode only in development
const StrictModeWrapper = process.env.NODE_ENV === 'development' 
  ? ({ children }) => <React.StrictMode>{children}</React.StrictMode>
  : ({ children }) => children;

root.render(
  <StrictModeWrapper>
    <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
    </ErrorBoundary>
  </StrictModeWrapper>
); 