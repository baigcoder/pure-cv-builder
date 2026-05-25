"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

// Toast types
type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return context;
}

interface ToastProviderProps {
    children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = (message: string, type: ToastType = "info") => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);

        // Auto-dismiss after 4 seconds
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    };

    const dismissToast = (id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const getToastStyles = (type: ToastType) => {
        const baseStyles = {
            padding: "1rem 1.5rem",
            borderRadius: "12px",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            fontSize: "0.95rem",
            fontWeight: 500,
            animation: "toastSlideIn 0.3s ease",
            cursor: "pointer",
        };

        switch (type) {
            case "success":
                return { ...baseStyles, background: "#10b981", color: "white" };
            case "error":
                return { ...baseStyles, background: "#ef4444", color: "white" };
            case "warning":
                return { ...baseStyles, background: "#f59e0b", color: "white" };
            default:
                return { ...baseStyles, background: "#1e293b", color: "white" };
        }
    };

    const getIcon = (type: ToastType) => {
        switch (type) {
            case "success":
                return "✓";
            case "error":
                return "✕";
            case "warning":
                return "⚠";
            default:
                return "ℹ";
        }
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}

            {/* Toast Container */}
            <div
                style={{
                    position: "fixed",
                    bottom: "2rem",
                    right: "2rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    zIndex: 9999,
                }}
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        onClick={() => dismissToast(toast.id)}
                        style={getToastStyles(toast.type)}
                    >
                        <span style={{ fontSize: "1.1rem" }}>{getIcon(toast.type)}</span>
                        <span>{toast.message}</span>
                    </div>
                ))}
            </div>

        </ToastContext.Provider>
    );
}

export default ToastProvider;
