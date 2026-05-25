"use client";

import React, { Component, ReactNode } from "react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary component to catch JavaScript errors in child components
 * and display a fallback UI instead of crashing the entire application.
 */
class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log error to console (in production, send to error tracking service)
        console.error("Error caught by ErrorBoundary:", error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div
                    style={{
                        minHeight: "100vh",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "2rem",
                        background: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
                    }}
                >
                    <div
                        style={{
                            maxWidth: "500px",
                            textAlign: "center",
                            background: "white",
                            borderRadius: "16px",
                            padding: "3rem",
                            boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
                        }}
                    >
                        <div
                            style={{
                                fontSize: "4rem",
                                marginBottom: "1rem",
                            }}
                        >
                            😕
                        </div>
                        <h1
                            style={{
                                fontSize: "1.75rem",
                                fontWeight: 700,
                                color: "#1e293b",
                                marginBottom: "1rem",
                            }}
                        >
                            Something went wrong
                        </h1>
                        <p
                            style={{
                                color: "#64748b",
                                marginBottom: "2rem",
                                lineHeight: 1.6,
                            }}
                        >
                            We encountered an unexpected error. Your CV data has been saved
                            locally and will be restored when you refresh.
                        </p>
                        <button
                            onClick={this.handleRetry}
                            style={{
                                background: "#1e293b",
                                color: "white",
                                border: "none",
                                padding: "0.875rem 2rem",
                                borderRadius: "10px",
                                fontSize: "1rem",
                                fontWeight: 500,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = "#334155";
                                e.currentTarget.style.transform = "translateY(-2px)";
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = "#1e293b";
                                e.currentTarget.style.transform = "translateY(0)";
                            }}
                        >
                            Refresh Page
                        </button>
                        {process.env.NODE_ENV === "development" && this.state.error && (
                            <details
                                style={{
                                    marginTop: "2rem",
                                    textAlign: "left",
                                    background: "#fef2f2",
                                    padding: "1rem",
                                    borderRadius: "8px",
                                    fontSize: "0.75rem",
                                }}
                            >
                                <summary style={{ cursor: "pointer", color: "#dc2626" }}>
                                    Error Details (Development Only)
                                </summary>
                                <pre
                                    style={{
                                        marginTop: "0.5rem",
                                        overflow: "auto",
                                        color: "#991b1b",
                                    }}
                                >
                                    {this.state.error.message}
                                    {"\n\n"}
                                    {this.state.error.stack}
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

export default ErrorBoundary;
