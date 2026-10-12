export const ensureKhilaWarangalMandal = (constituency, mandals) => {
  const constituencyName = String(constituency || '').trim().toLowerCase();
  const isWardhannapet = /^wardhannapet(?:\s*\(sc\))?$/.test(constituencyName);
  if (!isWardhannapet) return mandals;

  const hasKhilaWarangal = mandals.some(item => {
    const name = typeof item === 'string' ? item : item?.mandal;
    return String(name || '').trim().toLowerCase() === 'khila warangal';
  });
  return hasKhilaWarangal ? mandals : [...mandals, { mandal: 'Khila Warangal' }];
};