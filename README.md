# Zero a 100 km/h

Cronômetro 0–100 km/h por GPS. Feito com Vite, React, TypeScript, Tailwind/shadcn e Capacitor 7.

## Rodar localmente

Requer Node.js 20 ou mais novo.

```sh
npm install
npm run dev        # servidor de desenvolvimento em http://localhost:8080
npm run build      # gera a versão de produção em dist/
npm run preview    # serve o conteúdo de dist/ para conferir o build
npm test           # roda os testes (vitest)
```

Variáveis do Sentry (opcionais) ficam em `.env.local`; veja `.env.example` e `SENTRY_SETUP.md`.

## Publicar na web

O build é um site estático (`dist/`), então qualquer hospedagem estática serve:

- **Vercel** ou **Netlify**: importe o repositório do GitHub, comando de build `npm run build`, pasta de saída `dist`.
- **Cloudflare Pages**: mesmas configurações.

Como o app usa GPS (`navigator.geolocation`), ele precisa ser servido por HTTPS, o que essas plataformas já fazem.

## Apps Android e iOS (Capacitor)

O app nativo empacota o conteúdo de `dist/` dentro do aplicativo, sem depender de nenhum servidor externo.

Primeira vez (gera as pastas nativas, que devem ser commitadas):

```sh
npm run build
npx cap add android   # requer Android Studio
npx cap add ios       # requer macOS com Xcode
```

A cada mudança no código web:

```sh
npm run cap:sync      # build + copia dist/ para os projetos nativos
npx cap open android  # ou: npx cap open ios
```

No Android, adicione as permissões de localização em `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-feature android:name="android.hardware.location.gps" />
```

No iOS, adicione `NSLocationWhenInUseUsageDescription` ao `ios/App/App/Info.plist` com o texto explicando o uso do GPS.

O identificador do app é `br.com.vendra.zeroa100` (em `capacitor.config.ts`).
