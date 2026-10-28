# Nutrify 1.3.0 — prévia Android

Aplicativo Expo / React Native para alimentação, hidratação, evolução e treinos. API FastAPI com MongoDB. O pacote Android é `com.maurolainetti.nutrify`, versão 1.3.0, versionCode 9.

Esta branch reúne o código da versão entregue 1.2.3, que estava à frente da antiga main deste repositório, e aplica a auditoria de integrações e experiência de treinos. Os commits de consolidação e correções estão separados para revisão.

- [Diagnóstico, alterações e validação](docs/AUDITORIA-1.3.0.md)
- [Fontes, créditos e licenças das figuras](frontend/THIRD_PARTY_NOTICES.md)
- [API em uso e PR de suporte](https://github.com/maurolainettifotografia-lgtm/nutrify-app/pull/1)
- [Prévia e APK assinado](https://github.com/maurolainettifotografia-lgtm/NUTRIFY/releases/tag/v1.3.0-rc.1)

## Desenvolvimento

No frontend: `npm ci`, configure `EXPO_PUBLIC_BACKEND_URL` e execute `npm start`. Preserve a entrada `expo-router/entry`, os providers da aplicação e as configurações de Metro, TypeScript e ESLint.

No backend: instale `backend/requirements.txt`, configure `MONGO_URL` e `DB_NAME` no ambiente ou em `backend/.env` e execute `uvicorn server:app --app-dir backend --host 127.0.0.1 --port 8000`. A configuração de IA está documentada em [backend/README.md](backend/README.md). Segredos ficam fora do Git.

## Verificações

- Frontend: `npm run typecheck`, `npm run lint`, `node --test tests/api-network.cjs` na pasta frontend.
- Backend: `pytest -c backend/pytest.ini` seguido dos arquivos de teste indicados no relatório. `NUTRIFY_TEST_MONGO` aponta somente para um MongoDB de teste descartável; as bases criadas têm prefixo `nutrify_audit_`. A configuração fixa de dois workers foi preservada.
- Web: `npx expo export --platform web --output-dir <pasta-nova>`.

## APK de release

O projeto nativo versionado fica em `frontend/android`. Use JDK 17, Android SDK com build-tools 36 e o Gradle Wrapper do projeto. No Windows, prefira um caminho curto para o checkout por causa dos compiladores nativos.

Defina `JAVA_HOME`, `ANDROID_HOME`, `EXPO_PUBLIC_BACKEND_URL`, `NUTRIFY_UPLOAD_STORE` e `NUTRIFY_UPLOAD_PASSWORD` no ambiente. A chave autorizada é externa ao repositório, com alias `nutrify-upload`. Execute em `frontend/android`:

```text
gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64 --no-daemon --max-workers=2
```

O resultado fica em `app/build/outputs/apk/release/app-release.apk`. Verifique com `apksigner verify --verbose --print-certs` e `aapt dump badging`. Não há fallback de release para chave de debug. O APK é publicado como asset de prévia, fora do histórico Git.
