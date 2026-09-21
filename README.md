# Revezo 🗓️

Revezo é um aplicativo focado em gerar e gerenciar escalas de equipe hospitalar utilizando um motor/solver determinístico, rodando de forma ágil no navegador.

## 🛠️ Stack de Tecnologia
- **Frontend:** React + TypeScript + Vite
- **Estilização:** TailwindCSS + Lucide Icons
- **Autenticação & Banco:** Supabase (PostgreSQL + RLS)
- **Hospedagem:** GitHub Pages (via GitHub Actions)
- **Node Recomendado:** v22 ou v24

## 🚀 Como rodar localmente

### 1. Clonar e Instalar
Faça o clone do projeto e entre na pasta:
```bash
git clone git@github.com:NexaDuo/revezo.git
cd revezo
```

Instale as dependências (recomendamos Node 22+):
```bash
npm install
```

### 2. Configuração das Variáveis de Ambiente
O projeto exige as chaves do Supabase para funcionar com o banco de dados real.

Copie o arquivo de exemplo:
```bash
cp .env.example .env
```
Abra o arquivo `.env` gerado e insira suas credenciais:
```env
VITE_SUPABASE_URL=https://[SEU_ID].supabase.co
VITE_SUPABASE_ANON_KEY=[SUA_CHAVE_PUBLICA]
```
*(Dica de Sobrevivência: O aplicativo possui um "Modo Demo". Se você tentar rodar sem essas chaves, o app não vai dar tela branca (crash). Ele entrará em modo demonstração com dados de perfil falsos para você poder desenvolver telas).*

### 3. Executando o Servidor
Inicie o servidor do Vite:
```bash
npm run dev
```
Abra `http://localhost:5173` no seu navegador!

### 4. Teste de Build
Sempre rode o build de produção localmente antes de enviar código para garantir que a tipagem do TypeScript está íntegra:
```bash
npm run build
```

## 🔐 Permissões e Login com o Google
Se for testar o login OAuth do Google rodando localmente (na porta 5173), você precisa configurar os redirecionamentos de segurança para não receber um erro de bloqueio:

1. No painel do **Supabase** (Auth > URL Configuration), adicione `http://localhost:5173/*` na lista de **Redirect URLs** adicionais.
2. No painel do **Google Cloud Console**, certifique-se de que sua URL de callback de autorização está apontando certinho para o seu projeto no Supabase: `https://[SEU_ID].supabase.co/auth/v1/callback`
