# Autenticação do Rubli

## Sessão

O login e o cadastro retornam `accessToken` e `refreshToken` além do usuário.

- O access token é assinado por HMAC SHA-256 e expira em **15 minutos**.
- O refresh token é opaco, aleatório, armazenado apenas como hash SHA-256 no banco e expira em **30 dias**.
- A renovação é rotativa: um refresh token usado deixa de valer e outro é emitido.
- Cada conta mantém no máximo cinco sessões de refresh ainda válidas.

Em produção, `AUTH_ACCESS_TOKEN_SECRET` é obrigatório. Em desenvolvimento, se ele não existir, a API gera um segredo efêmero e avisa no log; reiniciar a API encerra as sessões desse modo.

## Endpoints de sessão

- `POST /api/v1/auth/register` — cria a conta e já inicia uma sessão.
- `POST /api/v1/auth/login` — credenciais válidas retornam os dois tokens.
- `GET /api/v1/auth/me` — retorna o usuário da sessão atual. Requer `Authorization: Bearer <accessToken>`.
- `POST /api/v1/auth/refresh` — recebe `{ "refreshToken": "..." }` e devolve um novo par de tokens.
- `POST /api/v1/auth/logout` — recebe o refresh token e o invalida. O aplicativo também o remove do dispositivo.

## Rotas protegidas

As ações que alteram dados identificam o autor exclusivamente pelo token: criação e cancelamento de demanda, propostas, aceite, contraproposta, confirmações, etapas de serviço, avaliações, conversa e mensagens, suporte, push token, perfil e simulação de assinatura.

As rotas de listagem de demandas, propostas e conversas também filtram os dados para o participante autenticado. O catálogo público de prestadores e o perfil público continuam públicos por necessidade do produto. O WebSocket exige um access token de sessão e não aceita mais `userId` de identificação enviado pelo cliente.

O backend valida o papel atual gravado no usuário. Assim, um cliente não envia proposta como prestador e um prestador não pode alterar demanda, proposta, conversa ou serviço de outra pessoa. O painel administrativo aceita usuário com papel `admin`; a chave administrativa existente é preservada temporariamente para não interromper o painel legado.

## Mobile Expo

Em Android e iOS, os tokens são mantidos em `expo-secure-store` (Keychain/Keystore). A camada de API inclui `Authorization: Bearer` automaticamente, renova uma vez após resposta 401 e encerra a sessão local quando o refresh falha.

Na versão web não existe equivalente seguro ao Keychain/Keystore: o fallback é armazenamento do próprio navegador, protegido pelas mesmas práticas de HTTPS, origem confiável e prevenção de XSS. Não use o build web para uma sessão administrativa de alto privilégio até existir uma estratégia web com cookie `HttpOnly` no domínio de produção.

## Verificações de segurança recomendadas

1. Login com senha correta retorna tokens; senha errada retorna 401.
2. Chamar uma rota protegida sem token, com token alterado ou token vencido retorna 401.
3. Renovar com refresh válido cria novo par; repetir o refresh antigo retorna 401.
4. Um cliente tentando criar proposta recebe 403.
5. Um prestador tentando cancelar demanda de cliente ou alterar serviço que não contratou recebe 403.
6. Logout invalida o refresh e remove a sessão local.
