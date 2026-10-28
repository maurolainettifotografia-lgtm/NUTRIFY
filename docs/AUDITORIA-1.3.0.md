# Auditoria Nutrify 1.3.0 — 28/10/2026

## Diagnóstico antes das alterações

A main de NUTRIFY estava na versão 1.0.0 e não representava o APK 1.2.3 já entregue. A consolidação usa as fontes locais da versão entregue, preserva os originais e mantém inalterados `frontend/metro.config.js`, `frontend/tsconfig.json`, `frontend/eslint.config.js`, `frontend/scripts/**` e `backend/pytest.ini` em relação à main.

| Situação | Evidência e conclusão |
| --- | --- |
| Implementado | `backend/strava_integration.py`: OAuth com estado temporário, escopos, tokens criptografados, renovação, lease de sincronização, cache de sete dias e unicidade por usuário/atividade. |
| Implementado | `backend/server.py`, `backend/workouts_lib.py`: MongoDB como fonte persistente; diário usa somente os registros Nutrify. MET × peso em kg × duração em horas nos treinos concluídos. Strava usa segundos→minutos, metros→km e kcal informadas, sem inventar valor ausente. |
| Incompleto | `frontend/src/auth-context.tsx`: rede bloqueava a restauração; qualquer erro derrubava o estado de login. Consultas de saúde ficavam somente na memória. |
| Falha confirmada | `POST /sessions`: dois inserts sem identificação de envio podiam duplicar sessão/calorias em reenvio ou deixar a gravação secundária incompleta. Soma diária parava em 100 registros. |
| Incompleto | 59 detalhes de execução tinham textos misturados, vazios ou inadequados; outras 17 figuras não tinham instruções. Legendas mencionavam geração por IA. |
| Não implementado | Health Connect: sem SDK nativo, permissões, leitura ou escrita. Não foi tratado como conexão concluída. |
| Não verificado | OAuth com uma conta Strava real, permissões/revogação reais e desempenho/instalação em Android físico. |

A sequência aplicada foi: consolidar fontes; corrigir sessão/reenvios e erros; revisar execução e hierarquia; reduzir trabalho inicial; verificar API, interface e build; publicar branch/PR/prévia sem merge.

## Alterações

### Treinos e apresentação

- 76 guias PT-BR com posição inicial, movimento, respiração específica e cuidados, em `frontend/src/data/exercise-instructions-pt.json`.
- Os 59 registros legados de `exercise-details.json` também foram traduzidos; o componente não exibe texto em inglês nem recorta frases de maneira arbitrária.
- Ajustes incluem remada unilateral com apoio, supinos, máquinas com instruções ausentes, execução controlada e cuidados com ombros/lombar.
- Referências de execução identificadas nos próprios guias: wger, NASM, ACE, PureGym e manual BodyCraft. A adaptação não tenta deduzir movimentos apenas pelas figuras. O modelo específico de uma máquina deve ser ajustado conforme seu próprio manual; as imagens continuam sendo referências estáticas, não vídeos ou validação de postura.
- Removidas as legendas equivalentes a “imagem gerada por IA”. Mantidos autores, links, créditos Everkinetic/wger e CC BY-SA obrigatórios.
- Mapas musculares e integrações abrem por toque; as rotinas e o botão Iniciar ficam mais fáceis de encontrar. Guias e mapas extensos usam memoização para evitar reconstrução pelo relógio do treino.
- Perfil identifica as metas como base (a meta calórica diária ajustada aparece no Painel/Diário em Modo Atleta), identifica o gasto de sessão como estimativa MET e distingue registros manuais. Há ação de recarga se as rotinas não puderem ser consultadas.

### Sessão e inicialização

