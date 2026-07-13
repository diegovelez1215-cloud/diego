export const FLAG_CODE_MAP = {
  ALG: 'dz', ARG: 'ar', AUS: 'au', AUT: 'at', BEL: 'be', BIH: 'ba', BRA: 'br', CAN: 'ca',
  CIV: 'ci', COD: 'cd', COL: 'co', CPV: 'cv', CRO: 'hr', CUW: 'cw', CZE: 'cz', ECU: 'ec',
  EGY: 'eg', ENG: 'gb-eng', ESP: 'es', FRA: 'fr', GER: 'de', GHA: 'gh', HAI: 'ht', IRN: 'ir',
  IRQ: 'iq', JOR: 'jo', JPN: 'jp', KOR: 'kr', KSA: 'sa', MAR: 'ma', MEX: 'mx', NED: 'nl',
  NOR: 'no', NZL: 'nz', PAN: 'pa', PAR: 'py', POR: 'pt', QAT: 'qa', RSA: 'za', SCO: 'gb-sct',
  SEN: 'sn', SUI: 'ch', SWE: 'se', TUN: 'tn', TUR: 'tr', URU: 'uy', USA: 'us', UZB: 'uz',
} as const;

export function Flag({ code, size = 'row' }: { code?: string | null; size?: 'row' | 'stage' }) {
  const asset = code ? FLAG_CODE_MAP[code as keyof typeof FLAG_CODE_MAP] : undefined;
  if (!asset) return <span className="v2-flag v2-flag--unresolved" data-size={size} aria-hidden="true" />;
  return (
    <svg className="v2-flag" data-size={size} aria-hidden="true" focusable="false">
      <use href={`/v2/flags.svg#flag-${asset}`} />
    </svg>
  );
}
