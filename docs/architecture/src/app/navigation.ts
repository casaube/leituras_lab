export interface LimsNavigationItem {
  id: string;
  label: string;
  path: string;
  module: string;
}

// A Sidebar deve receber esta lista por props ou contexto de aplicacao.
// Novos bounded contexts entram aqui sem alterar o componente visual.
export const limsNavigation: LimsNavigationItem[] = [
  {
    id: 'analytical-readings',
    label: 'Leitura de Bancada',
    path: '/leituras-bancada',
    module: 'analytical-readings',
  },
];