- Identidade mínima versionada, vinculada ao token, guardada pelo wrapper de armazenamento seguro por até sete dias. No Android usa a implementação nativa de armazenamento seguro; no navegador usa o armazenamento do próprio navegador. Não foi criado cache persistente dos dados de saúde.
- Com identidade válida em cache, a navegação pode aparecer enquanto `/auth/me` revalida em segundo plano. Erros transitórios preservam a sessão; 401 da sessão atual limpa token/identidade/cache. Uma resposta atrasada da sessão antiga não encerra uma sessão nova.
- Reconexão ao voltar ao app e aviso com tentativa manual. Consultas usam cache de 30 segundos, uma tentativa adicional quando apropriada e não repetem automaticamente mutações.
- Requisições têm timeout; restauração de identidade usa oito segundos. Primeiro login tem até 70 segundos para tolerar o despertar do backend gratuito; IA tem limite próprio de 100 segundos.
- A hospedagem gratuita do serviço existente pode demorar 50 segundos ou mais ao despertar, conforme seu painel. Isso permanece um limite externo; não houve mudança de plano. [Documentação do Render](https://render.com/docs/free#spinning-down-on-idle).

**Medição antes/depois:** não há Android físico conectado nem emulador configurado para este trabalho. Não foram medidos cold start, tempo até interatividade, CPU ou memória no Android; nenhum percentual de melhora é atribuído às alterações. O teste de navegador valida comportamento e layout, sem substituir uma medição nativa.

### Integridade e prioridade das fontes

1. O diário soma o ledger `workouts` do próprio usuário, na data local do app. Inclui registros manuais e uma entrada vinculada a cada sessão Nutrify concluída.
2. Sessão Nutrify usa MET × kg × horas. O lançamento vinculado tem origem `nutrify_met`; registros novos manuais têm `manual_estimate`. Registros antigos continuam legíveis.
3. Atividades Strava são informativas e ficam separadas. Não incrementam meta nem gasto do diário. Unicidade continua por usuário e activity_id; durações e distâncias preservam unidades; kcal ausente continua sem valor.
No Modo Atleta, a meta calórica diária é a meta base mais o ledger daquele dia; fora dele, mantém o fator de atividade sem adicionar novamente os treinos. Os macros mantêm a regra base existente.

4. Health Connect não contribui para os totais, pois não está implementado. A interface informa isso explicitamente. Uma implementação futura precisa do SDK, declaração de permissões e tipos, concessões pelo usuário, verificação de disponibilidade, política de origem/deduplicação e validação em aparelho compatível; não depende de credenciais OAuth. [Disponibilidade oficial Android](https://developer.android.com/health-and-fitness/health-connect/availability).

O novo `request_id` é opcional para compatibilidade, limitado por usuário e gera um `_id` determinístico. Reenvio idêntico devolve o mesmo treino; dados diferentes ou registro já removido retornam 409. A gravação secundária é idempotente e pode ser reparada pelo reenvio após falha/reinício. O cliente congela o payload e a duração durante uma tentativa sem confirmação e impede dois toques simultâneos. Erros de validação anteriores à gravação permitem corrigir os campos.

A soma diária usa agregação sem o limite incorreto de 100 documentos. Não houve remoção ou fusão heurística de históricos antigos nem alteração das regras de metas. Dois registros manuais feitos separadamente continuam sendo dois registros; o app informa para não lançar manualmente a mesma sessão já concluída.

Strava agora diferencia 403 de token inválido: mantém conexão/cache e informa o problema de permissão. Limite global, retry ou lease não são apresentados como sincronização concluída. A configuração do serviço real foi confirmada como disponível. Logs do worker mostraram consultas ao Strava com HTTP 200; o fluxo completo de autorização e revogação não foi refeito. O teste sintético não conectou uma conta Strava.

## Validação

- **63 testes Python aprovados**, mantendo os dois workers configurados. Arquivos: `test_audit_integrations.py`, `test_session_idempotency.py`, `test_ai_meal.py`, `test_food_vision.py`, `test_food_vision_api.py`, `test_password_auth.py`, `test_taco_data.py`, `test_update_features.py`, `test_workouts_lib.py`.
- MongoDB isolado: concorrência, reenvio, conflito, usuário distinto, remoção, reparo de gravação secundária com um novo cliente de banco soma com mais de 100 registros e exclusão durante um reenvio.
- Strava: conversão de unidades, kcal ausente, 401/403/429/5xx, bloqueio global e rotação criptografada de ambos os tokens com transporte simulado.
- **8 testes do cliente HTTP aprovados**: autenticação, offline, expiração, 401 atrasado, timeout, erro não JSON, 204 e mensagem de validação. Executam o cliente real transpilado, com rede/armazenamento isolados.
- TypeScript sem erros; ESLint de app/src sem erros; export web aprovado; `git diff --check` aprovado.
- Interface local com conta fictícia: login, painel, abrir integrações, mapa muscular, figuras/posições, instruções e créditos, duas séries concluídas e sessão salva. Recarregar preservou histórico e login. Sem API, manteve a navegação e mostrou aviso; reconectar recuperou os registros.
- Layout inspecionado em desktop e 390 × 844. Sem erros de console na execução online examinada. Validação visual por amostragem de Supino e Face pull, além da checagem dos 76 arquivos e guias. Os 76 WebP foram decodificados/verificados com Pillow e têm hashes distintos.
- **Serviço real após deploy:** quatro POSTs concorrentes idênticos geraram uma sessão e um lançamento calórico. Excluir a sessão removeu o lançamento; reenvio após exclusão retornou 409. Somente dados sintéticos foram usados.
- Suítes antigas do template que pressupõem tokens/dados fixos não foram usadas como aprovação desta versão.

## Build e publicação

- Android release: **1.3.0 / versionCode 9**, minSdk 24, targetSdk 36, ABIs arm64-v8a / armeabi-v7a / x86_64.
- `:app:assembleRelease` concluído; assinatura v2 verificada com `apksigner`; mesmo certificado do APK 1.2.2 disponível para comparação. A chave autorizada externa foi reutilizada.
- Foram comparados **311 arquivos de fonte/configuração/assets** entre a branch e a cópia isolada usada pelo build: nenhuma divergência. Testes e documentação não entram no pacote.
- APK `NUTRIFY-1.3.0-RC1.apk`: 123.498.187 bytes.
- SHA-256: `1776bd08a69b8d49376d7fe2157a44e5b0271ad0348c762332d4526861b72b0a`.
- Certificado SHA-256: `caa3b679a6bfe0381fe48542d66901e780cc115dbf8e213df643b04ff7af1ffe`.
- API em uso: `1.3.0-api`, commit [`8a36a71`](https://github.com/maurolainettifotografia-lgtm/nutrify-app/commit/8a36a716f316761e0794351ab7b35e6a7d154b9c), deploy Render `dep-dbh1j567bikc7388cgu0`, verificado live e por HTTP.
- A API fica em outro repositório, por isso há um [PR de suporte separado](https://github.com/maurolainettifotografia-lgtm/nutrify-app/pull/1). O deploy usa o commit dessa branch. O Render desliga auto-deploy nesse modo; reativar somente após aprovar/incorporar a correção no fluxo de produção.
- Nenhum PR foi mesclado automaticamente. O APK é asset da [prévia v1.3.0-rc.1](https://github.com/maurolainettifotografia-lgtm/NUTRIFY/releases/tag/v1.3.0-rc.1), não um binário no histórico.

## Limites reais

Health Connect continua não implementado. Strava exige teste OAuth com conta real, consentimento, atividade real e revogação. Não houve instalação nem teste de câmera/biometria/armazenamento físico no Android nesta auditoria.

Os dados concluídos ficam no MongoDB e voltam após login/reinício online. A identidade em cache não libera acesso sem validação pelo servidor. Não há fila completa de operações offline nem cópia persistente local de diário/histórico; séries em andamento e envio sem confirmação ainda dependem da tela aberta. Após uma falha de envio, confirme pelo botão Finalizar antes de fechar a tela; fechamento forçado pode perder esse rascunho. O controle de reenvio protege tentativas com a mesma identificação, não tenta adivinhar se duas sessões novas ou dois registros manuais representam a mesma atividade.
