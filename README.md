# FolhaPronta · Admin

Painel administrativo do FolhaPronta. Vite + React + TypeScript + Tailwind.

## Setup

```bash
npm install
npm run dev          # http://localhost:3001
```

## Variáveis

- `VITE_API_URL` — base do backend (default `https://localhost:7166`).

## Login

A primeira subida do backend roda o seeder (`DataSeeder`) e cria um admin a
partir das chaves `Admin:SeedEmail` / `Admin:SeedPassword` em
`appsettings.Development.json`. Se já existe um usuário com esse e-mail, ele é
**promovido a Admin** sem alterar a senha.

Default dev (em `appsettings.Development.json`).

> Em produção, configure via env vars (`Admin__SeedEmail` / `Admin__SeedPassword` / `Admin__SeedName`) — o `appsettings.json` de prod não tem o bloco.

## Status (Fase 1)

- [x] Esqueleto Vite + Tailwind
- [x] AuthContext + login (compartilha `/api/auth/login` com o app principal)
- [x] RBAC client-side (`ProtectedRoute` checa `role === "Admin"`)
- [x] Sidebar com placeholders das próximas fases
- [x] HealthPage — chama `/api/admin/health` pra validar RBAC end-to-end

Próximas fases: Clientes, Assinaturas, Planos, Plano × Atividade, Diagnóstico.
