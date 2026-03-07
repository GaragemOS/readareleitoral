
export const normalizeName = (s) =>
    s?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim() || '';

export const getMuniData = (municipalData, name) => {
    if (!name || !municipalData) return undefined;
    if (municipalData[name]) return municipalData[name];
    // Slow path: normalized match
    const norm = normalizeName(name);
    const key = Object.keys(municipalData).find(k => normalizeName(k) === norm);
    return key ? municipalData[key] : undefined;
};