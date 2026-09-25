# Políticas de Privacidade e Telemetria

Este documento estabelece as diretrizes de privacidade e conformidade com a LGPD (Lei Geral de Proteção de Dados) referentes à captura de telemetria, gravação de sessões e identificação de usuários no sistema Revezo.

## 1. Princípio da Minimização e Anonimização
O Revezo lida com informações sensíveis de escalas hospitalares, incluindo nomes de profissionais, licenças e restrições. Para garantir a segurança dos dados e o cumprimento da LGPD:
- **É estritamente proibido** o envio de dados diretamente identificáveis (PII - *Personally Identifiable Information*), como e-mails, CPFs ou nomes completos, para ferramentas externas de análise e telemetria (ex: Microsoft Clarity, Google Analytics).
- Todo rastreamento de uso e sessões deve ser feito utilizando identificadores opacos e pseudonimizados, especificamente o **UUID** gerado pelo Supabase Auth (`user.id`).

## 2. Telemetria e Microsoft Clarity
A integração com o Microsoft Clarity serve exclusivamente para fins de melhoria de usabilidade (UX) e depuração de erros. Para manter a conformidade com os Termos de Uso do Clarity e a LGPD:
- O sistema utiliza o recurso de mascaramento (`data-clarity-mask="true"`) para garantir que os nomes dos médicos e detalhes específicos dos plantões não sejam gravados em texto legível.
- A identificação do usuário na ferramenta (`identify`) utiliza o UUID. Caso seja necessário fornecer suporte a um usuário específico, a equipe técnica cruza internamente o e-mail informado pelo usuário com o UUID no banco de dados seguro, e então busca a sessão correspondente na ferramenta analítica.
- Tags adicionais enviadas à telemetria devem ser impessoais, como o ambiente (`environment: production/development`), a versão do aplicativo ou o cargo/papel genérico do usuário.

## 3. Isolamento Multi-Tenant (Múltiplas Unidades)
O Revezo é uma aplicação multi-tenant. Dados de uma unidade hospitalar nunca devem transbordar para outra. Isso se estende à **presença online**:
- A presença é visível apenas para coordenadores da mesma unidade e administradores, por prerrogativa de função. O usuário comum anuncia sua presença, mas não vê a de ninguém.
- Os dados trafegados são o UUID do perfil e o horário de entrada. O isolamento é garantido no servidor por RLS no Realtime, com canal privado por unidade. Coordenadores não recebem a presença de outras unidades; administradores podem acompanhar as unidades às quais têm acesso.

## 4. Consentimento e Finalidade
Os dados de telemetria anonimizada não são utilizados para vigilância ou avaliação de desempenho individual, sendo vedada a criação de "perfis comportamentais" rastreáveis. A finalidade é unicamente a manutenção da estabilidade técnica e segurança da plataforma.
