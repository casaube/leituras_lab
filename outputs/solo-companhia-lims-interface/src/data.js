export const STORAGE_KEY = 'soloCompanhia.lims.interface.v2';

export const ANALYSES = {
  PHOSPHORUS: {
    code: 'PHOSPHORUS',
    label: 'Fosforo',
    method: 'Colorimetria',
    maxCurveValue: 2,
    unit: 'mg/L',
    hint: 'Aguardar o tempo de desenvolvimento de cor antes da leitura.',
  },
  SULFUR: {
    code: 'SULFUR',
    label: 'Enxofre',
    method: 'Turbidimetria',
    maxCurveValue: 2,
    unit: 'mg/L',
    hint: 'Verificar particulas em suspensao antes de aspirar.',
  },
  BORON: {
    code: 'BORON',
    label: 'Boro',
    method: 'Colorimetria',
    maxCurveValue: 1.5,
    unit: 'mg/L',
    hint: 'Confirmar extrator e condicoes do metodo antes da leitura.',
  },
  POTASSIUM: {
    code: 'POTASSIUM',
    label: 'Potassio',
    method: 'Fotometria de chama',
    maxCurveValue: 100,
    unit: 'mg/L',
    hint: 'Conferir estabilidade da chama e padroes antes da sequencia.',
  },
};

export const DEVICE_PROFILES = {
  KASVI_K37_UVVIS0: {
    code: 'KASVI_K37_UVVIS0',
    label: 'Kasvi K37-UVVIS0',
    family: 'Espectrofotometro',
    preferredTransport: 'USB/Serial',
    physicalPort: 'USB ou RS-232 conforme configuracao do equipamento',
    defaultBaudRate: 9600,
    defaultParserPattern: '[+-]?\\d+(?:[,.]\\d+)?',
    parser: 'first-decimal',
    notes: 'Perfil inicial para captura de primeira leitura numerica enviada pelo equipamento.',
  },
  GBC_SAVANT_AA: {
    code: 'GBC_SAVANT_AA',
    label: 'GBC SavantAA',
    family: 'Absorcao atomica',
    preferredTransport: 'USB/Serial ou exportacao por software',
    physicalPort: 'RS-232/USB via computador de controle, conforme instalacao local',
    defaultBaudRate: 9600,
    defaultParserPattern: '[+-]?\\d+(?:[,.]\\d+)?',
    parser: 'first-decimal',
    notes: 'Pode exigir captura a partir do software controlador quando a porta direta nao estiver habilitada.',
  },
  FEMTO_600_PLUS: {
    code: 'FEMTO_600_PLUS',
    label: 'Femto 600 Plus',
    family: 'Espectrofotometro',
    preferredTransport: 'USB/Serial',
    physicalPort: 'USB ou RS-232 conforme modulo instalado',
    defaultBaudRate: 9600,
    defaultParserPattern: '[+-]?\\d+(?:[,.]\\d+)?',
    parser: 'first-decimal',
    notes: 'Usar modo de impressao/envio continuo quando disponivel.',
  },
  METASH_V5000_VISIBLE: {
    code: 'METASH_V5000_VISIBLE',
    label: 'Metash V-5000 Visible',
    family: 'Espectrofotometro',
    preferredTransport: 'USB/Serial',
    physicalPort: 'USB ou RS-232 conforme configuracao do equipamento',
    defaultBaudRate: 9600,
    defaultParserPattern: '[+-]?\\d+(?:[,.]\\d+)?',
    parser: 'first-decimal',
    notes: 'Perfil generico para saida textual com valor decimal.',
  },
  ANALYSER_FLAME_910M: {
    code: 'ANALYSER_FLAME_910M',
    label: 'Fotometro de Chama 910 M - Analyser',
    family: 'Fotometro de chama',
    preferredTransport: 'USB/Serial',
    physicalPort: 'RS-232 ou USB virtual COM, a confirmar no equipamento instalado',
    defaultBaudRate: 9600,
    defaultParserPattern: '[+-]?\\d+(?:[,.]\\d+)?',
    parser: 'first-decimal',
    notes: 'Perfil inicial para leituras de Na/K/Ca/Li por linha serial; confirmar baud, paridade e formato no manual ou setup do aparelho.',
  },
};

export const RACK_TEMPLATES = {
  TRAY_30_3X10: {
    code: 'TRAY_30_3X10',
    label: 'Bandeja 30',
    rows: 3,
    columns: 10,
  },
  RACK_50_5X10: {
    code: 'RACK_50_5X10',
    label: 'Rack 50',
    rows: 5,
    columns: 10,
  },
  GRID_90_6X15: {
    code: 'GRID_90_6X15',
    label: 'Gradinha 90',
    rows: 6,
    columns: 15,
  },
  MICROPLATE_96_8X12: {
    code: 'MICROPLATE_96_8X12',
    label: 'Microplaca 96',
    rows: 8,
    columns: 12,
  },
};

export const STATUS_LABELS = {
  pending: 'Pendente',
  current: 'Lendo',
  completed: 'OK',
  overRange: 'Estouro',
  diluted: 'Diluido',
  qc: 'CQ',
};

export const STATUS_ORDER = ['pending', 'current', 'completed', 'overRange', 'diluted'];

export const QC_INTERVAL = 20;
export const MIN_CALIBRATION_R2 = 0.995;
