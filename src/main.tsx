import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { applyInitialTheme } from "@/hooks/useTheme";
import App from "./App";
import "./styles/globals.css";

// Aplica o tema ANTES do React montar — evita flash de tema claro
// quando o usuário tem preferência por escuro.
applyInitialTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
