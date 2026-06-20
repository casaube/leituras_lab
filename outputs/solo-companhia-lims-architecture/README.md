# Solo & Companhia - proposta de arquitetura LIMS

Este scaffold demonstra uma base modular para iniciar pelo modulo de leitura de bancada e crescer para um LIMS completo.

## Estrutura recomendada

```txt
src/
  app/
    composition-root.ts
    routes.tsx
    AppShell.tsx

  shared/
    domain/
      Result.ts
      AuditMetadata.ts
    infrastructure/
      http/
      env/
    ui/
      Sidebar.tsx
      Header.tsx
      StatusBadge.tsx

  modules/
    analytical-readings/
      domain/
        types.ts
        readingRules.ts
      application/
        ports/
          IReadingsRepository.ts
        services/
          AnalyticalReadingsService.ts
      infrastructure/
        repositories/
          GoogleSheetsReadingsRepository.ts
          OfflineFirstReadingsRepository.ts
        devices/
          KasviK37UvvisAdapter.ts
          GbcSavantAaAdapter.ts
          Femto600PlusAdapter.ts
          MetashV5000VisibleAdapter.ts
      presentation/
        components/
          VirtualRack.tsx
          ReadingPanel.tsx
          CalibrationGate.tsx
        store/
          createAnalyticalReadingsStore.ts

    sample-reception/
      README.md

    inventory/
      README.md

    billing/
      README.md
```

## Decisoes arquiteturais

- `modules/analytical-readings` e um bounded context isolado para a bancada.
- `domain` contem regras puras: calibracao, estouro de curva, diluicao, CQ e sequencia.
- `application` coordena casos de uso e conhece apenas portas/interfaces.
- `infrastructure` implementa detalhes substituiveis, como Google Sheets, IndexedDB/Dexie e drivers de aparelhos.
- `presentation` contem Zustand e componentes React. A tela nao conhece Google Drive.
- `app/composition-root.ts` e o unico ponto que instancia implementacoes concretas.

Para trocar Google Sheets por PostgreSQL no futuro, crie `PostgresReadingsRepository implements IReadingsRepository` e substitua a injecao no composition root.

