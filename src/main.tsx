import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './context/AuthContext';
import { WorkProvider } from './context/WorkContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Sem basename, num site servido em /revezo/ todo <Link to="/x">
        aponta para a raiz do domínio em vez de /revezo/x. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        {/* WorkProvider depende do perfil resolvido por AuthProvider (unidade,
            papel) — precisa ficar por dentro dele. */}
        <WorkProvider>
          <App />
        </WorkProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
